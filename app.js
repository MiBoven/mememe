'use strict';
/* mememe — To Me, or not to Me, that's the Meme!
 * Client-side meme / grid / comic composer. Everything is drawn on a <canvas>;
 * nothing is uploaded. */

const APP_VERSION = '0.2.0';
const $ = (id) => document.getElementById(id);
const isCoarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;

// =====================================================================
// Fonts
// =====================================================================
// `load` is the @font-face family that must be loaded before the canvas can
// draw with it (canvas text silently falls back otherwise).
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
  ensureFont(state.layout.num.font);
  state.elements.forEach(el => ensureFont(el.font));
}

// =====================================================================
// Settings & theme
// =====================================================================
const SETTINGS_KEY = 'mememe-settings';
const settings = Object.assign(
  { format: 'png', quality: 90, width: '1080', snap: true, downscale: true, tplSource: 'imgflip', side: 'auto', pin: false },
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
    cols: 'auto', width: settings.width, mode: 'uniform', aspect: 'first', fit: 'cover', bg: '#ffffff',
    gap: 0, gapColor: '#000000', pad: 0, padColor: '#000000', border: 0, borderColor: '#000000', radius: 0,
    cap: {
      pos: 'overlayBottom', font: 'montserrat', size: 44, color: '#ffffff', stroke: '#000000', strokeW: 6,
      bg: '#000000', bgOpacity: 0, align: 'center', bold: true, italic: false, upper: false
    },
    num: {
      on: false, format: '1', shape: 'circle', font: 'archivo', size: 40, color: '#ffffff', bg: '#111111',
      border: '#ffffff', borderW: 3, anchor: 'tl', margin: 20
    }
  };
}
// Element defaults (also used by "click label to reset").
const TEXT_DEFAULTS = {
  font: 'anton', size: 72, color: '#ffffff', stroke: '#000000', strokeW: 8, bgOn: false, bg: '#000000', bgOpacity: 60,
  align: 'center', bold: false, italic: false, upper: true, shadow: false, rot: 0, fit: false, clip: false, pin: 'auto', margin: 30
};
const BUBBLE_DEFAULTS = {
  font: 'comic', size: 40, color: '#111111', stroke: '#ffffff', strokeW: 0, bgOn: false, bg: '#000000', bgOpacity: 0,
  align: 'center', bold: true, italic: false, upper: false, shadow: false, rot: 0, fit: true, clip: false, pin: 'auto', margin: 30,
  shape: 'oval', fill: '#ffffff', fillOpacity: 100, border: '#111111', borderW: 4, tail: true, autoH: true
};
const PANEL_DEFAULTS = {
  fit: '', zoom: 1, offX: 0, offY: 0, span: 1, color: '#ffffff', caption: '', flip: false,
  numText: '', numHide: false, numOwn: false, numColor: '#ffffff', numBg: '#e53935'
};
const state = { layout: defaultLayout(), panels: [], elements: [] };

// Decoded images live outside the (serialisable) state so undo/redo stays cheap.
// id -> { src: ImageBitmap|HTMLCanvasElement|HTMLImageElement, w, h, thumb, name, credit }
const images = new Map();

let sel = null;               // { kind: 'el' | 'panel', id }
let detailId = null;          // panel shown in the detail view (null = whole composition)
let lastLayout = null;        // layout from the last on-screen render
let lastView = { x: 0, y: 0, w: 1080, h: 1080, scale: 1 };
const geo = new Map();        // element id -> geometry from the last render (for hit tests)
let guides = { x: null, y: null };

// Style of the last edited text / bubble, used for the next new one.
const lastStyle = { text: null, bubble: null };
const STYLE_KEYS = ['font', 'size', 'color', 'stroke', 'strokeW', 'bgOn', 'bg', 'bgOpacity', 'align', 'bold', 'italic', 'upper', 'shadow',
  'shape', 'fill', 'fillOpacity', 'border', 'borderW'];
