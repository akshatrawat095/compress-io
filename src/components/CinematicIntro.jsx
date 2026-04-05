import { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function CinematicIntro({ onComplete, appMode }) {
  const [isExiting, setIsExiting] = useState(false);
  const logoText = appMode === 'enhance' ? 'ENHANCE I/O' : 'COMPRESS I/O';
  const logoIcon = appMode === 'enhance' ? '✨' : '⚡';
  const accent = appMode === 'enhance' ? '#f43f5e' : '#8b5cf6';

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
  }, [onComplete]);

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
        background: '#020617',
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

      {/* ⚡ Core Logo Icon Snap */}
      <motion.div
        initial={{ scale: 0, opacity: 0, rotate: -180 }}
        animate={{ 
          scale: [0, 1.2, 1], 
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
        style={{ 
          fontSize: '72px', 
          zIndex: 10, 
          marginBottom: '20px',
          filter: `drop-shadow(0 0 20px ${accent}44)`
        }}
      >
        {logoIcon}
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
          color: 'white', 
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
