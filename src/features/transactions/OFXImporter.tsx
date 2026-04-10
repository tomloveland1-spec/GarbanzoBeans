import { useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';

type DropState = 'idle' | 'drag-over' | 'processing' | 'complete' | 'error';

function formatImportDate(iso: string): string {
  const parts = iso.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(parts[1] ?? '1') - 1;
  const day = parseInt(parts[2] ?? '1');
  return `${months[monthIdx] ?? ''} ${day}`;
}

export default function OFXImporter() {
  const [dropState, setDropState] = useState<DropState>('idle');
  const processingRef = useRef(false);
  const { isWriting, importResult, importError, importOFX, clearImportResult } =
    useTransactionStore();
  const isReadOnly = useSettingsStore(s => s.isReadOnly);

  // Sync store state → display state
  useEffect(() => {
    if (importResult) setDropState('complete');
    else if (importError) setDropState('error');
  }, [importResult, importError]);

  // Tauri drag-drop listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    getCurrentWebview()
      .onDragDropEvent((event) => {
        if (event.payload.type === 'enter' || event.payload.type === 'over') {
          setDropState('drag-over');
        } else if (event.payload.type === 'leave') {
          setDropState('idle');
        } else if (event.payload.type === 'drop') {
          const paths = (event.payload as { type: 'drop'; paths: string[] }).paths;
          if (paths.length > 0) {
            handleImport(paths[0]!);
          } else {
            setDropState('idle');
          }
        }
      })
      .then((fn) => {
        unlisten = fn;
      });
    return () => {
      unlisten?.();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleImport = async (path: string) => {
    // Use .getState() for the isReadOnly check — this function is captured in a stale closure
    // by the drag-drop useEffect (empty deps), so a subscribed reactive value would be frozen
    // at mount time. .getState() always reads fresh store state.
    if (useSettingsStore.getState().isReadOnly) return;
    if (processingRef.current) return;
    processingRef.current = true;
    setDropState('processing');
    await useTransactionStore.getState().importOFX(path);
    processingRef.current = false;
    // importResult/importError are now set in store — useEffect above will update dropState
  };

  const handleBrowse = async () => {
    const path = await open({
      filters: [{ name: 'OFX Files', extensions: ['ofx', 'qfx'] }],
      multiple: false,
    });
    if (typeof path === 'string') {
      await handleImport(path);
    }
  };

  const handleRetry = () => {
    clearImportResult();
    setDropState('idle');
  };

  const handleImportAnother = () => {
    clearImportResult();
    setDropState('idle');
  };

  // Derive border/background styles from dropState
  const containerStyle: React.CSSProperties = (() => {
    switch (dropState) {
      case 'drag-over':
        return {
          border: '2px solid var(--color-accent)',
          background: 'rgba(192, 245, 0, 0.06)',
        };
      case 'error':
        return { border: '2px solid var(--color-red)' };
      case 'complete':
        return { border: '2px dashed var(--color-border)' };
      default:
        return { border: '2px dashed var(--color-border)' };
    }
  })();

  return (
    <div
      className="flex flex-col items-center justify-center gap-3 p-8 rounded-lg m-4"
      style={containerStyle}
    >
      {(dropState === 'idle' || dropState === 'drag-over') && (
        <>
          <p className="type-body" style={{ color: 'var(--color-text-muted)' }}>
            Drag your OFX file here
          </p>
          <button
            className="type-label px-3 py-1 rounded"
            style={{
              color: 'var(--color-accent)',
              border: '1px solid var(--color-accent)',
              background: 'transparent',
              cursor: isReadOnly ? 'default' : 'pointer',
            }}
            disabled={isReadOnly}
            onClick={handleBrowse}
          >
            Browse…
          </button>
        </>
      )}

      {(dropState === 'processing' || isWriting) && (
        <>
          <div
            className="w-5 h-5 rounded-full border-2 border-t-transparent animate-spin"
            style={{ borderColor: 'var(--color-accent)', borderTopColor: 'transparent' }}
            aria-label="Loading"
          />
          <p className="type-body" style={{ color: 'var(--color-text-muted)' }}>
            Parsing transactions…
          </p>
        </>
      )}

      {dropState === 'complete' && importResult && (
        <>
          <p className="type-body" style={{ color: 'var(--color-text-primary)' }}>
            {importResult.count} transaction{importResult.count !== 1 ? 's' : ''} imported
            {importResult.latestDate ? ` — ${formatImportDate(importResult.latestDate)}` : ''}
          </p>
          <button
            className="type-label"
            style={{
              color: 'var(--color-accent)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              textDecoration: 'underline',
            }}
            onClick={handleImportAnother}
          >
            Import another
          </button>
        </>
      )}

      {dropState === 'error' && (
        <>
          <p className="type-body" style={{ color: 'var(--color-red)' }}>
            {importError ?? 'Import failed'}
          </p>
          <button
            className="type-label px-3 py-1 rounded"
            style={{
              color: 'var(--color-red)',
              border: '1px solid var(--color-red)',
              background: 'transparent',
              cursor: 'pointer',
            }}
            onClick={handleRetry}
          >
            Try again
          </button>
        </>
      )}
    </div>
  );
}
