import { vi, describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import OFXImporter from './OFXImporter';
import type { ImportResult } from '@/lib/types';

// Hoist mocks so they are available inside vi.mock factories
const { mockOnDragDropEvent, mockOpen, mockImportOFX, mockClearImportResult } = vi.hoisted(() => ({
  mockOnDragDropEvent: vi.fn().mockResolvedValue(() => {}),
  mockOpen: vi.fn(),
  mockImportOFX: vi.fn(),
  mockClearImportResult: vi.fn(),
}));

// Mock useSettingsStore
const mockSettingsState = { isReadOnly: false };

vi.mock('@/stores/useSettingsStore', () => ({
  useSettingsStore: Object.assign(
    vi.fn((selector: (s: typeof mockSettingsState) => unknown) =>
      selector(mockSettingsState),
    ),
    { getState: vi.fn(() => mockSettingsState) },
  ),
}));

// Mock Tauri webview drag-drop API
vi.mock('@tauri-apps/api/webview', () => ({
  getCurrentWebview: () => ({ onDragDropEvent: mockOnDragDropEvent }),
}));

// Mock Tauri dialog plugin
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: mockOpen,
}));

// Mock useTransactionStore
const defaultStoreState = {
  transactions: [],
  isWriting: false,
  error: null,
  importResult: null as ImportResult | null,
  importError: null as string | null,
  importOFX: mockImportOFX,
  clearImportResult: mockClearImportResult,
  loadTransactions: vi.fn(),
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  clearedTransactions: vi.fn(() => []),
  unclearedTransactions: vi.fn(() => []),
};

let storeState = { ...defaultStoreState };

vi.mock('@/stores/useTransactionStore', () => {
  const useTransactionStore = Object.assign(
    vi.fn(() => storeState),
    {
      getState: vi.fn(() => storeState),
    },
  );
  return { useTransactionStore };
});

describe('OFXImporter', () => {
  beforeEach(() => {
    storeState = { ...defaultStoreState };
    mockSettingsState.isReadOnly = false;
    vi.clearAllMocks();
    mockOnDragDropEvent.mockResolvedValue(() => {});
    mockOpen.mockResolvedValue(null);
  });

  it('renders idle state by default (dashed border visible, drag prompt text shown)', () => {
    render(<OFXImporter />);
    expect(screen.getByText('Drag your OFX file here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Browse…' })).toBeInTheDocument();
  });

  it('shows complete state when importResult is set in store', () => {
    storeState = {
      ...defaultStoreState,
      importResult: {
        count: 23,
        batchId: 'import_123',
        latestDate: '2026-10-12',
        transactions: [],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [],
        conflictedIds: [],
      },
    };
    render(<OFXImporter />);
    expect(screen.getByText(/23 transactions imported/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import another' })).toBeInTheDocument();
  });

  it('shows error state when importError is set in store', () => {
    storeState = {
      ...defaultStoreState,
      importError: 'No transactions found',
    };
    render(<OFXImporter />);
    expect(screen.getByText('No transactions found')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('"Try again" button resets to idle state and calls clearImportResult', () => {
    storeState = {
      ...defaultStoreState,
      importError: 'Some parse error',
    };
    render(<OFXImporter />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(mockClearImportResult).toHaveBeenCalledTimes(1);
  });

  it('"Browse…" button calls open() from plugin-dialog', async () => {
    mockOpen.mockResolvedValueOnce(null);
    render(<OFXImporter />);
    fireEvent.click(screen.getByRole('button', { name: 'Browse…' }));
    expect(mockOpen).toHaveBeenCalledWith({
      filters: [{ name: 'OFX Files', extensions: ['ofx', 'qfx'] }],
      multiple: false,
    });
  });

  it('complete state displays transaction count from importResult', () => {
    storeState = {
      ...defaultStoreState,
      importResult: {
        count: 5,
        batchId: 'import_abc',
        latestDate: '2026-10-15',
        transactions: [],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [],
        conflictedIds: [],
      },
    };
    render(<OFXImporter />);
    expect(screen.getByText(/5 transactions imported/)).toBeInTheDocument();
  });

  it('complete state displays formatted date from importResult.latestDate', () => {
    storeState = {
      ...defaultStoreState,
      importResult: {
        count: 3,
        batchId: 'import_xyz',
        latestDate: '2026-10-12',
        transactions: [],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [],
        conflictedIds: [],
      },
    };
    render(<OFXImporter />);
    expect(screen.getByText(/Oct 12/)).toBeInTheDocument();
  });

  it('transitions to processing state and calls importOFX on drag-drop event', async () => {
    type DragPayload = { payload: { type: string; paths?: string[] } };
    let capturedCallback: ((event: DragPayload) => void) | undefined;
    mockOnDragDropEvent.mockImplementationOnce((cb: (event: DragPayload) => void) => {
      capturedCallback = cb;
      return Promise.resolve(() => {});
    });
    mockImportOFX.mockResolvedValue(undefined);

    render(<OFXImporter />);
    await waitFor(() => expect(capturedCallback).toBeDefined());

    await act(async () => {
      capturedCallback!({ payload: { type: 'drop', paths: ['/test/import.ofx'] } });
    });

    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    expect(mockImportOFX).toHaveBeenCalledWith('/test/import.ofx');
  });

  it('Browse button is disabled when isReadOnly = true', () => {
    mockSettingsState.isReadOnly = true;
    render(<OFXImporter />);
    expect(screen.getByRole('button', { name: 'Browse…' })).toBeDisabled();
  });

  it('ignores drop events when isReadOnly = true', async () => {
    mockSettingsState.isReadOnly = true;
    type DragPayload = { payload: { type: string; paths?: string[] } };
    let capturedCallback: ((event: DragPayload) => void) | undefined;
    mockOnDragDropEvent.mockImplementationOnce((cb: (event: DragPayload) => void) => {
      capturedCallback = cb;
      return Promise.resolve(() => {});
    });

    render(<OFXImporter />);
    await waitFor(() => expect(capturedCallback).toBeDefined());

    await act(async () => {
      capturedCallback!({ payload: { type: 'drop', paths: ['/some/file.ofx'] } });
    });

    expect(mockImportOFX).not.toHaveBeenCalled();
  });

  it('complete state omits date section when latestDate is null', () => {
    storeState = {
      ...defaultStoreState,
      importResult: {
        count: 0,
        batchId: 'import_empty',
        latestDate: null,
        transactions: [],
        matchedTransactions: [],
        categorizedAnnotations: {},
        uncategorizedIds: [],
        conflictedIds: [],
      },
    };
    render(<OFXImporter />);
    expect(screen.getByText(/0 transactions imported/)).toBeInTheDocument();
    expect(screen.queryByText(/—/)).toBeNull();
  });
});
