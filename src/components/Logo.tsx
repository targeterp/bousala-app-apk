import { motion } from 'motion/react';

export const Logo = ({ className = "w-8 h-8", animate = true }: { className?: string, animate?: boolean }) => {
  return (
    <motion.svg 
      viewBox="0 0 100 100" 
      className={className}
      initial="initial"
      whileHover={animate ? "hover" : "initial"}
      whileTap={animate ? "tap" : "initial"}
    >
      <motion.path 
        d="M 10 15 L 83 15 L 35 43 Z" 
        fill="currentColor" 
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
        variants={{
          initial: { x: 0, y: 0 },
          hover: { x: -3, y: -3 },
          tap: { x: -1, y: -1 }
        }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      />
      <motion.path 
        d="M 48 52 L 96 24 L 50 85 Z" 
        fill="currentColor" 
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="round"
        variants={{
          initial: { x: 0, y: 0 },
          hover: { x: 3, y: 3 },
          tap: { x: 1, y: 1 }
        }}
        transition={{ type: "spring", stiffness: 400, damping: 10 }}
      />
    </motion.svg>
  );
};
