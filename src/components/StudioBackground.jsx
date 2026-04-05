import React, { useEffect } from "react";
import { motion, AnimatePresence, useTransform, useSpring, useMotionValue } from "framer-motion";

const StudioBackground = React.memo(({ 
  progress, 
  isProcessing, 
  appMode, 
  isDarkMode,
  mouseX,
  mouseY,
  isDragging
}) => {
  // 🎢 Standard Motion Value synced with the progress prop
  const mProgress = useMotionValue(progress);
  
  useEffect(() => {
    mProgress.set(progress);
  }, [progress, mProgress]);

  // 🎡 Smooth progress spring
  const springProgress = useSpring(mProgress, { stiffness: 45, damping: 15 });

  // 🧲 Parallax setup: Blooms reacting to mouse movement
  // We use extra-stiff springs for immediate undeniable movement to confirm visibility
  const mouseXSpring = useSpring(mouseX || 0, { stiffness: 100, damping: 40 });
  const mouseYSpring = useSpring(mouseY || 0, { stiffness: 100, damping: 40 });

  // Triple the previous range for undeniable visibility: [-150px to 150px]
  const parallaxX = useTransform(mouseXSpring, [0, 1920], [-150, 150]);
  const parallaxY = useTransform(mouseYSpring, [0, 1080], [-100, 100]);

  // ✨ Dynamic Transforms: Blooms as progress increases
  const auraScale = useTransform(springProgress, [0, 100], [1.2, 3.0]);
  const auraOpacity = useTransform(springProgress, [0, 100], [0.55, 0.95]);
  const auraRotate = useTransform(springProgress, [0, 100], [0, 360]);

  const bgBase = isDarkMode ? "#030712" : "#f8fafc";
  const accent1 = appMode === "enhance" ? "#f43f5e" : "#8b5cf6";
  const accent2 = appMode === "enhance" ? "#fb7185" : "#a78bfa";

  // 🧪 Chromatic Aberration: Color splits during heavy processing
  const redTransform = useTransform(springProgress, [0, 100], ["0px 0px", "8px -8px"]);
  const blueTransform = useTransform(springProgress, [0, 100], ["0px 0px", "-8px 8px"]);

  // 🌫 Reliable Base64 Noise: No external URL required
  const noiseSvg = `data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E`;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      style={{
        zIndex: -1,
        background: bgBase,
        transition: "background 1s cubic-bezier(0.4, 0, 0.2, 1)",
      }}
    >
      {/* 🕸️ Neural Grid Overlay: High Intensity Pulsing & Morphing */}
      <motion.div 
        layout
        initial={false}
        animate={{ 
          opacity: isProcessing ? [0.1, 0.25, 0.1] : (appMode === 'enhance' ? 0.14 : 0.08),
          scale: isProcessing ? [1.0, 1.08, 1.0] : 1,
          backgroundSize: appMode === 'enhance' ? "40px 40px" : "60px 60px"
        }}
        transition={{ 
          layout: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
          opacity: { duration: 0.8 },
          backgroundSize: { duration: 0.8 }
        }}
        className="absolute inset-0 z-0"
        style={{
          backgroundImage: isDarkMode 
            ? "radial-gradient(circle at 1.5px 1.5px, rgba(255,255,255,0.12) 1.5px, transparent 0)"
            : "radial-gradient(circle at 1.5px 1.5px, rgba(139,92,246,0.18) 1.5px, transparent 0)",
        }}
      />

      {/* ⌬ Secondary Neural Web: Exclusive to Enhance Mode */}
      <AnimatePresence>
        {appMode === 'enhance' && (
          <motion.div 
            initial={{ opacity: 0, scale: 1.1 }}
            animate={{ opacity: 0.06, scale: 1 }}
            exit={{ opacity: 0, scale: 1.1 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0 z-0"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='100' height='100' viewBox='0 0 100 100' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M50 0 L100 25 L100 75 L50 100 L0 75 L0 25 Z' fill='none' stroke='${isDarkMode ? 'white' : 'black'}' stroke-width='0.5' opacity='0.5'/%3E%3C/svg%3E")`,
              backgroundSize: "100px 86px"
            }}
          />
        )}
      </AnimatePresence>

      {/* 🔮 Reactive Gaussian Engine */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center scale-110"
        style={{
          rotate: auraRotate,
          x: parallaxX,
          y: parallaxY,
        }}
      >
        {/* Chromatic Layer: Red Channel */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: "85vw",
            height: "85vw",
            background: `radial-gradient(circle, #f43f5e55 0%, transparent 60%)`,
            filter: "blur(100px)",
            scale: auraScale,
            opacity: isProcessing ? 0.4 : 0,
            x: redTransform,
            mixBlendMode: "screen",
            willChange: "transform, opacity",
          }}
        />

        {/* Main Blob: Dynamic Multi-Accent Core */}
        <motion.div
          animate={{
            x: isProcessing ? [0, 40, -40, 0] : [0, 60, 0],
            y: isProcessing ? [0, -20, 20, 0] : [0, -40, 0],
          }}
          transition={{
            duration: isProcessing ? 2.5 : 20,
            repeat: Infinity,
            ease: "easeInOut",
          }}
          className="absolute rounded-full"
          style={{
            width: "80vw",
            height: "80vw",
            background: `radial-gradient(circle, ${accent1}aa 0%, ${accent2}66 40%, transparent 70%)`,
            filter: `blur(90px)`,
            scale: auraScale,
            opacity: auraOpacity,
            willChange: "transform, opacity",
          }}
        />

        {/* Chromatic Layer: Blue Channel */}
        <motion.div
          className="absolute rounded-full"
          style={{
            width: "85vw",
            height: "85vw",
            background: `radial-gradient(circle, #3b82f655 0%, transparent 60%)`,
            filter: "blur(100px)",
            scale: auraScale,
            opacity: isProcessing ? 0.4 : 0,
            x: blueTransform,
            mixBlendMode: "screen",
            willChange: "transform, opacity",
          }}
        />
      </motion.div>

      {/* 🌊 Interaction Ripple: Forceful Visual Response to Drag */}
      <motion.div 
        animate={{ 
          scale: isDragging ? 1.8 : 0,
          opacity: isDragging ? 0.8 : 0
        }}
        transition={{ type: "spring", stiffness: 100, damping: 15 }}
        className="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <div className={`w-[80vw] h-[80vw] rounded-full blur-[140px] transition-colors duration-700 ${
          appMode === 'compress' 
          ? (isDarkMode ? 'bg-studio-violet/40' : 'bg-studio-violet/20') 
          : (isDarkMode ? 'bg-studio-rose/40' : 'bg-studio-rose/20')
        }`} />
      </motion.div>

      {/* 🔦 Tracking Beam: Focused cursor response during ingest */}
      <motion.div 
        animate={{ opacity: isDragging ? 0.6 : 0 }}
        className="absolute inset-0 z-10 pointer-events-none"
        style={{
          background: useTransform(
            [mouseX, mouseY],
            ([x, y]) => `radial-gradient(400px circle at ${x}px ${y}px, ${appMode === 'compress' ? 'rgba(139,92,246,0.15)' : 'rgba(244,63,94,0.15)'}, transparent 80%)`
          )
        }}
      />

      {/* 🌫 Reliable Atmospheric "Dancing" Grain - Always Offline Responsive */}
      <motion.div 
        animate={{ 
          x: [0, 10, -10, 0],
          y: [0, -8, 8, 0]
        }}
        transition={{ duration: 0.15, repeat: Infinity, ease: "linear" }}
        className="absolute inset-[-10%] opacity-[0.14] pointer-events-none mix-blend-overlay"
        style={{ 
          backgroundImage: `url("${noiseSvg}")`,
          backgroundSize: "200px 200px",
          filter: "brightness(0.9) contrast(1.8)",
          zIndex: 1 
        }} 
      />
    </div>
  );
});

StudioBackground.displayName = "StudioBackground";

export default StudioBackground;
