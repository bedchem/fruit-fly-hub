import { useCallback, useEffect, useRef, useState } from 'react';
import { SixSevenScene } from './scene/SixSevenScene.jsx';
import { SixSeven, PHASES, NAME } from './game/sixSeven.js';
import { sound } from './audio/audio.js';
import { saySixSeven, hush } from './audio/sixSevenVoice.js';
import { Connectome } from './neural/Connectome.jsx';
import { useConnectome } from './neural/useConnectome.js';
import { SixSevenBrain } from './neural/sixSevenBrain.js';
import { Tooltips } from './ui/Tooltips.jsx';
import { CortisolMeter } from './ui/CortisolMeter.jsx';
import {
  SixSevenBank, OnTheBoard, Impulse, SixSevenScores, ResultSlip, DetentionCard, SixSevenToast, SixSevenHowItWorks,
} from './ui/SixSevenPanels.jsx';
import { GitHubIcon } from './ui/icons.jsx';
import { SiteMenu, LabHome } from './ui/SiteMenu.jsx';
import { useSound } from './ui/useSound.js';
import { Loader } from './ui/Loader.jsx';
import site from '../site.config.js';
import './styles/sixseven.css';

const SLIP_MS = 2400;
const TOAST_MS = 2200;

/** A new lesson every visit; `?seed=67` replays the same one. */
function readSeed() {
  try {
    const s = Number(new URLSearchParams(window.location.search).get('seed'));
    if (Number.isFinite(s) && s > 0) return Math.floor(s);
  } catch { /* fall through */ }
  return 1 + Math.floor(Math.random() * 1e6);
}

/** Damian, a fly in a classroom, says six seven. One of the Fly Lab experiments. */
export default function SixSevenApp() {
  const gameRef = useRef(null);
  const eventRef = useRef(() => {});
  if (!gameRef.current) gameRef.current = new SixSeven({ seed: readSeed(), onEvent: (t, d) => eventRef.current(t, d) });
  const game = gameRef.current;
  if (import.meta.env.DEV) window.__six = game;

  const [ui, setUi] = useState({ phase: game.phase, result: null, history: [], toast: null, lines: 0 });
  const toast = useRef(null);
  /** Whether the current 67 is being spoken, or only chanted in notes. */
  const spoke = useRef(false);
  const { muted, toggleSound } = useSound();
  const [howOpen, setHowOpen] = useState(false);
  const closeHow = useCallback(() => setHowOpen(false), []);
  // switching the sound off, or leaving the page, stops him mid-word
  useEffect(() => { if (muted) hush(); }, [muted]);
  useEffect(() => hush, []);

  eventRef.current = (type, d) => {
    const say = (text) => { toast.current = { text, at: Date.now() }; };
    switch (type) {
      case 'item': sound.reach?.(); break;
      // Two notes under it: "six", "seven". They carry the chant alone when the
      // device has no voice to say it with, and sit back when it has.
      case 'six': sound.tone?.({ freq: d.mutter ? 392 : 523, dur: 0.16, gain: (d.mutter ? 0.08 : 0.2) * (spoke.current ? 0.35 : 1), type: 'triangle' }); break;
      case 'seven': sound.tone?.({ freq: d.mutter ? 494 : 659, dur: 0.16, gain: (d.mutter ? 0.08 : 0.2) * (spoke.current ? 0.35 : 1), type: 'triangle' }); break;
      case 'say':
        // he says it out loud
        spoke.current = saySixSeven({ mutter: d.mutter });
        if (d.seen) say('In plain sight. Bold.');
        break;
      case 'whip': sound.swing?.(); say('The teacher whips round'); break;
      case 'laugh': sound.coin?.(Math.max(2, Math.round(d.laughs * 7))); break;
      case 'flop': sound.tease?.(); break;
      case 'caught': hush(); sound.lose?.(); break;
      case 'detention': sound.broke?.(); break;
      case 'released': sound.revive?.(); say(`Day ${d.day}. The board is clean.`); break;
      default: break;
    }
  };

  const { ready: cnsReady, store: cnsStore } = useConnectome(gameRef, SixSevenBrain);
  // the flies are decoded off the main thread; hold the loading screen until they are drawn
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  const onTick = useCallback(() => {
    const g = gameRef.current;
    const beat = Math.floor(Date.now() / 500);
    setUi((prev) => (
      prev.beat === beat && prev.phase === g.phase && prev.result === g.lastResult
        && prev.toast === toast.current && prev.histLen === g.history.length && prev.lines === g.lines
        ? prev
        : {
          beat, phase: g.phase, result: g.lastResult, history: g.history.slice(), histLen: g.history.length,
          toast: toast.current, lines: g.lines,
        }
    ));
  }, []);

  const r = ui.result;
  const showSlip = r && (game.clock - r.at) * 1000 < SLIP_MS && ui.phase !== PHASES.DETENTION;
  const showToast = ui.toast && Date.now() - ui.toast.at < TOAST_MS;

  return (
    <div className="app venue-six">
      <div className="stage">
        <SixSevenScene game={game} onTick={onTick} onReady={onSceneReady} />

        <div className="six-vignette" aria-hidden="true" />
        <div className="stage-overlay">
          <Loader ready={cnsReady && sceneReady} />
          <header className="masthead">
            <LabHome />
            <h1>
              <span className="title-full">{NAME} Says Six Seven</span>
              <span className="title-compact">{NAME}: 6 7</span>
            </h1>
            <p className="byline">
              <span>by </span>
              <a href="https://github.com/orgs/bedchem/people" target="_blank" rel="noopener" title="BedChem on GitHub">BedChem <GitHubIcon /></a>
            </p>
          </header>

          <SixSevenBank gameRef={gameRef} ui={ui} />

          <SiteMenu
            muted={muted}
            onToggleSound={toggleSound}
            howOpen={howOpen}
            onToggleHow={() => setHowOpen((v) => !v)}
          />
          <SixSevenHowItWorks open={howOpen} onClose={closeHow} />

          {showToast && <SixSevenToast text={ui.toast} />}
          {ui.phase === PHASES.DETENTION && <DetentionCard count={game.stats.detentions} lines={ui.lines} />}
          {showSlip && <ResultSlip result={r} />}
        </div>
      </div>

      <aside className="panel">
        <Connectome machineRef={gameRef} store={cnsStore} ready={cnsReady} />
        <OnTheBoard gameRef={gameRef} />
        <Impulse gameRef={gameRef} />
        <CortisolMeter machineRef={gameRef} label={`${NAME}'s cortisol meter`} idPrefix="six-cortisol" />
        <SixSevenScores gameRef={gameRef} />
        <footer className="panel-foot">
          <p className="credits-3d">
            3D model, CC BY 4.0:{' '}
            <a href="https://sketchfab.com/3d-models/drosophila-adult-fruit-fly-ct-scan-ad29b897bd2b4e27bb04ab9d31baa117" target="_blank" rel="noopener">
              fruit fly CT scan
            </a>
            {' '}by etainproject, twice. The classroom is drawn from primitives. No fly knows what sixty-seven is.
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
