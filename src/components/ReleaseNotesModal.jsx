import React, { useEffect, useMemo, useRef } from 'react';
import { AnimatePresence, motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Icon from './Icon';
import { buildMarkdownComponents } from './markdownComponents';
import { getReleaseNotesForVersion } from '../data/releaseNotes';

export default function ReleaseNotesModal({
  isOpen,
  version,
  markdownBody = '',
  onDismiss,
  isDarkMode,
}) {
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const cardRef = useRef(null);

  function handleMouseMove(event) {
    if (!cardRef.current) return;
    const { left, top } = cardRef.current.getBoundingClientRect();
    mouseX.set(event.clientX - left);
    mouseY.set(event.clientY - top);
  }

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        onDismiss?.();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onDismiss]);

  const springX = useSpring(mouseX, { stiffness: 500, damping: 50 });
  const springY = useSpring(mouseY, { stiffness: 500, damping: 50 });

  const spotlightColor = isDarkMode ? 'rgba(138, 162, 130, 0.15)' : 'rgba(102, 107, 84, 0.08)';
  const spotlightGlow = useMotionTemplate`radial-gradient(400px circle at ${springX}px ${springY}px, ${spotlightColor}, transparent 80%)`;
  const borderGlow = useMotionTemplate`radial-gradient(200px circle at ${springX}px ${springY}px, rgba(138, 162, 130, 0.4), transparent 80%)`;

  const releaseData = useMemo(() => getReleaseNotesForVersion(version), [version]);

  const mdComponents = useMemo(() => buildMarkdownComponents(isDarkMode), [isDarkMode]);

  const overlayVariants = {
    hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
    visible: {
      opacity: 1,
      backdropFilter: 'blur(20px)',
      transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] },
    },
    exit: { opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0.3 } },
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 24, filter: 'blur(14px)' },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      filter: 'blur(0px)',
      transition: {
        type: 'spring',
        stiffness: 310,
        damping: 26,
        staggerChildren: 0.07,
        delayChildren: 0.12,
      },
    },
    exit: { opacity: 0, scale: 0.95, y: -12, filter: 'blur(8px)', transition: { duration: 0.25 } },
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 12 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { type: 'spring', stiffness: 340, damping: 26 },
    },
  };

  const hasMarkdown = Boolean(markdownBody && markdownBody.trim().length > 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onDismiss}
          className={`fixed inset-0 z-[52000] flex items-center justify-center p-4 ${
            isDarkMode ? 'bg-[#0E130F]/82' : 'bg-[#1D241C]/42'
          }`}
          style={{ perspective: 1200 }}
        >
          <motion.div
            ref={cardRef}
            variants={modalVariants}
            onMouseMove={handleMouseMove}
            onClick={(e) => e.stopPropagation()}
            className={`relative w-full max-w-lg overflow-hidden rounded-[2rem] border shadow-2xl p-6 sm:p-7 flex flex-col gap-5 ${
              isDarkMode
                ? 'bg-studio-obsidian/95 border-[#8AA282]/20 shadow-[0_0_80px_rgba(138,162,130,0.14)]'
                : 'bg-[#FAF9F5]/95 border-[#E2DFD5] shadow-[0_0_80px_rgba(66,79,60,0.12)]'
            }`}
          >
            <motion.div className="pointer-events-none absolute inset-0 z-0" style={{ background: spotlightGlow }} />
            <motion.div className="pointer-events-none absolute inset-0 z-0 opacity-50" style={{ borderImage: borderGlow }} />

            <div className="relative z-10 flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-[10px] font-black tracking-[0.18em] uppercase ${
                  isDarkMode
                    ? 'bg-studio-sage/15 border-studio-sage/30 text-studio-moss'
                    : 'bg-studio-sage/12 border-studio-olive/25 text-studio-forest'
                }`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-studio-sage" />
                  {releaseData.badge}
                </div>
                <button
                  type="button"
                  onClick={onDismiss}
                  aria-label="Close release notes"
                  className={`w-8 h-8 rounded-full flex items-center justify-center border transition-colors cursor-pointer ${
                    isDarkMode
                      ? 'bg-white/5 border-white/10 text-studio-lichen hover:bg-white/10 hover:text-[#F2F0EB]'
                      : 'bg-[#F2F0EB] border-[#DFDCD2] text-[#555C50] hover:bg-[#EAE7DF] hover:text-[#232921]'
                  }`}
                >
                  <Icon name="x" className="w-3.5 h-3.5" stroke={2.2} />
                </button>
              </div>

              <motion.div variants={itemVariants} className="flex flex-col gap-1.5 items-center text-center">
                <h2
                  className={`text-3xl font-black tracking-tight ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#232921]'}`}
                  style={{ fontFamily: "'Outfit', sans-serif" }}
                >
                  {releaseData.headlineTop}{' '}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-studio-forest to-studio-sage">
                    {releaseData.headlineAccent}
                  </span>
                </h2>
                <p className={`text-xs max-w-sm leading-relaxed ${isDarkMode ? 'text-[#BFC6BA]' : 'text-[#555C50]'}`}>
                  {releaseData.subtitle}
                </p>
              </motion.div>

              {hasMarkdown ? (
                <motion.div
                  variants={itemVariants}
                  className={`w-full text-left rounded-2xl text-xs max-h-64 overflow-y-auto custom-scrollbar p-4 border font-normal ${
                    isDarkMode
                      ? 'bg-white/[0.03] border-white/10 text-[#DCD9CF]'
                      : 'bg-[#F2F0EB]/85 border-[#DFDCD2] text-[#394135]'
                  }`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>
                    {markdownBody}
                  </ReactMarkdown>
                </motion.div>
              ) : (
                <div className="flex flex-col gap-2.5 max-h-64 overflow-y-auto custom-scrollbar pr-1">
                  {releaseData.highlights.map((feat) => (
                    <motion.div
                      key={feat.title}
                      variants={itemVariants}
                      className={`flex items-start gap-3.5 p-3.5 rounded-2xl border transition-colors ${
                        isDarkMode
                          ? 'bg-white/[0.04] border-white/10 hover:bg-white/[0.07]'
                          : 'bg-[#F2F0EB]/85 border-[#E2DFD5] hover:bg-[#EAE7DF]/90'
                      }`}
                    >
                      <div
                        className={`mt-0.5 flex-none flex items-center justify-center w-8 h-8 rounded-xl ${
                          isDarkMode
                            ? 'bg-studio-sage/20 text-studio-moss'
                            : 'bg-[#FAF9F5] border border-[#DFDCD2] shadow-sm text-studio-forest'
                        }`}
                      >
                        <Icon name={feat.icon} className="w-4 h-4" />
                      </div>
                      <div className="flex flex-col gap-0.5 text-left">
                        <h3 className={`text-[12px] font-bold tracking-wide ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#232921]'}`}>
                          {feat.title}
                        </h3>
                        <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-[#BFC6BA]' : 'text-[#555C50]'}`}>
                          {feat.desc}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}

              <motion.div variants={itemVariants} className="pt-1 flex justify-center">
                <button
                  type="button"
                  onClick={onDismiss}
                  className="relative overflow-hidden group w-full py-3 rounded-xl bg-studio-forest text-[#FAF9F5] font-black text-xs uppercase tracking-widest shadow-lg shadow-studio-forest/25 transition-all hover:bg-studio-olive active:scale-[0.98] cursor-pointer"
                >
                  <span className="relative z-10">Experience It Now</span>
                </button>
              </motion.div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
