'use strict';
/* mememe — To Me, or not to Me, that's the Meme!
 * Client-side meme / grid / comic composer. Everything is drawn on a <canvas>;
 * nothing is uploaded. */

const APP_VERSION = '0.1.0';
const $ = (id) => document.getElementById(id);

// =====================================================================
// Fonts
// =====================================================================
// `load` is the @font-face family name that has to be loaded before the
// canvas can draw with it (canvas text silently falls back otherwise).
const FONTS = [
  { id: 'anton', label: 'Anton (Impact-style)', family: '"Anton", Impact, "Arial Black", sans-serif', load: 'Anton' },
  { id: 'impact', label: 'Impact (system)', family: 'Impact, "Anton", "Arial Black", sans-serif' },
  { id: 'comic', label: 'Comic Relief', family: '"Comic Relief", "Comic Sans MS", cursive', load: 'Comic Relief' },
  { id: 'archivo', label: 'Archivo Black', family: '"Archivo Black", "Arial Black", sans-serif', load: 'Archivo Black' },
  { id: 'montserrat', label: 'Montserrat', family: '"Montserrat", system-ui, sans-serif', load: 'Montserrat' },
  { id: 'bitter', label: 'Bitter (serif)', family: '"Bitter", Georgia, serif', load: 'Bitter' },
  { id: 'mono', label: 'Anonymous Pro (mono)', family: '"Anonymous Pro", ui-monospace, monospace', load: 'Anonymous Pro' },
  { id: 'system', label: 'System sans', family: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif' },
  { id: 'hand', label: 'Handwriting (system)', family: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' }
];
let customFontCount = 0;
const loadedFonts = new Set();

function fontById(id) { return FONTS.find(f => f.id === id) || FONTS[0]; }
function fontString(id, px, bold, italic) {
  return `${italic ? 'italic ' : ''}${bold ? '700' : '400'} ${Math.max(1, px).toFixed(2)}px ${fontById(id).family}`;
}
function ensureFont(id) {
  const f = fontById(id);
  if (!f.load || loadedFonts.has(f.id) || !document.fonts) return;
  loadedFonts.add(f.id);
  Promise.all([
    document.fonts.load(`400 40px "${f.load}"`),
    document.fonts.load(`700 40px "${f.load}"`)
  ]).then(scheduleRender).catch(() => {});
}
function ensureUsedFonts() {
  ensureFont(state.layout.cap.font);
  state.elements.forEach(el => ensureFont(el.font));
}

// =====================================================================
// Settings & theme
// =====================================================================
const SETTINGS_KEY = 'mememe-settings';
const settings = Object.assign(
  { format: 'png', quality: 90, width: '1080', snap: true, downscale: true, tplSource: 'imgflip' },
  safeJSON(localStorage.getItem(SETTINGS_KEY))
);
function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage full / blocked */ }
}
function safeJSON(s) { try { return JSON.parse(s) || {}; } catch (e) { return {}; } }

const root = document.documentElement;
function setTheme(t) {
  root.setAttribute('data-theme', t);
  try { localStorage.setItem('mememe-theme', t); } catch (e) { /* ignore */ }
  $('themeToggle').textContent = t === 'dark' ? '☀ Light mode' : '◐ Dark mode';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', t === 'dark' ? '#131313' : '#f4f4f2');
}
setTheme(localStorage.getItem('mememe-theme') || 'dark');

// =====================================================================
// State
// =====================================================================
function defaultLayout() {
  return {
    cols: 'auto', width: settings.width, mode: 'uniform', aspect: 'first', fit: 'cover',
    bg: '#ffffff', gap: 0, pad: 0, border: 0, borderColor: '#000000', radius: 0,
    cap: {
      pos: 'overlayBottom', font: 'montserrat', size: 44, color: '#ffffff', stroke: '#000000', strokeW: 6,
      bg: '#000000', bgOpacity: 0, align: 'center', bold: true, italic: false, upper: false
    }
  };
}
const state = { layout: defaultLayout(), panels: [], elements: [] };

// Decoded images live outside the (serialisable) state so undo/redo stays cheap.
// id -> { src: ImageBitmap|HTMLCanvasElement|HTMLImageElement, w, h, thumb, name }
const images = new Map();

let sel = null;               // { kind: 'el' | 'panel', id }
let lastLayout = null;        // result of computeLayout() from the last on-screen render
const geo = new Map();        // element id -> geometry from the last render (for hit tests)
let guides = { v: false, h: false };

// Style of the last edited text / bubble, used for the next new one.
const lastStyle = { text: null, bubble: null };
const STYLE_KEYS = ['font', 'size', 'color', 'stroke', 'strokeW', 'bgOn', 'bg', 'bgOpacity', 'align', 'bold', 'italic', 'upper', 'shadow',
  'shape', 'fill', 'fillOpacity', 'border', 'borderW'];

let idCounter = 0;
function uid() { return (Date.now().toString(36) + (idCounter++).toString(36) + Math.random().toString(36).slice(2, 5)); }

// =====================================================================
// History (undo / redo)
// =====================================================================
const H_MAX = 40;
let history = [];
let hIndex = -1;
function snapshot() { return JSON.stringify({ layout: state.layout, panels: state.panels, elements: state.elements }); }
function commit() {
  const s = snapshot();
  if (history[hIndex] === s) return;
  history = history.slice(0, hIndex + 1);
  history.push(s);
  if (history.length > H_MAX) history.shift();
  hIndex = history.length - 1;
  updateUndoButtons();
}
function restore(s) {
  const o = JSON.parse(s);
  state.layout = o.layout; state.panels = o.panels; state.elements = o.elements;
  if (sel && !findSel()) sel = null;
  ensureUsedFonts();
  syncAll();
}
function undo() { if (hIndex > 0) { hIndex--; restore(history[hIndex]); updateUndoButtons(); } }
function redo() { if (hIndex < history.length - 1) { hIndex++; restore(history[hIndex]); updateUndoButtons(); } }
function updateUndoButtons() {
  $('undoBtn').disabled = hIndex <= 0;
  $('redoBtn').disabled = hIndex >= history.length - 1;
}

// =====================================================================
// Helpers
// =====================================================================
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
function hexToRgba(hex, alpha) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h, 16) || 0;
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
function toast(msg, ms = 2800) {
  const t = $('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, ms);
}
function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Word-wrap text to a max width; words longer than a line are hard-broken.
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width <= maxW) { line = test; continue; }
      if (line) { out.push(line); line = ''; }
      while (w.length > 1 && ctx.measureText(w).width > maxW) {
        let i = w.length - 1;
        while (i > 1 && ctx.measureText(w.slice(0, i)).width > maxW) i--;
        out.push(w.slice(0, i));
        w = w.slice(i);
      }
      line = w;
    }
    out.push(line);
  }
  return out;
}

// Draws pre-wrapped lines: outline first, then fill (classic meme look).
function drawLines(ctx, lines, x0, areaW, yTop, lineH, st, s) {
  ctx.textAlign = st.align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const sw = (st.strokeW || 0) * s;
  const lx = st.align === 'left' ? x0 : st.align === 'right' ? x0 + areaW : x0 + areaW / 2;
  const shadowOn = !!st.shadow;
  const px = st.size * s;
  const setShadow = (on) => {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent';
    ctx.shadowBlur = on ? px * 0.12 : 0;
    ctx.shadowOffsetX = on ? px * 0.04 : 0;
    ctx.shadowOffsetY = on ? px * 0.05 : 0;
  };
  lines.forEach((line, i) => {
    const ly = yTop + lineH * (i + 0.5);
    if (sw > 0) {
      setShadow(shadowOn);
      ctx.lineWidth = sw;
      ctx.strokeStyle = st.stroke;
      ctx.strokeText(line, lx, ly);
      setShadow(false);
    } else {
      setShadow(shadowOn);
    }
    ctx.fillStyle = st.color;
    ctx.fillText(line, lx, ly);
    setShadow(false);
  });
}

// =====================================================================
// Layout
// =====================================================================
function panelAspect(p) {
  if (p.type === 'image') {
    const im = images.get(p.imgId);
    if (im) return im.w / im.h;
  }
  return 1;
}
function getCols() {
  const n = state.panels.length;
  if (state.layout.cols === 'auto') return n <= 1 ? 1 : Math.min(6, Math.ceil(Math.sqrt(n)));
  return clamp(parseInt(state.layout.cols, 10) || 1, 1, 6);
}
function baseWidth() {
  const L = state.layout;
  if (L.width === 'orig') {
    const first = state.panels.find(p => p.type === 'image' && images.get(p.imgId));
    if (first) return clamp(Math.round(images.get(first.imgId).w), 320, 4096);
    return 1080;
  }
  return parseInt(L.width, 10) || 1080;
}
function firstAspect() {
  const first = state.panels.find(p => p.type === 'image' && images.get(p.imgId));
  return first ? panelAspect(first) : 1;
}

