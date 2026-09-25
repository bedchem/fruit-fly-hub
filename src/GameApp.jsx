import { useCallback, useRef, useState } from 'react';
import { GameScene } from './scene/GameScene.jsx';
import { Gamer, PHASES } from './game/gamer.js';
import { sound } from './audio/audio.js';
import { Connectome } from './neural/Connectome.jsx';
import { useConnectome } from './neural/useConnectome.js';
import { GamerBrain } from './neural/gamerBrain.js';
import { Vitals } from './ui/Vitals.jsx';
import { Tooltips } from './ui/Tooltips.jsx';
import { MemoryPanel } from './ui/Memory.jsx';
import { GameThinker } from './ui/gameThoughts.js';
import {
  GameHud, GameVision, GameLeague, KillSlip, ResultCard, RageQuitCard, GameHowItWorks,
} from './ui/GamePanels.jsx';
import { GitHubIcon } from './ui/icons.jsx';
import { SiteMenu, LabHome } from './ui/SiteMenu.jsx';
import { useSound } from './ui/useSound.js';
import site from '../site.config.js';
import { Loader } from './ui/Loader.jsx';

const SLIP_MS = 2000;

/**
 * A new night of games every visit, but a reproducible one: `?seed=42`
 * replays exactly the same matches, deaths and rage-quits.
 */
function readSeed() {
  try {
    const s = Number(new URLSearchParams(window.location.search).get('seed'));
    if (Number.isFinite(s) && s > 0) return Math.floor(s);
  } catch { /* fall through */ }
  return 1 + Math.floor(Math.random() * 1e6);
}

/** The gaming setup: the fly plays four games, and rages. One of the Fly Lab experiments. */
export default function GameApp() {
  const gamerRef = useRef(null);
  const eventRef = useRef(() => {});
  if (!gamerRef.current) {
    gamerRef.current = new Gamer({ seed: readSeed(), onEvent: (t, d) => eventRef.current(t, d) });
  }
  const gamer = gamerRef.current;
  if (import.meta.env.DEV) window.__gamer = gamer;

  const [ui, setUi] = useState({ phase: gamer.phase, result: null, history: [], slams: 0, rageQuits: 0 });
  const { muted, toggleSound } = useSound();
  const [howOpen, setHowOpen] = useState(false);
  const closeHow = useCallback(() => setHowOpen(false), []);
  const lastShotSound = useRef(0);

  eventRef.current = (type, d) => {
    const g = gamerRef.current;
    const game = g?.match?.game ?? g?.game;
    switch (type) {
      case 'shot': {
        // the rifle every shot, the rest now and then
        const now = performance.now();
        if (game === 'cs2' || game === 'fortnite') sound.gunshot();
        else if (now - lastShotSound.current > 300) { if (game === 'minecraft') sound.swing(); else sound.cast(); }
        lastShotSound.current = now;
        sound.click();
        break;
      }
      case 'headshot': sound.ding(); sound.coin(3); break;
      case 'kill': sound.coin(2); break;
      case 'death': sound.lose(); break;
      case 'explode': sound.boom(); break;
      case 'loom': if (d?.kind === 'creeper') sound.hiss(); else sound.tease(); break;
      case 'flinch': sound.reach(); break;
      case 'flash': sound.ring(); break;
      case 'mine': if (Math.random() < 0.35) sound.crunch(); break;
      case 'diamond': sound.coin(3); break;
      case 'build': sound.crunch(); break;
      case 'slam': sound.slam(); break;
      case 'victory': sound.win(false); break;
      case 'defeat': sound.defeat(); break;
      case 'rageQuit': sound.rageQuit(); break;
      case 'start': case 'accept': sound.queuePop(); break;
      case 'chat': if (d?.kind === 'me') sound.clack(Math.min(14, 4 + (d.text?.length ?? 0) / 2)); else sound.ping(); break;
      default: break;
    }
  };

  const { ready: cnsReady, store: cnsStore } = useConnectome(gamerRef, GamerBrain);

  const onTick = useCallback(() => {
    const g = gamerRef.current;
    const beat = Math.floor(Date.now() / 500);
    setUi((prev) => (
      prev.beat === beat && prev.phase === g.phase && prev.result === g.lastResult
        && prev.slams === g.slams && prev.rageQuits === g.rageQuits
        ? prev
        : { beat, phase: g.phase, result: g.lastResult, history: g.history.slice(), slams: g.slams, rageQuits: g.rageQuits }
    ));
  }, []);

  const now = Date.now();
  const r = ui.result;
  const age = r ? now - r.at : Infinity;
  const showSlip = r && age < SLIP_MS && (r.kind === 'kill' || r.kind === 'death') && ui.phase === PHASES.PLAYING;
  const showResult = r && ui.phase === PHASES.RESULT && (r.kind === 'victory' || r.kind === 'defeat');
  const showQuit = r && ui.phase === PHASES.RAGE_QUIT && r.kind === 'ragequit';

  return (
    <div className="app venue-dark venue-game">
      <div className="stage">
        <GameScene gamer={gamer} onTick={onTick} />

        <div className="stage-overlay">
          <Loader ready={cnsReady} />
          <header className="masthead">
            <LabHome />
            <h1>
              <span className="title-full">Fruit Fly Gamer</span>
              <span className="title-compact">Fly Gamer</span>
            </h1>
            <p className="byline">
              <span>by </span>
              <a href="https://github.com/orgs/bedchem/people" target="_blank" rel="noopener" title="BedChem on GitHub">BedChem <GitHubIcon /></a>
            </p>
          </header>

          <GameHud gamerRef={gamerRef} ui={ui} />

          <SiteMenu
            muted={muted}
            onToggleSound={toggleSound}
            howOpen={howOpen}
            onToggleHow={() => setHowOpen((v) => !v)}
          />
          <GameHowItWorks open={howOpen} onClose={closeHow} />

          {showSlip && <KillSlip result={r} />}
          {showResult && <ResultCard result={gamer.result} />}
          {showQuit && <RageQuitCard game={r.game} count={ui.rageQuits} midMatch={r.midMatch} />}
        </div>
      </div>

      <aside className="panel">
        <Connectome machineRef={gamerRef} store={cnsStore} ready={cnsReady} />
        <GameVision gamerRef={gamerRef} store={cnsStore} ready={cnsReady} />
        <GameLeague gamerRef={gamerRef} />
        <Vitals machineRef={gamerRef} />
        <MemoryPanel store={cnsStore} ready={cnsReady} machineRef={gamerRef} ThinkerClass={GameThinker} />
        <footer className="panel-foot">
          <p className="credits-3d">
            3D model, CC BY 4.0:{' '}
            <a href="https://sketchfab.com/3d-models/drosophila-adult-fruit-fly-ct-scan-ad29b897bd2b4e27bb04ab9d31baa117" target="_blank" rel="noopener">
              fruit fly CT scan
            </a>
            {' '}by etainproject. League of Legends, Minecraft, Fortnite and Counter-Strike 2 belong to Riot Games,
            Mojang Studios / Microsoft, Epic Games and Valve; the screens here are drawn by us, and none of them is
            affiliated with this page.
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
