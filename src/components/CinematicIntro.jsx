import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import Icon from './Icon';

export default function CinematicIntro({ onComplete, appMode }) {
  const [isExiting, setIsExiting] = useState(false);
  const logoText = appMode === 'enhance' ? 'ENHANCE I/O' : 'COMPRESS I/O';
  const accent = appMode === 'enhance' ? '#747B4D' : '#8AA282';

  // 🎇 Generate 40 minimalist particles with random trajectories
  const particles = useMemo(() => {
    return Array.from({ length: 42 }).map((_, i) => ({
      id: i,
      x: (Math.random() - 0.5) * 800,
      y: (Math.random() - 0.5) * 800,
      size: Math.random() * 3 + 1,
      delay: Math.random() * 0.5
    }));
  }, []);

  useEffect(() => {
    // 🛡️ Sequence Timeline: Assemble -> Hold -> Snap Exit
    const sequenceTimer = setTimeout(() => setIsExiting(true), 2400);
    const completeTimer = setTimeout(onComplete, 3200);

    return () => {
      clearTimeout(sequenceTimer);
      clearTimeout(completeTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const containerVariants = {
    initial: { 
      opacity: 1,
      scale: 1
    },
    exit: { 
      opacity: 0,
      scale: 1.15,
      filter: "blur(40px)",
      transition: { 
        duration: 0.7, 
        ease: [0.16, 1, 0.3, 1] 
      } 
    }
  };

  const particleVariants = {
    hidden: { x: 0, y: 0, opacity: 0, scale: 0 },
    explode: (p) => ({
      x: p.x,
      y: p.y,
      opacity: [0, 1, 0.4],
      scale: 1,
      transition: { 
        duration: 0.8, 
        ease: "easeOut",
        delay: p.delay 
      }
    }),
    snap: {
      x: 0,
      y: 0,
      opacity: 0,
      scale: 0,
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 15,
        delay: 1.2
      }
    }
  };

  const textContainer = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.04,
        delayChildren: 1.4
      }
    }
  };

  const charVariants = {
    hidden: { opacity: 0, y: 25, scale: 0.8, filter: 'blur(10px)' },
    visible: { 
      opacity: 1, 
      y: 0, 
      scale: 1,
      filter: 'blur(0px)',
      transition: { 
        type: "spring", 
        stiffness: 350, 
        damping: 12 
      }
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="initial"
      animate={isExiting ? "exit" : "initial"}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        background: '#0E130F',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}
    >
      {/* 🎇 Anime.js Style Particle Assembly */}
      <div className="absolute inset-0 flex items-center justify-center">
        {particles.map((p) => (
          <motion.div
            key={p.id}
            custom={p}
            variants={particleVariants}
            initial="hidden"
            animate={["explode", "snap"]}
            style={{
              position: 'absolute',
              width: p.size,
              height: p.size,
              borderRadius: '50%',
              background: accent,
              boxShadow: `0 0 10px ${accent}66`
            }}
          />
        ))}
      </div>

      {/* Core Studio Emblem Snap */}
      <motion.div
        initial={{ scale: 0, opacity: 0, rotate: -90 }}
        animate={{ 
          scale: [0, 1.12, 1], 
          opacity: 1, 
          rotate: 0 
        }}
        transition={{ 
          delay: 1.4, 
          duration: 0.8, 
          type: "spring", 
          stiffness: 300, 
          damping: 15 
        }}
        className="p-5 rounded-3xl bg-gradient-to-br from-[#666B54] to-[#424F3C] ring-1 ring-white/20 mb-5 z-10"
        style={{ 
          boxShadow: `0 0 36px ${accent}44`
        }}
      >
        <Icon name={appMode === 'enhance' ? 'sparkles' : 'compressLogo'} className="w-14 h-14 text-[#F2F0EB]" stroke={1.9} />
      </motion.div>

      {/* 🍱 Staggered Ripple Text */}
      <motion.div 
        variants={textContainer}
        initial="hidden"
        animate="visible"
        style={{ 
          display: 'flex', 
          fontSize: '28px', 
          fontWeight: '900', 
          color: '#F2F0EB', 
          letterSpacing: '0.3em', 
          zIndex: 10,
          fontFamily: "'Outfit', sans-serif"
        }}
      >
        {logoText.split('').map((char, i) => (
          <motion.span key={i} variants={charVariants}>
            {char === ' ' ? '\u00A0' : char}
          </motion.span>
        ))}
      </motion.div>

      {/* 💈 Atmosphere Glow */}
      <motion.div
        animate={{ 
          opacity: [0.1, 0.2, 0.1],
          scale: [1, 1.1, 1] 
        }}
        transition={{ duration: 4, repeat: Infinity }}
        style={{
          position: 'absolute',
          width: '600px',
          height: '600px',
          background: `radial-gradient(circle, ${accent}22 0%, transparent 70%)`,
          filter: 'blur(80px)',
          zIndex: 0
        }}
      />
    </motion.div>
  );
}