// Keys measured in "frame units" — rescaled when an element moves to a differently sized image.
const SCALE_KEYS = ['size', 'w', 'h', 'strokeW', 'borderW', 'margin'];

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
  if (detailId && !findPanel(detailId)) detailId = null;
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
function normHex(v) {
  let h = String(v || '').trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(h)) h = h.split('').map(c => c + c).join('');
  return /^[0-9a-f]{6}$/.test(h) ? '#' + h : null;
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
function roundRectPath2D(p, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
}
function fmtNum(n, f) {
  if (f === 'A' || f === 'a') {
    let s = '', k = n;
    while (k > 0) { k--; s = String.fromCharCode(65 + (k % 26)) + s; k = Math.floor(k / 26); }
    return f === 'a' ? s.toLowerCase() : s;
  }
  if (f === 'I' || f === 'i') {
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '', k = n;
    for (const [v, r] of map) while (k >= v) { s += r; k -= v; }
    return f === 'i' ? s.toLowerCase() : s;
  }
  return String(n);
}
// Position of a w×h box inside a frame for an anchor like 'tl', 'mc', 'br'.
function anchorPos(a, fr, w, h, m) {
  const row = a[0], col = a[1];
  return {
    x: col === 'l' ? fr.x + m + w / 2 : col === 'r' ? fr.x + fr.w - m - w / 2 : fr.x + fr.w / 2,
    y: row === 't' ? fr.y + m + h / 2 : row === 'b' ? fr.y + fr.h - m - h / 2 : fr.y + fr.h / 2
  };
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
function longestWord(ctx, text) {
  let m = 0;
  String(text).split(/\s+/).forEach(w => { if (w) m = Math.max(m, ctx.measureText(w).width); });
  return m;
}

// Draws pre-wrapped lines: outline first, then fill (classic meme look).
function drawLines(ctx, lines, x0, areaW, yTop, lineH, st, px, strokePx) {
  ctx.textAlign = st.align;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  const lx = st.align === 'left' ? x0 : st.align === 'right' ? x0 + areaW : x0 + areaW / 2;
  const setShadow = (on) => {
    ctx.shadowColor = on ? 'rgba(0,0,0,0.55)' : 'transparent';
    ctx.shadowBlur = on ? px * 0.12 : 0;
    ctx.shadowOffsetX = on ? px * 0.04 : 0;
    ctx.shadowOffsetY = on ? px * 0.05 : 0;
  };
  lines.forEach((line, i) => {
    const ly = yTop + lineH * (i + 0.5);
    if (strokePx > 0) {
      setShadow(!!st.shadow);
      ctx.lineWidth = strokePx;
      ctx.strokeStyle = st.stroke;
      ctx.strokeText(line, lx, ly);
      setShadow(false);
    } else {
      setShadow(!!st.shadow);
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
function firstImage() {
  const p = state.panels.find(q => q.type === 'image' && images.get(q.imgId));
  return p ? images.get(p.imgId) : null;
}
function firstAspect() {
  const im = firstImage();
  return im ? im.w / im.h : 1;
}
// Width needed so that every image is drawn at (at least) its original pixel size.
function detailWidth() {
  const L = state.layout, cols = getCols();
  const imgPanels = state.panels.filter(p => p.type === 'image' && images.get(p.imgId));
  if (!imgPanels.length) return 1080;
  const frac = Math.max(0.2, 1 - (2 * L.pad + (cols - 1) * L.gap) / 1000);
  if (L.mode === 'justified') {
    let best = 0;
    for (let i = 0; i < state.panels.length; i += cols) {
      const chunk = state.panels.slice(i, i + cols);
      const sumA = chunk.reduce((a, p) => a + panelAspect(p), 0);
      const maxH = Math.max(1, ...chunk.filter(p => p.type === 'image' && images.get(p.imgId)).map(p => images.get(p.imgId).h));
      best = Math.max(best, sumA * maxH);
    }
    return best / frac;
  }
  const aspect = L.aspect === 'first' ? firstAspect() : parseFloat(L.aspect) || 1;
  let cwNeed = 0;
  imgPanels.forEach(p => {
    const im = images.get(p.imgId);
    const fit = p.fit || L.fit;
    const need = fit === 'cover' ? Math.min(im.w, im.h * aspect) : Math.max(im.w, im.h * aspect);
    const span = clamp(p.span || 1, 1, cols);
    cwNeed = Math.max(cwNeed, need / (p.zoom || 1) / span);
  });
  return (cols * cwNeed) / frac;
}
function baseWidth() {
  const L = state.layout;
  if (L.width === 'orig') { const im = firstImage(); return im ? clamp(Math.round(im.w), 320, 8192) : 1080; }
  if (L.width === 'detail') return clamp(Math.round(detailWidth()), 320, 12000);
  return parseInt(L.width, 10) || 1080;
}

function captionGeom(ctx, text, areaW, cu) {
  const c = state.layout.cap;
  const px = c.size * cu;
  ctx.font = fontString(c.font, px, c.bold, c.italic);
  const pad = px * 0.35;
  const txt = c.upper ? String(text).toUpperCase() : String(text);
  const lines = text && text.trim() ? wrapLines(ctx, txt, Math.max(px, areaW - 2 * pad)) : [];
  const lineH = px * 1.2;
  return { px, pad, lines, lineH, h: lines.length ? lines.length * lineH + 2 * pad : 0 };
}

// Browser canvas limits: ~16.7 MP on iOS / many phones, much more on desktop.
const MAX_AREA = isCoarse ? 16000000 : 40000000;
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
  const cu = inner / cols / 1000; // "column unit" for captions & numbers
  const cells = [];
  const panels = state.panels;
  if (!panels.length) {
    const a = L.aspect === 'first' ? 1 : parseFloat(L.aspect) || 1;
    return { W: Math.round(W), H: Math.round(W / a), s, cu: W / 1000, gap, pad, cells };
  }
  const bar = L.cap.pos === 'below' || L.cap.pos === 'above';
  const rows = [];
  if (L.mode === 'justified') {
    for (let i = 0; i < panels.length; i += cols) {
      const chunk = panels.slice(i, i + cols);
      const sumA = chunk.reduce((a, p) => a + panelAspect(p), 0);
      const h = (inner - (chunk.length - 1) * gap) / sumA;
      let x = pad;
      rows.push({ h, cells: chunk.map(p => { const w = panelAspect(p) * h; const c = { p, x, w }; x += w + gap; return c; }) });
    }
  } else {
    const aspect = L.aspect === 'first' ? firstAspect() : parseFloat(L.aspect) || 1;
    const cw = (inner - (cols - 1) * gap) / cols;
    const ch = cw / aspect;
    let cur = [], used = 0;
    for (const p of panels) {
      const span = clamp(p.span || 1, 1, cols);
      if (used + span > cols && cur.length) { rows.push({ h: ch, cells: cur }); cur = []; used = 0; }
      cur.push({ p, x: pad + used * (cw + gap), w: span * cw + (span - 1) * gap });
      used += span;
    }
    if (cur.length) rows.push({ h: ch, cells: cur });
  }
  let y = pad;
  for (const row of rows) {
    let barH = 0;
    if (bar) row.cells.forEach(c => { barH = Math.max(barH, captionGeom(ctx, c.p.caption || '', c.w, cu).h); });
    for (const c of row.cells) {
      const imgY = y + (L.cap.pos === 'above' ? barH : 0);
      const cell = { p: c.p, x: c.x, y: imgY, w: c.w, h: row.h, capRect: null };
      if (bar && barH > 0) cell.capRect = { x: c.x, y: L.cap.pos === 'above' ? y : imgY + row.h, w: c.w, h: barH };
      cells.push(cell);
    }
    y += row.h + barH + gap;
  }
  const H = Math.max(1, Math.round(y - gap + pad));
  return { W: Math.round(W), H, s, cu, gap, pad, cells };
}
function canvasFrame(lay) { return { x: 0, y: 0, w: lay.W, h: lay.H, canvas: true }; }
function frameOf(el, lay) {
  if (el.panelId) {
    const cell = lay.cells.find(c => c.p.id === el.panelId);
    if (cell) return cell;
  }
  return canvasFrame(lay);
}
function cellAt(lay, x, y) {
  return lay.cells.find(c => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) || null;
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
let lastSizeKey = '';
function render() {
  const r = renderTo(canvas, { ui: true });
  lastLayout = r.lay;
  lastView = r.v;
  const key = state.layout.width + '|' + r.lay.W + 'x' + r.lay.H;
  if (r.lay.scaledDown && key !== lastSizeKey && lastSizeKey) {
    toast('Very large result — scaled down evenly to stay within the browser limit.');
  }
  lastSizeKey = key;
  $('exSize').textContent = `Result: ${r.lay.W} × ${r.lay.H} px` + (r.lay.scaledDown ? ' (reduced to the browser limit)' : '');
}
// Composition units per CSS pixel of the on-screen canvas (for handle sizes).
function dispScale() {
  const r = canvas.getBoundingClientRect();
  return r.width ? lastView.w / r.width : 1;
}
// Which part of the composition the on-screen canvas shows, and at which scale.
function displayView(lay) {
  let rect = { x: 0, y: 0, w: lay.W, h: lay.H };
  if (detailId) {
    const cell = lay.cells.find(c => c.p.id === detailId);
    if (cell) {
      let x0 = cell.x, y0 = cell.y, x1 = cell.x + cell.w, y1 = cell.y + cell.h;
      if (cell.capRect) { y0 = Math.min(y0, cell.capRect.y); y1 = Math.max(y1, cell.capRect.y + cell.capRect.h); }
      const m = Math.max(lay.gap, cell.w * 0.04);
      x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m); x1 = Math.min(lay.W, x1 + m); y1 = Math.min(lay.H, y1 + m);
      rect = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    } else {
      detailId = null;
      updateDetailBar();
    }
  }
  const stage = $('stage');
  const cssW = Math.max(200, stage.clientWidth - 22);
  const target = cssW * (window.devicePixelRatio || 1);
  // Phones: draw only as many pixels as the screen shows (fast). Desktop: at least full resolution.
  let scale = isCoarse ? target / rect.w : Math.max(1, target / rect.w);
  scale = Math.min(scale, 4);
  const area = rect.w * rect.h * scale * scale;
  if (area > MAX_AREA) scale *= Math.sqrt(MAX_AREA / area);
  return Object.assign(rect, { scale });
}

function renderTo(cv, opt) {
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  const lay = computeLayout(c);
  const v = opt.full ? { x: 0, y: 0, w: lay.W, h: lay.H, scale: 1 } : displayView(lay);
  const pw = Math.max(1, Math.round(v.w * v.scale)), ph = Math.max(1, Math.round(v.h * v.scale));
  if (cv.width !== pw) cv.width = pw;
  if (cv.height !== ph) cv.height = ph;
  c.setTransform(v.scale, 0, 0, v.scale, -v.x * v.scale, -v.y * v.scale);
  c.imageSmoothingQuality = 'high';
  drawComposition(c, lay, v.scale, opt.ui);
  c.setTransform(1, 0, 0, 1, 0, 0);
  return { lay, v };
}

function drawComposition(c, lay, scale, withUI) {
  const L = state.layout;
  const { W, H, pad, gap } = lay;
  // outer frame + background
  c.fillStyle = pad > 0 ? L.padColor : L.bg;
  c.fillRect(0, 0, W, H);
  if (pad > 0) { c.fillStyle = L.bg; c.fillRect(pad, pad, W - 2 * pad, H - 2 * pad); }
  // lines between the images: each cell (incl. caption bar) is backed by a
  // slightly larger rect in the gap color, clipped to the inner area
  if (gap > 0 && lay.cells.length > 1) {
    c.save();
    c.beginPath();
    c.rect(pad, pad, W - 2 * pad, H - 2 * pad);
    c.clip();
    c.fillStyle = L.gapColor;
    lay.cells.forEach(cell => {
      let y0 = cell.y, y1 = cell.y + cell.h;
      if (cell.capRect) { y0 = Math.min(y0, cell.capRect.y); y1 = Math.max(y1, cell.capRect.y + cell.capRect.h); }
      c.fillRect(cell.x - gap / 2, y0 - gap / 2, cell.w + gap, y1 - y0 + gap);
    });
    c.restore();
  }
  lay.cells.forEach(cell => drawPanel(c, cell, lay));
  lay.cells.forEach(cell => drawCaption(c, cell, lay));
  drawNumbers(c, lay);
  state.elements.forEach(el => {
    const fr = frameOf(el, lay);
    const clip = el.clip && !fr.canvas;
    if (clip) { c.save(); c.beginPath(); c.rect(fr.x, fr.y, fr.w, fr.h); c.clip(); }
    if (el.type === 'text') drawTextEl(c, el, fr);
    else drawBubbleEl(c, el, fr, lay, scale);
    if (clip) c.restore();
  });
  if (withUI) drawSelection(c, lay);
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
      c.fillStyle = L.bg;
      c.fillRect(x, y, w, h);
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
  const cap = state.layout.cap;
  c.save();
  if (cell.capRect) {
    const R = cell.capRect;
    if (cap.bgOpacity > 0) { c.fillStyle = hexToRgba(cap.bg, cap.bgOpacity / 100); c.fillRect(R.x, R.y, R.w, R.h); }
    const g = captionGeom(c, text, R.w, lay.cu);
    const top = R.y + (R.h - g.lines.length * g.lineH) / 2;
    drawLines(c, g.lines, R.x + g.pad, R.w - 2 * g.pad, top, g.lineH, cap, g.px, cap.strokeW * lay.cu);
  } else {
    const g = captionGeom(c, text, cell.w, lay.cu);
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
    drawLines(c, g.lines, cell.x + g.pad, cell.w - 2 * g.pad, top, g.lineH, cap, g.px, cap.strokeW * lay.cu);
  }
  c.restore();
}

// ---------- Number badges ----------
function drawNumbers(c, lay) {
  const N = state.layout.num;
  if (!N.on) return;
  let n = 0;
  lay.cells.forEach(cell => {
    const p = cell.p;
    if (p.numHide) return;
    n++;
    const label = (p.numText && p.numText.trim()) || fmtNum(n, N.format);
    const D = N.size * lay.cu * 2;
    const fpx = D * 0.56;
    c.save();
    c.font = fontString(N.font, fpx, true, false);
    const tw = c.measureText(label).width;
    let bw = D, bh = D;
    if (N.shape === 'circle' && tw > D * 0.7) bw = tw + D * 0.55;
    if (N.shape === 'square') bw = Math.max(D, tw + D * 0.45);
    if (N.shape === 'none') { bw = tw; bh = fpx * 1.1; }
    const m = N.margin * lay.cu;
    const pos = anchorPos(N.anchor || 'tl', cell, bw, bh, m);
    const fill = p.numOwn ? p.numBg : N.bg;
    const color = p.numOwn ? p.numColor : N.color;
    const bwPx = N.borderW * lay.cu;
    c.beginPath();
    c.rect(cell.x, cell.y, cell.w, cell.h);
    c.clip();
    if (N.shape !== 'none') {
      const r = N.shape === 'circle' ? bh / 2 : D * 0.22;
      roundRectPath(c, pos.x - bw / 2, pos.y - bh / 2, bw, bh, r);
      c.fillStyle = fill;
      c.fill();
      if (bwPx > 0) { c.lineWidth = bwPx; c.strokeStyle = N.border; c.stroke(); }
    }
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    if (N.shape === 'none' && bwPx > 0) {
      c.lineJoin = 'round';
      c.lineWidth = bwPx * 2;
      c.strokeStyle = N.border;
      c.strokeText(label, pos.x, pos.y + fpx * 0.04);
    }
    c.fillStyle = color;
    c.fillText(label, pos.x, pos.y + fpx * 0.04);
    c.restore();
  });
}

// ---------- Text elements ----------
function textGeom(c, el, fr) {
  const u = fr.w / 1000;
  const txt0 = el.upper ? String(el.text).toUpperCase() : String(el.text);
  const txt = txt0.length ? txt0 : ' ';
  const boxW = Math.max(8, el.w * fr.w);
  let px = Math.max(2, el.size * u);
  const layoutFor = (size) => {
    c.font = fontString(el.font, size, el.bold, el.italic);
    const pad = size * 0.28;
    const maxW = Math.max(size * 0.6, boxW - 2 * pad);
    return { size, pad, maxW, lines: wrapLines(c, txt, maxW), lineH: size * 1.12 };
  };
  let g = layoutFor(px);
  let boxH = null;
  if (el.fit) {
    boxH = Math.max(8, (el.h || 0.2) * fr.w);
    while (g.size > 3 && (g.lines.length * g.lineH + 2 * g.pad > boxH || longestWord(c, txt) > g.maxW)) g = layoutFor(g.size * 0.93);
  }
  c.font = fontString(el.font, g.size, el.bold, el.italic);
  const widths = g.lines.map(l => c.measureText(l).width);
  const blockW = Math.min(boxW - 2 * g.pad, Math.max(0, ...widths));
  const blockH = g.lines.length * g.lineH + 2 * g.pad;
  return {
    type: 'text', px: g.size, pad: g.pad, boxW, w: boxW, h: boxH || blockH, blockH, lines: g.lines, lineH: g.lineH, blockW,
    strokePx: (el.strokeW || 0) * u * (g.size / Math.max(0.001, el.size * u)),
    cx: fr.x + el.x * fr.w, cy: fr.y + el.y * fr.h, rot: (el.rot || 0) * Math.PI / 180, frame: fr
  };
}
function drawTextEl(c, el, fr) {
  const g = textGeom(c, el, fr);
  geo.set(el.id, g);
  c.save();
  c.translate(g.cx, g.cy);
  c.rotate(g.rot);
  const left = -g.boxW / 2;
  const top = -g.blockH / 2;
  if (el.bgOn && el.bgOpacity > 0) {
    const bw = g.blockW + 2 * g.pad;
    const bx = el.align === 'left' ? left : el.align === 'right' ? left + g.boxW - bw : -bw / 2;
    c.fillStyle = hexToRgba(el.bg, el.bgOpacity / 100);
    roundRectPath(c, bx, top, bw, g.blockH, g.pad * 0.7);
    c.fill();
  }
  c.font = fontString(el.font, g.px, el.bold, el.italic);
  drawLines(c, g.lines, left + g.pad, g.boxW - 2 * g.pad, top + g.pad, g.lineH, el, g.px, g.strokePx);
  c.restore();
}

// ---------- Speech bubbles ----------
const ROUND_SHAPES = ['oval', 'whisper', 'thought', 'shout'];
function bubbleGeom(c, el, fr) {
  const u = fr.w / 1000;
  const txt0 = el.upper ? String(el.text).toUpperCase() : String(el.text);
  const txt = txt0.length ? txt0 : ' ';
  const bw = Math.max(16, el.w * fr.w);
  const round = ROUND_SHAPES.includes(el.shape);
  const k = el.shape === 'shout' || el.shape === 'thought' ? 0.64 : round ? 0.74 : 1;
  const t = el.shape === 'shout' || el.shape === 'thought' ? 0.6 : 0.68;
  const layoutFor = (size) => {
    c.font = fontString(el.font, size, el.bold, el.italic);
    const pad = size * 0.45;
    const maxW = Math.max(size, bw * k - 2 * pad);
    const lines = wrapLines(c, txt, maxW);
    const lineH = size * 1.15;
    return { size, pad, maxW, lines, lineH, textH: lines.length * lineH };
  };
  let g = layoutFor(Math.max(2, el.size * u));
  let bh;
  if (el.autoH) {
    bh = round ? (g.textH + g.pad) / t : g.textH + 2 * g.pad * 1.3;
    bh = Math.max(bh, g.size * 1.8);
  } else {
    bh = Math.max(8, el.h * fr.w);
    if (el.fit) {
      const fits = (q) => (round ? (q.textH + q.pad) / t : q.textH + 2 * q.pad * 1.3) <= bh && longestWord(c, txt) <= q.maxW;
      while (g.size > 3 && !fits(g)) g = layoutFor(g.size * 0.93);
    }
  }
  c.font = fontString(el.font, g.size, el.bold, el.italic);
  return {
    type: 'bubble', px: g.size, pad: g.pad, w: bw, h: bh, lines: g.lines, lineH: g.lineH, textH: g.textH, maxW: g.maxW,
    strokePx: (el.strokeW || 0) * u * (g.size / Math.max(0.001, el.size * u)), borderPx: (el.borderW || 0) * u,
    cx: fr.x + el.x * fr.w, cy: fr.y + el.y * fr.h, tipX: fr.x + el.tx * fr.w, tipY: fr.y + el.ty * fr.h, rot: 0, frame: fr
  };
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
    // One continuous scalloped outline (cloud) — no overlapping circles.
    const perim = Math.PI * (rx + ry);
    const n = Math.max(8, Math.round(perim / (Math.min(rx, ry) * 0.62)));
    const pt = (a, f) => ({ x: cx + Math.cos(a) * rx * f, y: cy + Math.sin(a) * ry * f });
    const step = (Math.PI * 2) / n;
    const a0 = 0.2;
    const start = pt(a0, 0.9);
    body.moveTo(start.x, start.y);
    for (let i = 0; i < n; i++) {
      const a = a0 + i * step;
      const bulge = 1.16 + rnd() * 0.08;
      const c1 = pt(a + step * 0.12, bulge);
      const c2 = pt(a + step * 0.88, bulge);
      const end = pt(a + step, 0.9);
      body.bezierCurveTo(c1.x, c1.y, c2.x, c2.y, end.x, end.y);
    }
    body.closePath();
  } else {
    body.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  }
  shapes.push(body);

  if (el.tail) {
    const dx = g.tipX - cx, dy = g.tipY - cy;
    const dist = Math.hypot(dx, dy);
    const inside = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) < 1;
    if (dist > 1 && !inside) {
      const ux = dx / dist, uy = dy / dist, nx = -uy, ny = ux;
      if (el.shape === 'thought') {
        const t = 1 / Math.sqrt((ux * ux) / (rx * rx) + (uy * uy) / (ry * ry));
        const ex = cx + ux * t * 1.08, ey = cy + uy * t * 1.08;
        const base = Math.min(rx, ry);
        [[0.2, 0.15], [0.55, 0.105], [0.88, 0.065]].forEach(([f, r]) => {
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
          const bend = dist * 0.14;
          tail.quadraticCurveTo(cx + dx * 0.6 + nx * bend, cy + dy * 0.6 + ny * bend, g.tipX, g.tipY);
          tail.quadraticCurveTo(cx + dx * 0.45 + nx * bend * 0.4, cy + dy * 0.45 + ny * bend * 0.4, b2x, b2y);
        }
        tail.closePath();
        shapes.push(tail);
      }
    }
  }
  return shapes;
}

// Two scratch layers: fill (drawn with the fill opacity as a whole, so
// overlapping parts never get darker) and border (outline around the union).
const scratchFill = document.createElement('canvas');
const scratchLine = document.createElement('canvas');
function prepScratch(cv, w, h, scale, x0, y0) {
  if (cv.width < w) cv.width = w;
  if (cv.height < h) cv.height = h;
  const sc = cv.getContext('2d');
  sc.setTransform(1, 0, 0, 1, 0, 0);
  sc.clearRect(0, 0, w, h);
  sc.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
  return sc;
}
function drawBubbleEl(c, el, fr, lay, scale) {
  const g = bubbleGeom(c, el, fr);
  geo.set(el.id, g);
  const bwPx = g.borderPx;
  const m = Math.max(g.w, g.h) * 0.2 + bwPx * 2 + 4;
  let x0 = g.cx - g.w / 2 - m, y0 = g.cy - g.h / 2 - m, x1 = g.cx + g.w / 2 + m, y1 = g.cy + g.h / 2 + m;
  if (el.tail) { x0 = Math.min(x0, g.tipX - m); y0 = Math.min(y0, g.tipY - m); x1 = Math.max(x1, g.tipX + m); y1 = Math.max(y1, g.tipY + m); }
  x0 = Math.max(x0, 0); y0 = Math.max(y0, 0);
  x1 = Math.min(x1, lay.W); y1 = Math.min(y1, lay.H);
  const sw = Math.ceil((x1 - x0) * scale), sh = Math.ceil((y1 - y0) * scale);
  if (sw > 0 && sh > 0) {
    const shapes = bubbleShapes(el, g);
    const fa = prepScratch(scratchFill, sw, sh, scale, x0, y0);
    fa.fillStyle = el.fill;
    shapes.forEach(p => fa.fill(p));
    c.save();
    c.globalAlpha = clamp((el.fillOpacity ?? 100) / 100, 0, 1);
    c.drawImage(scratchFill, 0, 0, sw, sh, x0, y0, sw / scale, sh / scale);
    c.globalAlpha = 1;
    if (bwPx > 0) {
      const la = prepScratch(scratchLine, sw, sh, scale, x0, y0);
      la.lineWidth = bwPx * 2;
      la.lineJoin = 'round';
      la.strokeStyle = el.border;
      if (el.shape === 'whisper') la.setLineDash([g.px * 0.5, g.px * 0.35]);
      shapes.forEach(p => la.stroke(p));
      la.setLineDash([]);
      la.globalCompositeOperation = 'destination-out';
      la.fillStyle = '#000';
      shapes.forEach(p => la.fill(p));
      la.globalCompositeOperation = 'source-over';
      c.drawImage(scratchLine, 0, 0, sw, sh, x0, y0, sw / scale, sh / scale);
    }
    c.restore();
  }
  c.save();
  c.font = fontString(el.font, g.px, el.bold, el.italic);
  drawLines(c, g.lines, g.cx - g.maxW / 2, g.maxW, g.cy - g.textH / 2, g.lineH, el, g.px, g.strokePx);
  c.restore();
}

// ---------- Selection overlay ----------
function drawSelection(c, lay) {
  const ds = dispScale();
  const accent = '#4f8cff';
  c.save();
  c.lineWidth = 2 * ds;
  c.strokeStyle = '#ff3ea5';
  if (guides.x != null) { c.beginPath(); c.moveTo(guides.x, 0); c.lineTo(guides.x, lay.H); c.stroke(); }
  if (guides.y != null) { c.beginPath(); c.moveTo(0, guides.y); c.lineTo(lay.W, guides.y); c.stroke(); }
  c.strokeStyle = accent;
  c.setLineDash([7 * ds, 5 * ds]);
  if (sel && sel.kind === 'panel') {
    const cell = lay.cells.find(cl => cl.p.id === sel.id);
    if (cell) c.strokeRect(cell.x + ds, cell.y + ds, cell.w - 2 * ds, cell.h - 2 * ds);
  } else if (sel && sel.kind === 'el') {
    const g = geo.get(sel.id);
    const el = findEl(sel.id);
    if (g && el) {
      // faint outline of the image the element belongs to
      if (!g.frame.canvas) {
        c.save();
        c.strokeStyle = 'rgba(79,140,255,.45)';
        c.setLineDash([3 * ds, 4 * ds]);
        c.strokeRect(g.frame.x + ds, g.frame.y + ds, g.frame.w - 2 * ds, g.frame.h - 2 * ds);
        c.restore();
      }
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

// Move an element into another frame without changing how it looks.
function moveToFrame(el, from, to) {
  const k = from.w / to.w;
  const cx = from.x + el.x * from.w, cy = from.y + el.y * from.h;
  SCALE_KEYS.forEach(key => { if (typeof el[key] === 'number') el[key] *= k; });
  el.x = (cx - to.x) / to.w;
  el.y = (cy - to.y) / to.h;
  if (el.type === 'bubble') {
    const tx = from.x + el.tx * from.w, ty = from.y + el.ty * from.h;
    el.tx = (tx - to.x) / to.w;
    el.ty = (ty - to.y) / to.h;
  }
  el.panelId = to.canvas ? null : to.p.id;
}
function geomFor(el, fr) { return el.type === 'text' ? textGeom(ctx, el, fr) : bubbleGeom(ctx, el, fr); }
function alignElement(el, a, lay) {
  lay = lay || lastLayout;
  if (!lay) return;
  const fr = frameOf(el, lay);
  const g = geomFor(el, fr);
  const m = (el.margin ?? 30) * fr.w / 1000;
  const pos = anchorPos(a, fr, g.w, g.h, m);
  const nx = (pos.x - fr.x) / fr.w, ny = (pos.y - fr.y) / fr.h;
  if (el.type === 'bubble') { el.tx += nx - el.x; el.ty += ny - el.y; }
  el.x = nx; el.y = ny;
}

// =====================================================================
// Images: import
// =====================================================================
const MAX_IMPORT = 4096;
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
async function makeImageEntry(blob, name, credit) {
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
  const ts = 120 / Math.max(d.w, d.h);
  const tc = document.createElement('canvas');
  tc.width = Math.max(1, Math.round(d.w * Math.min(1, ts)));
  tc.height = Math.max(1, Math.round(d.h * Math.min(1, ts)));
  tc.getContext('2d').drawImage(d.src, 0, 0, tc.width, tc.height);
  const thumbBlob = await new Promise(res => tc.toBlob(res, 'image/jpeg', 0.7));
  const id = uid();
  images.set(id, { src: d.src, w: d.w, h: d.h, name: name || 'image', credit: credit || '', thumb: thumbBlob ? URL.createObjectURL(thumbBlob) : '' });
  return id;
}
function newPanel(over) {
  return Object.assign({ id: uid(), type: 'image', imgId: null }, JSON.parse(JSON.stringify(PANEL_DEFAULTS)), over);
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
async function addBlob(blob, name, credit) {
  const imgId = await makeImageEntry(blob, name, credit);
  state.panels.push(newPanel({ imgId }));
  afterPanelsChanged();
}
function afterPanelsChanged() {
  commit();
  renderStrip();
  syncProps();
  updateDetailBar();
  scheduleRender();
}

// =====================================================================
// Elements: create
// =====================================================================
function insertionFrame() {
  const lay = lastLayout;
  if (!lay) return { x: 0, y: 0, w: 1080, h: 1080, canvas: true };
  const el = selEl();
  const pid = detailId || (selPanel() && selPanel().id) || (el && el.panelId);
  const cell = pid && lay.cells.find(c => c.p.id === pid);
  return cell || canvasFrame(lay);
}
function pickStyle(src) {
  if (!src) return {};
  const o = {};
  STYLE_KEYS.forEach(k => { if (k in src) o[k] = src[k]; });
  return o;
}
function newText(over) {
  const fr = insertionFrame();
  const n = state.elements.filter(e => e.panelId === (fr.canvas ? null : fr.p.id)).length % 5;
  return Object.assign({ id: uid(), type: 'text', text: 'Your text', panelId: fr.canvas ? null : fr.p.id, x: 0.5, y: 0.5 + n * 0.06, w: 0.9, h: 0.25 },
    JSON.parse(JSON.stringify(TEXT_DEFAULTS)), pickStyle(lastStyle.text), over);
}
function newBubble(over) {
  const fr = insertionFrame();
  const n = state.elements.filter(e => e.panelId === (fr.canvas ? null : fr.p.id)).length % 5;
  const x = 0.5, y = 0.38 + n * 0.06;
  return Object.assign({
    id: uid(), type: 'bubble', text: 'Hello!', panelId: fr.canvas ? null : fr.p.id, x, y, w: 0.45, h: 0.25,
    tx: x - 0.12, ty: y + 0.22 * fr.w / fr.h
  }, JSON.parse(JSON.stringify(BUBBLE_DEFAULTS)), pickStyle(lastStyle.bubble), over);
}
function addElement(el, focus) {
  state.elements.push(el);
  ensureFont(el.font);
  commit();
  select({ kind: 'el', id: el.id });
  if (focus) {
    const t = $('elText');
    t.focus({ preventScroll: true });
    t.select();
  }
}
function addTopBottom() {
  const fr = insertionFrame();
  const pid = fr.canvas ? null : fr.p.id;
  const base = Object.assign(JSON.parse(JSON.stringify(TEXT_DEFAULTS)), { panelId: pid, x: 0.5, w: 0.94, margin: 25 });
  const top = newText(Object.assign({}, base, { text: 'Top text', y: 0.1 }));
  const bottom = newText(Object.assign({}, base, { text: 'Bottom text', y: 0.9 }));
  state.elements.push(top, bottom);
  ensureFont('anton');
  if (lastLayout) { alignElement(top, 'tc'); alignElement(bottom, 'bc'); }
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
    after() { if (!state.elements.some(e => e.type === 'text') && state.panels.length) { select({ kind: 'panel', id: state.panels[0].id }); requestAnimationFrame(() => requestAnimationFrame(addTopBottom)); } }
  },
  captionTop: {
    layout: { cols: '1', mode: 'uniform', aspect: 'first', fit: 'cover', gap: 0, pad: 0, border: 0, radius: 0, bg: '#ffffff' },
    cap: { pos: 'above', font: 'montserrat', size: 46, color: '#111111', strokeW: 0, bg: '#ffffff', bgOpacity: 100, align: 'left', bold: true, italic: false, upper: false },
    hint: 'Caption on top: type the caption in the panel settings below.',
    after() { if (state.panels.length) { select({ kind: 'panel', id: state.panels[0].id }); $('pCaption').focus(); } }
  },
  twoCol: {
    layout: { cols: '2', mode: 'uniform', aspect: '1', fit: 'cover', gap: 4, gapColor: '#000000', pad: 4, padColor: '#000000', border: 0, radius: 0, bg: '#ffffff' },
    cap: {},
    hint: 'Two columns: add “Blank panels” to put text next to an image.'
  },
  grid: {
    layout: { cols: 'auto', mode: 'uniform', aspect: '1', fit: 'cover', gap: 10, gapColor: '#ffffff', pad: 10, padColor: '#ffffff', border: 0, radius: 10, bg: '#ffffff' },
    cap: {},
    hint: 'Grid: all images get the same size (cropped to fill). Switch “Fit” to letterbox if nothing may be cut off.'
  },
  mosaic: {
    layout: { cols: 'auto', mode: 'justified', gap: 6, gapColor: '#ffffff', pad: 6, padColor: '#ffffff', border: 0, radius: 0, bg: '#ffffff' },
    cap: {},
    hint: 'Mosaic: images keep their ratios; each row is scaled to the same width.'
  },
  comic: {
    layout: { cols: '3', mode: 'uniform', aspect: '1.3333', fit: 'cover', gap: 16, gapColor: '#ffffff', pad: 24, padColor: '#ffffff', border: 5, borderColor: '#111111', radius: 4, bg: '#ffffff' },
    cap: { pos: 'overlayTop', font: 'comic', size: 40, color: '#111111', strokeW: 0, bg: '#fff6c8', bgOpacity: 100, align: 'left', bold: true, italic: false, upper: true },
    hint: 'Comic page: captions become narration boxes. Make a panel wider via More options → Width, add bubbles with “+ Bubble”.'
  },
  story: {
    layout: { cols: '1', mode: 'uniform', aspect: 'first', fit: 'cover', gap: 8, gapColor: '#000000', pad: 8, padColor: '#000000', border: 0, radius: 0, bg: '#000000' },
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
// UI: panel strip (tap to select, drag to reorder)
// =====================================================================
let stripDrag = null;
let skipStripClick = false;
function renderStrip() {
  const strip = $('strip');
  $('stripWrap').hidden = state.panels.length === 0;
  strip.innerHTML = '';
  state.panels.forEach((p, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'thumb' + (sel && sel.kind === 'panel' && sel.id === p.id ? ' sel' : '');
    const im = images.get(p.imgId);
    b.title = (p.type === 'color' ? 'Blank panel' : (im && im.name) || 'Image') + (im && im.credit ? ' — ' + im.credit : '');
    b.dataset.id = p.id;
    if (p.type === 'image' && im) {
      const img = document.createElement('img');
      img.src = im.thumb;
      img.alt = '';
      img.draggable = false;
      b.appendChild(img);
    } else {
      b.style.background = p.color;
    }
    const num = document.createElement('span');
    num.className = 'num';
    num.textContent = i + 1;
    b.appendChild(num);
    b.addEventListener('click', () => {
      if (skipStripClick) { skipStripClick = false; return; }
      if (detailId) detailId = p.id;
      select({ kind: 'panel', id: p.id });
      updateDetailBar();
    });
    b.addEventListener('pointerdown', (e) => onThumbDown(e, p, b));
    strip.appendChild(b);
  });
}
function onThumbDown(e, p, btn) {
  if (e.button > 0) return;
  cancelStripDrag();
  stripDrag = { id: p.id, btn, x0: e.clientX, y0: e.clientY, type: e.pointerType, active: false, timer: null, target: null };
  if (e.pointerType !== 'mouse') {
    stripDrag.timer = setTimeout(() => { if (stripDrag && !stripDrag.active) startStripDrag(); }, 320);
  }
}
function startStripDrag() {
  const d = stripDrag;
  d.active = true;
  d.btn.classList.add('dragging');
  d.rects = Array.from($('strip').children).filter(n => n.classList.contains('thumb')).map(n => ({ id: n.dataset.id, r: n.getBoundingClientRect() }));
  const marker = document.createElement('div');
  marker.className = 'drop-marker';
  $('strip').appendChild(marker);
  d.marker = marker;
  if (navigator.vibrate) { try { navigator.vibrate(15); } catch (err) { /* ignore */ } }
}
function moveStripDrag(x, y) {
  const d = stripDrag;
  if (!d) return;
  if (!d.active) {
    const dist = Math.hypot(x - d.x0, y - d.y0);
    if (d.type === 'mouse') { if (dist > 6) startStripDrag(); else return; }
    else { if (dist > 10) cancelStripDrag(); return; } // touch moved before long-press → normal scroll
  }
  d.btn.style.transform = `translateX(${x - d.x0}px)`;
  const others = d.rects.filter(o => o.id !== d.id);
  let idx = others.filter(o => o.r.left + o.r.width / 2 < x).length;
  d.target = idx;
  const strip = $('strip');
  const sr = strip.getBoundingClientRect();
  let left;
  if (!others.length) left = 0;
  else if (idx >= others.length) left = others[others.length - 1].r.right + 2;
  else left = others[idx].r.left - 6;
  d.marker.style.left = (left - sr.left + strip.scrollLeft) + 'px';
}
function endStripDrag() {
  const d = stripDrag;
  if (!d) return;
  clearTimeout(d.timer);
  if (d.active) {
    skipStripClick = true;
    setTimeout(() => { skipStripClick = false; }, 400);
    const from = state.panels.findIndex(p => p.id === d.id);
    if (from >= 0 && d.target != null) {
      const [p] = state.panels.splice(from, 1);
      state.panels.splice(d.target, 0, p);
      stripDrag = null;
      afterPanelsChanged();
      return;
    }
  }
  cancelStripDrag();
}
function cancelStripDrag() {
  if (!stripDrag) return;
  clearTimeout(stripDrag.timer);
  if (stripDrag.active) { stripDrag.btn.classList.remove('dragging'); stripDrag.btn.style.transform = ''; if (stripDrag.marker) stripDrag.marker.remove(); }
  stripDrag = null;
}
document.addEventListener('pointermove', (e) => { if (stripDrag) moveStripDrag(e.clientX, e.clientY); });
document.addEventListener('pointerup', () => { if (stripDrag) endStripDrag(); });
document.addEventListener('pointercancel', () => { if (stripDrag && !stripDrag.active) cancelStripDrag(); });
// On touch screens the drag is driven by touch events, which can block scrolling.
$('strip').addEventListener('touchmove', (e) => {
  if (stripDrag && stripDrag.active) { e.preventDefault(); const t = e.touches[0]; moveStripDrag(t.clientX, t.clientY); }
}, { passive: false });
$('strip').addEventListener('touchend', () => { if (stripDrag && stripDrag.active) endStripDrag(); });
$('strip').addEventListener('contextmenu', (e) => e.preventDefault());

// =====================================================================
// UI: properties
// =====================================================================
function populateFontSelects() {
  ['elFont', 'cFont', 'nFont'].forEach(id => {
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
    $('elTitle').textContent = (isB ? 'Speech bubble' : 'Text') + (el.panelId ? ` · image ${state.panels.findIndex(q => q.id === el.panelId) + 1}` : ' · canvas');
    $('elText').value = el.text;
    $('bubbleOnly').hidden = !isB;
    $('textBgRow').hidden = isB;
    $('autoHRow').hidden = !isB;
    $('rotLbl').hidden = isB;
    $('elRot').hidden = isB;
    $('elRotVal').hidden = isB;
    if (isB) {
      $('bShape').value = el.shape;
      $('bFill').value = el.fill;
      $('bFillOpacity').value = el.fillOpacity;
      $('bBorder').value = el.border;
      $('bBorderWidth').value = Math.round(el.borderW);
      $('bTail').checked = !!el.tail;
      $('bAutoH').checked = !!el.autoH;
    }
    $('elFont').value = fontById(el.font).id;
    $('elSize').value = Math.round(el.size);
    $('elColor').value = el.color;
    $('elStroke').value = el.stroke;
    $('elStrokeW').value = Math.round(el.strokeW);
    $('elBgOn').checked = !!el.bgOn;
    $('elBg').value = el.bg;
    $('elBgOpacity').value = el.bgOpacity;
    $('elShadow').checked = !!el.shadow;
    $('elRot').value = el.rot || 0;
    $('elMargin').value = Math.round(el.margin ?? 30);
    $('elPin').value = el.pin || 'auto';
    $('elClip').checked = !!el.clip;
    $('elFit').checked = !!el.fit;
    setSeg('elAlign', el.align, {});
    setSeg('elStyleBtns', null, el);
  }
  if (p) {
    const idx = state.panels.indexOf(p);
    const isImg = p.type === 'image';
    $('panelTitle').textContent = `${isImg ? 'Image' : 'Blank panel'} ${idx + 1} of ${state.panels.length}`;
    $('pCaption').value = p.caption || '';
    $('pColorRow').hidden = isImg;
    $('pImageRows').hidden = !isImg;
    $('pImageAdv').hidden = !isImg;
    $('pReplaceBtn').hidden = !isImg;
    $('pColor').value = p.color;
    $('pColorHex').value = p.color;
    $('pColorHex').classList.remove('bad');
    $('pFit').value = p.fit || '';
    $('pZoom').value = Math.round((p.zoom || 1) * 100);
    $('pOffX').value = Math.round((p.offX || 0) * 100);
    $('pOffY').value = Math.round((p.offY || 0) * 100);
    $('pFlipBtn').classList.toggle('active', !!p.flip);
    $('pLeftBtn').disabled = idx <= 0;
    $('pRightBtn').disabled = idx >= state.panels.length - 1;
    $('pNumText').value = p.numText || '';
    $('pNumHide').checked = !!p.numHide;
    $('pNumOwn').checked = !!p.numOwn;
    $('pNumColor').value = p.numColor || '#ffffff';
    $('pNumBg').value = p.numBg || '#e53935';
    const cols = getCols();
    const spanOk = state.layout.mode === 'uniform' && cols > 1;
    $('pSpanRow').hidden = !spanOk;
    if (spanOk) {
      const s = $('pSpan');
      s.innerHTML = '';
      for (let i = 1; i <= cols; i++) {
        const o = document.createElement('option');
        o.value = i;
        o.textContent = i === 1 ? '1 column (normal)' : i === cols ? `${i} columns (full row)` : `${i} columns`;
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
    $('elSizeVal').textContent = Math.round(el.size);
    $('elStrokeWVal').textContent = Math.round(el.strokeW);
    $('elBgOpacityVal').textContent = el.bgOpacity + '%';
    $('elRotVal').textContent = (el.rot || 0) + '°';
    if (el.type === 'bubble') {
      $('bFillOpacityVal').textContent = el.fillOpacity + '%';
      $('bBorderWidthVal').textContent = Math.round(el.borderW);
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
  $('nSizeVal').textContent = L.num.size;
  $('nBorderWVal').textContent = L.num.borderW;
  $('exQualityVal').textContent = settings.quality + '%';
  $('resHint').textContent = L.width === 'detail'
    ? `Every image keeps its original pixel size. Upper limit ≈ ${Math.round(MAX_AREA / 1e6)} megapixels on this device — above that, everything is scaled down evenly.`
    : '';
}
function syncLayoutUI() {
  const L = state.layout, c = L.cap, N = L.num;
  $('lCols').value = L.cols;
  $('lWidth').value = L.width;
  $('lMode').value = L.mode;
  $('lAspect').value = L.aspect;
  $('lAspect').disabled = L.mode === 'justified';
  $('lFit').value = L.fit;
  $('lBg').value = L.bg;
  $('lGap').value = L.gap;
  $('lGapColor').value = L.gapColor;
  $('lPad').value = L.pad;
  $('lPadColor').value = L.padColor;
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
  $('nOn').checked = !!N.on;
  $('nFormat').value = N.format;
  $('nColor').value = N.color;
  $('nBg').value = N.bg;
  $('nSize').value = N.size;
  $('nShape').value = N.shape;
  $('nFont').value = fontById(N.font).id;
  $('nBorder').value = N.border;
  $('nBorderW').value = N.borderW;
  $('nMargin').value = N.margin;
  $('nAnchor').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.a === N.anchor));
  updateValueLabels();
}
function syncAll() {
  syncLayoutUI();
  syncProps();
  renderStrip();
  updateDetailBar();
  scheduleRender();
}

// ---------- "click a label to reset" registry ----------
const RESETS = {};      // input id -> () => default value for the input
const SEG_RESETS = {};  // seg id -> () => void

// ---------- bind element inputs ----------
function rememberStyle(el) { lastStyle[el.type] = pickStyle(el); }
function elDefaults(el) { return el.type === 'bubble' ? BUBBLE_DEFAULTS : TEXT_DEFAULTS; }
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
  if (inp.tagName !== 'TEXTAREA') RESETS[id] = () => { const el = selEl(); return el ? elDefaults(el)[key] : undefined; };
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
bindEl('elMargin', 'margin', num);
bindEl('elClip', 'clip');
bindEl('bShape', 'shape');
bindEl('bFill', 'fill');
bindEl('bFillOpacity', 'fillOpacity', num);
bindEl('bBorder', 'border');
bindEl('bBorderWidth', 'borderW', num);
bindEl('bTail', 'tail');
// These need extra work before the generic handler runs (capture phase).
$('bAutoH').addEventListener('input', () => {
  const el = selEl(); if (!el) return;
  el.autoH = $('bAutoH').checked;
  if (!el.autoH) { const g = geo.get(el.id); if (g) el.h = g.h / g.frame.w; }
  commit(); scheduleRender();
});
RESETS.bAutoH = () => true;
$('elFit').addEventListener('input', () => {
  const el = selEl(); if (!el) return;
  el.fit = $('elFit').checked;
  if (el.fit && el.type === 'text') { const g = geo.get(el.id); if (g) el.h = g.h / g.frame.w; }
  commit(); scheduleRender();
});
RESETS.elFit = () => { const el = selEl(); return el ? elDefaults(el).fit : undefined; };
$('elPin').addEventListener('input', () => {
  const el = selEl(); if (!el || !lastLayout) return;
  el.pin = $('elPin').value;
  const from = frameOf(el, lastLayout);
  let to = canvasFrame(lastLayout);
  if (el.pin === 'auto') {
    const g = geo.get(el.id);
    const cell = g && cellAt(lastLayout, g.cx, g.cy);
    if (cell) to = cell;
  }
  if (from !== to) moveToFrame(el, from, to);
  commit(); syncProps(); scheduleRender();
});
RESETS.elPin = () => 'auto';
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
SEG_RESETS.elAlign = () => { const el = selEl(); if (el) { el.align = elDefaults(el).align; setSeg('elAlign', el.align, {}); } };
SEG_RESETS.elStyleBtns = () => { const el = selEl(); if (el) { ['bold', 'italic', 'upper'].forEach(k => { el[k] = elDefaults(el)[k]; }); setSeg('elStyleBtns', null, el); } };
$('elAnchor').addEventListener('click', (e) => {
  const b = e.target.closest('button'); const el = selEl();
  if (!b || !el) return;
  alignElement(el, b.dataset.a);
  commit(); scheduleRender();
});

$('elDelBtn').addEventListener('click', deleteSelectedElement);
$('elDupBtn').addEventListener('click', () => {
  const el = selEl(); if (!el) return;
  const copy = JSON.parse(JSON.stringify(el));
  copy.id = uid(); copy.x += 0.04; copy.y += 0.04;
  if (copy.type === 'bubble') { copy.tx += 0.04; copy.ty += 0.04; }
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
function bindPanel(id, key, conv, toUI) {
  const inp = $(id);
  inp.addEventListener('input', () => {
    const p = selPanel(); if (!p) return;
    p[key] = inp.type === 'checkbox' ? inp.checked : conv ? conv(inp.value) : inp.value;
    updateValueLabels();
    scheduleRender();
    if (inp.tagName === 'SELECT' || inp.type === 'checkbox') commit();
  });
  inp.addEventListener('change', commit);
  if (inp.tagName !== 'TEXTAREA') RESETS[id] = () => (toUI ? toUI(PANEL_DEFAULTS[key]) : PANEL_DEFAULTS[key]);
}
bindPanel('pCaption', 'caption');
bindPanel('pColor', 'color');
bindPanel('pFit', 'fit');
bindPanel('pZoom', 'zoom', v => Number(v) / 100, v => v * 100);
bindPanel('pOffX', 'offX', v => Number(v) / 100, v => v * 100);
bindPanel('pOffY', 'offY', v => Number(v) / 100, v => v * 100);
bindPanel('pSpan', 'span', num);
bindPanel('pNumText', 'numText');
bindPanel('pNumHide', 'numHide');
bindPanel('pNumOwn', 'numOwn');
bindPanel('pNumColor', 'numColor');
bindPanel('pNumBg', 'numBg');
$('pColor').addEventListener('input', () => { $('pColorHex').value = $('pColor').value; $('pColorHex').classList.remove('bad'); });
$('pColorHex').addEventListener('input', () => {
  const p = selPanel(); if (!p) return;
  const h = normHex($('pColorHex').value);
  $('pColorHex').classList.toggle('bad', !h);
  if (h) { p.color = h; $('pColor').value = h; renderStrip(); scheduleRender(); }
});
$('pColorHex').addEventListener('change', () => { commit(); renderStrip(); });
$('pColor').addEventListener('change', renderStrip);
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
  // elements on this image stay where they are, now attached to the canvas
  if (lastLayout) {
    const cell = lastLayout.cells.find(c => c.p.id === p.id);
    state.elements.filter(el => el.panelId === p.id).forEach(el => {
      if (cell) moveToFrame(el, cell, canvasFrame(lastLayout)); else el.panelId = null;
    });
  }
  state.panels = state.panels.filter(x => x !== p);
  sel = null;
  if (detailId === p.id) detailId = null;
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

// ---------- bind layout / caption / numbering inputs ----------
function bindLayout(id, key, conv, sub) {
  const inp = $(id);
  inp.addEventListener('input', () => {
    const target = sub ? state.layout[sub] : state.layout;
    target[key] = inp.type === 'checkbox' ? inp.checked : conv ? conv(inp.value) : inp.value;
    if (key === 'font') ensureFont(target.font);
    if (id === 'lMode') $('lAspect').disabled = state.layout.mode === 'justified';
    updateValueLabels();
    scheduleRender();
    if (inp.tagName === 'SELECT' || inp.type === 'checkbox') { commit(); syncProps(); }
  });
  inp.addEventListener('change', commit);
  RESETS[id] = () => { const d = defaultLayout(); return (sub ? d[sub] : d)[key]; };
}
bindLayout('lCols', 'cols');
bindLayout('lWidth', 'width');
bindLayout('lMode', 'mode');
bindLayout('lAspect', 'aspect');
bindLayout('lFit', 'fit');
bindLayout('lBg', 'bg');
bindLayout('lGap', 'gap', num);
bindLayout('lGapColor', 'gapColor');
bindLayout('lPad', 'pad', num);
bindLayout('lPadColor', 'padColor');
bindLayout('lBorder', 'border', num);
bindLayout('lBorderColor', 'borderColor');
bindLayout('lRadius', 'radius', num);
bindLayout('cPos', 'pos', null, 'cap');
bindLayout('cFont', 'font', null, 'cap');
bindLayout('cColor', 'color', null, 'cap');
bindLayout('cSize', 'size', num, 'cap');
bindLayout('cStroke', 'stroke', null, 'cap');
bindLayout('cStrokeW', 'strokeW', num, 'cap');
bindLayout('cBg', 'bg', null, 'cap');
bindLayout('cBgOpacity', 'bgOpacity', num, 'cap');
bindLayout('nOn', 'on', null, 'num');
bindLayout('nFormat', 'format', null, 'num');
bindLayout('nColor', 'color', null, 'num');
bindLayout('nBg', 'bg', null, 'num');
bindLayout('nSize', 'size', num, 'num');
bindLayout('nShape', 'shape', null, 'num');
bindLayout('nFont', 'font', null, 'num');
bindLayout('nBorder', 'border', null, 'num');
bindLayout('nBorderW', 'borderW', num, 'num');
bindLayout('nMargin', 'margin', num, 'num');
$('nOn').addEventListener('input', () => { if ($('nOn').checked) ensureFont(state.layout.num.font); });
$('nAnchor').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.layout.num.anchor = b.dataset.a;
  if (!state.layout.num.on) { state.layout.num.on = true; $('nOn').checked = true; }
  syncLayoutUI(); commit(); scheduleRender();
});
$('cAlign').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  state.layout.cap.align = b.dataset.v; setSeg('cAlign', b.dataset.v, {}); commit(); scheduleRender();
});
$('cStyleBtns').addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const c = state.layout.cap; c[b.dataset.k] = !c[b.dataset.k]; setSeg('cStyleBtns', null, c); commit(); scheduleRender();
});
SEG_RESETS.cAlign = () => { state.layout.cap.align = defaultLayout().cap.align; setSeg('cAlign', state.layout.cap.align, {}); };
SEG_RESETS.cStyleBtns = () => { const d = defaultLayout().cap; ['bold', 'italic', 'upper'].forEach(k => { state.layout.cap[k] = d[k]; }); setSeg('cStyleBtns', null, state.layout.cap); };
$('presets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-preset]');
  if (b) applyPreset(b.dataset.preset);
});

// ---------- label click → reset the row to defaults ----------
function setupResetLabels() {
  document.querySelectorAll('.lbl').forEach(l => {
    const row = l.closest('.row');
    if (!row) return;
    const inputs = Array.from(row.querySelectorAll('input, select')).filter(i => RESETS[i.id]);
    const segs = Array.from(row.querySelectorAll('.seg-mini')).filter(s => SEG_RESETS[s.id]);
    if (!inputs.length && !segs.length) return;
    l.dataset.reset = '1';
    l.title = 'Click to reset to default';
    l.addEventListener('click', (e) => {
      e.preventDefault();
      inputs.forEach(i => {
        const v = RESETS[i.id]();
        if (v === undefined) return;
        if (i.type === 'checkbox') i.checked = !!v; else i.value = v;
        i.dispatchEvent(new Event('input', { bubbles: true }));
      });
      segs.forEach(s => SEG_RESETS[s.id]());
      commit();
      syncProps();
      syncLayoutUI();
      scheduleRender();
    });
  });
}

// =====================================================================
// Canvas interaction
// =====================================================================
let drag = null;
let lastTap = { id: null, t: 0 };
function toCanvasPoint(e) {
  const r = canvas.getBoundingClientRect();
  const v = lastView;
  return { x: v.x + (e.clientX - r.left) / r.width * v.w, y: v.y + (e.clientY - r.top) / r.height * v.h };
}
function localPoint(g, p) {
  const dx = p.x - g.cx, dy = p.y - g.cy;
  const c = Math.cos(-g.rot), s = Math.sin(-g.rot);
  return { x: dx * c - dy * s, y: dx * s + dy * c };
}
function hitTest(p) {
  const ds = dispScale();
  const hr = 18 * ds;
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
    const cell = cellAt(lastLayout, p.x, p.y);
    if (cell) return { kind: 'panel', cell };
  }
  return null;
}
// Snap the element's center or edges to image / canvas centers and edges.
function snap(cx, cy, hw, hh) {
  guides = { x: null, y: null };
  if (!settings.snap || !lastLayout) return { cx, cy };
  const tol = 9 * dispScale();
  const lay = lastLayout;
  const xs = [lay.W / 2], ys = [lay.H / 2];
  if (lay.pad > 0) { xs.push(lay.pad, lay.W - lay.pad); ys.push(lay.pad, lay.H - lay.pad); } else { xs.push(0, lay.W); ys.push(0, lay.H); }
  lay.cells.forEach(c => { xs.push(c.x, c.x + c.w / 2, c.x + c.w); ys.push(c.y, c.y + c.h / 2, c.y + c.h); });
  let best = null;
  xs.forEach(line => [-hw, 0, hw].forEach(off => { const d = line - (cx + off); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line }; }));
  if (best) { cx += best.d; guides.x = best.line; }
  best = null;
  ys.forEach(line => [-hh, 0, hh].forEach(off => { const d = line - (cy + off); if (Math.abs(d) < tol && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, line }; }));
  if (best) { cy += best.d; guides.y = best.line; }
  return { cx, cy };
}

canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  const p = toCanvasPoint(e);
  const hit = hitTest(p);
  drag = null;
  const now = Date.now();
  if (!hit) { select(null); return; }
  if (hit.kind === 'tail' || hit.kind === 'resize') {
    drag = { mode: hit.kind, el: hit.el, start: p, moved: false };
  } else if (hit.kind === 'el') {
    const el = hit.el;
    if (lastTap.id === el.id && now - lastTap.t < 380) {
      lastTap = { id: null, t: 0 };
      select({ kind: 'el', id: el.id });
      $('elText').focus();
      $('elText').select();
      return;
    }
    lastTap = { id: el.id, t: now };
    if (!sel || sel.id !== el.id) select({ kind: 'el', id: el.id });
    const g = geo.get(el.id);
    const o = {};
    SCALE_KEYS.forEach(k => { o[k] = el[k]; });
    drag = { mode: 'move', el, start: p, moved: false, g, ocx: g.cx, ocy: g.cy, ofr: g.frame, o, otip: el.type === 'bubble' ? { x: g.tipX, y: g.tipY } : null };
  } else if (hit.kind === 'panel') {
    const pnl = hit.cell.p;
    if (lastTap.id === pnl.id && now - lastTap.t < 380) {
      lastTap = { id: null, t: 0 };
      if (detailId) exitDetail();
      else if (state.panels.length > 1) enterDetail(pnl.id);
      return;
    }
    lastTap = { id: pnl.id, t: now };
    if (sel && sel.kind === 'panel' && sel.id === pnl.id && pnl.type === 'image') {
      drag = { mode: 'pan', panel: pnl, cell: hit.cell, start: p, ox: pnl.offX || 0, oy: pnl.offY || 0, moved: false };
    } else {
      select({ kind: 'panel', id: pnl.id });
      if (detailId) { detailId = pnl.id; updateDetailBar(); }
    }
  }
  if (drag) {
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
  }
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const p = toCanvasPoint(e);
  const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
  if (!drag.moved && Math.hypot(dx, dy) < 3 * dispScale()) return;
  drag.moved = true;
  const el = drag.el;
  const lay = lastLayout;
  if (drag.mode === 'move') {
    const s = snap(drag.ocx + dx, drag.ocy + dy, drag.g.w / 2, drag.g.h / 2);
    let to = canvasFrame(lay);
    if ((el.pin || 'auto') === 'auto') { const cell = cellAt(lay, s.cx, s.cy); if (cell) to = cell; }
    const k = drag.ofr.w / to.w;
    SCALE_KEYS.forEach(key => { if (typeof drag.o[key] === 'number') el[key] = drag.o[key] * k; });
    el.panelId = to.canvas ? null : to.p.id;
    el.x = (s.cx - to.x) / to.w;
    el.y = (s.cy - to.y) / to.h;
    if (drag.otip) {
      el.tx = (drag.otip.x + (s.cx - drag.ocx) - to.x) / to.w;
      el.ty = (drag.otip.y + (s.cy - drag.ocy) - to.y) / to.h;
    }
  } else if (drag.mode === 'resize') {
    const g = geo.get(el.id);
    const lp = localPoint(g, p);
    const fw = g.frame.w;
    el.w = clamp(Math.abs(lp.x) * 2 / fw, 0.03, 4);
    if (el.type === 'bubble') {
      el.h = clamp(Math.abs(lp.y) * 2 / fw, 0.02, 4);
      if (el.autoH) { el.autoH = false; $('bAutoH').checked = false; }
    } else if (el.fit) {
      el.h = clamp(Math.abs(lp.y) * 2 / fw, 0.02, 4);
    }
  } else if (drag.mode === 'tail') {
    const fr = geo.get(el.id).frame;
    el.tx = (p.x - fr.x) / fr.w; el.ty = (p.y - fr.y) / fr.h;
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
  guides = { x: null, y: null };
  if (moved) { commit(); syncProps(); }
  scheduleRender();
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
window.addEventListener('resize', scheduleRender);

// Click anywhere outside the canvas and the editing controls → deselect.
document.addEventListener('pointerdown', (e) => {
  if (!sel) return;
  const t = e.target;
  if (!(t instanceof Element)) return;
  if (t.closest('#canvas, #propsCard, #toolbar, #stripWrap, #detailBar, .modal-bg, .menu-wrap, .card, button, input, select, textarea, label, summary, a, .toast')) return;
  select(null);
});

// =====================================================================
// Detail view
// =====================================================================
function enterDetail(id) {
  if (!id) return;
  detailId = id;
  select({ kind: 'panel', id });
  updateDetailBar();
}
function exitDetail() {
  detailId = null;
  updateDetailBar();
  scheduleRender();
}
function updateDetailBar() {
  const on = !!detailId && !!findPanel(detailId);
  if (!on) detailId = null;
  $('detailBar').hidden = !on;
  $('detailBtn').classList.toggle('active', on);
  if (on) {
    const i = state.panels.findIndex(p => p.id === detailId);
    $('detailLabel').textContent = `Detail · image ${i + 1} of ${state.panels.length}`;
    $('detailPrev').disabled = i <= 0;
    $('detailNext').disabled = i >= state.panels.length - 1;
  }
}
function stepDetail(dir) {
  const i = state.panels.findIndex(p => p.id === detailId);
  const p = state.panels[i + dir];
  if (p) enterDetail(p.id);
}
$('detailBtn').addEventListener('click', () => {
  if (detailId) { exitDetail(); return; }
  const el = selEl();
  const id = (selPanel() && selPanel().id) || (el && el.panelId) || (state.panels[0] && state.panels[0].id);
  if (!id) { toast('Add an image first.'); return; }
  enterDetail(id);
});
$('detailPrev').addEventListener('click', () => stepDetail(-1));
$('detailNext').addEventListener('click', () => stepDetail(1));
$('detailExit').addEventListener('click', exitDetail);

// =====================================================================
// Side-by-side view & pinned canvas
// =====================================================================
const sideMQ = window.matchMedia('(min-width: 900px) and (orientation: landscape)');
function isSide() { return settings.side === 'always' || (settings.side === 'auto' && sideMQ.matches); }
function applyLayoutMode() {
  const side = isSide();
  document.body.classList.toggle('side', side);
  $('stageBlock').classList.toggle('pinned', !!settings.pin && !side);
  $('pinBtn').classList.toggle('active', !!settings.pin);
  scheduleRender();
}
if (sideMQ.addEventListener) sideMQ.addEventListener('change', applyLayoutMode);
$('pinBtn').addEventListener('click', () => { settings.pin = !settings.pin; saveSettings(); applyLayoutMode(); });

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
// Toolbar & keyboard
// =====================================================================
$('undoBtn').addEventListener('click', undo);
$('redoBtn').addEventListener('click', redo);
$('addTextBtn').addEventListener('click', () => addElement(newText(), true));
$('addBubbleBtn').addEventListener('click', () => addElement(newBubble(), true));
$('topBottomBtn').addEventListener('click', addTopBottom);

let nudgeTimer = null;
document.addEventListener('keydown', (e) => {
  const t = e.target;
  const typing = t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT');
  const mod = e.ctrlKey || e.metaKey;
  if (mod && !typing && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && !typing && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (typing) return;
  if (e.key === 'Escape') {
    if (document.querySelector('.modal-bg.open')) { closeAllModals(); return; }
    if (detailId) { exitDetail(); return; }
    select(null);
    return;
  }
  const el = selEl();
  if (!el) return;
  if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); deleteSelectedElement(); return; }
  const arrows = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (arrows[e.key] && lastLayout) {
    e.preventDefault();
    const fr = frameOf(el, lastLayout);
    const step = e.shiftKey ? 10 : 1;
    const [ax, ay] = arrows[e.key];
    el.x += ax * step / fr.w; el.y += ay * step / fr.h;
    if (el.type === 'bubble') { el.tx += ax * step / fr.w; el.ty += ay * step / fr.h; }
    clearTimeout(nudgeTimer);
    nudgeTimer = setTimeout(commit, 400);
    scheduleRender();
  }
});

// =====================================================================
// Export
// =====================================================================
$('exFormat').addEventListener('input', () => { settings.format = $('exFormat').value; $('setFormat').value = settings.format; saveSettings(); });
$('exQuality').addEventListener('input', () => { settings.quality = Number($('exQuality').value); updateValueLabels(); saveSettings(); });

function hasContent() { return state.panels.length > 0 || state.elements.length > 0; }
async function exportFile() {
  const cv = document.createElement('canvas');
  renderTo(cv, { ui: false, full: true });
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
  scheduleRender(); // geometry cache back to on-screen values
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `mememe_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
  return new File([blob], name, { type: blob.type });
}
$('downloadBtn').addEventListener('click', async () => {
  if (!hasContent()) { toast('Nothing to save yet — add an image or some text first.'); return; }
  $('downloadBtn').disabled = true;
  try {
    const file = await exportFile();
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } finally {
    $('downloadBtn').disabled = false;
  }
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
  detailId = null;
  geo.clear();
  commit();
  syncAll();
});

// =====================================================================
// Templates & free images
// =====================================================================
const FETCH_OPTS = { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' };
async function getJSON(url) {
  const res = await fetch(url, Object.assign({ cache: 'no-store' }, FETCH_OPTS));
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}
const stripTags = (h) => String(h || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const TPL_SOURCES = {
  imgflip: {
    label: 'Imgflip', kind: 'list',
    info: 'The 100 most popular meme templates right now.',
    async load() {
      const j = await getJSON('https://api.imgflip.com/get_memes');
      return (j && j.data && j.data.memes || []).map(m => ({ name: m.name, url: m.url, thumb: m.url }));
    }
  },
  memegen: {
    label: 'Memegen.link', kind: 'list',
    info: 'About 200 classic meme templates (open-source project).',
    async load() {
      const j = await getJSON('https://api.memegen.link/templates/');
      return (Array.isArray(j) ? j : []).filter(t => t.blank).map(t => ({
        name: t.name, url: t.blank, thumb: t.blank + (t.blank.includes('?') ? '&' : '?') + 'width=200'
      }));
    }
  },
  reddit: {
    label: 'Reddit', kind: 'search',
    info: 'Community-collected blank templates, incl. older and niche ones. Experimental — Reddit sometimes blocks web apps. Leave the search empty for the all-time top.',
    chips: ['drake', 'cat', 'spongebob', 'office', 'anime', 'politics'],
    allowEmpty: true,
    async search(q, cursor) {
      const base = 'https://www.reddit.com/r/MemeTemplatesOfficial/';
      let url = q ? `${base}search.json?q=${encodeURIComponent(q)}&restrict_sr=1&sort=top&t=all&limit=40&raw_json=1`
        : `${base}top.json?t=all&limit=40&raw_json=1`;
      if (cursor) url += '&after=' + encodeURIComponent(cursor);
      const j = await getJSON(url);
      const items = ((j.data && j.data.children) || []).map(c => c.data)
        .filter(d => d && /\.(jpe?g|png|webp)$/i.test(d.url || ''))
        .map(d => {
          const img = d.preview && d.preview.images && d.preview.images[0];
          const res = img && img.resolutions || [];
          const small = res.find(r => r.width >= 200) || res[res.length - 1];
          return { name: d.title, url: d.url, thumb: (small && small.url) || d.url, fallback: img && img.source && img.source.url, credit: 'u/' + d.author + ' on Reddit' };
        });
      return { items, next: (j.data && j.data.after) || null };
    }
  },
  wikimedia: {
    label: 'Wikimedia Commons', kind: 'search',
    info: 'Public-domain & freely licensed art and photos — great for classic “art memes”. Credit the author when sharing.',
    chips: ['renaissance painting', 'medieval art', 'old photograph', 'cat painting', 'vintage advertisement', 'portrait painting'],
    async search(q, cursor) {
      const p = new URLSearchParams({
        action: 'query', format: 'json', origin: '*', generator: 'search', gsrnamespace: '6',
        gsrsearch: q + ' filetype:bitmap', gsrlimit: '30', prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata', iiurlwidth: '300', iiextmetadatafilter: 'LicenseShortName|Artist'
      });
      if (cursor) p.set('gsroffset', cursor);
      const j = await getJSON('https://commons.wikimedia.org/w/api.php?' + p.toString());
      const pages = Object.values((j.query && j.query.pages) || {}).sort((a, b) => a.index - b.index);
      const items = pages.filter(pg => pg.imageinfo && pg.imageinfo[0]).map(pg => {
        const ii = pg.imageinfo[0];
        const meta = ii.extmetadata || {};
        const big = ii.width > 2560 && ii.thumburl ? ii.thumburl.replace(/\/\d+px-/, '/2560px-') : ii.url;
        const credit = [stripTags(meta.Artist && meta.Artist.value), meta.LicenseShortName && meta.LicenseShortName.value].filter(Boolean).join(' · ');
        return { name: pg.title.replace(/^File:/, '').replace(/\.[^.]+$/, ''), url: big, thumb: ii.thumburl || ii.url, fallback: ii.thumburl, credit: credit + ' (Wikimedia Commons)' };
      });
      return { items, next: (j.continue && j.continue.gsroffset) || null };
    }
  },
  openverse: {
    label: 'Openverse', kind: 'search',
    info: 'Hundreds of millions of openly licensed images (Creative Commons). Credit the author when sharing.',
    chips: ['funny cat', 'surprised face', 'office', 'dog', 'retro', 'robot'],
    async search(q, cursor) {
      const page = cursor || 1;
      const j = await getJSON(`https://api.openverse.org/v1/images/?q=${encodeURIComponent(q)}&page_size=20&page=${page}&mature=false`);
      const items = (j.results || []).map(r => ({
        name: r.title || 'Untitled', url: r.url, thumb: r.thumbnail || r.url, fallback: r.thumbnail,
        credit: r.attribution || [r.creator, r.license && ('CC ' + String(r.license).toUpperCase())].filter(Boolean).join(' · ')
      }));
      return { items, next: page < (j.page_count || 0) ? page + 1 : null };
    }
  }
};
const CHUNK = 36;
const tpl = { key: null, all: [], shown: 0, next: null, query: '', busy: false, listCache: {} };

function tplSrc() { return TPL_SOURCES[$('tplSource').value]; }
function setupTplSource() {
  const src = tplSrc();
  tpl.key = $('tplSource').value;
  $('tplSourceInfo').textContent = src.info;
  $('tplSearch').value = '';
  $('tplSearch').placeholder = src.kind === 'list' ? 'Filter loaded templates…' : 'Search…';
  $('tplLoadBtn').textContent = src.kind === 'list' ? 'Load' : 'Search';
  const chips = $('tplChips');
  chips.innerHTML = '';
  (src.chips || []).forEach(c => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = c;
    b.addEventListener('click', () => { $('tplSearch').value = c; runTplSearch(); });
    chips.appendChild(b);
  });
  tpl.all = []; tpl.shown = 0; tpl.next = null;
  $('tplGrid').innerHTML = '';
  $('tplMoreBtn').hidden = true;
  if (src.kind === 'list' && tpl.listCache[tpl.key]) { tpl.all = tpl.listCache[tpl.key]; redrawTplList(); }
  else $('tplStatus').textContent = src.kind === 'list' ? 'Press “Load” to fetch the list.' : 'Type a search term (or tap a suggestion) and press “Search”.';
}
function filteredTpl() {
  const src = tplSrc();
  if (src.kind !== 'list') return tpl.all;
  const q = $('tplSearch').value.trim().toLowerCase();
  return q ? tpl.all.filter(t => t.name.toLowerCase().includes(q)) : tpl.all;
}
function redrawTplList() {
  tpl.shown = 0;
  $('tplGrid').innerHTML = '';
  showMoreTpl();
}
// Adds the next chunk of thumbnails — never all at once, to keep traffic low.
function showMoreTpl() {
  const items = filteredTpl();
  const grid = $('tplGrid');
  const frag = document.createDocumentFragment();
  items.slice(tpl.shown, tpl.shown + CHUNK).forEach(t => frag.appendChild(tplButton(t)));
  grid.appendChild(frag);
  tpl.shown = Math.min(items.length, tpl.shown + CHUNK);
  const src = tplSrc();
  const moreLocal = tpl.shown < items.length;
  $('tplMoreBtn').hidden = !(moreLocal || (src.kind === 'search' && tpl.next));
  $('tplStatus').textContent = items.length
    ? `Showing ${tpl.shown} of ${items.length}${src.kind === 'search' && tpl.next ? '+' : ''} — tap one to add it as a panel.`
    : (src.kind === 'list' ? 'No template matches.' : 'Nothing found.');
}
function tplButton(t) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'tpl';
  b.title = t.name + (t.credit ? '\n' + t.credit : '');
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
  if (t.credit) { const sm = document.createElement('small'); sm.textContent = t.credit; b.appendChild(sm); }
  b.addEventListener('click', () => useTemplate(t, b));
  return b;
}
async function runTplSearch(more) {
  const src = tplSrc();
  if (tpl.busy) return;
  if (src.kind === 'list') {
    if (tpl.listCache[tpl.key]) { tpl.all = tpl.listCache[tpl.key]; redrawTplList(); return; }
    tpl.busy = true;
    $('tplStatus').textContent = `Loading from ${src.label}…`;
    try {
      const list = await src.load();
      if (!list.length) throw new Error('empty');
      tpl.listCache[tpl.key] = list;
      tpl.all = list;
      redrawTplList();
    } catch (err) {
      $('tplStatus').textContent = `Couldn't load from ${src.label} — you may be offline, or the site currently blocks web apps. Try another source.`;
    } finally { tpl.busy = false; }
    return;
  }
  const q = more ? tpl.query : $('tplSearch').value.trim();
  if (!q && !src.allowEmpty) { $('tplStatus').textContent = 'Please type a search term first.'; return; }
  tpl.busy = true;
  $('tplLoadBtn').disabled = true;
  $('tplMoreBtn').disabled = true;
  $('tplStatus').textContent = `Searching ${src.label}…`;
  try {
    const r = await src.search(q, more ? tpl.next : null);
    if (!more) { tpl.all = []; tpl.shown = 0; $('tplGrid').innerHTML = ''; tpl.query = q; }
    tpl.all = tpl.all.concat(r.items);
    tpl.next = r.next;
    showMoreTpl();
  } catch (err) {
    $('tplStatus').textContent = `Couldn't reach ${src.label} — you may be offline, or the site blocks web apps right now.`;
  } finally {
    tpl.busy = false;
    $('tplLoadBtn').disabled = false;
    $('tplMoreBtn').disabled = false;
  }
}
$('templatesBtn').addEventListener('click', () => {
  $('tplSource').value = settings.tplSource;
  if (tpl.key !== settings.tplSource) setupTplSource();
  openModal('tplModal');
});
$('tplSource').addEventListener('change', () => {
  settings.tplSource = $('tplSource').value;
  saveSettings();
  setupTplSource();
});
$('tplLoadBtn').addEventListener('click', () => runTplSearch(false));
$('tplSearch').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); runTplSearch(false); } });
$('tplSearch').addEventListener('input', () => { if (tplSrc().kind === 'list' && tpl.all.length) redrawTplList(); });
$('tplMoreBtn').addEventListener('click', () => {
  const src = tplSrc();
  if (tpl.shown < filteredTpl().length) showMoreTpl();
  else if (src.kind === 'search' && tpl.next) runTplSearch(true);
});

