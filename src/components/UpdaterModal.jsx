import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export default function UpdaterModal({ isDarkMode }) {
  const [update, setUpdate] = useState(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [progress, setProgress] = useState(0);
  const cardRef = useRef(null);

  // 🎇 Ultra-premium mouse-tracking spotlight effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove(event) {
    if (!cardRef.current) return;
    const { left, top } = cardRef.current.getBoundingClientRect();
    mouseX.set(event.clientX - left);
    mouseY.set(event.clientY - top);
  }

  // Smooth the spotlight movement for a buttery fluid feel
  const springX = useSpring(mouseX, { stiffness: 500, damping: 50 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 50 });

  const spotlightColor = isDarkMode ? 'rgba(139, 92, 246, 0.15)' : 'rgba(139, 92, 246, 0.08)';
  const spotlightGlow = useMotionTemplate`radial-gradient(400px circle at ${springX}px ${springY}px, ${spotlightColor}, transparent 80%)`;
  const borderGlow = useMotionTemplate`radial-gradient(200px circle at ${springX}px ${springY}px, rgba(139, 92, 246, 0.4), transparent 80%)`;

  const staggerVariants = React.useMemo(() => ({
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }
  }), []);

  const mdComponents = React.useMemo(() => ({
    h2: ({node, ...props}) => <motion.h2 variants={staggerVariants} initial="hidden" whileInView="visible" viewport={{once:true}} className="text-sm font-black mb-2 tracking-wide text-white/95" {...props} />,
    h3: ({node, ...props}) => <motion.h3 variants={staggerVariants} initial="hidden" whileInView="visible" viewport={{once:true}} className="text-xs font-bold uppercase tracking-wider mt-4 mb-2 text-fuchsia-400" {...props} />,
    p: ({node, ...props}) => <motion.p variants={staggerVariants} initial="hidden" whileInView="visible" viewport={{once:true}} className="mb-2 leading-relaxed opacity-90 text-xs" {...props} />,
    ul: ({node, ...props}) => <ul className="list-disc list-inside space-y-1.5 my-2 pl-1 leading-relaxed text-xs opacity-90" {...props} />,
    li: ({node, ...props}) => <li className="leading-relaxed" {...props} />,
    code: ({node, inline, ...props}) => inline ? <code className="px-1.5 py-0.5 rounded bg-white/10 font-mono text-[11px] text-fuchsia-400" {...props} /> : <code {...props} />,
    pre: ({node, ...props}) => <pre className="p-3 my-2.5 rounded-lg bg-black/40 text-[11px] font-mono overflow-x-auto border border-white/5 text-slate-200" {...props} />,
    table: ({node, ...props}) => <div className="overflow-x-auto my-3 rounded-lg border border-white/10"><table className="w-full text-left border-collapse text-[11px]" {...props} /></div>,
    th: ({node, ...props}) => <th className={`border-b py-2 px-3 font-bold ${isDarkMode ? 'border-white/10 bg-white/5 text-white/90' : 'border-slate-200 bg-slate-100 text-slate-800'}`} {...props} />,
    tr: ({node, ...props}) => <tr className={`border-b last:border-b-0 ${isDarkMode ? 'border-white/5 hover:bg-white/5' : 'border-slate-100 hover:bg-slate-50'} transition-colors`} {...props} />,
    td: ({node, ...props}) => <td className="py-2 px-3 opacity-80" {...props} />,
    hr: ({node, ...props}) => <hr className={`my-3 ${isDarkMode ? 'border-white/10' : 'border-slate-200'}`} {...props} />,
    blockquote: ({node, ...props}) => <blockquote className={`border-l-2 border-fuchsia-500 pl-3 py-1.5 my-2 text-xs italic rounded-r-lg ${isDarkMode ? 'bg-fuchsia-500/10 text-slate-300' : 'bg-fuchsia-500/5 text-slate-600'}`} {...props} />,
  }), [isDarkMode, staggerVariants]);

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
    }
  };

  return (
    <AnimatePresence>
      {update && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className={`fixed inset-0 z-[60000] flex flex-col p-4 items-center justify-center ${
            isDarkMode ? 'bg-slate-950/80' : 'bg-slate-900/40'
          }`}
          style={{ perspective: 1200 }}
        >
          <motion.div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            initial={{ y: 20, opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: -10, opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={`relative max-w-lg w-full p-6 sm:p-7 rounded-[2rem] flex flex-col items-center text-center shadow-2xl border transition-colors will-change-transform overflow-hidden ${
              isDarkMode
                ? 'bg-studio-obsidian/95 border-white/10 shadow-[0_0_80px_rgba(139,92,246,0.15)]'
                : 'bg-white/95 border-white shadow-[0_0_80px_rgba(139,92,246,0.1)]'
            }`}
          >
            {/* Dynamic Spotlight Layers */}
            <motion.div className="pointer-events-none absolute inset-0 z-0" style={{ background: spotlightGlow }} />
            <motion.div className="pointer-events-none absolute inset-0 z-0 opacity-50" style={{ borderImage: borderGlow }} />

            {/* Content Container */}
            <div className="relative z-10 flex flex-col items-center w-full">
              {/* Animated Download Icon */}
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-studio-violet to-fuchsia-500 flex items-center justify-center shadow-lg shadow-studio-violet/30 mb-3"
              >
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </motion.div>

              <h2 className={`text-xl font-black mb-1 uppercase tracking-widest ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>
                Update Available
              </h2>
              
              <p className={`font-mono text-[11px] font-bold px-3 py-0.5 rounded-full mb-4 ${isDarkMode ? 'bg-white/10 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                Version {update.version}
              </p>

              <div className={`w-full mb-6 text-left rounded-2xl text-xs max-h-72 overflow-y-auto custom-scrollbar p-4 border font-normal ${
                isDarkMode ? 'bg-white/[0.03] border-white/5 text-slate-300' : 'bg-slate-50/80 border-slate-200/60 text-slate-600'
              }`}>
                {update.body ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {update.body}
                  </ReactMarkdown>
                ) : (
                  <div className="italic opacity-60 text-center py-4">
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
                    className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                      isDarkMode ? 'bg-white/5 hover:bg-white/10 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    Ignore
                  </button>
                  <button
                    onClick={handleUpdate}
                    className="flex-[2] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest bg-studio-violet hover:bg-fuchsia-500 text-white shadow-[0_0_20px_rgba(139,92,246,0.3)] hover:shadow-[0_0_30px_rgba(139,92,246,0.5)] hover:-translate-y-0.5 transition-all"
                  >
                    Update & Restart
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
