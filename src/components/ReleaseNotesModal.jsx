import React, { useRef, useEffect } from 'react';
import { motion, useMotionTemplate, useMotionValue, useSpring } from 'framer-motion';
import Icon from './Icon';

export default function ReleaseNotesModal({ onDismiss, isDarkMode }) {
  // 🎇 Ultra-premium mouse-tracking spotlight effect
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const cardRef = useRef(null);

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

  const overlayVariants = {
    hidden: { opacity: 0, backdropFilter: 'blur(0px)' },
    visible: { 
      opacity: 1, 
      backdropFilter: 'blur(20px)',
      transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] }
    },
    exit: { opacity: 0, backdropFilter: 'blur(0px)', transition: { duration: 0.5 } }
  };

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.85, y: 30, rotateX: 10, filter: 'blur(20px)' },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0, 
      rotateX: 0,
      filter: 'blur(0px)',
      transition: { 
        type: "spring", stiffness: 300, damping: 25, delay: 0.2, staggerChildren: 0.1, delayChildren: 0.3
      }
    },
    exit: { opacity: 0, scale: 0.95, y: -20, filter: 'blur(10px)', transition: { duration: 0.4 } }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 15, filter: 'blur(10px)' },
    visible: { 
      opacity: 1, 
      y: 0, 
      filter: 'blur(0px)',
      transition: { type: "spring", stiffness: 350, damping: 25 }
    }
  };

  const features = [
    {
      icon: "zap",
      title: "Precision. Perfected.",
      desc: "An entirely rebuilt Target Size engine. Compress media to your exact specifications without a single kilobyte of bloat."
    },
    {
      icon: "folder",
      title: "Frictionless Workflow.",
      desc: "Flawless native integration. Instantly summon your freshly compressed files in Windows Explorer with a single click."
    },
    {
      icon: "sparkles",
      title: "Obsessive Polish.",
      desc: "Every pixel scrutinized. From fluid dynamic dropdowns to intelligent hardware warnings, the interface is now smoother than ever."
    }
  ];

  return (
    <motion.div
      variants={overlayVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40"
      style={{ perspective: 1200 }}
    >
      <motion.div
        ref={cardRef}
        variants={modalVariants}
        onMouseMove={handleMouseMove}
        className={`relative w-full max-w-lg overflow-hidden rounded-[2rem] border shadow-2xl p-8 flex flex-col gap-8 ${
          isDarkMode ? 'bg-studio-obsidian border-white/10' : 'bg-white/80 border-white shadow-studio-violet/10'
        }`}
      >
        {/* Dynamic Spotlight Layers */}
        <motion.div className="pointer-events-none absolute inset-0 z-0" style={{ background: spotlightGlow }} />
        <motion.div className="pointer-events-none absolute inset-0 z-0 opacity-50" style={{ borderImage: borderGlow }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col gap-6">
          <motion.div variants={itemVariants} className="flex flex-col gap-2 items-center text-center">
            <div className="inline-flex items-center justify-center px-3 py-1 rounded-full bg-studio-violet/10 border border-studio-violet/20 text-studio-violet text-[10px] font-black tracking-[0.2em] uppercase mb-2">
              Update 1.1 is here
            </div>
            <h2 className={`text-4xl font-black tracking-tight ${isDarkMode ? 'text-white' : 'text-slate-900'}`} style={{ fontFamily: "'Outfit', sans-serif" }}>
              Redefining <span className="text-transparent bg-clip-text bg-gradient-to-r from-studio-violet to-fuchsia-500">Excellence.</span>
            </h2>
            <p className={`text-sm max-w-sm ${isDarkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              We didn't just update the app. We obsessed over every mathematical detail to deliver an unprecedented experience.
            </p>
          </motion.div>

          <div className="flex flex-col gap-4 mt-2">
            {features.map((feat, i) => (
              <motion.div key={i} variants={itemVariants} className={`flex items-start gap-4 p-4 rounded-2xl border transition-colors ${isDarkMode ? 'bg-white/5 border-white/5 hover:bg-white/10' : 'bg-slate-50 border-slate-100 hover:bg-slate-100'}`}>
                <div className={`mt-1 flex items-center justify-center w-8 h-8 rounded-full ${isDarkMode ? 'bg-studio-violet/20 text-studio-violet' : 'bg-white shadow-sm text-studio-violet'}`}>
                  <Icon name={feat.icon} className="w-4 h-4" />
                </div>
                <div className="flex flex-col gap-1">
                  <h3 className={`text-[13px] font-bold tracking-wide ${isDarkMode ? 'text-white' : 'text-slate-900'}`}>{feat.title}</h3>
                  <p className={`text-[11px] leading-relaxed ${isDarkMode ? 'text-slate-400' : 'text-slate-600'}`}>{feat.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          <motion.div variants={itemVariants} className="mt-4 flex justify-center">
            <button
              onClick={onDismiss}
              className="relative overflow-hidden group px-8 py-3 rounded-xl bg-studio-violet text-white font-bold text-xs tracking-widest shadow-lg shadow-studio-violet/30 transition-all hover:scale-105 hover:shadow-studio-violet/50 active:scale-95"
            >
              <span className="relative z-10">EXPERIENCE IT NOW</span>
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out" />
            </button>
          </motion.div>
        </div>
      </motion.div>
    </motion.div>
  );
}