function captionGeom(ctx, text, areaW, W) {
  const c = state.layout.cap;
  const s = W / 1000;
  const px = c.size * s;
  ctx.font = fontString(c.font, px, c.bold, c.italic);
  const pad = px * 0.35;
  const txt = c.upper ? String(text).toUpperCase() : String(text);
  const lines = text && text.trim() ? wrapLines(ctx, txt, Math.max(px, areaW - 2 * pad)) : [];
  const lineH = px * 1.2;
  return { px, pad, lines, lineH, h: lines.length ? lines.length * lineH + 2 * pad : 0 };
}

const MAX_AREA = 16000000; // stay under mobile Safari's canvas limit
function computeLayout(ctx) {
  let W = baseWidth();
  let lay = layoutAt(ctx, W);
  if (lay.W * lay.H > MAX_AREA) {
    W = Math.floor(W * Math.sqrt(MAX_AREA / (lay.W * lay.H)));
    lay = layoutAt(ctx, W);
    lay.scaledDown = true;
  }
  return lay;
}
function layoutAt(ctx, W) {
  const L = state.layout;
  const s = W / 1000;
  const gap = L.gap * s, pad = L.pad * s;
  const inner = W - 2 * pad;
  const cols = getCols();
  const cells = [];
  const panels = state.panels;
  if (!panels.length) {
    const a = L.aspect === 'first' ? 1 : parseFloat(L.aspect) || 1;
    return { W, H: Math.round(W / a), s, cells };
  }
  const bar = L.cap.pos === 'below' || L.cap.pos === 'above';
  // Build rows: arrays of { p, x, w, h }
  const rows = [];
  if (L.mode === 'justified') {
    for (let i = 0; i < panels.length; i += cols) {
      const chunk = panels.slice(i, i + cols);
      const sumA = chunk.reduce((a, p) => a + panelAspect(p), 0);
      const h = (inner - (chunk.length - 1) * gap) / sumA;
      let x = pad;
      rows.push({ h, cells: chunk.map(p => { const w = panelAspect(p) * h; const c = { p, x, w, h }; x += w + gap; return c; }) });
    }
  } else {
    const aspect = L.aspect === 'first' ? firstAspect() : parseFloat(L.aspect) || 1;
    const cw = (inner - (cols - 1) * gap) / cols;
    const ch = cw / aspect;
    let cur = [], used = 0;
    for (const p of panels) {
      const span = clamp(p.span || 1, 1, cols);
      if (used + span > cols && cur.length) { rows.push({ h: ch, cells: cur }); cur = []; used = 0; }
      cur.push({ p, x: pad + used * (cw + gap), w: span * cw + (span - 1) * gap, h: ch });
      used += span;
    }
    if (cur.length) rows.push({ h: ch, cells: cur });
  }
  let y = pad;
  for (const row of rows) {
    let barH = 0;
    if (bar) row.cells.forEach(c => { barH = Math.max(barH, captionGeom(ctx, c.p.caption || '', c.w, W).h); });
    for (const c of row.cells) {
      const imgY = y + (L.cap.pos === 'above' ? barH : 0);
      const cell = { p: c.p, x: c.x, y: imgY, w: c.w, h: row.h, capRect: null };
      if (bar && barH > 0) cell.capRect = { x: c.x, y: L.cap.pos === 'above' ? y : imgY + row.h, w: c.w, h: barH };
      cells.push(cell);
    }
    y += row.h + barH + gap;
  }
  const H = Math.max(1, Math.round(y - gap + pad));
  return { W: Math.round(W), H, s, cells };
}

// =====================================================================
// Rendering
// =====================================================================
const canvas = $('canvas');
const ctx = canvas.getContext('2d');
let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => { renderQueued = false; render(); });
}
function render() {
  lastLayout = renderTo(canvas, true);
  if (lastLayout.scaledDown && !render._warned) {
    render._warned = true;
    toast('Canvas got very large — output width was reduced to stay within browser limits.');
  }
}
function dispScale() {
  const r = canvas.getBoundingClientRect();
  return r.width ? canvas.width / r.width : 1;
}

function renderTo(cv, withUI) {
  const c = cv.getContext('2d');
  const lay = computeLayout(c);
  if (cv.width !== lay.W) cv.width = lay.W;
  if (cv.height !== lay.H) cv.height = lay.H;
  const L = state.layout;
  c.save();
  c.fillStyle = L.bg;
  c.fillRect(0, 0, lay.W, lay.H);
  lay.cells.forEach(cell => drawPanel(c, cell, lay));
  lay.cells.forEach(cell => drawCaption(c, cell, lay));
  state.elements.forEach(el => {
    if (el.type === 'text') drawTextEl(c, el, lay);
    else drawBubbleEl(c, el, lay);
  });
  if (withUI) drawSelection(c, lay);
  c.restore();
  return lay;
}

function drawPanel(c, cell, lay) {
  const L = state.layout, s = lay.s, p = cell.p;
  const { x, y, w, h } = cell;
  const r = L.radius * s;
  c.save();
  roundRectPath(c, x, y, w, h, r);
  c.clip();
  if (p.type === 'color') {
    c.fillStyle = p.color;
    c.fillRect(x, y, w, h);
  } else {
    const im = images.get(p.imgId);
    if (im) {
      const fit = p.fit || L.fit;
      const zoom = p.zoom || 1;
      let dw, dh;
      if (fit === 'stretch') { dw = w * zoom; dh = h * zoom; }
      else {
        const sc = (fit === 'contain' ? Math.min(w / im.w, h / im.h) : Math.max(w / im.w, h / im.h)) * zoom;
        dw = im.w * sc; dh = im.h * sc;
      }
      const dx = dw <= w ? x + (w - dw) / 2 : x - (dw - w) * ((p.offX || 0) + 1) / 2;
      const dy = dh <= h ? y + (h - dh) / 2 : y - (dh - h) * ((p.offY || 0) + 1) / 2;
      cell.draw = { dw, dh };
      if (p.flip) {
        c.translate(dx + dw / 2, 0);
        c.scale(-1, 1);
        c.drawImage(im.src, -dw / 2, dy, dw, dh);
      } else {
        c.drawImage(im.src, dx, dy, dw, dh);
      }
    } else {
      c.fillStyle = '#888';
      c.fillRect(x, y, w, h);
    }
  }
  c.restore();
  if (L.border > 0) {
    const bw = L.border * s;
    c.save();
    c.lineWidth = bw;
    c.strokeStyle = L.borderColor;
    roundRectPath(c, x + bw / 2, y + bw / 2, w - bw, h - bw, Math.max(0, r - bw / 2));
    c.stroke();
    c.restore();
  }
}

function drawCaption(c, cell, lay) {
  const text = cell.p.caption;
  if (!text || !text.trim()) return;
  const cap = state.layout.cap, s = lay.s;
  c.save();
  if (cell.capRect) {
    const R = cell.capRect;
    if (cap.bgOpacity > 0) { c.fillStyle = hexToRgba(cap.bg, cap.bgOpacity / 100); c.fillRect(R.x, R.y, R.w, R.h); }
    const g = captionGeom(c, text, R.w, lay.W);
    const top = R.y + (R.h - g.lines.length * g.lineH) / 2;
    drawLines(c, g.lines, R.x + g.pad, R.w - 2 * g.pad, top, g.lineH, cap, s);
  } else {
    const g = captionGeom(c, text, cell.w, lay.W);
    const blockH = g.lines.length * g.lineH;
    const margin = g.px * 0.45;
    const top = cap.pos === 'overlayTop' ? cell.y + margin + g.pad * 0.3 : cell.y + cell.h - margin - blockH - g.pad * 0.3;
    c.beginPath();
    c.rect(cell.x, cell.y, cell.w, cell.h);
    c.clip();
    if (cap.bgOpacity > 0) {
      c.fillStyle = hexToRgba(cap.bg, cap.bgOpacity / 100);
      const areaX = cell.x + g.pad, areaW = cell.w - 2 * g.pad;
      g.lines.forEach((line, i) => {
        if (!line) return;
        const lw = Math.min(areaW, c.measureText(line).width) + g.pad * 1.2;
        const lx = cap.align === 'left' ? areaX - g.pad * 0.6 : cap.align === 'right' ? areaX + areaW - lw + g.pad * 0.6 : areaX + (areaW - lw) / 2;
        roundRectPath(c, lx, top + i * g.lineH - g.lineH * 0.02, lw, g.lineH * 1.04, g.px * 0.12);
        c.fill();
      });
    }
    drawLines(c, g.lines, cell.x + g.pad, cell.w - 2 * g.pad, top, g.lineH, cap, s);
  }
  c.restore();
}

