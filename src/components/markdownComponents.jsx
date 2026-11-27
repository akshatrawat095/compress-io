import React from 'react';
import { motion } from 'framer-motion';

function stripNode({ ...props }) {
  delete props.node;
  return props;
}

/**
 * Shared Tailwind/Framer-Motion component map for rendering release changelog
 * Markdown consistently across UpdaterModal and ReleaseNotesModal.
 */
export function buildMarkdownComponents(isDarkMode, staggerVariants) {
  const motionBlockProps = staggerVariants
    ? {
        variants: staggerVariants,
        initial: 'hidden',
        whileInView: 'visible',
        viewport: { once: true },
      }
    : {};

  return {
    h2: (raw) => (
      <motion.h2
        {...motionBlockProps}
        className={`text-sm font-black mb-2 tracking-wide ${isDarkMode ? 'text-[#F2F0EB]' : 'text-[#232921]'}`}
        {...stripNode(raw)}
      />
    ),
    h3: (raw) => (
      <motion.h3
        {...motionBlockProps}
        className={`text-xs font-bold uppercase tracking-wider mt-4 mb-2 ${isDarkMode ? 'text-studio-moss' : 'text-studio-forest'}`}
        {...stripNode(raw)}
      />
    ),
    p: (raw) => (
      <motion.p
        {...motionBlockProps}
        className="mb-2 leading-relaxed opacity-90 text-xs"
        {...stripNode(raw)}
      />
    ),
    ul: (raw) => (
      <ul
        className="list-disc list-inside space-y-1.5 my-2 pl-1 leading-relaxed text-xs opacity-90"
        {...stripNode(raw)}
      />
    ),
    li: (raw) => <li className="leading-relaxed" {...stripNode(raw)} />,
    code: ({ inline, ...rest }) =>
      inline ? (
        <code
          className={`px-1.5 py-0.5 rounded font-mono text-[11px] ${
            isDarkMode ? 'bg-white/10 text-studio-moss' : 'bg-studio-sage/15 text-studio-forest'
          }`}
          {...stripNode(rest)}
        />
      ) : (
        <code {...stripNode(rest)} />
      ),
    pre: (raw) => (
      <pre
        className={`p-3 my-2.5 rounded-lg text-[11px] font-mono overflow-x-auto border ${
          isDarkMode
            ? 'bg-black/40 border-white/5 text-[#E5E2D9]'
            : 'bg-[#EFECE4] border-[#DFDCD2] text-[#232921]'
        }`}
        {...stripNode(raw)}
      />
    ),
    table: (raw) => (
      <div
        className={`overflow-x-auto my-3 rounded-lg border ${
          isDarkMode ? 'border-white/10' : 'border-[#DFDCD2]'
        }`}
      >
        <table className="w-full text-left border-collapse text-[11px]" {...stripNode(raw)} />
      </div>
    ),
    th: (raw) => (
      <th
        className={`border-b py-2 px-3 font-bold ${
          isDarkMode
            ? 'border-white/10 bg-white/5 text-[#F2F0EB]'
            : 'border-[#DFDCD2] bg-[#EAE7DF] text-[#232921]'
        }`}
        {...stripNode(raw)}
      />
    ),
    tr: (raw) => (
      <tr
        className={`border-b last:border-b-0 ${
          isDarkMode ? 'border-white/5 hover:bg-white/5' : 'border-[#EAE7DF] hover:bg-[#EFECE4]'
        } transition-colors`}
        {...stripNode(raw)}
      />
    ),
    td: (raw) => <td className="py-2 px-3 opacity-85" {...stripNode(raw)} />,
    hr: (raw) => (
      <hr
        className={`my-3 ${isDarkMode ? 'border-white/10' : 'border-[#DFDCD2]'}`}
        {...stripNode(raw)}
      />
    ),
    blockquote: (raw) => (
      <blockquote
        className={`border-l-2 border-studio-sage pl-3 py-1.5 my-2 text-xs italic rounded-r-lg ${
          isDarkMode ? 'bg-studio-sage/10 text-[#D7DDD3]' : 'bg-studio-sage/10 text-[#495046]'
        }`}
        {...stripNode(raw)}
      />
    ),
  };
}
