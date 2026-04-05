import React from "react";
import { motion, useSpring, useTransform } from "framer-motion";

const RollingDigit = React.memo(({ value }) => {
  // Use a spring to make the transition feel mechanical and high-end
  const springValue = useSpring(value, {
    stiffness: 80,
    damping: 15,
    restDelta: 0.001
  });

  // 🔗 RE-SYNC: Ensure the spring follows the live value
  React.useEffect(() => {
    springValue.set(value);
  }, [value, springValue]);

  // Map the spring value (0-9) to the vertical translate percentage
  const translateY = useTransform(springValue, (v) => `${-v * 10}%`);

  return (
    <div className="relative h-[1em] overflow-hidden flex flex-col items-center">
      <motion.div
        style={{ y: translateY }}
        className="flex flex-col items-center"
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
          <span key={digit} className="leading-none select-none">
            {digit}
          </span>
        ))}
      </motion.div>
    </div>
  );
});

RollingDigit.displayName = "RollingDigit";

export default RollingDigit;
