import { useMemo } from 'react';
import { motion } from 'framer-motion';

export default function UniversalGrid({ isProcessing, isDarkMode, appMode }) {
  const rows = 12;
  const cols = 20; // Slightly reduced for performance, can increase if needed
  const totalDots = rows * cols;

  // Pre-calculate dot indices for consistent mapping
  const dots = useMemo(() => Array.from({ length: totalDots }), [totalDots]);

  const primaryColor = appMode === 'enhance' ? '#f43f5e' : '#8b5cf6';
  const glowColor = isDarkMode 
    ? (appMode === 'enhance' ? 'rgba(244, 63, 94, 0.6)' : 'rgba(139, 92, 246, 0.6)')
    : 'rgba(0, 0, 0, 0.1)';

  // Pulse animation variants
  const dotVariants = {
    idle: (i) => ({
      scale: [1, 1.2, 1],
      opacity: [0.1, 0.25, 0.1],
      transition: {
        duration: 3 + (i % 5) * 0.5,
        repeat: Infinity,
        ease: "easeInOut",
        delay: (i % 20) * 0.1
      }
    }),
    processing: (i) => ({
      scale: [1, 1.5, 1],
      opacity: [0.2, 0.7, 0.2],
      backgroundColor: primaryColor,
      transition: {
        duration: 1.2,
        repeat: Infinity,
        ease: "easeInOut",
        delay: (i % 10) * 0.05
      }
    })
  };

  return (
    <div 
      className={`universal-grid-container ${isDarkMode ? 'dark' : ''}`}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 0,
        pointerEvents: 'none', // Changed to none so it doesn't block UI interactions
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isDarkMode ? '#0f172a' : 'transparent'
      }}
    >
      <div 
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gridTemplateRows: `repeat(${rows}, 1fr)`,
          gap: '40px',
          width: '110vw',
          height: '110vh',
          padding: '100px',
          boxSizing: 'border-box',
          filter: isDarkMode ? 'blur(0.5px)' : 'none'
        }}
      >
        {dots.map((_, i) => (
          <motion.div
            key={i}
            custom={i}
            variants={dotVariants}
            animate={isProcessing ? "processing" : "idle"}
            initial={{ scale: 0, opacity: 0 }}
            whileInView={{ scale: 1, opacity: 0.15 }}
            viewport={{ once: true }}
            style={{
              width: '4px',
              height: '4px',
              borderRadius: '50%',
              backgroundColor: primaryColor,
              boxShadow: isDarkMode ? `0 0 10px ${primaryColor}` : 'none'
            }}
          />
        ))}
      </div>

      <style>{`
        .universal-grid-container {
            transition: background-color 1s ease;
        }
      `}</style>
    </div>
  );
}
