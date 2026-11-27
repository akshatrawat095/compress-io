/**
 * Structured post-install / post-update highlights keyed by application SemVer.
 * Used when the app launches cleanly from an installer build or when no GitHub
 * Markdown release body was cached by the in-app updater.
 */
export const RELEASE_NOTES_BY_VERSION = {
  '0.1.60': {
    badge: 'Release v0.1.60',
    headlineTop: 'Next-Gen',
    headlineAccent: 'Studio Architecture.',
    subtitle:
      'Engineered for fast offline setup, lightweight silent updates, and seamless Windows shell integration.',
    highlights: [
      {
        icon: 'download',
        title: 'Custom Frameless Windows Installer',
        desc: 'Next-gen WebView2 setup with custom folder picker, live disk space check, atomic rollback, UAC elevation, and clean Uninstall.',
      },
      {
        icon: 'zap',
        title: 'Decoupled SHA-256 FFmpeg Cache',
        desc: 'FFmpeg downloads once into a permanent SHA-256-verified cache — cutting installers and updates by ~87%.',
      },
      {
        icon: 'sparkles',
        title: 'Quiet Background Auto-Updater',
        desc: 'Stages verified updates silently in the background with a header status pill, release notes preview, and popup-free install.',
      },
      {
        icon: 'folder',
        title: 'Explorer Context Menu',
        desc: 'Right-click supported media files in Windows Explorer and choose "Compress with Compress I/O" to queue them immediately.',
      },
    ],
  },
};

const LATEST_DEFINED_VERSION = '0.1.60';

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
