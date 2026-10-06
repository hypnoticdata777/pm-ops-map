// Hosted-demo mode, switched on by opening the app with ?demo=1.
//
// The public demo runs on the same origin as anything else served from the same
// host (e.g. a real workspace on a fork's GitHub Pages site), and localStorage is
// shared per origin. So demo mode keeps everything under its own key prefix:
// visiting the demo can never read, overwrite, or reset a real workspace, and
// "Reset demo" only ever removes demo keys.
//
// This module has no dependencies on purpose — storage.js imports it to name
// every key, so it must load first and must not import anything back.

function detectDemoMode(search) {
  try {
    return new URLSearchParams(search).get('demo') === '1';
  } catch (_) {
    return false;
  }
}

export const DEMO_MODE = detectDemoMode(typeof location === 'undefined' ? '' : location.search);

// All real keys start with "pm-ops-"; demo keys become "pm-ops-demo-...".
export const namespacedKey = key => (DEMO_MODE ? key.replace(/^pm-ops-/, 'pm-ops-demo-') : key);

// Exposed for tests, which need to evaluate the same logic for both modes.
export const _detectDemoMode = detectDemoMode;