// ---------- Text elements ----------
function textGeom(c, el, W) {
  const s = W / 1000, px = el.size * s;
  c.font = fontString(el.font, px, el.bold, el.italic);
  const txt = el.upper ? String(el.text).toUpperCase() : String(el.text);
  const pad = px * 0.28;
  const boxW = Math.max(px, el.w * W);
  const lines = wrapLines(c, txt.length ? txt : ' ', Math.max(px * 0.6, boxW - 2 * pad));
  const lineH = px * 1.12;
  const widths = lines.map(l => c.measureText(l).width);
  const blockW = Math.min(boxW - 2 * pad, Math.max(0, ...widths));
  const h = lines.length * lineH + 2 * pad;
  return { type: 'text', px, pad, boxW, w: boxW, h, lines, lineH, blockW, cx: el.x * W, cy: el.y * W, rot: (el.rot || 0) * Math.PI / 180 };
}
function drawTextEl(c, el, lay) {
  const g = textGeom(c, el, lay.W);
  geo.set(el.id, g);
  c.save();
  c.translate(g.cx, g.cy);
  c.rotate(g.rot);
  const left = -g.boxW / 2, top = -g.h / 2;
  if (el.bgOn && el.bgOpacity > 0) {
    const bw = g.blockW + 2 * g.pad;
    const bx = el.align === 'left' ? left : el.align === 'right' ? left + g.boxW - bw : -bw / 2;
    c.fillStyle = hexToRgba(el.bg, el.bgOpacity / 100);
    roundRectPath(c, bx, top, bw, g.h, g.pad * 0.7);
    c.fill();
  }
  drawLines(c, g.lines, left + g.pad, g.boxW - 2 * g.pad, top + g.pad, g.lineH, el, lay.s);
  c.restore();
}

// ---------- Speech bubbles ----------
const ROUND_SHAPES = ['oval', 'whisper', 'thought', 'shout'];
function bubbleGeom(c, el, W) {
  const s = W / 1000, px = el.size * s;
  c.font = fontString(el.font, px, el.bold, el.italic);
  const txt = el.upper ? String(el.text).toUpperCase() : String(el.text);
  const bw = Math.max(px * 2, el.w * W);
  const round = ROUND_SHAPES.includes(el.shape);
  const k = el.shape === 'shout' || el.shape === 'thought' ? 0.64 : round ? 0.74 : 1;
  const pad = px * 0.45;
  const maxW = Math.max(px, bw * k - 2 * pad);
  const lines = wrapLines(c, txt.length ? txt : ' ', maxW);
  const lineH = px * 1.15;
  const textH = lines.length * lineH;
  let bh;
  if (el.autoH) {
    const t = el.shape === 'shout' || el.shape === 'thought' ? 0.6 : 0.68;
    bh = round ? (textH + pad) / t : textH + 2 * pad * 1.3;
    bh = Math.max(bh, px * 1.8);
  } else {
    bh = Math.max(px, el.h * W);
  }
  return { type: 'bubble', px, pad, w: bw, h: bh, lines, lineH, textH, maxW, cx: el.x * W, cy: el.y * W, tipX: el.tx * W, tipY: el.ty * W, rot: 0 };
}
// Deterministic pseudo-random numbers so spiky/cloud shapes don't flicker.
function seeded(seedStr) {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619); }
  return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; };
}
function bubbleShapes(el, g) {
  const { cx, cy } = g;
  const rx = g.w / 2, ry = g.h / 2;
  const shapes = [];
  const body = new Path2D();
  const rnd = seeded(el.id);
  if (el.shape === 'rounded' || el.shape === 'box') {
    const r = el.shape === 'box' ? Math.min(rx, ry) * 0.04 : Math.min(rx, ry) * 0.35;
    roundRectPath2D(body, cx - rx, cy - ry, g.w, g.h, r);
  } else if (el.shape === 'shout') {
    const n = Math.max(12, Math.round((rx + ry) / (g.px * 0.55)));
    for (let i = 0; i < n * 2; i++) {
      const a = (i / (n * 2)) * Math.PI * 2;
      const f = i % 2 === 0 ? 1.14 + rnd() * 0.12 : 0.9;
      const px = cx + Math.cos(a) * rx * f, py = cy + Math.sin(a) * ry * f;
      if (i === 0) body.moveTo(px, py); else body.lineTo(px, py);
    }
    body.closePath();
  } else if (el.shape === 'thought') {
    body.ellipse(cx, cy, rx * 0.9, ry * 0.9, 0, 0, Math.PI * 2);
    const rr = Math.min(rx, ry) * 0.34;
    const perim = Math.PI * (rx + ry);
    const n = Math.max(7, Math.round(perim / (rr * 1.45)));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + 0.3;
      const p = new Path2D();
      const r = rr * (0.85 + rnd() * 0.3);
      p.arc(cx + Math.cos(a) * (rx * 0.86 - r * 0.35), cy + Math.sin(a) * (ry * 0.86 - r * 0.35), r, 0, Math.PI * 2);
      shapes.push(p);
    }
  } else {
    body.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  shapes.unshift(body);

  // Tail
  if (el.tail) {
    const dx = g.tipX - cx, dy = g.tipY - cy;
    const dist = Math.hypot(dx, dy);
    // only if the tip is outside the bubble
    const inside = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
    if (dist > 1 && !inside) {
      const ux = dx / dist, uy = dy / dist, nx = -uy, ny = ux;
      if (el.shape === 'thought') {
        // edge point of the ellipse in tip direction
        const t = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
        const ex = cx + ux * t, ey = cy + uy * t;
        const base = Math.min(rx, ry);
        [[0.22, 0.17], [0.55, 0.115], [0.88, 0.07]].forEach(([f, r]) => {
          const p = new Path2D();
          p.arc(ex + (g.tipX - ex) * f, ey + (g.tipY - ey) * f, base * r, 0, Math.PI * 2);
          shapes.push(p);
        });
      } else {
        const half = Math.min(rx, ry) * (el.shape === 'shout' ? 0.3 : 0.26);
        const b1x = cx + nx * half, b1y = cy + ny * half;
        const b2x = cx - nx * half, b2y = cy - ny * half;
        const tail = new Path2D();
        tail.moveTo(b1x, b1y);
        if (el.shape === 'shout') {
          tail.lineTo(g.tipX, g.tipY);
          tail.lineTo(b2x, b2y);
        } else {
          // slightly hooked, comic-style tail
          const bend = dist * 0.14;
          const mx = cx + dx * 0.6 + nx * bend, my = cy + dy * 0.6 + ny * bend;
          tail.quadraticCurveTo(mx, my, g.tipX, g.tipY);
          tail.quadraticCurveTo(cx + dx * 0.45 + nx * bend * 0.4, cy + dy * 0.45 + ny * bend * 0.4, b2x, b2y);
        }
        tail.closePath();
        shapes.push(tail);
      }
    }
  }
  return shapes;
}
function roundRectPath2D(p, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}

const scratch = document.createElement('canvas');
function drawBubbleEl(c, el, lay) {
  const g = bubbleGeom(c, el, lay.W);
  geo.set(el.id, g);
  const s = lay.s;
  const bwPx = (el.borderW || 0) * s;
  // bounding box of body + tail + spikes + border
  const m = Math.max(g.w, g.h) * 0.2 + bwPx * 2 + 4;
  let x0 = g.cx - g.w / 2 - m, y0 = g.cy - g.h / 2 - m, x1 = g.cx + g.w / 2 + m, y1 = g.cy + g.h / 2 + m;
  if (el.tail) { x0 = Math.min(x0, g.tipX - m); y0 = Math.min(y0, g.tipY - m); x1 = Math.max(x1, g.tipX + m); y1 = Math.max(y1, g.tipY + m); }
  x0 = Math.floor(Math.max(x0, 0)); y0 = Math.floor(Math.max(y0, 0));
  x1 = Math.ceil(Math.min(x1, lay.W)); y1 = Math.ceil(Math.min(y1, lay.H));
  const bw = x1 - x0, bh = y1 - y0;
  if (bw > 0 && bh > 0) {
    // Draw the shape on a scratch canvas: a double-width stroke, then punch out
    // the interior, then fill. This gives an outline only around the union of
    // body + tail (no seam), and lets the fill be semi-transparent.
    if (scratch.width < bw) scratch.width = bw;
    if (scratch.height < bh) scratch.height = bh;
    const sc = scratch.getContext('2d');
    sc.setTransform(1, 0, 0, 1, 0, 0);
    sc.clearRect(0, 0, bw, bh);
    sc.setTransform(1, 0, 0, 1, -x0, -y0);
    const shapes = bubbleShapes(el, g);
    if (bwPx > 0) {
      sc.lineWidth = bwPx * 2;
      sc.lineJoin = 'round';
      sc.strokeStyle = el.border;
      if (el.shape === 'whisper') sc.setLineDash([g.px * 0.5, g.px * 0.35]);
      shapes.forEach(p => sc.stroke(p));
      sc.setLineDash([]);
      sc.globalCompositeOperation = 'destination-out';
      sc.fillStyle = '#000';
      shapes.forEach(p => sc.fill(p));
      sc.globalCompositeOperation = 'source-over';
    }
    sc.globalAlpha = clamp((el.fillOpacity ?? 100) / 100, 0, 1);
    sc.fillStyle = el.fill;
    shapes.forEach(p => sc.fill(p));
    sc.globalAlpha = 1;
    c.drawImage(scratch, 0, 0, bw, bh, x0, y0, bw, bh);
  }
  // text
  c.save();
  c.font = fontString(el.font, g.px, el.bold, el.italic);
  drawLines(c, g.lines, g.cx - g.maxW / 2, g.maxW, g.cy - g.textH / 2, g.lineH, el, s);
  c.restore();
}

