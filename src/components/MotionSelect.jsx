import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

/**
 * MotionSelect — A professional custom dropdown built with Framer Motion.
 * Replaces <select> with an animated panel that slides open.
 *
 * Props:
 *  - value: string  (current value)
 *  - onChange: (newValue: string) => void
 *  - options: [{ value: string, label: string }]
 *  - style?: React.CSSProperties
 */
export default function MotionSelect({ value, onChange, options, isDarkMode = false, style = {} }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selectedLabel = options.find((o) => o.value === value)?.label ?? value;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%", ...style }}>
      {/* Trigger button */}
      <motion.button
        type="button"
        onClick={() => setOpen((v) => !v)}
        whileHover={{ borderColor: isDarkMode ? "rgba(138,162,130,0.65)" : "rgba(66,79,60,0.55)" }}
        whileTap={{ scale: 0.99 }}
        transition={{ duration: 0.15 }}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "9px 12px",
          borderRadius: "10px",
          border: isDarkMode ? "1.5px solid rgba(138,162,130,0.22)" : "1.5px solid rgba(66,79,60,0.28)",
          background: isDarkMode ? "rgba(22, 29, 23, 0.72)" : "rgba(250, 249, 245, 0.92)",
          backdropFilter: "blur(6px)",
          boxShadow: isDarkMode ? "none" : "0 2px 8px rgba(66,79,60,0.06)",
          cursor: "pointer",
          fontSize: "12px",
          fontWeight: "600",
          fontFamily: "inherit",
          color: isDarkMode ? "#E5E2D9" : "#262D24",
          textAlign: "left",
          outline: "none",
        }}
      >
        <span>{selectedLabel}</span>
        <motion.svg
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ opacity: 0.5, flexShrink: 0 }}
        >
          <polyline points="6 9 12 15 18 9" />
        </motion.svg>
      </motion.button>

      {/* Dropdown panel */}
      <AnimatePresence mode="wait">
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 400, damping: 28 }}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              right: 0,
              zIndex: 1000,
              background: isDarkMode ? "rgba(18, 24, 19, 0.96)" : "rgba(250, 249, 245, 0.96)",
              backdropFilter: "blur(16px)",
              border: isDarkMode ? "1.5px solid rgba(138,162,130,0.22)" : "1.5px solid rgba(66,79,60,0.22)",
              borderRadius: "12px",
              overflow: "hidden",
              boxShadow: isDarkMode 
                ? "0 20px 50px rgba(0,0,0,0.45), 0 0 12px rgba(138,162,130,0.12)" 
                : "0 12px 40px rgba(42,48,38,0.12), 0 2px 8px rgba(66,79,60,0.08)",
            }}
          >
            {options.map((opt, idx) => (
              <motion.div
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                whileHover={{ background: isDarkMode ? "rgba(138,162,130,0.12)" : "rgba(138,162,130,0.15)" }}
                whileTap={{ scale: 0.98 }}
                style={{
                  padding: "10px 14px",
                  fontSize: "12px",
                  fontWeight: opt.value === value ? "700" : "600",
                  color: opt.value === value ? (isDarkMode ? "#9DB290" : "#424F3C") : (isDarkMode ? "#B6BCB0" : "#3E453B"),
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  borderBottom: idx < options.length - 1 
                    ? (isDarkMode ? "1px solid rgba(138,162,130,0.1)" : "1px solid rgba(66,79,60,0.08)") 
                    : "none",
                }}
              >
                <span>{opt.label}</span>
                <AnimatePresence>
                  {opt.value === value && (
                    <motion.svg
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={{ type: "spring", stiffness: 500, damping: 25 }}
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={isDarkMode ? "#9DB290" : "#424F3C"}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </motion.svg>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
