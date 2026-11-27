import React, { useRef } from 'react';
import { motion, AnimatePresence, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { buildMarkdownComponents } from './markdownComponents';

export default function UpdaterModal({ isDarkMode, updater }) {
  const cardRef = useRef(null);

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  function handleMouseMove(event) {
    if (!cardRef.current) return;
    const { left, top } = cardRef.current.getBoundingClientRect();
    mouseX.set(event.clientX - left);
    mouseY.set(event.clientY - top);
  }

  const springX = useSpring(mouseX, { stiffness: 500, damping: 50 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 50 });

  const spotlightColor = isDarkMode ? 'rgba(138, 162, 130, 0.15)' : 'rgba(102, 107, 84, 0.08)';
  const spotlightGlow = useMotionTemplate`radial-gradient(400px circle at ${springX}px ${springY}px, ${spotlightColor}, transparent 80%)`;
  const borderGlow = useMotionTemplate`radial-gradient(200px circle at ${springX}px ${springY}px, rgba(138, 162, 130, 0.4), transparent 80%)`;

  const staggerVariants = React.useMemo(() => ({
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: "easeOut" } }
  }), []);

  const mdComponents = React.useMemo(
    () => buildMarkdownComponents(isDarkMode, staggerVariants),
    [isDarkMode, staggerVariants],
  );

  const { updateInfo, status, progress, errorMsg, isModalOpen, closeModal, retryDownload, installAndRestart } = updater || {};
  const isBusy = status === 'downloading' || status === 'installing';

  return (
    <AnimatePresence>
      {updateInfo && isModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          onClick={status !== 'installing' ? closeModal : undefined}
          className={`fixed inset-0 z-[60000] flex flex-col p-4 items-center justify-center ${
            isDarkMode ? 'bg-[#0E130F]/85' : 'bg-[#1D241C]/45'
          }`}
          style={{ perspective: 1200 }}
        >
          <motion.div
            ref={cardRef}
            onMouseMove={handleMouseMove}
            onClick={(e) => e.stopPropagation()}
            initial={{ y: 20, opacity: 0, scale: 0.92, filter: 'blur(10px)' }}
            animate={{ y: 0, opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ y: -10, opacity: 0, scale: 0.95, filter: 'blur(10px)' }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className={`relative max-w-lg w-full p-6 sm:p-7 rounded-[2rem] flex flex-col items-center text-center shadow-2xl border transition-colors will-change-transform overflow-hidden ${
              isDarkMode
                ? 'bg-studio-obsidian/95 border-[#8AA282]/20 shadow-[0_0_80px_rgba(138,162,130,0.15)]'
                : 'bg-[#FAF9F5]/95 border-[#E2DFD5] shadow-[0_0_80px_rgba(66,79,60,0.12)]'
            }`}
          >
            <motion.div className="pointer-events-none absolute inset-0 z-0" style={{ background: spotlightGlow }} />
            <motion.div className="pointer-events-none absolute inset-0 z-0 opacity-50" style={{ borderImage: borderGlow }} />

            <div className="relative z-10 flex flex-col items-center w-full">
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-studio-forest to-studio-sage flex items-center justify-center shadow-lg shadow-studio-forest/30 mb-3"
              >
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </motion.div>

              <h2 className={`text-xl font-black mb-1 uppercase tracking-widest ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#232921]'}`}>
                {status === 'ready' ? 'Update Ready' : status === 'installing' ? 'Installing Update' : 'Update Available'}
              </h2>

              <p className={`font-mono text-[11px] font-bold px-3 py-0.5 rounded-full mb-4 ${isDarkMode ? 'bg-white/10 text-studio-moss' : 'bg-[#EAE7DF] text-studio-forest'}`}>
                Version {updateInfo.version}
              </p>

              <div className={`w-full mb-5 text-left rounded-2xl text-xs max-h-72 overflow-y-auto custom-scrollbar p-4 border font-normal ${
                isDarkMode ? 'bg-white/[0.03] border-white/5 text-[#DCD9CF]' : 'bg-[#F2F0EB]/80 border-[#DFDCD2] text-[#394135]'
              }`}>
                {updateInfo.body ? (
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {updateInfo.body}
                  </ReactMarkdown>
                ) : (
                  <div className="italic opacity-60 text-center py-4">
                    No release notes provided.
                  </div>
                )}
              </div>

              {errorMsg && status === 'error' && (
                <p className="text-[11px] text-[#B85442] font-semibold mb-3 px-2 break-words w-full">
                  {errorMsg}
                </p>
              )}

              {isBusy ? (
                <div className="w-full flex flex-col gap-3">
                  <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-white/10' : 'bg-[#EAE7DF]'}`}>
                    <motion.div
                      className="h-full bg-gradient-to-r from-studio-forest to-studio-sage"
                      initial={{ width: 0 }}
                      animate={{ width: `${status === 'installing' ? 100 : progress}%` }}
                      transition={{ ease: "easeOut", duration: 0.2 }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] font-black font-mono tracking-widest">
                    <span className={isDarkMode ? 'text-studio-lichen' : 'text-[#555C50]'}>
                      {status === 'installing' ? 'APPLYING QUIET UPDATE...' : `STAGING IN BACKGROUND... ${progress}%`}
                    </span>
                    {status === 'downloading' && (
                      <button
                        onClick={closeModal}
                        className="underline opacity-70 hover:opacity-100 uppercase"
                      >
                        Hide
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex w-full gap-3">
                  <button
                    onClick={closeModal}
                    className={`flex-1 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                      isDarkMode ? 'bg-white/5 hover:bg-white/10 text-[#F2F0EB]' : 'bg-[#EAE7DF] hover:bg-[#DFDCD2] text-[#394135]'
                    }`}
                  >
                    Later
                  </button>
                  <button
                    onClick={status === 'error' ? retryDownload : installAndRestart}
                    className="flex-[2] py-3.5 rounded-xl font-black text-xs uppercase tracking-widest bg-studio-forest hover:bg-studio-olive text-[#FAF9F5] shadow-[0_0_20px_rgba(66,79,60,0.28)] hover:shadow-[0_0_28px_rgba(66,79,60,0.42)] hover:-translate-y-0.5 transition-all"
                  >
                    {status === 'error' ? 'Retry Download' : 'Restart & Install'}
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