// ---------- Selection overlay ----------
function drawSelection(c, lay) {
  const ds = dispScale();
  const accent = '#4f8cff';
  c.save();
  c.lineWidth = 2 * ds;
  if (guides.v) { c.strokeStyle = '#ff3ea5'; c.beginPath(); c.moveTo(lay.W / 2, 0); c.lineTo(lay.W / 2, lay.H); c.stroke(); }
  if (guides.h) { c.strokeStyle = '#ff3ea5'; c.beginPath(); c.moveTo(0, lay.H / 2); c.lineTo(lay.W, lay.H / 2); c.stroke(); }
  c.strokeStyle = accent;
  c.setLineDash([7 * ds, 5 * ds]);
  if (sel && sel.kind === 'panel') {
    const cell = lay.cells.find(cl => cl.p.id === sel.id);
    if (cell) c.strokeRect(cell.x + ds, cell.y + ds, cell.w - 2 * ds, cell.h - 2 * ds);
  } else if (sel && sel.kind === 'el') {
    const g = geo.get(sel.id);
    const el = findEl(sel.id);
    if (g && el) {
      const hs = 9 * ds;
      c.save();
      c.translate(g.cx, g.cy);
      c.rotate(g.rot);
      c.strokeRect(-g.w / 2, -g.h / 2, g.w, g.h);
      c.setLineDash([]);
      c.fillStyle = accent;
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5 * ds;
      c.fillRect(g.w / 2 - hs, g.h / 2 - hs, hs * 2, hs * 2);
      c.strokeRect(g.w / 2 - hs, g.h / 2 - hs, hs * 2, hs * 2);
      c.restore();
      if (el.type === 'bubble' && el.tail) {
        c.setLineDash([]);
        c.beginPath();
        c.arc(g.tipX, g.tipY, 10 * ds, 0, Math.PI * 2);
        c.fillStyle = '#ffb020';
        c.fill();
        c.strokeStyle = '#fff';
        c.lineWidth = 2 * ds;
        c.stroke();
      }
    }
  }
  c.restore();
}

// =====================================================================
// Selection helpers
// =====================================================================
function findEl(id) { return state.elements.find(e => e.id === id); }
function findPanel(id) { return state.panels.find(p => p.id === id); }
function findSel() { return !sel ? null : sel.kind === 'el' ? findEl(sel.id) : findPanel(sel.id); }
function selEl() { return sel && sel.kind === 'el' ? findEl(sel.id) : null; }
function selPanel() { return sel && sel.kind === 'panel' ? findPanel(sel.id) : null; }
function select(next) {
  sel = next;
  syncProps();
  renderStrip();
  scheduleRender();
}

