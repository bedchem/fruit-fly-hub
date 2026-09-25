import { useCallback, useRef, useState } from 'react';
import { CodeScene } from './scene/CodeScene.jsx';
import { Coder, PHASES } from './game/coder.js';
import { sound } from './audio/audio.js';
import { cozy } from './audio/codeSounds.js';
import { Connectome } from './neural/Connectome.jsx';
import { useConnectome } from './neural/useConnectome.js';
import { CodeBrain } from './neural/codeBrain.js';
import { Vitals } from './ui/Vitals.jsx';
import { Tooltips } from './ui/Tooltips.jsx';
import { MemoryPanel } from './ui/Memory.jsx';
import { CodeThinker } from './ui/codeThoughts.js';
import {
  CodeHud, CaffeineVsSleep, NightLedger, CodeSlip, AsleepCard, MorningCard, CodeHowItWorks,
} from './ui/CodePanels.jsx';
import { GitHubIcon } from './ui/icons.jsx';
import { SiteMenu, LabHome } from './ui/SiteMenu.jsx';
import { useSound } from './ui/useSound.js';
import site from '../site.config.js';
import { Loader } from './ui/Loader.jsx';

const SLIP_MS = 2600;

/**
 * A new night every visit, but a reproducible one: `?seed=42` replays exactly
 * the same night — the same typos, the same red builds, the same coffee.
 */
function readSeed() {
  try {
    const s = Number(new URLSearchParams(window.location.search).get('seed'));
    if (Number.isFinite(s) && s > 0) return Math.floor(s);
  } catch { /* fall through */ }
  return 1 + Math.floor(Math.random() * 1e6);
}

/** Vitals rows of its own: caffeine and the sleep drive. */
const EXTRA = [
  { key: 'caffeine', label: 'Caffeine', tip: 'Caffeine in the body, on a scale to 300 mg. It keeps a fly awake through its dopamine neurons.', value: (c) => Math.min(1, c.caffeine / 300) },
  { key: 'dfb', label: 'Sleep drive', tip: 'The dorsal fan-shaped body: sleep pressure, and the small hours.', value: (c) => c.sleepiness },
];

/** The coder's desk: the fly works on POKYH through the night, on coffee. One of the Fly Lab experiments. */
export default function CodeApp() {
  const coderRef = useRef(null);
  const eventRef = useRef(() => {});
  if (!coderRef.current) {
    coderRef.current = new Coder({ seed: readSeed(), onEvent: (t, d) => eventRef.current(t, d) });
  }
  const coder = coderRef.current;
  if (import.meta.env.DEV) window.__coder = coder;

  const [ui, setUi] = useState({ phase: coder.phase, result: null, history: [] });
  const { muted, toggleSound } = useSound();
  const [howOpen, setHowOpen] = useState(false);
  const closeHow = useCallback(() => setHowOpen(false), []);

  eventRef.current = (type) => {
    switch (type) {
      case 'key': cozy.key(); break;
      case 'click': cozy.click(); break;
      case 'save': cozy.click(); break;
      case 'sip': cozy.sip(); break;
      case 'mugDown': cozy.clink(); break;
      case 'refill': cozy.pour(); break;
      case 'typeError': case 'buildFail': case 'ciFail': case 'conflict': case 'rejected': cozy.error(); break;
      case 'compiled': case 'buildOk': case 'commit': cozy.ok(); break;
      case 'deploy': cozy.deploy(); break;
      case 'jerk': cozy.jerk(); break;
      case 'asleep': sound.snore?.(); break;
      case 'wake': case 'morning': sound.stopSnore?.(); break;
      default: break;
    }
  };

  const { ready: cnsReady, store: cnsStore } = useConnectome(coderRef, CodeBrain);

  const onTick = useCallback(() => {
    const c = coderRef.current;
    const beat = Math.floor(Date.now() / 500);
    setUi((prev) => (
      prev.beat === beat && prev.phase === c.phase && prev.result === c.lastResult
        ? prev
        : { beat, phase: c.phase, result: c.lastResult, history: c.history.slice() }
    ));
  }, []);

  const now = Date.now();
  const r = ui.result;
  const showSlip = r && now - r.at < SLIP_MS && ui.phase !== PHASES.ASLEEP && ui.phase !== PHASES.MORNING;

  return (
    <div className="app venue-dark venue-code">
      <div className="stage">
        <CodeScene coder={coder} store={cnsStore} onTick={onTick} />

        <div className="stage-overlay">
          <Loader ready={cnsReady} />
          <header className="masthead">
            <LabHome />
            <h1>
              <span className="title-full">Fruit Fly Codes POKYH</span>
              <span className="title-compact">Fly Codes</span>
            </h1>
            <p className="byline">
              <span>by </span>
              <a href="https://github.com/orgs/bedchem/people" target="_blank" rel="noopener" title="BedChem on GitHub">BedChem <GitHubIcon /></a>
            </p>
          </header>

          <CodeHud coderRef={coderRef} ui={ui} />

          <SiteMenu
            muted={muted}
            onToggleSound={toggleSound}
            howOpen={howOpen}
            onToggleHow={() => setHowOpen((v) => !v)}
          />
          <CodeHowItWorks open={howOpen} onClose={closeHow} />

          {showSlip && <CodeSlip result={r} />}
          {ui.phase === PHASES.ASLEEP && <AsleepCard clock={coder.clock} />}
          {ui.phase === PHASES.MORNING && <MorningCard morning={coder.morning} />}
        </div>
      </div>

      <aside className="panel">
        <Connectome machineRef={coderRef} store={cnsStore} ready={cnsReady} />
        <CaffeineVsSleep coderRef={coderRef} store={cnsStore} ready={cnsReady} />
        <NightLedger coderRef={coderRef} />
        <Vitals machineRef={coderRef} extra={EXTRA} />
        <MemoryPanel store={cnsStore} ready={cnsReady} machineRef={coderRef} ThinkerClass={CodeThinker} />
        <footer className="panel-foot">
          <p className="credits-3d">
            3D model, CC BY 4.0:{' '}
            <a href="https://sketchfab.com/3d-models/drosophila-adult-fruit-fly-ct-scan-ad29b897bd2b4e27bb04ab9d31baa117" target="_blank" rel="noopener">
              fruit fly CT scan
            </a>
            {' '}by etainproject. Plants, lamp, shelf, books and clock from{' '}
            <a href="https://polyhaven.com" target="_blank" rel="noopener">Poly Haven</a> (CC0). The code on screen is{' '}
            <a href="https://github.com/bedchem/pokyh-frontend" target="_blank" rel="noopener">POKYH</a>&apos;s own, by BedChem.
            The laptop is drawn generically; no affiliation with Apple.
          </p>
          <a className="source" href={site.repository} target="_blank" rel="noopener">
            <GitHubIcon /> Open source on GitHub
          </a>
        </footer>
      </aside>

      <Tooltips />
    </div>
  );
}
