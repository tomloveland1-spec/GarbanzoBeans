# Story 7.1: Launch & Global UI Polish

Status: done

## Story

As Tom,
I want the app to open cleanly and feel polished at the global level,
So that first impressions and everyday interactions feel intentional and high-quality.

## Acceptance Criteria

1. **Given** the app window opens on any machine / **When** the Tauri shell loads before React hydrates / **Then** the window background is `#111214` from the very first paint — no white flash before the dark theme loads.

2. **Given** the app is running a production/release build / **When** any screen renders / **Then** the TanStack Router devtools badge is not visible; it only appears when `NODE_ENV=development`.

3. **Given** the user hovers an inactive nav item in the sidebar (Ledger, Rules, Settings) / **When** the pointer is over the item / **Then** a `rgba(255,255,255,0.07)` background tint is applied matching the design spec hover state; active and hover states are visually distinct.

## Tasks / Subtasks

- [x] Verify AC1 — FOUC fix (AC: #1)
  - [x] Confirm `index.html` `<html>` tag has `style="background-color: #111214"` — already present, no code change needed
- [x] Verify AC2 — Devtools guard (AC: #2)
  - [x] Confirm `router.tsx` devtools render is wrapped in `{import.meta.env.DEV && <TanStackRouterDevtools />}` — already present, no code change needed
- [x] Implement AC3 — Sidebar hover state (AC: #3)
  - [x] Add `.sidebar-interactive:hover` CSS rule to `src/styles.css` using `var(--color-sidebar-hover)`, positioned after the existing `.sidebar-interactive:focus-visible` rule
  - [x] Verify active item hover does NOT override active lime tint (active state uses inline style, which takes precedence over CSS class — no extra code needed)
  - [x] Manual visual test: hover each inactive nav item and confirm `rgba(255,255,255,0.07)` tint appears; hover active item and confirm it shows lime tint only

### Review Findings

- [x] [Review][Patch] Touch hover persistence — no `@media (hover: hover)` guard on `.sidebar-interactive:hover` [src/styles.css]
- [x] [Review][Defer] Active-state inline style fragility — hover suppression on active item relies on `activeProps` inline style taking CSS precedence; refactoring active state to a class would silently break hover isolation [src/styles.css] — deferred, pre-existing design decision
- [x] [Review][Defer] No `pointer-events: none` guard for future disabled nav items — `.sidebar-interactive:hover` will fire on any element with the class even if visually disabled [src/styles.css] — deferred, no disabled items exist today

## Dev Notes

### Current State — What's Already Done

**AC1 — FOUC is already fixed.**
`index.html` line 2: `<html lang="en" style="background-color: #111214">` — the background color is set inline on the `<html>` element before any JS loads. No change needed. Verify only.

**AC2 — Devtools guard is already implemented.**
`src/router.tsx:62`: `{import.meta.env.DEV && <TanStackRouterDevtools />}` — the badge only renders in dev mode. No change needed. Verify only.

**AC3 — Sidebar hover is the only actual implementation task.**
The CSS token `--color-sidebar-hover: rgba(255, 255, 255, 0.07)` is defined in `src/styles.css` line 15, but no hover rule applies it to nav items. The `.sidebar-interactive` class only has a `focus-visible` rule (line 134). The `<Link>` elements in `App.tsx` have `activeProps` for active state but no hover handling.

### Implementation — Sidebar Hover

**File to edit: `src/styles.css`**

Add immediately after the existing `.sidebar-interactive:focus-visible` block (around line 137):

```css
.sidebar-interactive:hover {
  background-color: var(--color-sidebar-hover);
}
```

**Why CSS and not `hoverProps` on the Link:**
The `transition-colors` Tailwind class is already on the `<Link>` in `App.tsx:72`. CSS hover will work seamlessly with it. The active state is set via `activeProps` as an inline style (`backgroundColor: 'rgba(192, 245, 0, 0.08)'`) which takes precedence over any CSS class — so hovering the active item will not show the white tint. Correct behavior, zero extra code.

**File: `src/App.tsx`** — no changes needed.

### Design Token Reference

From `src/styles.css` `@theme` block:
- `--color-sidebar-hover: rgba(255, 255, 255, 0.07)` — hover tint for inactive items
- `--color-sidebar-active: #C0F500` — lime for active item text
- Active item background: `rgba(192, 245, 0, 0.08)` (inline in `activeProps` — not a token)
- Sidebar background: `--color-bg-sidebar: #0F2218`

### UX Spec Reference

From `ux-design-specification.md`:
- `--color-sidebar-hover: rgba(255,255,255,0.07)` — Sidebar hover state token (line 323)
- "Section labels (TOOLS) are non-interactive — 35% white opacity, no hover state" — confirms only nav items get hover
- Focus ring on sidebar: white 2px outline (already implemented in `.sidebar-interactive:focus-visible`)

### Architecture Reference

From `architecture.md`:
- Navigation component: `src/App.tsx` (houses `NavBar` / sidebar inline) — `src/features/navigation/NavBar.tsx` does not exist; sidebar is in `App.tsx` directly
- Design tokens: `src/lib/design-tokens.ts` + CSS custom properties in `src/styles.css`
- Tailwind v4 is used; `@theme` block in `styles.css` declares all CSS custom properties

### Testing

This story's only code change is a single CSS rule. jsdom does not compute hover pseudo-class styles, so a Vitest unit test cannot verify the visual hover behavior.

**Required verification:**
- Manual: run `pnpm tauri dev`, hover each inactive nav item — confirm subtle white tint appears
- Manual: hover the active item — confirm no tint change (lime tint should remain)
- Manual: open app in production build (`pnpm tauri build`) — confirm no devtools badge visible

No new automated tests are required for this story. The existing `design-tokens.test.ts` already verifies the token values.

### Project Structure Notes

- Sidebar lives in `src/App.tsx` — NOT in a separate `NavBar.tsx` component
- CSS custom properties are in `src/styles.css` under `@theme` (Tailwind v4 syntax)
- `.sidebar-interactive` is the utility class used for all sidebar interactive elements; focus rule already defined there

### References

- [Source: src/App.tsx#L72] — `<Link>` with `className="sidebar-interactive ..."` and `activeProps`
- [Source: src/styles.css#L15] — `--color-sidebar-hover` token definition
- [Source: src/styles.css#L134] — `.sidebar-interactive:focus-visible` existing rule (add hover rule after this)
- [Source: index.html#L2] — FOUC fix already present
- [Source: src/router.tsx#L62] — Devtools already guarded
- [Source: ux-design-specification.md] — `--color-sidebar-hover: rgba(255,255,255,0.07)`, sidebar hover spec

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- AC1 verified: `index.html:2` already has `style="background-color: #111214"` on `<html>` — no change needed.
- AC2 verified: `router.tsx:62` already has `{import.meta.env.DEV && <TanStackRouterDevtools />}` — no change needed.
- AC3 implemented: Added `.sidebar-interactive:hover { background-color: var(--color-sidebar-hover); }` to `src/styles.css` after the existing `.sidebar-interactive:focus-visible` rule. Active item hover unaffected — `activeProps` inline style takes CSS precedence.
- Pre-existing `BorrowOverlay.test.tsx` failures (13 tests, `useEnvelopeStore.setState is not a function`) confirmed not caused by this story — file not in our changeset. All 438 previously-passing tests continue to pass.

### File List

- src/styles.css

### Change Log

- 2026-04-09: Verified AC1 (FOUC fix) and AC2 (devtools guard) — both already implemented, no code change. Implemented AC3 — added `.sidebar-interactive:hover` CSS rule to `src/styles.css`.
