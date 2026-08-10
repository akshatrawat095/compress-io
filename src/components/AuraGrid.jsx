import React from 'react';
import { motion } from 'framer-motion';

const AuraGrid = () => {
  return (
    <div className="absolute inset-0 z-0 overflow-hidden rounded-3xl pointer-events-none">
      {/* Mesh Gradient Aura Background */}
      <motion.div
        className="absolute inset-0 opacity-40 mix-blend-screen"
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.4 }}
        transition={{ duration: 2 }}
        style={{
          background: 'radial-gradient(circle at 50% 120%, rgba(225, 29, 72, 0.25) 0%, rgba(30, 27, 75, 0.5) 40%, transparent 70%)',
        }}
      />
      <motion.div
        className="absolute inset-0 opacity-20 mix-blend-screen"
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.1, 0.3, 0.1],
        }}
        transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
        style={{
          background: 'radial-gradient(circle at 20% 0%, rgba(225, 29, 72, 0.15) 0%, transparent 50%)',
        }}
      />
      <motion.div
        className="absolute inset-0 opacity-20 mix-blend-screen"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.1, 0.25, 0.1],
        }}
        transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
        style={{
          background: 'radial-gradient(circle at 80% 80%, rgba(139, 92, 246, 0.2) 0%, transparent 50%)',
        }}
      />

      {/* High-Tech Animated Grid */}
      <div 
        className="absolute inset-0 opacity-15"
        style={{
          backgroundImage: `
            linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
          maskImage: 'linear-gradient(to bottom, transparent, black 10%, black 90%, transparent)'
        }}
      />

      {/* Grid Scanline effect */}
      <motion.div
        className="absolute left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-studio-rose/30 to-transparent"
        animate={{ top: ['0%', '100%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  );
};

export default AuraGrid;