// =====================================================================
// Images: import
// =====================================================================
const MAX_IMPORT = 2560;
async function decodeBlob(blob) {
  if (window.createImageBitmap) {
    try {
      const bmp = await createImageBitmap(blob);
      return { src: bmp, w: bmp.width, h: bmp.height };
    } catch (e) { /* fall back below */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    return { src: img, w: img.naturalWidth, h: img.naturalHeight, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
async function makeImageEntry(blob, name) {
  let d = await decodeBlob(blob);
  if (settings.downscale && Math.max(d.w, d.h) > MAX_IMPORT) {
    const sc = MAX_IMPORT / Math.max(d.w, d.h);
    const cv = document.createElement('canvas');
    cv.width = Math.round(d.w * sc);
    cv.height = Math.round(d.h * sc);
    const cx = cv.getContext('2d');
    cx.imageSmoothingQuality = 'high';
    cx.drawImage(d.src, 0, 0, cv.width, cv.height);
    if (d.src.close) d.src.close();
    if (d.url) URL.revokeObjectURL(d.url);
    d = { src: cv, w: cv.width, h: cv.height };
  }
  // small thumbnail for the panel strip
  const ts = 120 / Math.max(d.w, d.h);
  const tc = document.createElement('canvas');
  tc.width = Math.max(1, Math.round(d.w * Math.min(1, ts)));
  tc.height = Math.max(1, Math.round(d.h * Math.min(1, ts)));
  tc.getContext('2d').drawImage(d.src, 0, 0, tc.width, tc.height);
  const thumbBlob = await new Promise(res => tc.toBlob(res, 'image/jpeg', 0.7));
  const id = uid();
  images.set(id, { src: d.src, w: d.w, h: d.h, name: name || 'image', thumb: thumbBlob ? URL.createObjectURL(thumbBlob) : '' });
  return id;
}
function newPanel(over) {
  return Object.assign({ id: uid(), type: 'image', imgId: null, color: '#ffffff', fit: '', zoom: 1, offX: 0, offY: 0, span: 1, caption: '', flip: false }, over);
}
function isImageFile(f) {
  return (f.type && f.type.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|avif|svg|heic|heif)$/i.test(f.name || '');
}
async function addFiles(fileList) {
  const files = Array.from(fileList || []).filter(isImageFile);
  if (!files.length) { toast('Please choose image files.'); return; }
  const hint = $('processingHint');
  hint.hidden = false;
  let added = 0, failed = 0;
  for (let i = 0; i < files.length; i++) {
    hint.textContent = `Loading image ${i + 1} of ${files.length}…`;
    try {
      const imgId = await makeImageEntry(files[i], files[i].name);
      state.panels.push(newPanel({ imgId }));
      added++;
    } catch (e) { failed++; }
  }
  hint.hidden = true;
  if (failed) toast(`${failed} file(s) could not be read as an image (e.g. HEIC isn't supported by every browser).`, 4200);
  if (added) afterPanelsChanged();
}
async function addBlob(blob, name) {
  const imgId = await makeImageEntry(blob, name);
  state.panels.push(newPanel({ imgId }));
  afterPanelsChanged();
}
function afterPanelsChanged() {
  commit();
  renderStrip();
  syncProps();
  scheduleRender();
}

// =====================================================================
// Elements: create
// =====================================================================
function insertionPoint() {
  // centre of the selected panel, else of the canvas
  const lay = lastLayout;
  if (!lay) return { x: 0.5, y: 0.5, w: 1 };
  const p = selPanel();
  const cell = p && lay.cells.find(c => c.p.id === p.id);
  if (cell) return { x: (cell.x + cell.w / 2) / lay.W, y: (cell.y + cell.h / 2) / lay.W, w: cell.w / lay.W, rect: cell };
  return { x: 0.5, y: lay.H / 2 / lay.W, w: 1, rect: { x: 0, y: 0, w: lay.W, h: lay.H } };
}
function pickStyle(src) {
  if (!src) return {};
  const o = {};
  STYLE_KEYS.forEach(k => { if (k in src) o[k] = src[k]; });
  return o;
}
function newText(over) {
  const ip = insertionPoint();
  const n = state.elements.length % 5;
  return Object.assign({
    id: uid(), type: 'text', text: 'Your text', x: ip.x, y: ip.y + n * 0.03, w: Math.min(0.9, ip.w * 0.92), rot: 0,
    font: 'anton', size: 72, color: '#ffffff', stroke: '#000000', strokeW: 8, bgOn: false, bg: '#000000', bgOpacity: 60,
    align: 'center', bold: false, italic: false, upper: true, shadow: false
  }, pickStyle(lastStyle.text), over);
}
function newBubble(over) {
  const ip = insertionPoint();
  const n = state.elements.length % 5;
  const x = ip.x, y = ip.y - 0.05 + n * 0.03;
  return Object.assign({
    id: uid(), type: 'bubble', text: 'Hello!', x, y, w: 0.4 * Math.min(1, ip.w * 1.4), h: 0.2, autoH: true, rot: 0,
    shape: 'oval', fill: '#ffffff', fillOpacity: 100, border: '#111111', borderW: 4, tail: true, tx: x - 0.1, ty: y + 0.2,
    font: 'comic', size: 40, color: '#111111', stroke: '#ffffff', strokeW: 0, bgOn: false, bg: '#000000', bgOpacity: 0,
    align: 'center', bold: true, italic: false, upper: false, shadow: false
  }, pickStyle(lastStyle.bubble), over);
}
function addElement(el) {
  state.elements.push(el);
  ensureFont(el.font);
  commit();
  select({ kind: 'el', id: el.id });
}
function addTopBottom() {
  const ip = insertionPoint();
  const lay = lastLayout;
  const R = ip.rect || { x: 0, y: 0, w: lay.W, h: lay.H };
  const W = lay.W;
  const base = { font: 'anton', size: 72, color: '#ffffff', stroke: '#000000', strokeW: 8, bgOn: false, upper: true, bold: false, italic: false, align: 'center', shadow: false, rot: 0 };
  const w = (R.w / W) * 0.94;
  const top = newText(Object.assign({}, base, { text: 'Top text', x: (R.x + R.w / 2) / W, y: (R.y + R.h * 0.11) / W, w }));
  const bottom = newText(Object.assign({}, base, { text: 'Bottom text', x: (R.x + R.w / 2) / W, y: (R.y + R.h * 0.89) / W, w }));
  state.elements.push(top, bottom);
  ensureFont('anton');
  commit();
  select({ kind: 'el', id: top.id });
}

// =====================================================================
// Presets
// =====================================================================
const PRESETS = {
  classic: {
    layout: { cols: '1', mode: 'uniform', aspect: 'first', fit: 'cover', gap: 0, pad: 0, border: 0, radius: 0, bg: '#000000' },
    cap: { pos: 'overlayBottom' },
    hint: 'Classic meme: one image, big outlined text. Tip: “Top/Bottom” adds both texts.',
    after() { if (!state.elements.some(e => e.type === 'text') && state.panels.length) { scheduleRender(); requestAnimationFrame(() => requestAnimationFrame(addTopBottom)); } }
  },
  captionTop: {
    layout: { cols: '1', mode: 'uniform', aspect: 'first', fit: 'cover', gap: 0, pad: 0, border: 0, radius: 0, bg: '#ffffff' },
    cap: { pos: 'above', font: 'montserrat', size: 46, color: '#111111', strokeW: 0, bg: '#ffffff', bgOpacity: 100, align: 'left', bold: true, italic: false, upper: false },
    hint: 'Caption on top: type the caption in the panel settings below.',
    after() { if (state.panels.length) { select({ kind: 'panel', id: state.panels[0].id }); $('pCaption').focus(); } }
  },
  twoCol: {
    layout: { cols: '2', mode: 'uniform', aspect: '1', fit: 'cover', gap: 0, pad: 0, border: 3, borderColor: '#000000', radius: 0, bg: '#ffffff' },
    cap: {},
    hint: 'Two columns: add “Blank panels” to put text next to an image.'
  },
  grid: {
    layout: { cols: 'auto', mode: 'uniform', aspect: '1', fit: 'cover', gap: 10, pad: 10, border: 0, radius: 10, bg: '#ffffff' },
    cap: {},
    hint: 'Grid: all images get the same size (cropped to fill). Switch “Fit” to letterbox if nothing may be cut off.'
  },
  mosaic: {
    layout: { cols: 'auto', mode: 'justified', gap: 6, pad: 6, border: 0, radius: 0, bg: '#ffffff' },
    cap: {},
    hint: 'Mosaic: images keep their ratios; each row is scaled to the same width.'
  },
  comic: {
    layout: { cols: '3', mode: 'uniform', aspect: '1.3333', fit: 'cover', gap: 16, pad: 24, border: 5, borderColor: '#111111', radius: 4, bg: '#ffffff' },
    cap: { pos: 'overlayTop', font: 'comic', size: 30, color: '#111111', strokeW: 0, bg: '#fff6c8', bgOpacity: 100, align: 'left', bold: true, italic: false, upper: true },
    hint: 'Comic page: captions become narration boxes. Make a panel wider via its “Width” setting, add bubbles with “+ Bubble”.'
  },
  story: {
    layout: { cols: '1', mode: 'uniform', aspect: 'first', fit: 'cover', gap: 8, pad: 8, border: 0, radius: 0, bg: '#000000' },
    cap: { pos: 'overlayBottom', font: 'montserrat', size: 40, color: '#ffffff', stroke: '#000000', strokeW: 6, bg: '#000000', bgOpacity: 0, align: 'center', bold: true, italic: false, upper: false },
    hint: 'Storyline: one image below the other with subtitles. Tap an image to type its subtitle.'
  }
};
function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  Object.assign(state.layout, p.layout);
  Object.assign(state.layout.cap, p.cap);
  ensureFont(state.layout.cap.font);
  commit();
  syncLayoutUI();
  syncProps();
  scheduleRender();
  if (p.hint) toast(p.hint, 4200);
  if (p.after) p.after();
}

// =====================================================================
// UI: panel strip
// =====================================================================
function renderStrip() {
  const strip = $('strip');
  $('stripWrap').hidden = state.panels.length === 0;
  strip.innerHTML = '';
  state.panels.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb' + (sel && sel.kind === 'panel' && sel.id === p.id ? ' sel' : '');
    b.title = p.type === 'color' ? 'Blank panel' : (images.get(p.imgId) || {}).name || 'Image';
    if (p.type === 'image' && images.get(p.imgId)) {
      const img = document.createElement('img');
      img.src = images.get(p.imgId).thumb;
      img.alt = '';
      b.appendChild(img);
    } else {
      b.style.background = p.color;
    }
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    b.appendChild(num);
    b.addEventListener('click', () => select({ kind: 'panel', id: p.id }));
    strip.appendChild(b);
  });
}

// =====================================================================
// UI: properties
// =====================================================================
function populateFontSelects() {
  ['elFont', 'cFont'].forEach(id => {
    const s = $(id);
    const cur = s.value;
    s.innerHTML = '';
    FONTS.forEach(f => {
      const o = document.createElement('option');
      o.value = f.id;
      o.textContent = f.label;
      s.appendChild(o);
    });
    if (cur) s.value = cur;
  });
}
function setSeg(segId, value, boolObj) {
  $(segId).querySelectorAll('button').forEach(b => {
    if (b.dataset.v) b.classList.toggle('active', b.dataset.v === value);
    if (b.dataset.k) b.classList.toggle('active', !!boolObj[b.dataset.k]);
  });
}
function syncProps() {
  const el = selEl();
  const p = selPanel();
  $('propsEmpty').hidden = !!(el || p);
  $('propsElement').hidden = !el;
  $('propsPanel').hidden = !p;
  if (el) {
    const isB = el.type === 'bubble';
    $('elTitle').textContent = isB ? 'Speech bubble' : 'Text';
    if (document.activeElement !== $('elText')) $('elText').value = el.text;
    $('bubbleOnly').hidden = !isB;
    $('textBgRow').hidden = isB;
    $('rotLbl').hidden = isB;
    $('elRot').hidden = isB;
    $('elRotVal').hidden = isB;
    if (isB) {
      $('bShape').value = el.shape;
      $('bFill').value = el.fill;
      $('bFillOpacity').value = el.fillOpacity;
      $('bBorder').value = el.border;
      $('bBorderWidth').value = el.borderW;
      $('bTail').checked = !!el.tail;
      $('bAutoH').checked = !!el.autoH;
    }
    $('elFont').value = fontById(el.font).id;
    $('elSize').value = el.size;
    $('elColor').value = el.color;
    $('elStroke').value = el.stroke;
    $('elStrokeW').value = el.strokeW;
    $('elBgOn').checked = !!el.bgOn;
    $('elBg').value = el.bg;
    $('elBgOpacity').value = el.bgOpacity;
    $('elShadow').checked = !!el.shadow;
    $('elRot').value = el.rot || 0;
    setSeg('elAlign', el.align, {});
    setSeg('elStyleBtns', null, el);
  }
  if (p) {
    const idx = state.panels.indexOf(p);
    const isImg = p.type === 'image';
    $('panelTitle').textContent = `${isImg ? 'Image' : 'Blank panel'} ${idx + 1} of ${state.panels.length}`;
    if (document.activeElement !== $('pCaption')) $('pCaption').value = p.caption || '';
    $('pColorRow').hidden = isImg;
    $('pImageRows').hidden = !isImg;
    $('pReplaceBtn').hidden = !isImg;
    $('pColor').value = p.color;
    $('pFit').value = p.fit || '';
    $('pZoom').value = Math.round((p.zoom || 1) * 100);
    $('pOffX').value = Math.round((p.offX || 0) * 100);
    $('pOffY').value = Math.round((p.offY || 0) * 100);
    $('pFlipBtn').classList.toggle('active', !!p.flip);
    $('pLeftBtn').disabled = idx <= 0;
    $('pRightBtn').disabled = idx >= state.panels.length - 1;
    const cols = getCols();
    const spanOk = state.layout.mode === 'uniform' && cols > 1;
    $('pSpanRow').hidden = !spanOk;
    if (spanOk) {
      const s = $('pSpan');
      s.innerHTML = '';
      for (let i = 1; i <= cols; i++) {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = i === 1 ? '1 (normal)' : i === cols ? `${i} (full row)` : String(i);
        s.appendChild(o);
      }
      s.value = clamp(p.span || 1, 1, cols);
    }
  }
  updateValueLabels();
}
function updateValueLabels() {
  const el = selEl();
  if (el) {
    $('elSizeVal').textContent = el.size;
    $('elStrokeWVal').textContent = el.strokeW;
    $('elBgOpacityVal').textContent = el.bgOpacity + '%';
    $('elRotVal').textContent = (el.rot || 0) + '°';
    if (el.type === 'bubble') {
      $('bFillOpacityVal').textContent = el.fillOpacity + '%';
      $('bBorderWidthVal').textContent = el.borderW;
    }
  }
  const p = selPanel();
  if (p) $('pZoomVal').textContent = Math.round((p.zoom || 1) * 100) + '%';
  const L = state.layout;
  $('lGapVal').textContent = L.gap;
  $('lPadVal').textContent = L.pad;
  $('lBorderVal').textContent = L.border;
  $('lRadiusVal').textContent = L.radius;
  $('cSizeVal').textContent = L.cap.size;
  $('cStrokeWVal').textContent = L.cap.strokeW;
  $('cBgOpacityVal').textContent = L.cap.bgOpacity + '%';
  $('exQualityVal').textContent = settings.quality + '%';
}
function syncLayoutUI() {
  const L = state.layout, c = L.cap;
  $('lCols').value = L.cols;
  $('lWidth').value = L.width;
  $('lMode').value = L.mode;
  $('lAspect').value = L.aspect;
  $('lAspect').disabled = L.mode === 'justified';
  $('lFit').value = L.fit;
  $('lBg').value = L.bg;
  $('lGap').value = L.gap;
  $('lPad').value = L.pad;
  $('lBorder').value = L.border;
  $('lBorderColor').value = L.borderColor;
  $('lRadius').value = L.radius;
  $('cPos').value = c.pos;
  $('cFont').value = fontById(c.font).id;
  $('cColor').value = c.color;
  $('cSize').value = c.size;
  $('cStroke').value = c.stroke;
  $('cStrokeW').value = c.strokeW;
  $('cBg').value = c.bg;
  $('cBgOpacity').value = c.bgOpacity;
  setSeg('cAlign', c.align, {});
  setSeg('cStyleBtns', null, c);
  updateValueLabels();
}
function syncAll() {
  syncLayoutUI();
  syncProps();
  renderStrip();
  scheduleRender();
}

// ---------- bind element inputs ----------
function rememberStyle(el) { lastStyle[el.type] = pickStyle(el); }
function bindEl(id, key, conv) {
  const inp = $(id);
  const read = () => (inp.type === 'checkbox' ? inp.checked : conv ? conv(inp.value) : inp.value);
  inp.addEventListener('input', () => {
    const el = selEl();
    if (!el) return;
    el[key] = read();
    if (key === 'font') ensureFont(el.font);
    rememberStyle(el);
    updateValueLabels();
    scheduleRender();
    if (inp.type === 'checkbox' || inp.tagName === 'SELECT') commit();
  });
  inp.addEventListener('change', commit);
}
const num = (v) => Number(v);
bindEl('elText', 'text');
bindEl('elFont', 'font');
bindEl('elSize', 'size', num);
bindEl('elColor', 'color');
bindEl('elStroke', 'stroke');
bindEl('elStrokeW', 'strokeW', num);
bindEl('elBgOn', 'bgOn');
bindEl('elBg', 'bg');
bindEl('elBgOpacity', 'bgOpacity', num);
bindEl('elShadow', 'shadow');
bindEl('elRot', 'rot', num);
bindEl('bShape', 'shape');
bindEl('bFill', 'fill');
bindEl('bFillOpacity', 'fillOpacity', num);
bindEl('bBorder', 'border');
bindEl('bBorderWidth', 'borderW', num);
bindEl('bTail', 'tail');
bindEl('bAutoH', 'autoH');
// Turning auto height off keeps the current height instead of jumping.
$('bAutoH').addEventListener('input', () => {
  const el = selEl();
  if (el && !el.autoH && lastLayout) { const g = geo.get(el.id); if (g) el.h = g.h / lastLayout.W; }
});
$('bShape').addEventListener('input', () => {
  const el = selEl();
  if (el && el.shape === 'box' && el.tail) { el.tail = false; $('bTail').checked = false; scheduleRender(); }
});

$('elAlign').addEventListener('click', (e) => {
  const b = e.target.closest('button'); const el = selEl();
  if (!b || !el) return;
  el.align = b.dataset.v; rememberStyle(el); setSeg('elAlign', el.align, {}); commit(); scheduleRender();
});
$('elStyleBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); const el = selEl();
  if (!b || !el) return;
  el[b.dataset.k] = !el[b.dataset.k]; rememberStyle(el); setSeg('elStyleBtns', null, el); commit(); scheduleRender();
});

