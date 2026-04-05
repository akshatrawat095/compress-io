import { useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "framer-motion";

export default function Magnetic({ children }) {
    const ref = useRef(null);
    const [position, setPosition] = useState({ x: 0, y: 0 });

    const x = useMotionValue(0);
    const y = useMotionValue(0);

    const springConfig = { damping: 20, stiffness: 150, mass: 0.6 };
    const springX = useSpring(x, springConfig);
    const springY = useSpring(y, springConfig);

    const handleMouse = (e) => {
        const { clientX, clientY } = e;
        const { height, width, left, top } = ref.current.getBoundingClientRect();
        const middleX = clientX - (left + width / 2);
        const middleY = clientY - (top + height / 2);
        
        // Multiplier controls the "strength" of the magnetic pull
        x.set(middleX * 0.35);
        y.set(middleY * 0.35);
    };

    const reset = () => {
        x.set(0);
        y.set(0);
    };

    return (
        <motion.div
            style={{ position: "relative" }}
            ref={ref}
            onMouseMove={handleMouse}
            onMouseLeave={reset}
            animate={{ x: springX, y: springY }}
        >
            {children}
        </motion.div>
    );
}
