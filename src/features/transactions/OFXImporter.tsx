import { useEffect, useRef, useState } from 'react';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { open } from '@tauri-apps/plugin-dialog';
import { useTransactionStore } from '@/stores/useTransactionStore';
import { useSettingsStore } from '@/stores/useSettingsStore';
import { Button } from '@/components/ui/button';

type DropState = 'idle' | 'drag-over' | 'processing' | 'complete' | 'error';


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

  const isProcessing = dropState === 'processing' || isWriting;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        disabled={isReadOnly || isProcessing}
        onClick={handleBrowse}
      >
        {isProcessing ? 'Importing…' : 'Import OFX'}
      </Button>

      {dropState === 'error' && (
        <>
          <span className="type-caption" style={{ color: 'var(--color-red)' }}>
            {importError ?? 'Import failed'}
          </span>
          <button
            className="type-caption"
            style={{ color: 'var(--color-red)', background: 'transparent', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={handleRetry}
          >
            Retry
          </button>
        </>
      )}
    </div>
  );
}