$('elDelBtn').addEventListener('click', deleteSelectedElement);
$('elDupBtn').addEventListener('click', () => {
  const el = selEl(); if (!el) return;
  const copy = JSON.parse(JSON.stringify(el));
  copy.id = uid(); copy.x += 0.03; copy.y += 0.03;
  if (copy.type === 'bubble') { copy.tx += 0.03; copy.ty += 0.03; }
  addElement(copy);
});
$('elFrontBtn').addEventListener('click', () => moveElement(1));
$('elBackBtn').addEventListener('click', () => moveElement(-1));
function moveElement(dir) {
  const el = selEl(); if (!el) return;
  const i = state.elements.indexOf(el), j = i + dir;
  if (j < 0 || j >= state.elements.length) return;
  [state.elements[i], state.elements[j]] = [state.elements[j], state.elements[i]];
  commit(); scheduleRender();
}
function deleteSelectedElement() {
  const el = selEl(); if (!el) return;
  state.elements = state.elements.filter(e => e !== el);
  geo.delete(el.id);
  commit();
  select(null);
}

// ---------- custom fonts ----------
$('loadFontBtn').addEventListener('click', () => $('fontInput').click());
$('fontInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const buf = await file.arrayBuffer();
    customFontCount++;
    const fam = `mememe-custom-${customFontCount}`;
    const face = new FontFace(fam, buf);
    await face.load();
    document.fonts.add(face);
    const id = 'custom-' + customFontCount;
    FONTS.push({ id, label: '★ ' + file.name.replace(/\.[^.]+$/, ''), family: `"${fam}", sans-serif` });
    populateFontSelects();
    const el = selEl();
    if (el) { el.font = id; rememberStyle(el); commit(); }
    syncProps(); syncLayoutUI(); scheduleRender();
    toast(`Font “${file.name}” loaded for this session.`);
  } catch (err) {
    toast('That file could not be loaded as a font.');
  }
});

// ---------- bind panel inputs ----------
function bindPanel(id, key, conv) {
  const inp = $(id);
  inp.addEventListener('input', () => {
    const p = selPanel(); if (!p) return;
    p[key] = conv ? conv(inp.value) : inp.value;
    updateValueLabels();
    scheduleRender();
    if (inp.tagName === 'SELECT') commit();
  });
  inp.addEventListener('change', commit);
}
bindPanel('pCaption', 'caption');
bindPanel('pColor', 'color');
bindPanel('pFit', 'fit');
bindPanel('pZoom', 'zoom', v => Number(v) / 100);
bindPanel('pOffX', 'offX', v => Number(v) / 100);
bindPanel('pOffY', 'offY', v => Number(v) / 100);
bindPanel('pSpan', 'span', num);
$('pFlipBtn').addEventListener('click', () => {
  const p = selPanel(); if (!p) return;
  p.flip = !p.flip; commit(); syncProps(); scheduleRender();
});
$('pLeftBtn').addEventListener('click', () => movePanel(-1));
$('pRightBtn').addEventListener('click', () => movePanel(1));
function movePanel(dir) {
  const p = selPanel(); if (!p) return;
  const i = state.panels.indexOf(p), j = i + dir;
  if (j < 0 || j >= state.panels.length) return;
  [state.panels[i], state.panels[j]] = [state.panels[j], state.panels[i]];
  afterPanelsChanged();
}
$('pDelBtn').addEventListener('click', () => {
  const p = selPanel(); if (!p) return;
  state.panels = state.panels.filter(x => x !== p);
  sel = null;
  afterPanelsChanged();
});
$('pReplaceBtn').addEventListener('click', () => $('replaceInput').click());
$('replaceInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  const p = selPanel();
  if (!file || !p) return;
  try {
    p.imgId = await makeImageEntry(file, file.name);
    p.offX = 0; p.offY = 0; p.zoom = 1;
    afterPanelsChanged();
  } catch (err) { toast('Could not read that image.'); }
});

