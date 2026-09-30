import { useCallback, useRef, useState } from 'react';
import { SwatScene } from './scene/SwatScene.jsx';
import { SwatGame, PHASES } from './game/swatter.js';
import { sound } from './audio/audio.js';
import { Connectome } from './neural/Connectome.jsx';
import { useConnectome } from './neural/useConnectome.js';
import { SwatBrain } from './neural/swatBrain.js';
import { Tooltips } from './ui/Tooltips.jsx';
import { CortisolMeter } from './ui/CortisolMeter.jsx';
import {
  SwatBank, EscapeCircuit, Scoreboard, BlowSlip, StunnedCard, OutCard, SwatToast, SwatHowItWorks,
} from './ui/SwatPanels.jsx';
import { GitHubIcon } from './ui/icons.jsx';
import { SiteMenu, LabHome } from './ui/SiteMenu.jsx';
import { useSound } from './ui/useSound.js';
import { Loader } from './ui/Loader.jsx';
import site from '../site.config.js';
import './styles/swat.css';

const SLIP_MS = 2200;
const TOAST_MS = 2000;

/** A new evening every visit; `?seed=42` replays the same hand. */
function readSeed() {
  try {
    const s = Number(new URLSearchParams(window.location.search).get('seed'));
    if (Number.isFinite(s) && s > 0) return Math.floor(s);
  } catch { /* fall through */ }
  return 1 + Math.floor(Math.random() * 1e6);
}

/** A fly on a pub table, spilled beer, and a swatter. One of the Fly Lab experiments. */
export default function SwatApp() {
  const gameRef = useRef(null);
  const eventRef = useRef(() => {});
  if (!gameRef.current) gameRef.current = new SwatGame({ seed: readSeed(), onEvent: (t, d) => eventRef.current(t, d) });
  const game = gameRef.current;
  if (import.meta.env.DEV) window.__swat = game;

  const [ui, setUi] = useState({ phase: game.phase, result: null, history: [], streak: 0, toast: null, slow: false });
  const toast = useRef(null);
  const { muted, toggleSound } = useSound();
  const [howOpen, setHowOpen] = useState(false);
  const closeHow = useCallback(() => setHowOpen(false), []);

  eventRef.current = (type, d) => {
    const say = (text) => { toast.current = { text, at: Date.now() }; };
    switch (type) {
      case 'stalk': sound.tease?.(); break;
      case 'feint': say('A feint — the wrist twitched'); break;
      case 'swing': sound.slip?.(); break;
      case 'takeoff':
        sound.reach?.();
        if (d.during !== 'swing') say('It left before the swing — the hand was enough');
        break;
      case 'miss':
        sound.tin?.();
        if (d.kind === 'escape') sound.coin?.(2);
        break;
      case 'hit': sound.lose?.(); sound.broke?.(); break;
      case 'recovered': sound.revive?.(); say('Back on its feet'); break;
      case 'tipsy': say('Tipsy — 0.5 ‰, and GABA is winning'); break;
      case 'drunk': say('Drunk — its giant fibre is getting slower'); break;
      case 'stumble': say('A clumsy landing'); break;
      case 'out': sound.broke?.(); break;
      case 'wake': sound.revive?.(); say('It comes round, and wants another drink'); break;
      default: break;
    }
  };

  const { ready: cnsReady, store: cnsStore } = useConnectome(gameRef, SwatBrain);
  // the fly is decoded off the main thread; hold the loading screen until it is drawn
  const [sceneReady, setSceneReady] = useState(false);
  const onSceneReady = useCallback(() => setSceneReady(true), []);

  const onTick = useCallback(() => {
    const g = gameRef.current;
    const beat = Math.floor(Date.now() / 500);
    setUi((prev) => (
      prev.beat === beat && prev.phase === g.phase && prev.result === g.lastResult
        && prev.toast === toast.current && prev.histLen === g.history.length && prev.slow === (g.timeScale < 0.7)
        ? prev
        : {
          beat, phase: g.phase, result: g.lastResult, history: g.history.slice(), histLen: g.history.length,
          streak: g.stats.streak, toast: toast.current, slow: g.timeScale < 0.7,
        }
    ));
  }, []);

  const now = Date.now();
  const r = ui.result;
  const showSlip = r && (game.clock - r.at) * 1000 < SLIP_MS && ui.phase !== PHASES.STUNNED && ui.phase !== PHASES.OUT;
  const showToast = ui.toast && now - ui.toast.at < TOAST_MS;

  return (
    <div className={`app venue-dark venue-swat${ui.slow ? ' slowmo' : ''}`}>
      <div className="stage">
        <SwatScene game={game} onTick={onTick} onReady={onSceneReady} />

        <div className="swat-vignette" aria-hidden="true" />
        <div className="stage-overlay">
          <Loader ready={cnsReady && sceneReady} />
          <header className="masthead">
            <LabHome />
            <h1>
              <span className="title-full">Fruit Fly vs. the Swatter</span>
              <span className="title-compact">Fly vs. Swatter</span>
            </h1>
            <p className="byline">
              <span>by </span>
              <a href="https://github.com/orgs/bedchem/people" target="_blank" rel="noopener" title="BedChem on GitHub">BedChem <GitHubIcon /></a>
            </p>
          </header>

          <SwatBank gameRef={gameRef} ui={ui} />

          <SiteMenu
            muted={muted}
            onToggleSound={toggleSound}
            howOpen={howOpen}
            onToggleHow={() => setHowOpen((v) => !v)}
          />
          <SwatHowItWorks open={howOpen} onClose={closeHow} />

          {showToast && <SwatToast text={ui.toast} />}
          {ui.phase === PHASES.STUNNED && <StunnedCard hits={game.stats.hits} />}
          {ui.phase === PHASES.OUT && <OutCard permille={game.permille} />}
          {showSlip && <BlowSlip result={r} />}
        </div>
      </div>

      <aside className="panel">
        <Connectome machineRef={gameRef} store={cnsStore} ready={cnsReady} />
        <EscapeCircuit gameRef={gameRef} />
        <CortisolMeter machineRef={gameRef} idPrefix="swat-cortisol" />
        <Scoreboard gameRef={gameRef} />
        <footer className="panel-foot">
          <p className="credits-3d">
            3D model, CC BY 4.0:{' '}
            <a href="https://sketchfab.com/3d-models/drosophila-adult-fruit-fly-ct-scan-ad29b897bd2b4e27bb04ab9d31baa117" target="_blank" rel="noopener">
              fruit fly CT scan
            </a>
            {' '}by etainproject. The swatter, the table, the bottle and the beer are drawn from primitives. No fly is harmed: a hit
            leaves it dazed for a few seconds, and the beer is simulated.
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
