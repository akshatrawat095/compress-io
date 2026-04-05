import React from 'react';
import { motion } from 'framer-motion';

const pathVariants = {
  hidden: { pathLength: 0, opacity: 0 },
  visible: { 
    pathLength: 1, 
    opacity: 1,
    transition: { duration: 0.8, ease: "easeInOut" }
  }
};

const icons = {
  zap: <motion.path d="M4 14l9-10V10h7l-9 10V14H4z" variants={pathVariants} />,
  sparkles: (
    <>
      <motion.path d="M12 3v1" variants={pathVariants} />
      <motion.path d="M12 20v1" variants={pathVariants} />
      <motion.path d="M4 12H3" variants={pathVariants} />
      <motion.path d="M20 12h1" variants={pathVariants} />
      <motion.path d="M5.6 5.6l.7.7" variants={pathVariants} />
      <motion.path d="M17.7 17.7l.7.7" variants={pathVariants} />
      <motion.path d="M5.6 18.4l.7-.7" variants={pathVariants} />
      <motion.path d="M17.7 6.3l.7-.7" variants={pathVariants} />
    </>
  ),
  plus: <motion.path d="M12 5v14M5 12h14" variants={pathVariants} />,
  folder: <motion.path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2z" variants={pathVariants} />,
  cog: (
    <>
      <motion.circle cx="12" cy="12" r="3" variants={pathVariants} />
      <motion.path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1V15a2 2 0 0 1-2-2 2 2 0 0 1 2-2v-.09A1.65 1.65 0 0 0 5 8.6a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2v.09a1.65 1.65 0 0 0-1.51 1z" variants={pathVariants} />
    </>
  ),
  play: <motion.polygon points="5 3 19 12 5 21 5 3" variants={pathVariants} />,
  square: <motion.rect width="18" height="18" x="3" y="3" rx="2" variants={pathVariants} />,
  terminal: (
    <>
      <motion.polyline points="4 17 10 11 4 5" variants={pathVariants} />
      <motion.line x1="12" x2="20" y1="19" y2="19" variants={pathVariants} />
    </>
  ),
  cpu: (
    <>
      <motion.rect width="16" height="16" x="4" y="4" rx="2" variants={pathVariants} />
      <motion.path d="M9 9h6v6H9zM15 2v2M15 20v2M2 15h2M20 15h2M2 9h2M20 9h2M9 2v2M9 20v2" variants={pathVariants} />
    </>
  ),
  maximize: <motion.path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3" variants={pathVariants} />,
  chevronDown: <motion.polyline points="6 9 12 15 18 9" variants={pathVariants} />,
  trash: (
    <>
      <motion.path d="M3 6h18" variants={pathVariants} />
      <motion.path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" variants={pathVariants} />
      <motion.line x1="10" y1="11" x2="10" y2="17" variants={pathVariants} />
      <motion.line x1="14" y1="11" x2="14" y2="17" variants={pathVariants} />
    </>
  ),
  info: (
    <>
      <motion.circle cx="12" cy="12" r="10" variants={pathVariants} />
      <motion.path d="M12 16v-4M12 8h.01" variants={pathVariants} />
    </>
  ),
  download: (
    <>
      <motion.path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4L7 10l5 5 5-5 4 5z" variants={pathVariants} />
      <motion.polyline points="7 10 12 15 17 10" variants={pathVariants} />
      <motion.line x1="12" x2="12" y1="15" y2="3" variants={pathVariants} />
    </>
  ),
  studioUpload: (
    <>
      <motion.path d="M12 5v11" variants={pathVariants} />
      <motion.path d="m17 11-5 5-5-5" variants={pathVariants} />
      <motion.path d="M4 21h16" variants={pathVariants} />
    </>
  ),
  film: (
    <>
      <motion.rect width="18" height="18" x="3" y="3" rx="2" ry="2" variants={pathVariants} />
      <motion.path d="M7 3v18" variants={pathVariants} />
      <motion.path d="M17 3v18" variants={pathVariants} />
      <motion.path d="M3 7h4" variants={pathVariants} />
      <motion.path d="M3 12h4" variants={pathVariants} />
      <motion.path d="M3 17h4" variants={pathVariants} />
      <motion.path d="M17 7h4" variants={pathVariants} />
      <motion.path d="M17 12h4" variants={pathVariants} />
      <motion.path d="M17 17h4" variants={pathVariants} />
    </>
  ),
  image: (
    <>
      <motion.rect width="18" height="18" x="3" y="3" rx="2" ry="2" variants={pathVariants} />
      <motion.circle cx="9" cy="9" r="2" variants={pathVariants} />
      <motion.path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" variants={pathVariants} />
    </>
  ),
  check: <motion.polyline points="20 6 9 17 4 12" variants={pathVariants} />,
  x: <motion.path d="M18 6 6 18M6 6l12 12" variants={pathVariants} />,
  moon: <motion.path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" variants={pathVariants} />,
  sun: (
    <>
      <motion.circle cx="12" cy="12" r="4" variants={pathVariants} />
      <motion.path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" variants={pathVariants} />
    </>
  )
};

const extraIcons = {
  user: (
    <>
      <motion.path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" variants={pathVariants} />
      <motion.circle cx="12" cy="7" r="4" variants={pathVariants} />
    </>
  ),
  layers: (
    <>
      <motion.path d="m12 2 10 5-10 5-10-5 10-5z" variants={pathVariants} />
      <motion.path d="m2 12 10 5 10-5" variants={pathVariants} />
      <motion.path d="m2 17 10 5 10-5" variants={pathVariants} />
    </>
  ),
  wind: (
    <>
      <motion.path d="M12.8 17.5a2.5 2.5 0 1 1-2.3-3.5h7.5" variants={pathVariants} />
      <motion.path d="M14.7 4.5a2.5 2.5 0 1 0-2.2 3.5H20" variants={pathVariants} />
      <motion.path d="M8 11h11.7" variants={pathVariants} />
    </>
  )
};

Object.assign(icons, extraIcons);

const Icon = ({ name, className = "", stroke = 2 }) => {
  return (
    <svg 
      xmlns="http://www.w3.org/2000/svg" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth={stroke} 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      className={className}
    >
      <motion.g
        key={name}
        initial="hidden"
        animate="visible"
        variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
      >
        {icons[name] || <motion.path d="M12 12h.01" variants={pathVariants} />}
      </motion.g>
    </svg>
  );
};

export default Icon;
