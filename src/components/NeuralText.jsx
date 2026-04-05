import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789%@#&*!$?/|[]{}";

const NeuralText = React.memo(({ text, speed = 40, isDarkMode = true }) => {
  const [displayText, setDisplayText] = useState(text);
  const iteration = useRef(0);
  const timeoutId = useRef(null);

  useEffect(() => {
    iteration.current = 0;
    
    if (timeoutId.current) clearInterval(timeoutId.current);

    // Initial scramble
    timeoutId.current = setInterval(() => {
      setDisplayText(prev => 
        text.split("").map((letter, index) => {
          if (index < iteration.current) {
            return text[index];
          }
          return chars[Math.floor(Math.random() * chars.length)];
        }).join("")
      );

      if (iteration.current >= text.length) {
        clearInterval(timeoutId.current);
      }

      iteration.current += 1 / 2.5; 
    }, speed);

    return () => clearInterval(timeoutId.current);
  }, [text, speed]);

  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`font-mono tracking-tight font-bold ${isDarkMode ? 'text-studio-violet' : 'text-slate-800'}`}
    >
      {displayText}
    </motion.span>
  );
});

NeuralText.displayName = "NeuralText";

export default NeuralText;
