import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/router-devtools';
import RootLayout from './App';
import { useMonthStore } from '@/stores/useMonthStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { useEnvelopeStore } from '@/stores/useEnvelopeStore';
import { useIncomeStore } from '@/stores/useIncomeStore';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useMerchantRuleStore } from '@/stores/useMerchantRuleStore';
import { pastTwelveMonths } from '@/lib/date-utils';
import OnboardingPage from '@/features/settings/OnboardingPage';
import SettingsPage from '@/features/settings/SettingsPage';
import BudgetPage from '@/features/envelopes/BudgetPage';
import AllocationPage from '@/features/envelopes/AllocationPage';
import LedgerPage from '@/features/transactions/LedgerPage';

// Guard: redirect to /onboarding if not yet onboarded.
// Uses getState() — not the hook — because hooks cannot be called outside React components.
// The root loader has already awaited loadSettings(), so getState().settings is populated.
export function guardOnboarding() {
  const { settings } = useSettingsStore.getState();
  if (!settings || !settings.onboardingComplete) {
    throw redirect({ to: '/onboarding' });
  }
}

// Guard: redirect to / if the app is in read-only mode (sentinel lock active).
// Used to block the allocation route from read-only instances.
function guardReadOnly() {
  const { isReadOnly } = useSettingsStore.getState();
  if (isReadOnly) {
    throw redirect({ to: '/' });
  }
}

// Guard: redirect to /turn-the-month if month is in closing state.
// Called in beforeLoad of all routes except /turn-the-month itself (AC3).
function guardTurnTheMonth() {
  const { monthStatus } = useMonthStore.getState();
  if (monthStatus.startsWith('closing:')) {
    throw redirect({ to: '/turn-the-month' });
  }
}

// Root route: wraps the entire app with the shell layout.
// beforeLoad hydrates settings store before any child route guards fire.
// Using beforeLoad (not loader) guarantees loadSettings completes before
// child routes' beforeLoad runs (TanStack Router runs all beforeLoads
// top-down before any loaders start).
const rootRoute = createRootRoute({
  component: () => (
    <>
      <RootLayout />
      {import.meta.env.DEV && <TanStackRouterDevtools />}
    </>
  ),
  beforeLoad: async () => {
    await useSettingsStore.getState().loadSettings();
    await useSettingsStore.getState().checkSentinel();
    await useEnvelopeStore.getState().loadEnvelopes();
    await useIncomeStore.getState().loadIncomeEntries();
    const currentMonth = pastTwelveMonths()[0];
    await useTransactionStore.getState().loadTransactions(currentMonth);
    await useMerchantRuleStore.getState().loadRules();
  },
});

// /  — Budget screen (main view)
const budgetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: BudgetPage,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
  },
});

// /ledger
const ledgerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ledger',
  component: LedgerPage,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
  },
});

// /merchant-rules
const merchantRulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/merchant-rules',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Merchant Rules — coming in Epic 4</div>,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
  },
});

// /settings
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/settings',
  component: SettingsPage,
  beforeLoad: () => {
    guardOnboarding();
    // No Turn the Month guard — settings must be accessible during closing state
  },
});

// /onboarding — reverse guard: redirect to / if already onboarded
const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: OnboardingPage,
  beforeLoad: () => {
    const { settings } = useSettingsStore.getState();
    if (settings?.onboardingComplete) {
      throw redirect({ to: '/' });
    }
    // No Turn the Month guard — onboarding must be accessible even during closing state
  },
});

// /budget/allocate — Monthly allocation flow
const allocationRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/budget/allocate',
  component: AllocationPage,
  beforeLoad: () => {
    guardOnboarding();
    guardTurnTheMonth();
    guardReadOnly();
  },
});

// /turn-the-month
// Guard: redirect to / if NOT in closing state (no manual access)
const turnTheMonthRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/turn-the-month',
  component: () => <div className="p-6 type-body" style={{ color: 'var(--color-text-primary)' }}>Turn the Month — coming in Epic 6</div>,
  beforeLoad: () => {
    const { monthStatus } = useMonthStore.getState();
    if (!monthStatus.startsWith('closing:')) {
      throw redirect({ to: '/' });
    }
  },
});

const routeTree = rootRoute.addChildren([
  budgetRoute,
  allocationRoute,
  ledgerRoute,
  merchantRulesRoute,
  settingsRoute,
  onboardingRoute,
  turnTheMonthRoute,
]);

export const router = createRouter({ routeTree });

// Type augmentation: makes router fully type-safe throughout the app
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