// ---------- bind layout inputs ----------
function bindLayout(id, key, conv, isCap) {
  const inp = $(id);
  inp.addEventListener('input', () => {
    const target = isCap ? state.layout.cap : state.layout;
    target[key] = conv ? conv(inp.value) : inp.value;
    if (key === 'font') ensureFont(target.font);
    if (id === 'lMode') $('lAspect').disabled = state.layout.mode === 'justified';
    updateValueLabels();
    scheduleRender();
    if (inp.tagName === 'SELECT') { commit(); syncProps(); }
  });
  inp.addEventListener('change', commit);
}
bindLayout('lCols', 'cols');
bindLayout('lWidth', 'width');
bindLayout('lMode', 'mode');
bindLayout('lAspect', 'aspect');
bindLayout('lFit', 'fit');
bindLayout('lBg', 'bg');
bindLayout('lGap', 'gap', num);
bindLayout('lPad', 'pad', num);
bindLayout('lBorder', 'border', num);
bindLayout('lBorderColor', 'borderColor');
bindLayout('lRadius', 'radius', num);
bindLayout('cPos', 'pos', null, true);
bindLayout('cFont', 'font', null, true);
bindLayout('cColor', 'color', null, true);
bindLayout('cSize', 'size', num, true);
bindLayout('cStroke', 'stroke', null, true);
bindLayout('cStrokeW', 'strokeW', num, true);
bindLayout('cBg', 'bg', null, true);
bindLayout('cBgOpacity', 'bgOpacity', num, true);
$('cAlign').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.layout.cap.align = b.dataset.v; setSeg('cAlign', b.dataset.v, {}); commit(); scheduleRender();
});
$('cStyleBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const c = state.layout.cap; c[b.dataset.k] = !c[b.dataset.k]; setSeg('cStyleBtns', null, c); commit(); scheduleRender();
});
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-preset]');
  if (b) applyPreset(b.dataset.preset);
});

// =====================================================================
// Canvas interaction
// =====================================================================
let drag = null;
let lastTap = { id: null, t: 0 };
function toCanvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
}
function localPoint(g, p) {
  const dx = p.x - g.cx, dy = p.y - g.cy;
  const c = Math.cos(-g.rot), s = Math.sin(-g.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}
function hitTest(p) {
  const ds = dispScale();
  const hr = 18 * ds;
  // handles of the selected element first
  const el = selEl();
  if (el) {
    const g = geo.get(el.id);
    if (g) {
      if (el.type === 'bubble' && el.tail && Math.hypot(p.x - g.tipX, p.y - g.tipY) < hr) return { kind: 'tail', el };
      const lp = localPoint(g, p);
      if (Math.abs(lp.x - g.w / 2) < hr && Math.abs(lp.y - g.h / 2) < hr) return { kind: 'resize', el };
    }
  }
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const e = state.elements[i];
    const g = geo.get(e.id);
    if (!g) continue;
    const lp = localPoint(g, p);
    if (Math.abs(lp.x) <= g.w / 2 && Math.abs(lp.y) <= g.h / 2) return { kind: 'el', el: e };
  }
  if (lastLayout) {
    for (const cell of lastLayout.cells) {
      if (p.x >= cell.x && p.x <= cell.x + cell.w && p.y >= cell.y && p.y <= cell.y + cell.h) return { kind: 'panel', cell };
    }
  }
  return null;
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  const p = toCanvasPoint(e);
  const hit = hitTest(p);
  const W = lastLayout ? lastLayout.W : canvas.width;
  drag = null;
  if (!hit) { select(null); return; }
  if (hit.kind === 'tail' || hit.kind === 'resize') {
    drag = { mode: hit.kind, el: hit.el, start: p, moved: false };
  } else if (hit.kind === 'el') {
    const el = hit.el;
    const now = Date.now();
    if (lastTap.id === el.id && now - lastTap.t < 380) {
      // double tap → jump to the text field
      lastTap = { id: null, t: 0 };
      select({ kind: 'el', id: el.id });
      $('elText').focus();
      $('elText').select();
      return;
    }
    lastTap = { id: el.id, t: now };
    if (!sel || sel.id !== el.id) select({ kind: 'el', id: el.id });
    drag = { mode: 'move', el, start: p, ox: el.x, oy: el.y, otx: el.tx, oty: el.ty, moved: false };
  } else if (hit.kind === 'panel') {
    const pnl = hit.cell.p;
    if (sel && sel.kind === 'panel' && sel.id === pnl.id && pnl.type === 'image') {
      drag = { mode: 'pan', panel: pnl, cell: hit.cell, start: p, ox: pnl.offX || 0, oy: pnl.offY || 0, moved: false };
    } else {
      select({ kind: 'panel', id: pnl.id });
    }
  }
  if (drag) {
    drag.W = W;
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toCanvasPoint(e);
  const W = drag.W;
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) < 3 * dispScale()) return;
  drag.moved = true;
  const el = drag.el;
  if (drag.mode === 'move') {
    let nx = drag.ox + dx / W, ny = drag.oy + dy / W;
    guides = { v: false, h: false };
    if (settings.snap && lastLayout) {
      const tol = 10 * dispScale() / W;
      if (Math.abs(nx - 0.5) < tol) { nx = 0.5; guides.v = true; }
      const midY = lastLayout.H / 2 / W;
      if (Math.abs(ny - midY) < tol) { ny = midY; guides.h = true; }
    }
    el.x = nx; el.y = ny;
    if (el.type === 'bubble') { el.tx = drag.otx + (nx - drag.ox); el.ty = drag.oty + (ny - drag.oy); }
  } else if (drag.mode === 'resize') {
    const g = geo.get(el.id);
    const lp = localPoint(g, p);
    el.w = clamp(Math.abs(lp.x) * 2 / W, 0.06, 3);
    if (el.type === 'bubble') {
      el.h = clamp(Math.abs(lp.y) * 2 / W, 0.04, 3);
      if (el.autoH) { el.autoH = false; $('bAutoH').checked = false; }
    }
  } else if (drag.mode === 'tail') {
    el.tx = p.x / W; el.ty = p.y / W;
  } else if (drag.mode === 'pan') {
    const pnl = drag.panel, d = drag.cell.draw;
    if (d) {
      const ox = d.dw - drag.cell.w, oy = d.dh - drag.cell.h;
      if (ox > 0.5) pnl.offX = clamp(drag.ox - 2 * dx / ox, -1, 1);
      if (oy > 0.5) pnl.offY = clamp(drag.oy - 2 * dy / oy, -1, 1);
      $('pOffX').value = Math.round(pnl.offX * 100);
      $('pOffY').value = Math.round(pnl.offY * 100);
    }
  }
  scheduleRender();
});
function endDrag() {
  if (!drag) return;
  const moved = drag.moved;
  drag = null;
  guides = { v: false, h: false };
  if (moved) { commit(); syncProps(); }
  scheduleRender();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
// Re-draw handles at the right size when the on-screen canvas size changes.
window.addEventListener('resize', scheduleRender);

// =====================================================================
// Sources: picker, drag & drop, paste
// =====================================================================
const drop = $('drop');
drop.addEventListener('click', () => $('fileInput').click());
$('fileInput').addEventListener('change', (e) => { addFiles(e.target.files); e.target.value = ''; });
['dragenter', 'dragover'].forEach(ev => {
  drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('drag'); });
  $('stage').addEventListener(ev, e => e.preventDefault());
});
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('drag'); }));
drop.addEventListener('drop', e => addFiles(e.dataTransfer.files));
$('stage').addEventListener('drop', e => { e.preventDefault(); addFiles(e.dataTransfer.files); });
document.addEventListener('paste', (e) => {
  const t = e.target;
  if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
  const files = Array.from(e.clipboardData ? e.clipboardData.files : []).filter(isImageFile);
  if (files.length) { e.preventDefault(); addFiles(files); }
});
$('colorPanelBtn').addEventListener('click', () => {
  state.panels.push(newPanel({ type: 'color', color: '#ffffff' }));
  const p = state.panels[state.panels.length - 1];
  sel = { kind: 'panel', id: p.id };
  afterPanelsChanged();
});

// =====================================================================
// Toolbar
// =====================================================================
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('addTextBtn').addEventListener('click', () => addElement(newText()));
$('addBubbleBtn').addEventListener('click', () => addElement(newBubble()));
$('topBottomBtn').addEventListener('click', addTopBottom);

document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.key === 'Escape') { closeAllModals(); select(null); return; }
  const el = selEl();
  if (!el) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedElement(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && lastLayout) {
    e.preventDefault();
    const step = (e.shiftKey ? 10 : 1) / lastLayout.W;
    const [ax, ay] = arrows[e.key];
    el.x += ax * step; el.y += ay * step;
    if (el.type === 'bubble') { el.tx += ax * step; el.ty += ay * step; }
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(commit, 400);
    scheduleRender();
  }
});
let nudgeTimer = null;

// =====================================================================
// Export
// =====================================================================
$('exFormat').addEventListener('input', () => { settings.format = $('exFormat').value; $('setFormat').value = settings.format; saveSettings(); });
$('exQuality').addEventListener('input', () => { settings.quality = Number($('exQuality').value); updateValueLabels(); saveSettings(); });