async function fetchImageBlob(url) {
  const res = await fetch(url, FETCH_OPTS);
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const blob = await res.blob();
  if (!blob.type.startsWith('image/')) throw new Error('not an image');
  return blob;
}
function blockedMessage(url) {
  const st = $('tplStatus');
  st.textContent = 'This image could not be used directly (the site blocks web apps). ';
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
    let blob, small = false;
    try { blob = await fetchImageBlob(t.url); }
    catch (err) {
      if (!t.fallback || t.fallback === t.url) throw err;
      blob = await fetchImageBlob(t.fallback);
      small = true;
    }
    await addBlob(blob, t.name, t.credit);
    closeModal('tplModal');
    toast(`Added “${t.name}”.` + (small ? ' (Only a smaller preview was available.)' : '') + (t.credit ? ` Credit: ${t.credit}` : ''), t.credit ? 6500 : 2800);
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

$('setFormat').addEventListener('input', () => { settings.format = $('setFormat').value; $('exFormat').value = settings.format; saveSettings(); });
$('setWidth').addEventListener('input', () => { settings.width = $('setWidth').value; saveSettings(); });
$('setSide').addEventListener('input', () => { settings.side = $('setSide').value; saveSettings(); applyLayoutMode(); });
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
document.addEventListener('fullscreenchange', () => { fsBtn.classList.toggle('active', !!document.fullscreenElement); scheduleRender(); });

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
$('setSide').value = settings.side;
$('setSnap').checked = !!settings.snap;
$('setDownscale').checked = !!settings.downscale;
setupResetLabels();
ensureUsedFonts();
ensureFont('anton');
ensureFont('comic');
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', scheduleRender);
applyLayoutMode();
commit();
syncAll();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
