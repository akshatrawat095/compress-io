import { motion, AnimatePresence } from 'framer-motion';

export default function QuantumBurst({ active, color }) {
  const particleCount = 15;
  const particles = Array.from({ length: particleCount });

  return (
    <div 
      style={{ 
        position: 'absolute', 
        inset: 0,
        pointerEvents: 'none', 
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }} 
    >
      <AnimatePresence>
        {active && particles.map((_, i) => (
          <motion.div
            key={`p-${i}`}
            initial={{ 
              x: 0, 
              y: 0, 
              scale: 0, 
              rotate: 0, 
              opacity: 1 
            }}
            animate={{ 
              x: (Math.random() - 0.5) * 120, 
              y: (Math.random() - 0.5) * 120, 
              scale: [0, 1.5, 0],
              rotate: Math.random() * 720 - 360,
              opacity: [1, 1, 0]
            }}
            exit={{ opacity: 0 }}
            transition={{ 
              duration: 1.2, 
              ease: "easeOut",
              delay: i * 0.02
            }}
            style={{
              position: 'absolute',
              fontFamily: 'monospace',
              fontSize: '10px',
              fontWeight: '900',
              color: color || '#8b5cf6',
              userSelect: 'none',
              textShadow: `0 0 5px ${color || '#8b5cf6'}66`
            }}
          >
            {Math.random() > 0.5 ? '0' : '1'}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