function hasContent() { return state.panels.length > 0 || state.elements.length > 0; }
async function exportFile() {
  const cv = document.createElement('canvas');
  renderTo(cv, false);
  const fmt = settings.format;
  const type = 'image/' + fmt;
  let blob = await new Promise(res => cv.toBlob(res, type, settings.quality / 100));
  let ext = fmt === 'jpeg' ? 'jpg' : fmt;
  if (!blob || blob.type !== type) { // e.g. WebP encoding unsupported (older Safari)
    blob = await new Promise(res => cv.toBlob(res, 'image/png'));
    ext = 'png';
    if (fmt !== 'png') toast(`${fmt.toUpperCase()} isn't supported by this browser — saved as PNG instead.`);
  }
  cv.width = cv.height = 0;
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `mememe_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
  return new File([blob], name, { type: blob.type });
}
$('downloadBtn').addEventListener('click', async () => {
  if (!hasContent()) { toast('Nothing to save yet — add an image or some text first.'); return; }
  const file = await exportFile();
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
});
(function setupShare() {
  try {
    const probe = new File([new Blob(['x'], { type: 'image/png' })], 'x.png', { type: 'image/png' });
    if (navigator.canShare && navigator.canShare({ files: [probe] })) $('shareBtn').hidden = false;
  } catch (e) { /* no File constructor / share API */ }
})();
$('shareBtn').addEventListener('click', async () => {
  if (!hasContent()) { toast('Nothing to share yet.'); return; }
  const file = await exportFile();
  try { await navigator.share({ files: [file], title: 'mememe' }); }
  catch (e) { if (e && e.name !== 'AbortError') toast('Sharing failed — use Download instead.'); }
});
$('clearAllBtn').addEventListener('click', () => {
  if (!hasContent()) return;
  if (!confirm('Remove all images, texts and bubbles and reset the layout?')) return;
  state.layout = defaultLayout();
  state.panels = [];
  state.elements = [];
  sel = null;
  geo.clear();
  commit();
  syncAll();
});

// =====================================================================
// Templates
// =====================================================================
const TPL_SOURCES = {
  imgflip: {
    label: 'Imgflip',
    url: 'https://api.imgflip.com/get_memes',
    parse: (j) => (j && j.data && j.data.memes || []).map(m => ({ name: m.name, url: m.url, thumb: m.url }))
  },
  memegen: {
    label: 'Memegen.link',
    url: 'https://api.memegen.link/templates/',
    parse: (j) => (Array.isArray(j) ? j : []).filter(t => t.blank).map(t => ({
      name: t.name, url: t.blank, thumb: t.blank + (t.blank.includes('?') ? '&' : '?') + 'width=200'
    }))
  }
};
const tplCache = {};
let tplList = [];
const FETCH_OPTS = { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' };

$('templatesBtn').addEventListener('click', () => {
  $('tplSource').value = settings.tplSource;
  openModal('tplModal');
  if (tplCache[settings.tplSource]) showTemplates(tplCache[settings.tplSource]);
});
$('tplSource').addEventListener('change', () => {
  settings.tplSource = $('tplSource').value;
  saveSettings();
  if (tplCache[settings.tplSource]) showTemplates(tplCache[settings.tplSource]);
  else { $('tplGrid').innerHTML = ''; $('tplStatus').textContent = 'Press “Load” to fetch the list.'; $('tplSearch').disabled = true; }
});
$('tplLoadBtn').addEventListener('click', async () => {
  const key = $('tplSource').value;
  const src = TPL_SOURCES[key];
  $('tplStatus').textContent = `Loading from ${src.label}…`;
  $('tplLoadBtn').disabled = true;
  try {
    const res = await fetch(src.url, Object.assign({ cache: 'no-store' }, FETCH_OPTS));
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const list = src.parse(await res.json());
    if (!list.length) throw new Error('empty');
    tplCache[key] = list;
    showTemplates(list);
  } catch (err) {
    $('tplStatus').textContent = `Couldn't load from ${src.label} — you may be offline, or the site currently blocks browser apps. Try the other source.`;
  } finally {
    $('tplLoadBtn').disabled = false;
  }
});
function showTemplates(list) {
  tplList = list;
  $('tplSearch').disabled = false;
  $('tplSearch').value = '';
  drawTemplateGrid();
}
$('tplSearch').addEventListener('input', drawTemplateGrid);
function drawTemplateGrid() {
  const q = $('tplSearch').value.trim().toLowerCase();
  const items = q ? tplList.filter(t => t.name.toLowerCase().includes(q)) : tplList;
  $('tplStatus').textContent = `${items.length} template${items.length === 1 ? '' : 's'} — tap one to add it as a panel.`;
  const grid = $('tplGrid');
  grid.innerHTML = '';
  const frag = document.createDocumentFragment();
  items.forEach(t => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tpl';
    b.title = t.name;
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    img.src = t.thumb;
    if (t.thumb !== t.url) img.addEventListener('error', () => { if (img.src !== t.url) img.src = t.url; }, { once: true });
    const span = document.createElement('span');
    span.textContent = t.name;
    b.append(img, span);
    b.addEventListener('click', () => useTemplate(t, b));
    frag.appendChild(b);
  });
  grid.appendChild(frag);
}
async function fetchImageBlob(url) {
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('not an image');
  return blob;
}
function blockedMessage(url) {
  const st = $('tplStatus');
  st.textContent = 'This image could not be used directly (the site blocks browser apps). ';
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  a.textContent = 'Open it in a new tab';
  st.append(a, ', save it, then add it via “Tap to add images”.');
}
async function useTemplate(t, btn) {
  btn.classList.add('busy');
  try {
    const blob = await fetchImageBlob(t.url);
    await addBlob(blob, t.name);
    closeModal('tplModal');
    toast(`Added “${t.name}”.`);
  } catch (err) {
    blockedMessage(t.url);
  } finally {
    btn.classList.remove('busy');
  }
}
$('urlLoadBtn').addEventListener('click', async () => {
  const url = $('urlInput').value.trim();
  if (!/^https:\/\//i.test(url)) { toast('Please enter an https:// address.'); return; }
  $('urlLoadBtn').disabled = true;
  try {
    const blob = await fetchImageBlob(url);
    await addBlob(blob, url.split('/').pop().split('?')[0] || 'image');
    $('urlInput').value = '';
    closeModal('tplModal');
  } catch (err) {
    blockedMessage(url);
  } finally {
    $('urlLoadBtn').disabled = false;
  }
});

// =====================================================================
// Menu, modals, header
// =====================================================================
const menu = $('menu');
$('menuBtn').addEventListener('click', (e) => {
  e.stopPropagation();
  menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
});
document.addEventListener('click', (e) => {
  if (menu.style.display !== 'none' && !menu.contains(e.target)) menu.style.display = 'none';
});
$('themeToggle').addEventListener('click', () => {
  setTheme(root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
  menu.style.display = 'none';
});
$('settingsBtn').addEventListener('click', () => { menu.style.display = 'none'; openModal('settingsModal'); });
$('aboutBtn').addEventListener('click', () => { menu.style.display = 'none'; openModal('aboutModal'); });

function openModal(id) { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }
function closeAllModals() { document.querySelectorAll('.modal-bg.open').forEach(m => m.classList.remove('open')); }
document.querySelectorAll('.modal-bg').forEach(bg => {
  bg.addEventListener('click', (e) => { if (e.target === bg) bg.classList.remove('open'); });
});
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));

// settings modal
$('setFormat').addEventListener('input', () => { settings.format = $('setFormat').value; $('exFormat').value = settings.format; saveSettings(); });
$('setWidth').addEventListener('input', () => { settings.width = $('setWidth').value; saveSettings(); });
$('setSnap').addEventListener('input', () => { settings.snap = $('setSnap').checked; saveSettings(); });
$('setDownscale').addEventListener('input', () => { settings.downscale = $('setDownscale').checked; saveSettings(); });

const brand = $('brand');
const goHome = () => window.scrollTo({ top: 0, behavior: 'smooth' });
brand.addEventListener('click', goHome);
brand.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); goHome(); } });

const fsBtn = $('fullscreenBtn');
if (!document.fullscreenEnabled) fsBtn.hidden = true;
fsBtn.addEventListener('click', () => {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
});
document.addEventListener('fullscreenchange', () => fsBtn.classList.toggle('active', !!document.fullscreenElement));

window.addEventListener('beforeunload', (e) => {
  if (hasContent()) { e.preventDefault(); e.returnValue = ''; }
});

// =====================================================================
// Init
// =====================================================================
$('footerVersion').textContent = 'v' + APP_VERSION;
$('aboutVersion').textContent = APP_VERSION;
populateFontSelects();
$('exFormat').value = settings.format;
$('setFormat').value = settings.format;
$('exQuality').value = settings.quality;
$('setWidth').value = settings.width;
$('setSnap').checked = !!settings.snap;
$('setDownscale').checked = !!settings.downscale;
ensureUsedFonts();
ensureFont('anton');
ensureFont('comic');
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', scheduleRender);
commit();
syncAll();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
