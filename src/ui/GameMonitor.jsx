import { useEffect, useRef, useState } from 'react';
import { PHASES } from '../game/gamer.js';
import { GAME_ORDER, GAMES } from '../game/games.js';
import { drawGame, MAIN_W, MAIN_H, preloadGamePainter } from '../scene/gamePainters.js';
import '../styles/game-monitor.css';

/**
 * The fly's main monitor, big: what it plays, live. The 3D monitor redraws
 * at 24 fps; here the gameplay is copied from it, and a case opening is drawn
 * at the display's own rate so the reel runs smooth.
 */
export function GameMonitor({ gamerRef, open, onOpen, onClose }) {
  const [current, setCurrent] = useState(gamerRef.current.game);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null), dialogRef = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => {
      const g = gamerRef.current;
      setCurrent(g.phase === PHASES.CASE_OPENING ? 'cs2' : g.nextGame ?? g.game);
      setBusy(!!g.cases.active);
    }, 300);
    return () => clearInterval(timer);
  }, [gamerRef]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open) { if (dialog.open) dialog.close(); return undefined; }
    if (!dialog.open) dialog.showModal();
    let raf, last = -Infinity;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const g = gamerRef.current;
      const cases = g.phase === PHASES.CASE_OPENING;
      if (!cases && now - last < 1000 / 30) return;
      last = now;
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!cases && g.monitorCanvas) ctx.drawImage(g.monitorCanvas, 0, 0);
      else drawGame(ctx, g, now / 1000);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [open, gamerRef]);
  const select = (id) => {
    if (gamerRef.current.selectGame(id)) {
      preloadGamePainter(id).catch(() => {});
      setCurrent(id);
    }
  };
  const title = busy ? 'Counter-Strike 2 · opening cases' : GAMES[current].name;
  return <section className="game-monitor-control">
    <div className="game-monitor-head"><label htmlFor="fly-game-select">Its monitor</label><span>{GAME_ORDER.length} games · one fly</span></div>
    <div className="game-monitor-buttons">
      <select id="fly-game-select" value={current} disabled={busy} onChange={(event) => select(event.target.value)} aria-describedby="fly-game-note">
        {GAME_ORDER.map((id) => <option key={id} value={id}>{GAMES[id].name}</option>)}
      </select>
      <button type="button" onClick={onOpen}><span aria-hidden="true">⤢</span> Watch</button>
    </div>
    <p className="game-monitor-note" id="fly-game-note">{busy ? 'It is opening cases; the game waits.' : 'Pick a game: it quits this one and opens yours. After that match it chooses again.'}</p>
    <dialog className="game-monitor-dialog" ref={dialogRef} aria-labelledby="game-monitor-title" onClose={onClose} onCancel={(e) => { e.preventDefault(); onClose(); }} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="game-monitor-shell">
        <header><div><span className="game-monitor-live"><i />LIVE · ITS MONITOR</span><h2 id="game-monitor-title">{title}</h2></div><button type="button" onClick={onClose} aria-label="Close the monitor">×</button></header>
        <canvas ref={canvasRef} width={MAIN_W} height={MAIN_H} aria-label={`Live: ${title}, on the fly's monitor`} />
        <footer><span>Nobody plays for it. This is its screen, as it sees it.</span>
          <label>Game <select aria-label="Switch its game" value={current} disabled={busy} onChange={(e) => select(e.target.value)}>{GAME_ORDER.map((id) => <option key={id} value={id}>{GAMES[id].short}</option>)}</select></label></footer>
      </div>
    </dialog>
  </section>;
}
