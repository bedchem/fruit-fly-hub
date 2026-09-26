/**
 * Red Dead Redemption 2 on the fly's monitor. PLACEHOLDER — replaced by the
 * painter that draws the real scene. Exports { play, queue, result, icon }.
 */
import { MAIN_W, MAIN_H, text } from './kit.js';

function play(ctx) {
  ctx.fillStyle = '#6b4a2a'; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
  text(ctx, 'RDR2', MAIN_W / 2, MAIN_H / 2, { size: 60, weight: 800, align: 'center' });
}

export const RDR2 = { play, queue: play, result: null, icon: null };
