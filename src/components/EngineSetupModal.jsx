import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Icon from './Icon';

function formatMiB(bytes) {
  if (!bytes || bytes <= 0) return '0.0';
  return (bytes / (1024 * 1024)).toFixed(1);
}

export default function EngineSetupModal({ isDarkMode, runtime }) {
  const shouldShow = runtime && (runtime.status === 'setting_up' || runtime.status === 'error');
  const stageLabel =
    runtime?.stage === 'verifying'
      ? 'VERIFYING SHA-256 CHECKSUM...'
      : runtime?.stage === 'extracting'
        ? 'EXTRACTING VERIFIED BINARY...'
        : 'DOWNLOADING MEDIA ENGINE...';

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, backdropFilter: 'blur(20px)' }}
          exit={{ opacity: 0, backdropFilter: 'blur(0px)' }}
          transition={{ duration: 0.35 }}
          className={`fixed inset-0 z-[55000] flex items-center justify-center p-4 ${
            isDarkMode ? 'bg-[#0E130F]/88' : 'bg-[#1D241C]/45'
          }`}
        >
          <motion.div
            initial={{ y: 18, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -10, opacity: 0, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className={`relative max-w-md w-full p-6 rounded-[2rem] flex flex-col items-center text-center shadow-2xl border overflow-hidden ${
              isDarkMode
                ? 'bg-studio-obsidian/95 border-[#8AA282]/20 shadow-[0_0_80px_rgba(138,162,130,0.14)]'
                : 'bg-[#FAF9F5]/95 border-[#E2DFD5] shadow-[0_0_80px_rgba(66,79,60,0.12)]'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-studio-olive to-studio-forest flex items-center justify-center shadow-lg shadow-studio-forest/25 mb-4">
              <Icon name="compressLogo" className="w-7 h-7 text-[#FAF9F5]" stroke={2} />
            </div>

            <h2 className={`text-lg font-black uppercase tracking-widest mb-1 ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#232921]'}`}>
              One-Time Engine Setup
            </h2>

            <p className={`text-xs leading-relaxed mb-5 max-w-sm ${isDarkMode ? 'text-[#BFC6BA]' : 'text-[#555C50]'}`}>
              Installing the hardware-accelerated FFmpeg runtime into local cache. Verified via SHA-256 and skipped on all future app updates.
            </p>

            {runtime.status === 'setting_up' ? (
              <div className="w-full flex flex-col gap-2.5">
                <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDarkMode ? 'bg-white/10' : 'bg-[#EAE7DF]'}`}>
                  <motion.div
                    className="h-full bg-gradient-to-r from-studio-forest via-studio-olive to-studio-sage"
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(4, runtime.progress)}%` }}
                    transition={{ ease: 'easeOut', duration: 0.25 }}
                  />
                </div>
                <div className="flex justify-between items-center text-[10px] font-black font-mono tracking-wider">
                  <span className={isDarkMode ? 'text-studio-lichen' : 'text-[#555C50]'}>{stageLabel}</span>
                  <span className={isDarkMode ? 'text-studio-moss' : 'text-studio-forest'}>
                    {runtime.totalBytes > 0
                      ? `${formatMiB(runtime.downloadedBytes)} / ${formatMiB(runtime.totalBytes)} MB`
                      : `${Math.round(runtime.progress)}%`}
                  </span>
                </div>
              </div>
            ) : (
              <div className="w-full flex flex-col gap-3">
                <div className={`p-3 rounded-xl text-[11px] font-medium border text-left break-words ${
                  isDarkMode ? 'bg-[#B85442]/12 border-[#B85442]/30 text-[#F2B8AD]' : 'bg-[#FDF1EE] border-[#E7BFB6] text-[#8F3728]'
                }`}>
                  {runtime.errorMsg || 'Network error while downloading the FFmpeg engine.'}
                </div>
                <button
                  onClick={runtime.retry}
                  className="w-full py-3 rounded-xl font-black text-xs uppercase tracking-widest bg-studio-forest hover:bg-studio-olive text-[#FAF9F5] shadow-[0_6px_18px_rgba(66,79,60,0.28)] transition-all"
                >
                  Retry Engine Setup
                </button>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
