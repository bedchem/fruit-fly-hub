// Development-only screenshot fixture for the coder fly. Loaded by
// .cache/code-check/index.html, never by an application entry or the
// production build.
//
//   /.cache/code-check/?pose=typing|sip|error|deploy|asleep|sunrise
//
// Each pose runs the coder to a moment worth looking at, then freezes it, so
// a screenshot shows the same frame every time.
import { PHASES } from '../src/game/coder.js';

const mode = new URLSearchParams(location.search).get('pose') ?? 'typing';

function run(c, seconds, until) {
  for (let i = 0; i < seconds * 60; i++) {
    c.update(1 / 60);
    if (until?.(c)) return true;
  }
  return false;
}

function pose() {
  const c = window.__coder;
  if (!c) { requestAnimationFrame(pose); return; }
  if (mode === 'typing') run(c, 40, (x) => x.phase === PHASES.TYPING && x.lines > 6);
  else if (mode === 'sip') { run(c, 4); c.startSipping(0.9); run(c, 1.9); }
  else if (mode === 'error') run(c, 600, (x) => ['typeError', 'buildFail'].includes(x.lastResult?.kind));
  else if (mode === 'deploy') run(c, 1500, (x) => x.lastResult?.kind === 'deploy');
  else if (mode === 'asleep') { run(c, 4); c.pressure = 1.2; c.caffeine = 0; c.fallAsleep(); run(c, 2); }
  else if (mode === 'sunrise') { run(c, 4); c.minute = c.nightStart + (6 * 60 + 35) + 90; run(c, 1.5); }
  c.update = () => c;
  document.documentElement.dataset.visualPose = mode;
}
requestAnimationFrame(pose);
