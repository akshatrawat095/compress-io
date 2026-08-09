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

            <div className={`w-full mb-8 text-left rounded-xl text-sm max-h-60 overflow-y-auto custom-scrollbar ${
              isDarkMode ? 'text-slate-300' : 'text-slate-600'
            }`}>
              {update.body ? (
                (() => {
                  const bodyText = update.body;
                  const secStart = bodyText.indexOf('[SECURITY_AUDIT]');
                  const secEnd = bodyText.indexOf('[/SECURITY_AUDIT]');
                  
                  if (secStart !== -1 && secEnd !== -1) {
                    const mainBody = bodyText.substring(0, secStart).trim();
                    const secBody = bodyText.substring(secStart + 16, secEnd).trim();
                    const afterBody = bodyText.substring(secEnd + 17).trim();
                    
                    return (
                      <div className="flex flex-col gap-4">
                        {mainBody && (
                          <div className={`p-4 rounded-xl border whitespace-pre-wrap font-medium ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {mainBody}
                          </div>
                        )}
                        
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className={`relative overflow-hidden p-5 rounded-2xl border shadow-lg ${isDarkMode ? 'bg-emerald-950/20 border-emerald-900/30' : 'bg-emerald-50 border-emerald-100'}`}
                        >
                          {/* Animated Shield Background */}
                          <div className="absolute -right-6 -top-6 opacity-10">
                            <svg className="w-32 h-32 text-emerald-500" fill="currentColor" viewBox="0 0 24 24">
                              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                            </svg>
                          </div>
                          
                          <div className="relative z-10 flex items-center gap-3 mb-3">
                            <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </div>
                            <h3 className={`text-base font-black uppercase tracking-widest ${isDarkMode ? 'text-emerald-400' : 'text-emerald-700'}`}>
                              Security Audit Passed
                            </h3>
                          </div>
                          
                          <div className={`whitespace-pre-wrap font-mono text-xs leading-relaxed ${isDarkMode ? 'text-emerald-200/70' : 'text-emerald-800/80'}`}>
                            {secBody}
                          </div>
                        </motion.div>

                        {afterBody && (
                          <div className={`p-4 rounded-xl border whitespace-pre-wrap font-medium ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                            {afterBody}
                          </div>
                        )}
                      </div>
                    );
                  }
                  
                  return (
                    <div className={`p-4 rounded-xl border whitespace-pre-wrap font-medium ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                      {bodyText}
                    </div>
                  );
                })()
              ) : (
                <div className={`p-4 rounded-xl border italic opacity-60 ${isDarkMode ? 'bg-white/5 border-white/5' : 'bg-slate-50 border-slate-100'}`}>
                  No release notes provided.
                </div>
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
