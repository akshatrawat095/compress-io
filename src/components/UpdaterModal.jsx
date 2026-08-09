import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export default function UpdaterModal({ isDarkMode }) {
  const [update, setUpdate] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    async function checkForUpdate() {
      try {
        const result = await check();
        if (result) {
          setUpdate(result);
        }
      } catch (err) {
        console.warn("Update check failed:", err);
      }
    }
    // Check after a short delay to not impact initial app load
    const timer = setTimeout(checkForUpdate, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleUpdate = async () => {
    if (!update) return;
    setIsUpdating(true);
    let downloaded = 0;
    let contentLength = 0;

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === 'Started') {
          contentLength = event.data.contentLength || 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          if (contentLength > 0) {
            setProgress(Math.round((downloaded / contentLength) * 100));
          } else {
            // Indeterminate progress fallback if contentLength is unknown
            setProgress((prev) => (prev < 90 ? prev + 1 : prev));
          }
        } else if (event.event === 'Finished') {
          setProgress(100);
        }
      });
      await relaunch();
    } catch (error) {
      console.error("Failed to update:", error);
      setIsUpdating(false);
      // Fallback: alert the user it failed
    }
  };

  return (
    <AnimatePresence>
      {update && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className={`fixed inset-0 z-[60000] backdrop-blur-xl flex flex-col p-6 items-center justify-center ${
            isDarkMode ? 'bg-slate-950/80' : 'bg-slate-900/40'
          }`}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.95 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className={`relative max-w-md w-full p-8 rounded-[2rem] flex flex-col items-center text-center shadow-2xl border transition-colors ${
              isDarkMode
                ? 'bg-slate-900 border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.5)]'
                : 'bg-white border-slate-200 shadow-[0_0_40px_rgba(0,0,0,0.1)]'
            }`}
          >
            {/* Animated Download Icon */}
            <motion.div
              animate={{ y: [0, -5, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-20 h-20 rounded-[2rem] bg-gradient-to-tr from-studio-violet to-fuchsia-500 flex items-center justify-center shadow-lg shadow-studio-violet/30 mb-6"
            >
              <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                 <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </motion.div>

            <h2 className={`text-2xl font-black mb-2 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
              Update Available
            </h2>
            
            <p className={`font-mono text-xs font-bold px-3 py-1 rounded-full mb-6 ${isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
              Version {update.version}
            </p>

            <div className={`w-full p-4 mb-8 text-left rounded-xl text-sm max-h-40 overflow-y-auto custom-scrollbar border ${
              isDarkMode ? 'bg-white/5 border-white/5 text-slate-300' : 'bg-slate-50 border-slate-100 text-slate-600'
            }`}>
              {update.body ? (
                 <div className="whitespace-pre-wrap font-medium">{update.body}</div>
              ) : (
                 <div className="italic opacity-60">No release notes provided.</div>
              )}
            </div>

            {isUpdating ? (
              <div className="w-full flex flex-col gap-3">
                <div className={`w-full h-3 rounded-full overflow-hidden ${isDarkMode ? 'bg-white/10' : 'bg-slate-100'}`}>
                  <motion.div
                    className="h-full bg-gradient-to-r from-studio-violet to-fuchsia-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ ease: "easeOut", duration: 0.2 }}
                  />
                </div>
                <div className={`text-[10px] font-black font-mono tracking-widest ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  DOWNLOADING UPDATE... {progress}%
                </div>
              </div>
            ) : (
              <div className="flex w-full gap-3">
                <button
                  onClick={() => setUpdate(null)}
                  className={`flex-1 py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                    isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                  }`}
                >
                  Ignore
                </button>
                <button
                  onClick={handleUpdate}
                  className="flex-[2] py-4 rounded-xl font-black text-xs uppercase tracking-widest bg-studio-violet hover:bg-fuchsia-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:-translate-y-0.5 transition-all"
                >
                  Update & Restart
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
