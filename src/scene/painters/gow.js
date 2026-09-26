/**
 * God of War (2018) and God of War Ragnarök on the fly's monitor.
 * PLACEHOLDER — replaced by the painter that draws the real scenes.
 * Each export is { play, queue, result, icon }.
 */
import { MAIN_W, MAIN_H, text } from './kit.js';

const scene = (label, color) => (ctx) => {
  ctx.fillStyle = color; ctx.fillRect(0, 0, MAIN_W, MAIN_H);
  text(ctx, label, MAIN_W / 2, MAIN_H / 2, { size: 60, weight: 800, align: 'center' });
};

export const GOW = { play: scene('GOD OF WAR', '#2a3a2e'), queue: scene('GOD OF WAR', '#1a1a1a'), result: null, icon: null };
export const RAGNAROK = { play: scene('RAGNARÖK', '#2a3448'), queue: scene('RAGNARÖK', '#101520'), result: null, icon: null };
