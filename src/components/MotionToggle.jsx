import { motion } from "framer-motion";

/**
 * MotionToggle — A professional, fully animated iOS-style toggle switch
 * using Framer Motion for the sliding knob and spring physics.
 *
 * Props:
 *  - checked: boolean
 *  - onChange: (newValue: boolean) => void
 *  - disabled?: boolean
 */
export default function MotionToggle({ checked, onChange, disabled = false }) {
  const TRACK_W = 40;
  const TRACK_H = 22;
  const KNOB = 16;
  const KNOB_OFFSET = 3;

  return (
    <motion.div
      onClick={() => !disabled && onChange(!checked)}
      style={{
        width: TRACK_W,
        height: TRACK_H,
        borderRadius: TRACK_H / 2,
        display: "flex",
        alignItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: `0 ${KNOB_OFFSET}px`,
        flexShrink: 0,
        position: "relative",
        opacity: disabled ? 0.45 : 1,
      }}
      animate={{
        backgroundColor: checked ? "#8b5cf6" : "rgba(148,163,184,0.35)",
        boxShadow: checked
          ? "0 0 0 3px rgba(139,92,246,0.18), inset 0 1px 2px rgba(0,0,0,0.2)"
          : "inset 0 1px 2px rgba(0,0,0,0.1)",
      }}
      transition={{ duration: 0.25, ease: "easeInOut" }}
      whileTap={!disabled ? { scale: 0.93 } : {}}
    >
      <motion.div
        style={{
          width: KNOB,
          height: KNOB,
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 4px rgba(0,0,0,0.25)",
          position: "absolute",
        }}
        animate={{ x: checked ? TRACK_W - KNOB - KNOB_OFFSET * 2 : 0 }}
        transition={{ type: "spring", stiffness: 500, damping: 30 }}
      />
    </motion.div>
  );
}
