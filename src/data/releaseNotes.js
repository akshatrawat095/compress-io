/**
 * Structured post-install / post-update highlights keyed by application SemVer.
 * Used when the app launches cleanly from an installer build or when no GitHub
 * Markdown release body was cached by the in-app updater.
 */
const STUDIO_ARCH_HIGHLIGHTS = [
  {
    icon: 'download',
    title: 'Custom Frameless Windows Installer',
    desc: 'Next-gen WebView2 setup with custom folder picker, live disk space check, atomic rollback, UAC elevation, and clean Uninstall.',
  },
  {
    icon: 'cpu',
    title: 'Native ARM64 + Multi-Platform Engine',
    desc: 'Native builds across Windows (x64 & ARM64), macOS Apple Silicon, and Linux (x64 & ARM64) with NVIDIA NVENC & ARM64 NEON support.',
  },
  {
    icon: 'zap',
    title: 'Decoupled SHA-256 FFmpeg Cache',
    desc: 'FFmpeg downloads once into a permanent SHA-256-verified cache — cutting installers and updates by ~87%.',
  },
  {
    icon: 'sparkles',
    title: 'Quiet Auto-Updater & Explorer Integration',
    desc: 'Silent background staging with header pill, post-install What\'s New notes, and Windows Explorer right-click queuing.',
  },
];

export const RELEASE_NOTES_BY_VERSION = {
  '0.1.62': {
    badge: 'Release v0.1.62',
    headlineTop: 'Next-Gen',
    headlineAccent: 'Studio Architecture.',
    subtitle:
      'Engineered for native ARM64 & x64 speed, ~87% smaller updates, and a custom zero-bloat Windows setup.',
    highlights: STUDIO_ARCH_HIGHLIGHTS,
  },
  '0.1.61': {
    badge: 'Release v0.1.61',
    headlineTop: 'Next-Gen',
    headlineAccent: 'Studio Architecture.',
    subtitle:
      'Engineered for native ARM64 & x64 speed, ~87% smaller updates, and a custom zero-bloat Windows setup.',
    highlights: STUDIO_ARCH_HIGHLIGHTS,
  },
  '0.1.60': {
    badge: 'Release v0.1.60',
    headlineTop: 'Next-Gen',
    headlineAccent: 'Studio Architecture.',
    subtitle:
      'Engineered for fast offline setup, lightweight silent updates, and seamless Windows shell integration.',
    highlights: STUDIO_ARCH_HIGHLIGHTS,
  },
};

const LATEST_DEFINED_VERSION = '0.1.62';

/**
 * Returns release notes metadata for the requested version, falling back cleanly
 * with the live version tag if a newer version has not added custom cards yet.
 */
export function getReleaseNotesForVersion(version) {
  const cleanVer = String(version || LATEST_DEFINED_VERSION).replace(/^v/i, '');
  const entry = RELEASE_NOTES_BY_VERSION[cleanVer];
  if (entry) {
    return entry;
  }
  const fallback = RELEASE_NOTES_BY_VERSION[LATEST_DEFINED_VERSION];
  return {
    ...fallback,
    badge: `Release v${cleanVer}`,
  };
}
