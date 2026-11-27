import { useState, useEffect, useCallback, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

/**
 * Checks whether the verified FFmpeg runtime is cached locally and automatically
 * bootstraps the one-time SHA-256-verified download when missing.
 */
export function useFfmpegRuntime() {
  const [status, setStatus] = useState('checking'); // 'checking' | 'setting_up' | 'ready' | 'error'
  const [stage, setStage] = useState('checking');
  const [progress, setProgress] = useState(0);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [totalBytes, setTotalBytes] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const isInstallingRef = useRef(false);

  const installRuntime = useCallback(async () => {
    if (isInstallingRef.current) return;
    isInstallingRef.current = true;
    setStatus('setting_up');
    setStage('downloading');
    setProgress(0);
    setDownloadedBytes(0);
    setTotalBytes(0);
    setErrorMsg('');

    try {
      await invoke('ensure_ffmpeg_runtime');
      setProgress(100);
      setStage('ready');
      setStatus('ready');
    } catch (err) {
      console.error('FFmpeg runtime setup failed:', err);
      setErrorMsg(String(err));
      setStatus('error');
    } finally {
      isInstallingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let unlisten = null;
    let cancelled = false;

    const init = async () => {
      unlisten = await listen('ffmpeg-setup-progress', (event) => {
        if (cancelled) return;
        const payload = event.payload || {};
        if (payload.stage) setStage(payload.stage);
        if (typeof payload.percent === 'number') setProgress(payload.percent);
        if (typeof payload.downloadedBytes === 'number') setDownloadedBytes(payload.downloadedBytes);
        if (typeof payload.totalBytes === 'number') setTotalBytes(payload.totalBytes);
      });

      try {
        const res = await invoke('check_ffmpeg_runtime');
        if (cancelled) return;
        if (res?.ready) {
          setStage('ready');
          setProgress(100);
          setStatus('ready');
        } else {
          await installRuntime();
        }
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(String(err));
        setStatus('error');
      }
    };

    init();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [installRuntime]);

  return {
    status,
    stage,
    progress,
    downloadedBytes,
    totalBytes,
    errorMsg,
    isReady: status === 'ready',
    retry: installRuntime,
  };
}
