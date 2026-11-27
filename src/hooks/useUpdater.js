import { useState, useEffect, useRef, useCallback } from 'react';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Silently checks for updates on startup and pre-downloads packages in the background
 * so users only restart when ready, with zero modal interruptions mid-task.
 */
export function useUpdater() {
  const [updateInfo, setUpdateInfo] = useState(null);
  const [status, setStatus] = useState('idle'); // 'idle' | 'downloading' | 'ready' | 'installing' | 'error'
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const updateResourceRef = useRef(null);
  const isConsumedRef = useRef(false);

  const downloadUpdate = useCallback(async (update) => {
    if (!update) return;
    setStatus('downloading');
    setErrorMsg('');
    let downloaded = 0;
    let contentLength = 0;

    try {
      await update.download((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength || 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setProgress(Math.min(99, Math.round((downloaded / contentLength) * 100)));
          } else {
            setProgress((prev) => (prev < 90 ? prev + 1 : prev));
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });
      setProgress(100);
      setStatus('ready');
    } catch (err) {
      console.warn('Background update download failed:', err);
      setErrorMsg(String(err));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await check();
        if (!result || cancelled) {
          if (result && cancelled) {
            await result.close().catch(() => {});
          }
          return;
        }
        updateResourceRef.current = result;
        isConsumedRef.current = false;
        setUpdateInfo({
          version: result.version,
          body: result.body || '',
        });
        await downloadUpdate(result);
      } catch (err) {
        console.warn('Update check skipped:', err);
      }
    }, 3000);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (updateResourceRef.current && !isConsumedRef.current) {
        updateResourceRef.current.close().catch(() => {});
        updateResourceRef.current = null;
      }
    };
  }, [downloadUpdate]);

  const retryDownload = useCallback(async () => {
    if (!updateResourceRef.current) return;
    setProgress(0);
    await downloadUpdate(updateResourceRef.current);
  }, [downloadUpdate]);

  const installAndRestart = useCallback(async () => {
    const update = updateResourceRef.current;
    if (!update) return;
    setStatus('installing');
    setErrorMsg('');

    try {
      if (status !== 'ready') {
        await downloadUpdate(update);
      }
      isConsumedRef.current = true;
      await update.install();
      // On Windows, install() exits the process and launches the quiet installer.
      // On macOS/Linux, relaunch manually so the updated bundle takes effect.
      if (!navigator.userAgent.toLowerCase().includes('windows')) {
        await relaunch();
      }
    } catch (err) {
      console.error('Failed to install update:', err);
      isConsumedRef.current = false;
      setErrorMsg(String(err));
      setStatus('error');
    }
  }, [downloadUpdate, status]);

  return {
    updateInfo,
    status,
    progress,
    errorMsg,
    isModalOpen,
    openModal: () => setIsModalOpen(true),
    closeModal: () => setIsModalOpen(false),
    retryDownload,
    installAndRestart,
  };
}
