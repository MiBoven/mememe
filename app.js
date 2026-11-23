'use strict';
/* mememe — To Me, or not to Me, that's the Meme!
 * Client-side meme / grid / comic composer. Everything is drawn on a <canvas>;
 * nothing is uploaded. */

const APP_VERSION = '0.4.0';
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
  { id: 'hand', label: 'Handwriting (system)', family: '"Segoe Print", "Bradley Hand", "Comic Sans MS", cursive' },
  { id: 'emoji', label: 'Emoji (system)', family: '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif' }
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
    cols: 'auto', width: settings.width, mode: 'uniform', aspect: 'first', fit: 'cover', bg: '#ffffff', bgOpacity: 100,
    gap: 0, gapColor: '#000000', pad: 0, padColor: '#000000', border: 0, borderColor: '#000000', radius: 0,
    cap: {
      pos: 'overlayBottom', font: 'montserrat', size: 44, color: '#ffffff', stroke: '#000000', strokeW: 6,
      bg: '#000000', bgOpacity: 0, align: 'center', bold: true, italic: false, upper: false
    },
    num: {
      on: false, format: '1', shape: 'circle', font: 'archivo', size: 40, color: '#ffffff', bg: '#111111',
      border: '#ffffff', borderW: 3, anchor: 'tl', margin: 20
    },
    rows: [{ n: 1, h: 45 }, { n: 3, h: 32 }, { n: 2, h: 40 }] // custom comic rows: panels per row, height in % of the width
  };
}
// Element defaults (also used by "click label to reset").
const TEXT_DEFAULTS = {
  font: 'anton', size: 72, color: '#ffffff', stroke: '#000000', strokeW: 8, bgOn: false, bg: '#000000', bgOpacity: 60,
  align: 'center', bold: false, italic: false, upper: true, shadow: false, rot: 0, fit: false, clip: false, pin: 'auto', margin: 30, opacity: 100
};
const BUBBLE_DEFAULTS = {
  font: 'comic', size: 40, color: '#111111', stroke: '#ffffff', strokeW: 0, bgOn: false, bg: '#000000', bgOpacity: 0,
  align: 'center', bold: true, italic: false, upper: false, shadow: false, rot: 0, fit: true, clip: false, pin: 'auto', margin: 30,
  shape: 'oval', fill: '#ffffff', fillOpacity: 100, border: '#111111', borderW: 4, tail: true, autoH: true, opacity: 100
};
const PICTURE_DEFAULTS = { opacity: 100, rot: 0, flip: false, clip: false, pin: 'auto', margin: 30 };
const DRAW_DEFAULTS = { opacity: 100, rot: 0, clip: false, pin: 'auto', margin: 30 };
const PANEL_DEFAULTS = {
  fit: '', zoom: 1, offX: 0, offY: 0, span: 1, color: '#ffffff', caption: '', flip: false,
  numText: '', numHide: false, numOwn: false, numColor: '#ffffff', numBg: '#e53935', rot: 0, straight: 0, weight: 1
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
const SCALE_KEYS = ['size', 'w', 'h', 'strokeW', 'borderW', 'margin', 's'];

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
  scheduleSave();
}
function restore(s) {
  const o = JSON.parse(s);
  state.layout = o.layout; state.panels = o.panels; state.elements = o.elements;
  if (sel && !findSel()) sel = null;
  if (detailId && !findPanel(detailId)) detailId = null;
  ensureUsedFonts();
  syncAll();
}
function undo() { if (hIndex > 0) { hIndex--; restore(history[hIndex]); updateUndoButtons(); scheduleSave(); } }
function redo() { if (hIndex < history.length - 1) { hIndex++; restore(history[hIndex]); updateUndoButtons(); scheduleSave(); } }
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
      // hard-break over-long words by code points (never split an emoji's surrogate pair)
      let chars = Array.from(w);
      while (chars.length > 1 && ctx.measureText(chars.join('')).width > maxW) {
        let i = chars.length - 1;
        while (i > 1 && ctx.measureText(chars.slice(0, i).join('')).width > maxW) i--;
        out.push(chars.slice(0, i).join(''));
        chars = chars.slice(i);
      }
      line = chars.join('');
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
const isQuarter = (p) => ((((p.rot || 0) % 180) + 180) % 180) === 90;
function panelAspect(p) {
  if (p.type === 'image') {
    const im = images.get(p.imgId);
    if (im) return isQuarter(p) ? im.h / im.w : im.w / im.h;
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
  const p = state.panels.find(q => q.type === 'image' && images.get(q.imgId));
  return p ? panelAspect(p) : 1;
}
// Width needed so that every image is drawn at (at least) its original pixel size.
// Everything in the layout scales linearly with the width, so measure at 1000 px.
function detailWidth() {
  const L = state.layout;
  const lay = layoutAt(ctx, 1000);
  let need = 0;
  lay.cells.forEach(cell => {
    const p = cell.p;
    const im = p.type === 'image' && images.get(p.imgId);
    if (!im) return;
    const iw = isQuarter(p) ? im.h : im.w, ih = isQuarter(p) ? im.w : im.h;
    const a = cell.w / cell.h;
    const fit = p.fit || L.fit;
    const nw = fit === 'cover' ? Math.min(iw, ih * a) : Math.max(iw, ih * a);
    need = Math.max(need, nw / (p.zoom || 1) / (cell.w / 1000));
  });
  return need || 1080;
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
  const defs = (L.rows && L.rows.length) ? L.rows : [{ n: 2, h: 40 }];
  const cols = L.mode === 'custom' ? Math.max(1, ...defs.map(d => clamp(d.n | 0, 1, 6))) : getCols();
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
  } else if (L.mode === 'custom') {
    let i = 0, r = 0;
    while (i < panels.length) {
      const d = defs[Math.min(r, defs.length - 1)];
      const n = clamp(d.n | 0, 1, 6);
      const chunk = panels.slice(i, i + n);
      const h = inner * clamp(d.h || 40, 5, 300) / 100;
      const sumW = chunk.reduce((a, p) => a + (p.weight || 1), 0);
      const avail = inner - (chunk.length - 1) * gap;
      let x = pad;
      rows.push({ h, cells: chunk.map(p => { const w = avail * (p.weight || 1) / sumW; const c = { p, x, w }; x += w + gap; return c; }) });
      i += n; r++;
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
  const rowBoxes = [];
  for (const row of rows) {
    let barH = 0;
    if (bar) row.cells.forEach(c => { barH = Math.max(barH, captionGeom(ctx, c.p.caption || '', c.w, cu).h); });
    for (const c of row.cells) {
      const imgY = y + (L.cap.pos === 'above' ? barH : 0);
      const cell = { p: c.p, x: c.x, y: imgY, w: c.w, h: row.h, capRect: null };
      if (bar && barH > 0) cell.capRect = { x: c.x, y: L.cap.pos === 'above' ? y : imgY + row.h, w: c.w, h: barH };
      cells.push(cell);
    }
    const last = row.cells[row.cells.length - 1];
    rowBoxes.push({ y0: y, y1: y + row.h + barH, xEnd: last.x + last.w });
    y += row.h + barH + gap;
  }
  const H = Math.max(1, Math.round(y - gap + pad));
  return { W: Math.round(W), H, s, cu, gap, pad, cells, rows: rowBoxes };
}
function bgStyle() { const L = state.layout; return hexToRgba(L.bg, (L.bgOpacity ?? 100) / 100); }
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
  // user zoom (pinch / wheel / buttons) inside the base rect
  const baseKey = detailId || '';
  if (baseKey !== lastBaseKey) { lastBaseKey = baseKey; zoom.z = 1; zoom.cx = zoom.cy = null; updateZoomUI(); }
  lastBase = Object.assign({}, rect);
  if (zoom.z > 1.001) {
    const w = rect.w / zoom.z, h = rect.h / zoom.z;
    const cx = clamp(zoom.cx ?? rect.x + rect.w / 2, rect.x + w / 2, rect.x + rect.w - w / 2);
    const cy = clamp(zoom.cy ?? rect.y + rect.h / 2, rect.y + h / 2, rect.y + rect.h - h / 2);
    zoom.cx = cx; zoom.cy = cy;
    rect = { x: cx - w / 2, y: cy - h / 2, w, h };
  }
  const stage = $('stage');
  const cssW = Math.max(200, stage.clientWidth - 22);
  const target = cssW * (window.devicePixelRatio || 1);
  // Phones: draw only as many pixels as the screen shows (fast). Desktop: at least full resolution.
  let scale = isCoarse ? target / rect.w : Math.max(1, target / rect.w);
  scale = Math.min(scale, 24);
  const area = rect.w * rect.h * scale * scale;
  if (area > MAX_AREA) scale *= Math.sqrt(MAX_AREA / area);
  return Object.assign(rect, { scale });
}

// ---------- view zoom ----------
const zoom = { z: 1, cx: null, cy: null };
let lastBase = null, lastBaseKey = '';
function updateZoomUI() { const b = $('zoomFit'); if (b) b.textContent = zoom.z > 1.01 ? zoom.z.toFixed(1) + '×' : '1×'; }
function resetZoom() { zoom.z = 1; zoom.cx = zoom.cy = null; updateZoomUI(); scheduleRender(); }
// Zoom so that composition point (px, py) ends up at fraction (fx, fy) of the canvas.
function zoomTo(z, px, py, fx, fy) {
  const b = lastBase;
  if (!b) return;
  zoom.z = clamp(z, 1, 8);
  const w = b.w / zoom.z, h = b.h / zoom.z;
  zoom.cx = px - fx * w + w / 2;
  zoom.cy = py - fy * h + h / 2;
  updateZoomUI();
  scheduleRender();
}
function zoomBy(f, px, py) {
  const v = lastView;
  if (px == null) { px = v.x + v.w / 2; py = v.y + v.h / 2; }
  zoomTo(zoom.z * f, px, py, (px - v.x) / v.w, (py - v.y) / v.h);
}
function panViewTo(cx, cy) { if (zoom.z <= 1.001) return; zoom.cx = cx; zoom.cy = cy; scheduleRender(); }

function renderTo(cv, opt) {
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  const lay = computeLayout(c);
  const v = opt.full ? { x: 0, y: 0, w: lay.W, h: lay.H, scale: opt.scale || 1 } : displayView(lay);
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
  // outer frame + background (the background may be (semi-)transparent)
  const bgFill = bgStyle();
  c.clearRect(0, 0, W, H);
  if (pad > 0) { c.fillStyle = L.padColor; c.fillRect(0, 0, W, H); c.clearRect(pad, pad, W - 2 * pad, H - 2 * pad); }
  c.fillStyle = bgFill;
  c.fillRect(pad, pad, W - 2 * pad, H - 2 * pad);
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
    // rows that aren't full: fill the empty rest with the line color as well
    (lay.rows || []).forEach(r => {
      if (r.xEnd < W - pad - 0.5) c.fillRect(r.xEnd, r.y0 - gap / 2, W - pad - r.xEnd, r.y1 - r.y0 + gap);
    });
    c.restore();
  }
  lay.cells.forEach(cell => drawPanel(c, cell, lay));
  lay.cells.forEach(cell => drawCaption(c, cell, lay));
  drawNumbers(c, lay);
  state.elements.forEach(el => {
    const fr = frameOf(el, lay);
    c.save();
    if (el.clip && !fr.canvas) { c.beginPath(); c.rect(fr.x, fr.y, fr.w, fr.h); c.clip(); }
    c.globalAlpha = clamp((el.opacity ?? 100) / 100, 0, 1);
    if (el.type === 'text') drawTextEl(c, el, fr);
    else if (el.type === 'bubble') drawBubbleEl(c, el, fr, lay, scale);
    else if (el.type === 'picture') drawPictureEl(c, el, fr);
    else if (el.type === 'draw') drawDrawEl(c, el, fr);
    c.restore();
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
      c.clearRect(x, y, w, h);
      c.fillStyle = bgStyle();
      c.fillRect(x, y, w, h);
      const fit = p.fit || L.fit;
      const zoom = p.zoom || 1;
      const q = isQuarter(p);
      const iw = q ? im.h : im.w, ih = q ? im.w : im.h;      // upright size after 90° steps
      const st = (p.straight || 0) * Math.PI / 180;            // fine "straighten" angle
      const ca = Math.abs(Math.cos(st)), sa = Math.abs(Math.sin(st));
      let bw, bh, dw0, dh0;                                    // bounding box on screen / drawn size
      if (fit === 'stretch') {
        bw = w * zoom; bh = h * zoom;
        dw0 = (q ? bh : bw); dh0 = (q ? bw : bh);
      } else {
        const sc = (fit === 'contain'
          ? Math.min(w / (iw * ca + ih * sa), h / (iw * sa + ih * ca))
          : Math.max((w * ca + h * sa) / iw, (w * sa + h * ca) / ih)) * zoom;
        bw = (iw * ca + ih * sa) * sc; bh = (iw * sa + ih * ca) * sc;
        dw0 = im.w * sc; dh0 = im.h * sc;
      }
      const ox = bw > w ? -(bw - w) / 2 * (p.offX || 0) : 0;
      const oy = bh > h ? -(bh - h) / 2 * (p.offY || 0) : 0;
      cell.draw = { dw: bw, dh: bh };
      const ang = ((p.rot || 0) + (p.straight || 0)) * Math.PI / 180;
      c.translate(x + w / 2 + ox, y + h / 2 + oy);
      if (p.flip) { c.scale(-1, 1); c.rotate(-ang); } else c.rotate(ang);
      c.drawImage(im.src, -dw0 / 2, -dh0 / 2, dw0, dh0);
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
    // One continuous cloud outline. Bumps are spaced by arc length (not angle),
    // so a flat cloud gets fewer, equally round bumps instead of squashed ones.
    const minR = Math.min(rx, ry);
    const bumpGuess = Math.max(minR * 0.55, g.px * 1.1);
    let n = clamp(Math.round((Math.PI * (rx + ry)) / (bumpGuess * 1.9)), 5, 16);
    const bh = Math.min(minR * 0.32, (Math.PI * (rx + ry)) / n * 0.3); // bump height
    const ax = Math.max(rx - bh, rx * 0.5), ay = Math.max(ry - bh, ry * 0.5);
    // sample the inner ellipse, then pick n points at equal arc length
    const S = 240, pts = [], acc = [0];
    for (let i = 0; i <= S; i++) { const a = (i / S) * Math.PI * 2 + 0.35; pts.push({ x: cx + Math.cos(a) * ax, y: cy + Math.sin(a) * ay }); }
    for (let i = 1; i <= S; i++) acc.push(acc[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
    const total = acc[S], P = [];
    for (let k = 0, j = 0; k < n; k++) {
      const target = (k + (rnd() - 0.5) * 0.18) / n * total;
      while (j < S && acc[j + 1] < target) j++;
      P.push(pts[Math.max(0, j)]);
    }
    const normal = (q) => { const dx = (q.x - cx) / (ax * ax), dy = (q.y - cy) / (ay * ay); const l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
    body.moveTo(P[0].x, P[0].y);
    for (let k = 0; k < n; k++) {
      const a = P[k], b = P[(k + 1) % n];
      const chord = Math.hypot(b.x - a.x, b.y - a.y);
      const na = normal(a), nb = normal(b);
      const h = chord * (0.62 + rnd() * 0.12);
      body.bezierCurveTo(a.x + na.x * h, a.y + na.y * h, b.x + nb.x * h, b.y + nb.y * h, b.x, b.y);
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
  sc.clearRect(0, 0, cv.width, cv.height); // whole canvas: smoothing samples neighbouring pixels
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
    const ea = c.globalAlpha;
    c.save();
    c.globalAlpha = ea * clamp((el.fillOpacity ?? 100) / 100, 0, 1);
    c.drawImage(scratchFill, 0, 0, sw, sh, x0, y0, sw / scale, sh / scale);
    c.globalAlpha = ea;
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

// ---------- Pictures (stickers, own images) ----------
function pictureGeom(el, fr) {
  const im = images.get(el.imgId);
  const a = im ? im.w / im.h : 1;
  const w = Math.max(4, el.w * fr.w);
  return { type: 'picture', w, h: w / a, cx: fr.x + el.x * fr.w, cy: fr.y + el.y * fr.h, rot: (el.rot || 0) * Math.PI / 180, frame: fr };
}
function drawPictureEl(c, el, fr) {
  const g = pictureGeom(el, fr);
  geo.set(el.id, g);
  const im = images.get(el.imgId);
  if (!im) return;
  c.translate(g.cx, g.cy);
  c.rotate(g.rot);
  if (el.flip) c.scale(-1, 1);
  c.drawImage(im.src, -g.w / 2, -g.h / 2, g.w, g.h);
}

// ---------- Freehand drawings ----------
// Points are stored relative to the drawing's origin, in units of
// (frame width × el.s), as a flat [x, y, x, y, …] array per stroke.
function drawGeom(el, fr) {
  const k = fr.w * (el.s || 1);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  (el.strokes || []).forEach(st => {
    const r = st.size / 2, p = st.pts;
    for (let i = 0; i < p.length; i += 2) {
      x0 = Math.min(x0, p[i] - r); x1 = Math.max(x1, p[i] + r);
      y0 = Math.min(y0, p[i + 1] - r); y1 = Math.max(y1, p[i + 1] + r);
    }
  });
  if (!isFinite(x0)) { x0 = y0 = -0.01; x1 = y1 = 0.01; }
  const ox = fr.x + el.x * fr.w, oy = fr.y + el.y * fr.h, rot = (el.rot || 0) * Math.PI / 180;
  const mx = (x0 + x1) / 2 * k, my = (y0 + y1) / 2 * k;
  return {
    type: 'draw', w: Math.max(8, (x1 - x0) * k), h: Math.max(8, (y1 - y0) * k), k, ox, oy, rot, frame: fr,
    cx: ox + mx * Math.cos(rot) - my * Math.sin(rot), cy: oy + mx * Math.sin(rot) + my * Math.cos(rot)
  };
}
function strokePath(c, st, k) {
  const p = st.pts;
  if (p.length < 2) return;
  c.save();
  c.globalAlpha *= (st.alpha ?? 1);
  c.strokeStyle = st.color;
  c.lineWidth = Math.max(0.5, st.size * k);
  c.lineCap = st.kind === 'marker' ? 'square' : 'round';
  c.lineJoin = 'round';
  c.beginPath();
  c.moveTo(p[0] * k, p[1] * k);
  if (p.length === 2) c.lineTo(p[0] * k + 0.01, p[1] * k);
  else {
    for (let i = 2; i < p.length - 2; i += 2) {
      c.quadraticCurveTo(p[i] * k, p[i + 1] * k, (p[i] + p[i + 2]) / 2 * k, (p[i + 1] + p[i + 3]) / 2 * k);
    }
    c.lineTo(p[p.length - 2] * k, p[p.length - 1] * k);
  }
  c.stroke();
  c.restore();
}
function drawDrawEl(c, el, fr) {
  const g = drawGeom(el, fr);
  geo.set(el.id, g);
  c.translate(g.ox, g.oy);
  c.rotate(g.rot);
  (el.strokes || []).forEach(st => strokePath(c, st, g.k));
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
function geomFor(el, fr) {
  if (el.type === 'bubble') return bubbleGeom(ctx, el, fr);
  if (el.type === 'picture') return pictureGeom(el, fr);
  if (el.type === 'draw') return drawGeom(el, fr);
  return textGeom(ctx, el, fr);
}
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
    return { src: img, w: img.naturalWidth || 512, h: img.naturalHeight || 512, url };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}
async function makeImageEntry(blob, name, credit, forcedId) {
  let d = await decodeBlob(blob);
  let storeBlob = blob;
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
    const keepAlpha = /png|webp|gif/.test(blob.type || '');
    storeBlob = await new Promise(res => cv.toBlob(res, keepAlpha ? 'image/png' : 'image/jpeg', 0.92)) || blob;
  }
  const ts = 120 / Math.max(d.w, d.h);
  const tc = document.createElement('canvas');
  tc.width = Math.max(1, Math.round(d.w * Math.min(1, ts)));
  tc.height = Math.max(1, Math.round(d.h * Math.min(1, ts)));
  tc.getContext('2d').drawImage(d.src, 0, 0, tc.width, tc.height);
  const thumbBlob = await new Promise(res => tc.toBlob(res, 'image/jpeg', 0.7));
  const id = forcedId || uid();
  images.set(id, { src: d.src, w: d.w, h: d.h, blob: storeBlob, name: name || 'image', credit: credit || '', thumb: thumbBlob ? URL.createObjectURL(thumbBlob) : '' });
  return id;
}
function newPanel(over) {
  return Object.assign({ id: uid(), type: 'image', imgId: null }, JSON.parse(JSON.stringify(PANEL_DEFAULTS)), over);
}
function isImageFile(f) {
  return (f.type && f.type.startsWith('image/')) || /\.(png|jpe?g|gif|webp|bmp|avif|svg|heic|heif)$/i.test(f.name || '');
}
async function addFiles(fileList) {
  const all = Array.from(fileList || []);
  const proj = all.find(f => /\.mememe$/i.test(f.name || ''));
  if (proj) { importProjectFile(proj); return; }
  const files = all.filter(isImageFile);
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
    layout: { mode: 'custom', rows: [{ n: 2, h: 40 }, { n: 3, h: 32 }, { n: 2, h: 40 }], fit: 'cover', gap: 16, gapColor: '#ffffff', pad: 24, padColor: '#ffffff', border: 5, borderColor: '#111111', radius: 4, bg: '#ffffff' },
    cap: { pos: 'overlayTop', font: 'comic', size: 40, color: '#111111', strokeW: 0, bg: '#fff6c8', bgOpacity: 100, align: 'left', bold: true, italic: false, upper: true },
    hint: 'Comic page: rows with different panel counts and heights (edit them under Layout). Captions become narration boxes, add bubbles with “+ Bubble”.'
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
  Object.assign(state.layout, JSON.parse(JSON.stringify(p.layout)));
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
  const dr = typeof drawState !== 'undefined' && drawState.on;
  $('propsDraw').hidden = !dr;
  $('propsEmpty').hidden = !!(el || p) || dr;
  $('propsElement').hidden = !el || dr;
  $('propsPanel').hidden = !p || dr;
  if (el) {
    const t = el.type, isB = t === 'bubble', isT = t === 'text', isP = t === 'picture', isD = t === 'draw';
    const name = isB ? 'Speech bubble' : isP ? 'Picture' : isD ? 'Drawing' : el.font === 'emoji' ? 'Emoji' : 'Text';
    $('elTitle').textContent = name + (el.panelId ? ` · image ${state.panels.findIndex(q => q.id === el.panelId) + 1}` : ' · canvas');
    $('elText').hidden = isP || isD;
    $('textRows').hidden = isP || isD;
    $('pictureRows').hidden = !(isP || isD);
    $('picOnly').hidden = !isP;
    $('drawOnly').hidden = !isD;
    $('bubbleOnly').hidden = !isB;
    $('textBgRow').hidden = !isT;
    $('autoHRow').hidden = !isB;
    $('fitRow').hidden = !(isT || isB);
    $('shadowRow').hidden = !(isT || isB);
    $('rotRow').hidden = isB;
    $('elOpacity').value = el.opacity ?? 100;
    $('elRot').value = Math.round(el.rot || 0);
    $('elMargin').value = Math.round(el.margin ?? 30);
    $('elPin').value = el.pin || 'auto';
    $('elClip').checked = !!el.clip;
  }
  if (el && (el.type === 'text' || el.type === 'bubble')) {
    const isB = el.type === 'bubble';
    $('elText').value = el.text;
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
    $('pStraight').value = p.straight || 0;
    $('pWeight').value = Math.round((p.weight || 1) * 100);
    $('pWeightRow').hidden = state.layout.mode !== 'custom';
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
    $('elOpacityVal').textContent = Math.round(el.opacity ?? 100) + '%';
    $('elRotVal').textContent = Math.round(el.rot || 0) + '°';
  }
  if (el && (el.type === 'text' || el.type === 'bubble')) {
    $('elSizeVal').textContent = Math.round(el.size);
    $('elStrokeWVal').textContent = Math.round(el.strokeW);
    $('elBgOpacityVal').textContent = el.bgOpacity + '%';
    if (el.type === 'bubble') {
      $('bFillOpacityVal').textContent = el.fillOpacity + '%';
      $('bBorderWidthVal').textContent = Math.round(el.borderW);
    }
  }
  const p = selPanel();
  if (p) {
    $('pZoomVal').textContent = Math.round((p.zoom || 1) * 100) + '%';
    $('pStraightVal').textContent = (p.straight || 0) + '°';
    $('pWeightVal').textContent = Math.round((p.weight || 1) * 100) + '%';
  }
  const L = state.layout;
  $('lGapVal').textContent = L.gap;
  $('lBgOpacityVal').textContent = (L.bgOpacity ?? 100) + '%';
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
  $('lAspect').disabled = L.mode !== 'uniform';
  $('lCols').disabled = L.mode === 'custom';
  renderRowsEditor();
  $('lFit').value = L.fit;
  $('lBg').value = L.bg;
  $('lBgOpacity').value = L.bgOpacity ?? 100;
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
function rememberStyle(el) {
  if ((el.type !== 'text' && el.type !== 'bubble') || el.font === 'emoji') return;
  lastStyle[el.type] = pickStyle(el);
}
function elDefaults(el) { return { bubble: BUBBLE_DEFAULTS, picture: PICTURE_DEFAULTS, draw: DRAW_DEFAULTS }[el.type] || TEXT_DEFAULTS; }
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
bindEl('elOpacity', 'opacity', num);
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
$('elTopBtn').addEventListener('click', () => moveElementTo(true));
$('elBottomBtn').addEventListener('click', () => moveElementTo(false));
function moveElementTo(front) {
  const el = selEl(); if (!el) return;
  state.elements = state.elements.filter(e => e !== el);
  if (front) state.elements.push(el); else state.elements.unshift(el);
  commit(); scheduleRender();
  toast(front ? 'Moved to the front.' : 'Moved to the back.', 1500);
}
$('picFlipBtn').addEventListener('click', () => { const el = selEl(); if (!el || el.type !== 'picture') return; el.flip = !el.flip; commit(); scheduleRender(); });
$('picReplaceBtn').addEventListener('click', () => $('picReplaceInput').click());
$('picReplaceInput').addEventListener('change', async (e) => {
  const file = e.target.files[0]; e.target.value = '';
  const el = selEl();
  if (!file || !el || el.type !== 'picture') return;
  try { el.imgId = await makeImageEntry(file, file.name); commit(); scheduleRender(); } catch (err) { toast('Could not read that picture.'); }
});
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
async function registerFontRecord(r) {
  if (FONTS.some(f => f.id === r.id)) return;
  const fam = 'mememe-' + r.id;
  const face = new FontFace(fam, await r.blob.arrayBuffer());
  await face.load();
  document.fonts.add(face);
  FONTS.push({ id: r.id, label: '★ ' + r.name, family: `"${fam}", sans-serif` });
}
$('fontInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const rec = { id: 'cf-' + uid(), name: file.name.replace(/\.[^.]+$/, ''), blob: file };
    await registerFontRecord(rec);
    if (projectsOK) await dbPut('fonts', rec).catch(() => {});
    populateFontSelects();
    const el = selEl();
    if (el) { el.font = rec.id; rememberStyle(el); commit(); }
    syncProps(); syncLayoutUI(); scheduleRender();
    toast(`Font “${rec.name}” added` + (projectsOK ? ' — it stays available and is saved with your projects.' : ' for this session.'), 4000);
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
bindPanel('pStraight', 'straight', num);
bindPanel('pWeight', 'weight', v => Number(v) / 100, v => v * 100);
function rotatePanel(d) {
  const p = selPanel(); if (!p) return;
  p.rot = (((p.rot || 0) + d) % 360 + 360) % 360;
  p.offX = 0; p.offY = 0;
  commit(); syncProps(); scheduleRender();
}
$('pRotLBtn').addEventListener('click', () => rotatePanel(-90));
$('pRotRBtn').addEventListener('click', () => rotatePanel(90));
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
$('pDelBtn').addEventListener('click', deleteSelectedPanel);
function deleteSelectedPanel() {
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
}
$('pReplaceBtn').addEventListener('click', () => $('replaceInput').click());
$('capStyleBtn').addEventListener('click', () => {
  $('layoutCard').open = true;
  const h = $('capHead');
  h.scrollIntoView({ behavior: 'smooth', block: 'center' });
  h.classList.remove('flash'); void h.offsetWidth; h.classList.add('flash');
});
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
    if (id === 'lMode') { $('lAspect').disabled = state.layout.mode !== 'uniform'; $('lCols').disabled = state.layout.mode === 'custom'; renderRowsEditor(); }
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
bindLayout('lBgOpacity', 'bgOpacity', num);
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
// ---------- custom comic rows ----------
const ROW_PRESETS = [
  ['1 · 4 · 1', [[1, 45], [4, 30], [1, 45]]], ['2 · 3 · 2', [[2, 40], [3, 32], [2, 40]]], ['1 · 2 · 2', [[1, 50], [2, 40], [2, 40]]],
  ['2 · 1 · 2', [[2, 40], [1, 45], [2, 40]]], ['3 · 3 · 3', [[3, 32], [3, 32], [3, 32]]], ['Big + 2', [[1, 62], [2, 40]]], ['Strip of 4', [[4, 30]]]
];
ROW_PRESETS.forEach(([label, rows]) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.title = 'Panels per row: ' + label;
  b.addEventListener('click', () => {
    state.layout.rows = rows.map(([n, h]) => ({ n, h }));
    commit(); renderRowsEditor(); syncProps(); scheduleRender();
  });
  $('rowPresets').appendChild(b);
});
function renderRowsEditor() {
  const L = state.layout;
  $('rowsEditor').hidden = L.mode !== 'custom';
  if (L.mode !== 'custom') return;
  if (!L.rows || !L.rows.length) L.rows = defaultLayout().rows;
  const list = $('rowsList');
  list.innerHTML = '';
  L.rows.forEach((r, i) => {
    const d = document.createElement('div');
    d.className = 'row-def';
    const lb = document.createElement('span');
    lb.className = 'rl';
    lb.textContent = `Row ${i + 1}`;
    const sl = document.createElement('select');
    sl.title = 'Panels in this row';
    for (let n = 1; n <= 6; n++) { const o = document.createElement('option'); o.value = n; o.textContent = `${n} panel${n > 1 ? 's' : ''}`; sl.appendChild(o); }
    sl.value = r.n;
    sl.addEventListener('input', () => { r.n = Number(sl.value); commit(); syncProps(); scheduleRender(); });
    const rg = document.createElement('input');
    rg.type = 'range'; rg.min = 10; rg.max = 150; rg.value = r.h;
    rg.title = 'Row height (% of the page width)';
    const val = document.createElement('span');
    val.className = 'val';
    val.textContent = r.h + '%';
    rg.addEventListener('input', () => { r.h = Number(rg.value); val.textContent = r.h + '%'; scheduleRender(); });
    rg.addEventListener('change', commit);
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'icon small danger';
    del.textContent = '✕';
    del.title = 'Remove this row';
    del.disabled = L.rows.length <= 1;
    del.addEventListener('click', () => { L.rows.splice(i, 1); commit(); renderRowsEditor(); scheduleRender(); });
    d.append(lb, sl, rg, val, del);
    list.appendChild(d);
  });
}
$('addRowBtn').addEventListener('click', () => {
  const L = state.layout;
  const last = L.rows[L.rows.length - 1] || { n: 2, h: 40 };
  L.rows.push({ n: last.n, h: last.h });
  commit(); renderRowsEditor(); scheduleRender();
});

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

const pointers = new Map();
let pinch = null, pinchLock = false, spaceDown = false;
function startPinch() {
  if (drag) { if (drag.moved && drag.mode !== 'view') restore(history[hIndex]); drag = null; guides = { x: null, y: null }; }
  if (drawing) cancelDrawing();
  const [a, b] = [...pointers.values()];
  const r = canvas.getBoundingClientRect(), v = lastView;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
  pinch = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: zoom.z, px: v.x + (mx - r.left) / r.width * v.w, py: v.y + (my - r.top) / r.height * v.h };
}
function movePinch() {
  const [a, b] = [...pointers.values()];
  const r = canvas.getBoundingClientRect();
  const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
  zoomTo(pinch.z0 * d / pinch.d0, pinch.px, pinch.py, ((a.x + b.x) / 2 - r.left) / r.width, ((a.y + b.y) / 2 - r.top) / r.height);
}

canvas.addEventListener('pointerdown', (e) => {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (pointers.size === 2) { startPinch(); e.preventDefault(); return; }
  if (pointers.size > 2 || pinchLock) return;
  // move the zoomed view: middle mouse button, or Space + drag
  if (e.button === 1 || (spaceDown && e.button === 0)) {
    drag = { mode: 'view', sx: e.clientX, sy: e.clientY, cx: lastView.x + lastView.w / 2, cy: lastView.y + lastView.h / 2, moved: false };
    e.preventDefault();
    return;
  }
  if (e.button !== undefined && e.button !== 0) return;
  const p = toCanvasPoint(e);
  if (drawState.on) { startDrawing(p); e.preventDefault(); return; }
  const hit = hitTest(p);
  drag = null;
  const now = Date.now();
  if (!hit) { select(null); return; }
  const copyScale = (el) => { const o = {}; SCALE_KEYS.forEach(k => { o[k] = el[k]; }); return o; };
  if (hit.kind === 'tail' || hit.kind === 'resize') {
    drag = { mode: hit.kind, el: hit.el, start: p, moved: false, o: copyScale(hit.el), g0: Object.assign({}, geo.get(hit.el.id)) };
  } else if (hit.kind === 'el') {
    const el = hit.el;
    if (lastTap.id === el.id && now - lastTap.t < 380) {
      lastTap = { id: null, t: 0 };
      select({ kind: 'el', id: el.id });
      if (el.type === 'text' || el.type === 'bubble') { $('elText').focus(); $('elText').select(); }
      else if (el.type === 'draw') setDrawMode(true, el.id);
      return;
    }
    lastTap = { id: el.id, t: now };
    if (!sel || sel.id !== el.id) select({ kind: 'el', id: el.id });
    const g = geo.get(el.id);
    drag = { mode: 'move', el, start: p, moved: false, g, ocx: g.cx, ocy: g.cy, ofr: g.frame, o: copyScale(el), otip: el.type === 'bubble' ? { x: g.tipX, y: g.tipY } : null };
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
  if (drag) e.preventDefault();
});
canvas.addEventListener('pointermove', (e) => {
  if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch) { if (pointers.size >= 2) movePinch(); return; }
  if (pinchLock) return;
  if (drawing) { continueDrawing(toCanvasPoint(e)); return; }
  if (!drag) return;
  if (drag.mode === 'view') {
    const r = canvas.getBoundingClientRect(), k = lastView.w / r.width;
    panViewTo(drag.cx - (e.clientX - drag.sx) * k, drag.cy - (e.clientY - drag.sy) * k);
    drag.moved = true;
    return;
  }
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
    // for drawings the origin may differ slightly from the box center
    const ocxOff = el.type === 'draw' ? (drag.g.ox - drag.g.cx) : 0, ocyOff = el.type === 'draw' ? (drag.g.oy - drag.g.cy) : 0;
    el.x = (s.cx + ocxOff - to.x) / to.w;
    el.y = (s.cy + ocyOff - to.y) / to.h;
    if (drag.otip) {
      el.tx = (drag.otip.x + (s.cx - drag.ocx) - to.x) / to.w;
      el.ty = (drag.otip.y + (s.cy - drag.ocy) - to.y) / to.h;
    }
  } else if (drag.mode === 'resize') {
    const g = geo.get(el.id);
    const lp = localPoint(g, p);
    const fw = g.frame.w;
    if (el.type === 'picture') {
      const a = g.w / g.h;
      el.w = clamp(Math.max(Math.abs(lp.x) * 2, Math.abs(lp.y) * 2 * a) / fw, 0.02, 6);
    } else if (el.type === 'draw') {
      const g0 = drag.g0;
      const f = Math.max(Math.abs(lp.x) / (g0.w / 2), Math.abs(lp.y) / (g0.h / 2));
      el.s = clamp((drag.o.s || 1) * f, 0.05, 30);
    } else {
      el.w = clamp(Math.abs(lp.x) * 2 / fw, 0.03, 4);
      if (el.type === 'text' && el.font === 'emoji') el.size = drag.o.size * el.w / drag.o.w; // emoji scale like stickers
      if (el.type === 'bubble') {
        el.h = clamp(Math.abs(lp.y) * 2 / fw, 0.02, 4);
        if (el.autoH) { el.autoH = false; $('bAutoH').checked = false; }
      } else if (el.fit) {
        el.h = clamp(Math.abs(lp.y) * 2 / fw, 0.02, 4);
      }
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
  const moved = drag.moved && drag.mode !== 'view';
  drag = null;
  guides = { x: null, y: null };
  if (moved) { commit(); syncProps(); }
  scheduleRender();
}
function onPointerEnd(e) {
  pointers.delete(e.pointerId);
  if (pinch) { if (pointers.size < 2) { pinch = null; pinchLock = pointers.size > 0; } return; }
  if (pinchLock) { if (pointers.size === 0) pinchLock = false; return; }
  if (drawing) { finishDrawing(); return; }
  endDrag();
}
canvas.addEventListener('pointerup', onPointerEnd);
canvas.addEventListener('pointercancel', onPointerEnd);
canvas.addEventListener('wheel', (e) => {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const p = toCanvasPoint(e);
    zoomBy(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), p.x, p.y);
  } else if (zoom.z > 1.01) {
    e.preventDefault();
    const r = canvas.getBoundingClientRect(), k = lastView.w / r.width;
    panViewTo(lastView.x + lastView.w / 2 + e.deltaX * k, lastView.y + lastView.h / 2 + e.deltaY * k);
  }
}, { passive: false });
$('zoomIn').addEventListener('click', () => zoomBy(1.5));
$('zoomOut').addEventListener('click', () => zoomBy(1 / 1.5));
$('zoomFit').addEventListener('click', resetZoom);
document.addEventListener('keydown', (e) => {
  const t = e.target;
  if (e.code === 'Space' && !(t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'BUTTON'))) {
    if (!spaceDown) { spaceDown = true; canvas.classList.add('panning'); }
    e.preventDefault();
  }
});
document.addEventListener('keyup', (e) => { if (e.code === 'Space') { spaceDown = false; canvas.classList.remove('panning'); } });

// =====================================================================
// Freehand drawing
// =====================================================================
const DRAW_COLORS = ['#111111', '#ffffff', '#e53935', '#fb8c00', '#fdd835', '#43a047', '#1e88e5', '#8e24aa'];
const drawState = Object.assign({ on: false, tool: 'pen', color: '#e53935', size: 8, alpha: 100, target: null }, settings.draw || {}, { on: false, target: null });
let drawing = null;
function saveDrawPrefs() { settings.draw = { tool: drawState.tool, color: drawState.color, size: drawState.size, alpha: drawState.alpha }; saveSettings(); }
function setDrawMode(on, targetId) {
  if (drawing) finishDrawing();
  drawState.on = on;
  drawState.target = on ? (targetId || null) : null;
  if (on) sel = null;
  $('drawBtn').classList.toggle('active', on);
  canvas.classList.toggle('drawing', on);
  syncDrawUI();
  syncProps();
  renderStrip();
  scheduleRender();
}
function syncDrawUI() {
  setSeg('drawTool', drawState.tool, {});
  $('drawColor').value = drawState.color;
  $('drawSize').value = drawState.size;
  $('drawAlpha').value = drawState.alpha;
  $('drawSizeVal').textContent = drawState.size;
  $('drawAlphaVal').textContent = drawState.alpha + '%';
}
function localDrawPoint(el, fr, p) {
  const k = fr.w * (el.s || 1);
  const r = -(el.rot || 0) * Math.PI / 180;
  const dx = p.x - (fr.x + el.x * fr.w), dy = p.y - (fr.y + el.y * fr.h);
  return { x: (dx * Math.cos(r) - dy * Math.sin(r)) / k, y: (dx * Math.sin(r) + dy * Math.cos(r)) / k, k };
}
function startDrawing(p) {
  if (!lastLayout) return;
  if (drawState.tool === 'eraser') { drawing = { erase: true, changed: false }; eraseAt(p); return; }
  const cell = cellAt(lastLayout, p.x, p.y);
  const fr = cell || canvasFrame(lastLayout);
  const pid = cell ? cell.p.id : null;
  let el = drawState.target && findEl(drawState.target);
  if (el && (el.type !== 'draw' || (el.panelId || null) !== pid)) el = null;
  if (!el) {
    el = Object.assign({ id: uid(), type: 'draw', panelId: pid, x: (p.x - fr.x) / fr.w, y: (p.y - fr.y) / fr.h, s: 1, strokes: [] }, JSON.parse(JSON.stringify(DRAW_DEFAULTS)));
    state.elements.push(el);
    drawState.target = el.id;
  }
  const efr = frameOf(el, lastLayout);
  const k = efr.w * (el.s || 1);
  const st = {
    pts: [], color: drawState.color, kind: drawState.tool,
    size: (drawState.size * (drawState.tool === 'marker' ? 2.2 : 1)) / 1000 * efr.w / k,
    alpha: (drawState.tool === 'marker' ? 0.45 : 1) * drawState.alpha / 100
  };
  el.strokes.push(st);
  drawing = { el, st };
  addDrawPoint(p, true);
}
function addDrawPoint(p, force) {
  const { el, st } = drawing;
  const fr = frameOf(el, lastLayout);
  const q = localDrawPoint(el, fr, p);
  const n = st.pts.length;
  if (!force && n >= 2 && Math.hypot(q.x - st.pts[n - 2], q.y - st.pts[n - 1]) * q.k < 1.5 * dispScale()) return;
  st.pts.push(+q.x.toFixed(5), +q.y.toFixed(5));
  scheduleRender();
}
function continueDrawing(p) { if (drawing.erase) eraseAt(p); else addDrawPoint(p); }
function finishDrawing() {
  const d = drawing;
  drawing = null;
  if (d.erase) { if (d.changed) commit(); return; }
  recenterDraw(d.el);
  commit();
  scheduleRender();
}
function cancelDrawing() {
  const d = drawing;
  drawing = null;
  if (!d || d.erase) return;
  d.el.strokes.pop();
  if (!d.el.strokes.length) { state.elements = state.elements.filter(e => e !== d.el); drawState.target = null; }
  scheduleRender();
}
// Keep the drawing's origin in the middle of its strokes (for rotation / resizing).
function recenterDraw(el) {
  if (!lastLayout) return;
  const fr = frameOf(el, lastLayout);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  el.strokes.forEach(st => { for (let i = 0; i < st.pts.length; i += 2) { x0 = Math.min(x0, st.pts[i]); x1 = Math.max(x1, st.pts[i]); y0 = Math.min(y0, st.pts[i + 1]); y1 = Math.max(y1, st.pts[i + 1]); } });
  if (!isFinite(x0)) return;
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  el.strokes.forEach(st => { for (let i = 0; i < st.pts.length; i += 2) { st.pts[i] = +(st.pts[i] - mx).toFixed(5); st.pts[i + 1] = +(st.pts[i + 1] - my).toFixed(5); } });
  const k = fr.w * (el.s || 1), r = (el.rot || 0) * Math.PI / 180;
  el.x += (mx * Math.cos(r) - my * Math.sin(r)) * k / fr.w;
  el.y += (mx * Math.sin(r) + my * Math.cos(r)) * k / fr.h;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function strokeHit(st, x, y, r) {
  const p = st.pts;
  if (p.length === 2) return Math.hypot(p[0] - x, p[1] - y) <= r;
  for (let i = 0; i < p.length - 2; i += 2) if (segDist(x, y, p[i], p[i + 1], p[i + 2], p[i + 3]) <= r) return true;
  return false;
}
function eraseAt(p) {
  const tol = 10 * dispScale();
  for (let i = state.elements.length - 1; i >= 0; i--) {
    const el = state.elements[i];
    if (el.type !== 'draw') continue;
    const fr = frameOf(el, lastLayout);
    const q = localDrawPoint(el, fr, p);
    const before = el.strokes.length;
    el.strokes = el.strokes.filter(st => !strokeHit(st, q.x, q.y, st.size / 2 + tol / q.k));
    if (el.strokes.length !== before) {
      drawing.changed = true;
      if (!el.strokes.length) { state.elements.splice(i, 1); geo.delete(el.id); if (drawState.target === el.id) drawState.target = null; }
    }
  }
  scheduleRender();
}
$('drawBtn').addEventListener('click', () => setDrawMode(!drawState.on));
$('drawDoneBtn').addEventListener('click', () => setDrawMode(false));
$('drawMoreBtn').addEventListener('click', () => { const el = selEl(); if (el && el.type === 'draw') setDrawMode(true, el.id); });
$('drawTool').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; drawState.tool = b.dataset.v; syncDrawUI(); saveDrawPrefs(); });
$('drawColor').addEventListener('input', () => { drawState.color = $('drawColor').value; if (drawState.tool === 'eraser') drawState.tool = 'pen'; syncDrawUI(); saveDrawPrefs(); });
$('drawSize').addEventListener('input', () => { drawState.size = Number($('drawSize').value); syncDrawUI(); saveDrawPrefs(); });
$('drawAlpha').addEventListener('input', () => { drawState.alpha = Number($('drawAlpha').value); syncDrawUI(); saveDrawPrefs(); });
DRAW_COLORS.forEach(c => {
  const b = document.createElement('button');
  b.type = 'button';
  b.style.background = c;
  b.title = c;
  b.addEventListener('click', () => { drawState.color = c; if (drawState.tool === 'eraser') drawState.tool = 'pen'; syncDrawUI(); saveDrawPrefs(); });
  $('drawSwatches').appendChild(b);
});
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
  resetZoom();
  select({ kind: 'panel', id });
  updateDetailBar();
}
function exitDetail() {
  detailId = null;
  resetZoom();
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
function isSide() { return settings.side === 'always' || (settings.side === 'auto' && !!document.fullscreenElement && sideMQ.matches); }
function applyLayoutMode() {
  const side = isSide();
  const fs = !!document.fullscreenElement;
  document.body.classList.toggle('side', side);
  document.body.classList.toggle('fs', fs);
  // the toolbar sits with the controls on the right in the side-by-side view
  const tb = $('toolbar');
  if (side && tb.parentElement !== $('ctrlBlock')) $('ctrlBlock').prepend(tb);
  if (!side && tb.parentElement !== $('stageBlock')) $('stageBlock').prepend(tb);
  requestAnimationFrame(() => {
    document.documentElement.style.setProperty('--sticky-top', fs ? document.querySelector('header').offsetHeight + 'px' : '0px');
  });
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
    if (drawState.on) { setDrawMode(false); return; }
    if (zoom.z > 1.01) { resetZoom(); return; }
    if (detailId) { exitDetail(); return; }
    select(null);
    return;
  }
  if ((e.key === 'Delete' || e.key === 'Backspace') && selPanel()) { e.preventDefault(); deleteSelectedPanel(); return; }
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
  if (fmt === 'jpeg' && (state.layout.bgOpacity ?? 100) < 100) {
    // JPG has no transparency → put the result on white
    const flat = document.createElement('canvas');
    flat.width = cv.width; flat.height = cv.height;
    const fc = flat.getContext('2d');
    fc.fillStyle = '#ffffff'; fc.fillRect(0, 0, flat.width, flat.height);
    fc.drawImage(cv, 0, 0);
    cv.width = cv.height = 0;
    return finishExport(flat, fmt, type);
  }
  return finishExport(cv, fmt, type);
}
async function finishExport(cv, fmt, type) {
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
$('clearAllBtn').addEventListener('click', () => newProject());

// =====================================================================
// Stickers: emoji, built-in vector stickers, own pictures
// =====================================================================
const EMOJI = {
  Faces: '😀 😃 😄 😁 😆 😅 🤣 😂 🙂 🙃 😉 😊 😇 🥰 😍 🤩 😘 😋 😛 😜 🤪 😝 🤑 🤗 🤭 🤫 🤔 🤐 🤨 😐 😑 😶 😏 😒 🙄 😬 🤥 😌 😔 😪 🤤 😴 😷 🤒 🤕 🤢 🤮 🥵 🥶 🥴 😵 🤯 🤠 🥳 😎 🤓 🧐 😕 😟 🙁 😮 😯 😲 😳 🥺 😦 😧 😨 😰 😥 😢 😭 😱 😖 😣 😞 😓 😩 😫 🥱 😤 😡 😠 🤬 😈 👿 💀 ☠️ 💩 🤡 👹 👺 👻 👽 🤖',
  Gestures: '👍 👎 👌 🤌 🤏 ✌️ 🤞 🤟 🤘 🤙 👈 👉 👆 👇 ☝️ ✋ 🤚 🖐️ 🖖 👋 👏 🙌 👐 🤲 🙏 💪 🫡 🤦 🤷 🙈 🙉 🙊 👀 👁️ 👄 🧠',
  Symbols: '❤️ 🧡 💛 💚 💙 💜 🖤 🤍 💔 💯 💢 💥 💫 💦 💨 💬 💭 🗯️ 💤 ✨ ⭐ 🌟 ⚡ 🔥 💧 ❗ ❓ ‼️ ⁉️ ✅ ❌ ⚠️ 🚫 🔞 🆗 🆒 🆕 🆘 ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟢 🔵',
  Animals: '🐶 🐱 🐭 🐹 🐰 🦊 🐻 🐼 🐨 🐯 🦁 🐮 🐷 🐸 🐵 🐔 🐧 🐦 🦆 🦅 🦉 🐴 🦄 🐝 🐛 🦋 🐌 🐞 🐢 🐍 🦖 🐙 🦀 🐬 🐳 🦈 🐊 🐘 🦒 🦘',
  Food: '🍕 🍔 🍟 🌭 🌮 🍿 🥨 🥐 🍩 🍪 🎂 🍰 🍫 🍬 🍭 🍦 🍉 🍌 🍎 🍓 🥑 🥦 🌶️ 🥕 🌽 🧀 🥚 🍳 🥓 ☕ 🍺 🍻 🥂 🍷 🍸 🧃',
  Things: '🎉 🎊 🎈 🎁 🏆 🥇 ⚽ 🏀 🎮 🎲 🎯 🎸 🎤 🎧 📱 💻 ⌨️ 📷 💡 💰 💸 💎 🔑 🔒 🔨 🧨 💣 ⏰ ⌛ 📌 📎 ✏️ 📝 📚 🚀 🚗 🚲 ✈️ 🏠 🏥 🌍 🌈 ☀️ 🌙 ☁️ ⛈️ ❄️ ☃️ 🌊 🌵 🌲 🌸 🍀 👑 🎩 🕶️ 💉 💊 🩺'
};
function sunglassesSVG() {
  const rows = ['1111111111111111', '0133111001331110', '0031111000311110', '0001111000011110'];
  let r = '';
  rows.forEach((row, y) => row.split('').forEach((ch, x) => {
    if (ch !== '0') r += `<rect x="${x * 20}" y="${y * 20}" width="20" height="20" fill="${ch === '3' ? '#fff' : '#000'}"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="80" viewBox="0 0 320 80" shape-rendering="crispEdges">${r}</svg>`;
}
const STICKERS = [
  ['Red arrow', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="200" viewBox="0 0 400 200"><path d="M12 72 H262 V18 L388 100 L262 182 V128 H12 Z" fill="#e53935" stroke="#fff" stroke-width="10" stroke-linejoin="round"/></svg>'],
  ['Red circle', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280" viewBox="0 0 400 280"><ellipse cx="200" cy="140" rx="180" ry="120" fill="none" stroke="#e53935" stroke-width="16"/></svg>'],
  ['Pixel sunglasses', null],
  ['Laser eye', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><radialGradient id="g"><stop offset="0" stop-color="#fff"/><stop offset=".12" stop-color="#fff"/><stop offset=".25" stop-color="#ff4d4d"/><stop offset=".55" stop-color="#ff0000" stop-opacity=".45"/><stop offset="1" stop-color="#ff0000" stop-opacity="0"/></radialGradient></defs><circle cx="200" cy="200" r="200" fill="url(#g)"/><path d="M0 200 Q200 186 400 200 Q200 214 0 200Z" fill="#fff" opacity=".85"/><path d="M200 40 Q208 200 200 360 Q192 200 200 40Z" fill="#fff" opacity=".6"/></svg>'],
  ['Censor bar', '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="90" viewBox="0 0 400 90"><rect x="0" y="0" width="400" height="90" fill="#000"/></svg>'],
  ['Heart', '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="270" viewBox="0 0 300 270"><path d="M150 262 C60 190 8 140 8 82 C8 38 42 8 84 8 C112 8 136 24 150 48 C164 24 188 8 216 8 C258 8 292 38 292 82 C292 140 240 190 150 262Z" fill="#e53935" stroke="#fff" stroke-width="10"/></svg>'],
  ['Crown', '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="220" viewBox="0 0 320 220"><path d="M20 70 L90 130 L160 20 L230 130 L300 70 L270 200 H50 Z" fill="#fbc02d" stroke="#8d6e00" stroke-width="10" stroke-linejoin="round"/><circle cx="160" cy="20" r="14" fill="#e53935"/><circle cx="20" cy="70" r="12" fill="#1e88e5"/><circle cx="300" cy="70" r="12" fill="#1e88e5"/></svg>'],
  ['Star burst', null]
];
function burstSVG() {
  let pts = '';
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = i % 2 ? 120 : 190; pts += `${(200 + Math.cos(a) * r).toFixed(1)},${(200 + Math.sin(a) * r * 0.8).toFixed(1)} `; }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="330" viewBox="0 35 400 330"><polygon points="${pts}" fill="#ffeb3b" stroke="#e53935" stroke-width="10" stroke-linejoin="round"/></svg>`;
}
STICKERS[2][1] = sunglassesSVG();
STICKERS[7][1] = burstSVG();

function newPicture(imgId, over) {
  const fr = insertionFrame();
  return Object.assign({ id: uid(), type: 'picture', imgId, panelId: fr.canvas ? null : fr.p.id, x: 0.5, y: 0.5, w: 0.4 },
    JSON.parse(JSON.stringify(PICTURE_DEFAULTS)), over);
}
async function addPictureBlob(blob, name, w) {
  try {
    const imgId = await makeImageEntry(blob, name);
    addElement(newPicture(imgId, { w: w || 0.4 }));
    closeModal('stickerModal');
  } catch (err) { toast('Could not read that picture.'); }
}
(function buildStickerModal() {
  const eg = $('emojiGrid');
  Object.entries(EMOJI).forEach(([cat, list]) => {
    const h = document.createElement('div');
    h.className = 'ecat';
    h.textContent = cat;
    eg.appendChild(h);
    list.split(' ').filter(Boolean).forEach(em => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = em;
      b.addEventListener('click', () => {
        addElement(newText({ text: em, font: 'emoji', size: 220, w: 0.45, strokeW: 0, stroke: '#ffffff', upper: false, bold: false, italic: false, bgOn: false, shadow: false, color: '#000000', fit: false }));
        closeModal('stickerModal');
      });
      eg.appendChild(b);
    });
  });
  const sg = $('stickerGrid');
  STICKERS.forEach(([name, svg]) => {
    const b = document.createElement('button');
    b.type = 'button';
    const img = document.createElement('img');
    img.alt = '';
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    const sp = document.createElement('span');
    sp.textContent = name;
    b.append(img, sp);
    b.addEventListener('click', () => addPictureBlob(new Blob([svg], { type: 'image/svg+xml' }), name, 0.35));
    sg.appendChild(b);
  });
})();
$('addStickerBtn').addEventListener('click', () => openModal('stickerModal'));
$('stickerTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]'); if (!b) return;
  $('stickerTabs').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
  $('tabEmoji').hidden = b.dataset.tab !== 'emoji';
  $('tabStickers').hidden = b.dataset.tab !== 'stickers';
  $('tabPicture').hidden = b.dataset.tab !== 'picture';
});
$('pictureFileBtn').addEventListener('click', () => $('pictureInput').click());
$('pictureInput').addEventListener('change', (e) => {
  const f = e.target.files[0]; e.target.value = '';
  if (f) addPictureBlob(f, f.name);
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
// Projects (IndexedDB autosave, list, export / import as .mememe)
// =====================================================================
const DB_NAME = 'mememe';
const CURRENT_KEY = 'mememe-current';
let dbPromise = null;
let projectsOK = false;
let currentProject = null;   // { id, name, created }
let savedImgs = new Set();   // image ids already stored in the DB
let saveTimer = null;
let saveDirty = false;
let saving = null;
let loadingProject = false;

function openDB() {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('IndexedDB unavailable')); return; }
      const r = indexedDB.open(DB_NAME, 2);
      r.onupgradeneeded = () => {
        const d = r.result;
        if (!d.objectStoreNames.contains('projects')) d.createObjectStore('projects', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('images')) d.createObjectStore('images', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('fonts')) d.createObjectStore('fonts', { keyPath: 'id' });
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  return dbPromise;
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const txP = (tx) => new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); });
async function dbGet(store, key) { const d = await openDB(); return reqP(d.transaction(store).objectStore(store).get(key)); }
async function dbAll(store) { const d = await openDB(); return reqP(d.transaction(store).objectStore(store).getAll()); }
async function dbKeys(store) { const d = await openDB(); return reqP(d.transaction(store).objectStore(store).getAllKeys()); }
async function dbPut(store, values) {
  const d = await openDB();
  const tx = d.transaction(store, 'readwrite');
  (Array.isArray(values) ? values : [values]).forEach(v => tx.objectStore(store).put(v));
  return txP(tx);
}
async function dbDel(store, keys) {
  const d = await openDB();
  const tx = d.transaction(store, 'readwrite');
  (Array.isArray(keys) ? keys : [keys]).forEach(k => tx.objectStore(store).delete(k));
  return txP(tx);
}
async function dbClear(store) { const d = await openDB(); const tx = d.transaction(store, 'readwrite'); tx.objectStore(store).clear(); return txP(tx); }

function stamp(t) {
  const d = new Date(t), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
function updateSaveStatus(text) {
  const el = $('saveStatus');
  if (!projectsOK) { el.textContent = text || 'Projects can’t be saved in this browser mode (no storage) — download your result before closing.'; return; }
  if (text) { el.textContent = text; return; }
  el.textContent = currentProject
    ? `Project “${currentProject.name}” · ${saveDirty ? 'unsaved changes…' : 'saved automatically'}`
    : 'New project — saved automatically as soon as it has content.';
}
function scheduleSave() {
  if (!projectsOK || loadingProject) return;
  if (!currentProject && !hasContent()) return;
  saveDirty = true;
  updateSaveStatus();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 1200);
}
async function makeThumb() {
  const cv = document.createElement('canvas');
  const lay = computeLayout(cv.getContext('2d'));
  renderTo(cv, { ui: false, full: true, scale: Math.min(1, 320 / Math.max(lay.W, lay.H)) });
  const flat = document.createElement('canvas');
  flat.width = cv.width; flat.height = cv.height;
  const fc = flat.getContext('2d');
  fc.fillStyle = '#ffffff'; fc.fillRect(0, 0, flat.width, flat.height);
  fc.drawImage(cv, 0, 0);
  return new Promise(res => flat.toBlob(res, 'image/jpeg', 0.75));
}
function idsOfState(st) {
  return Array.from(new Set([].concat((st.panels || []).filter(p => p.imgId).map(p => p.imgId), (st.elements || []).filter(e => e.imgId).map(e => e.imgId))));
}
function usedImageIds() { return idsOfState(state); }
async function saveNow() {
  clearTimeout(saveTimer);
  if (!projectsOK || !saveDirty) return;
  if (saving) { await saving; if (!saveDirty) return; }
  saving = (async () => {
    try {
      if (!currentProject) {
        currentProject = { id: uid(), name: 'Project ' + stamp(Date.now()), created: Date.now() };
        try { localStorage.setItem(CURRENT_KEY, currentProject.id); } catch (e) { /* ignore */ }
        if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
      }
      saveDirty = false;
      const ids = usedImageIds();
      const newImgs = ids.filter(id => !savedImgs.has(id) && images.get(id) && images.get(id).blob).map(id => {
        const im = images.get(id);
        return { id, blob: im.blob, name: im.name, credit: im.credit, w: im.w, h: im.h };
      });
      if (newImgs.length) { await dbPut('images', newImgs); newImgs.forEach(r => savedImgs.add(r.id)); }
      const thumb = await makeThumb();
      await dbPut('projects', {
        id: currentProject.id, name: currentProject.name, created: currentProject.created, updated: Date.now(),
        state: snapshot(), imageIds: ids, count: state.panels.length, thumb
      });
      updateSaveStatus();
    } catch (err) {
      saveDirty = true;
      updateSaveStatus('⚠ Saving failed — storage may be full. Export the project or delete old ones under Projects.');
    } finally {
      saving = null;
      scheduleRender();
    }
  })();
  return saving;
}
function releaseImages(keep) {
  for (const [id, im] of images) {
    if (keep && keep.has(id)) continue;
    if (im.src && im.src.close) im.src.close();
    if (im.thumb) URL.revokeObjectURL(im.thumb);
    images.delete(id);
  }
}
function resetEditor() {
  sel = null;
  detailId = null;
  geo.clear();
  history = []; hIndex = -1;
}
async function loadProject(id) {
  const rec = await dbGet('projects', id);
  if (!rec) return false;
  if (saveDirty) await saveNow();
  loadingProject = true;
  const hint = $('processingHint');
  hint.hidden = false;
  hint.textContent = `Opening “${rec.name}”…`;
  try {
    const o = JSON.parse(rec.state);
    const need = new Set(rec.imageIds || []);
    releaseImages(need);
    let missing = 0;
    for (const imgId of need) {
      if (images.has(imgId)) continue;
      const r = await dbGet('images', imgId);
      if (!r) { missing++; continue; }
      try { await makeImageEntry(r.blob, r.name, r.credit, imgId); savedImgs.add(imgId); } catch (e) { missing++; }
    }
    resetEditor();
    // fill in settings added in later versions
    const d = defaultLayout();
    state.layout = Object.assign(d, o.layout, { cap: Object.assign(d.cap, o.layout && o.layout.cap), num: Object.assign(d.num, o.layout && o.layout.num) });
    state.panels = o.panels || [];
    state.elements = o.elements || [];
    currentProject = { id: rec.id, name: rec.name, created: rec.created };
    try { localStorage.setItem(CURRENT_KEY, rec.id); } catch (e) { /* ignore */ }
    ensureUsedFonts();
    commit();
    saveDirty = false;
    syncAll();
    if (missing) toast(`${missing} image(s) of this project could not be restored.`, 4500);
    return true;
  } finally {
    loadingProject = false;
    hint.hidden = true;
    updateSaveStatus();
  }
}
async function newProject() {
  if (saveDirty) await saveNow();
  const had = !!currentProject;
  currentProject = null;
  try { localStorage.removeItem(CURRENT_KEY); } catch (e) { /* ignore */ }
  releaseImages(null);
  resetEditor();
  state.layout = defaultLayout();
  state.panels = [];
  state.elements = [];
  commit();
  saveDirty = false;
  syncAll();
  updateSaveStatus();
  if (had) toast('New project started — the previous one is saved under 📁 Projects.');
}
async function gcImages() {
  const projs = await dbAll('projects');
  const used = new Set(projs.flatMap(p => p.imageIds || []));
  usedImageIds().forEach(id => used.add(id));
  const stale = (await dbKeys('images')).filter(k => !used.has(k));
  if (stale.length) { await dbDel('images', stale); stale.forEach(k => savedImgs.delete(k)); }
}
async function initProjects() {
  try {
    await openDB();
    savedImgs = new Set(await dbKeys('images'));
    projectsOK = true;
    // custom fonts are a library shared by all projects
    for (const r of await dbAll('fonts')) { try { await registerFontRecord(r); } catch (e) { /* broken font file */ } }
    populateFontSelects();
    syncLayoutUI();
  } catch (e) {
    projectsOK = false;
    updateSaveStatus();
    return;
  }
  const id = localStorage.getItem(CURRENT_KEY);
  if (id && !hasContent()) {
    try {
      if (await loadProject(id)) toast(`Welcome back — “${currentProject.name}” restored.`);
    } catch (e) { toast('The last project could not be restored.'); }
  }
  updateSaveStatus();
  gcImages().catch(() => {});
}

// ---------- Projects dialog ----------
let projThumbUrls = [];
async function openProjects() {
  if (!projectsOK) { toast('Projects need browser storage, which isn’t available here (e.g. private mode).', 4500); return; }
  if (saveDirty) await saveNow();
  openModal('projModal');
  renderProjects();
}
$('projectsBtn').addEventListener('click', openProjects);
async function renderProjects() {
  const list = (await dbAll('projects')).sort((a, b) => b.updated - a.updated);
  projThumbUrls.forEach(u => URL.revokeObjectURL(u));
  projThumbUrls = [];
  const box = $('projList');
  box.innerHTML = '';
  if (!list.length) box.innerHTML = '<p class="muted">No saved projects yet. Add an image and it is saved automatically.</p>';
  list.forEach(rec => {
    const row = document.createElement('div');
    const isCur = currentProject && currentProject.id === rec.id;
    row.className = 'proj' + (isCur ? ' current' : '');
    const img = document.createElement('img');
    img.className = 'pthumb';
    img.alt = '';
    if (rec.thumb) { const u = URL.createObjectURL(rec.thumb); projThumbUrls.push(u); img.src = u; }
    const info = document.createElement('div');
    info.className = 'pinfo';
    const nm = document.createElement('div');
    nm.className = 'pname';
    nm.textContent = rec.name;
    if (isCur) { const t = document.createElement('span'); t.className = 'tag'; t.textContent = 'open'; nm.appendChild(t); }
    const meta = document.createElement('div');
    meta.className = 'pmeta';
    meta.textContent = `${rec.count || 0} panel${rec.count === 1 ? '' : 's'} · ${stamp(rec.updated)}`;
    info.append(nm, meta);
    const open = async () => {
      if (isCur) { closeModal('projModal'); return; }
      closeModal('projModal');
      await loadProject(rec.id);
    };
    img.addEventListener('click', open);
    info.addEventListener('click', open);
    info.title = img.title = isCur ? 'This project is open' : 'Open this project';
    const btns = document.createElement('div');
    btns.className = 'pbtns';
    const mk = (label, title, fn, danger) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'icon small' + (danger ? ' danger' : '');
      b.textContent = label;
      b.title = title;
      b.addEventListener('click', fn);
      btns.appendChild(b);
    };
    mk('✎', 'Rename', () => renameProject(rec));
    mk('⧉', 'Duplicate (independent copy)', () => duplicateProject(rec));
    mk('⇩', 'Export as .mememe file', () => exportProject(rec.id));
    mk('🗑', 'Delete', () => deleteProject(rec), true);
    row.append(img, info, btns);
    box.appendChild(row);
  });
  if (navigator.storage && navigator.storage.estimate) {
    try {
      const est = await navigator.storage.estimate();
      const mb = (n) => (n / 1048576).toFixed(n > 1048576 * 100 ? 0 : 1) + ' MB';
      $('projStorage').textContent = `${list.length} project${list.length === 1 ? '' : 's'} · using ${mb(est.usage || 0)}${est.quota ? ' of about ' + mb(est.quota) : ''} in this browser.`;
    } catch (e) { $('projStorage').textContent = ''; }
  }
}
async function renameProject(rec) {
  const name = prompt('Project name:', rec.name);
  if (!name || !name.trim()) return;
  rec.name = name.trim().slice(0, 80);
  await dbPut('projects', rec);
  if (currentProject && currentProject.id === rec.id) { currentProject.name = rec.name; updateSaveStatus(); }
  renderProjects();
}
async function duplicateProject(rec) {
  const copy = Object.assign({}, rec, { id: uid(), name: rec.name + ' (copy)', created: Date.now(), updated: Date.now() });
  await dbPut('projects', copy);
  toast(`Duplicated as “${copy.name}”.`);
  renderProjects();
}
async function deleteProject(rec) {
  if (!confirm(`Delete “${rec.name}”? This can't be undone (export it first if you want a backup).`)) return;
  const isCur = currentProject && currentProject.id === rec.id;
  await dbDel('projects', rec.id);
  if (isCur) { saveDirty = false; currentProject = null; await newProject(); }
  await gcImages();
  renderProjects();
}
$('projNewBtn').addEventListener('click', async () => { closeModal('projModal'); await newProject(); });
$('projImportBtn').addEventListener('click', () => $('projImportInput').click());
$('projImportInput').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) importProjectFile(f); });
$('deleteProjectsBtn').addEventListener('click', async () => {
  if (!projectsOK) return;
  if (!confirm('Delete ALL saved projects and their images from this browser? This can\'t be undone.')) return;
  if (!confirm('Really delete everything?')) return;
  saveDirty = false;
  clearTimeout(saveTimer);
  await dbClear('projects');
  await dbClear('images');
  savedImgs.clear();
  currentProject = null;
  await newProject();
  toast('All projects deleted.');
});

// ---------- .mememe files (a plain ZIP: project.json + images/) ----------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
// Uncompressed ("stored") ZIP — images are already compressed anyway.
function zipStore(files) {
  const enc = new TextEncoder();
  const now = new Date();
  const time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, f.data.length, true); lh.setUint32(22, f.data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(lh.buffer, name, f.data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, f.data.length, true); ch.setUint32(24, f.data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(ch.buffer, name);
    offset += 30 + name.length + f.data.length;
  });
  const cdSize = central.reduce((a, b) => a + b.byteLength, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob(parts.concat(central, [end.buffer]), { type: 'application/zip' });
}
async function unzip(buf) {
  const dv = new DataView(buf);
  let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 65557); i--) { if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; } }
  if (e < 0) throw new Error('not a zip');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder();
  const out = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad zip');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(buf, p + 46, nlen));
    p += 46 + nlen + xlen + clen;
    const start = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    let data = new Uint8Array(buf, start, csize);
    if (method === 8) {
      if (!window.DecompressionStream) throw new Error('compressed zip not supported');
      data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else if (method !== 0) throw new Error('unsupported zip method');
    out[name] = data;
  }
  return out;
}
const extFor = (type) => ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif', 'image/bmp': 'bmp' }[type] || 'bin');
async function exportProject(id) {
  if (currentProject && currentProject.id === id && saveDirty) await saveNow();
  const rec = await dbGet('projects', id);
  if (!rec) return;
  const files = [];
  const meta = [];
  for (const imgId of rec.imageIds || []) {
    const r = await dbGet('images', imgId);
    if (!r) continue;
    const file = `images/${imgId}.${extFor(r.blob.type)}`;
    files.push({ name: file, data: new Uint8Array(await r.blob.arrayBuffer()) });
    meta.push({ id: imgId, file, type: r.blob.type, name: r.name, credit: r.credit, w: r.w, h: r.h });
  }
  const st = JSON.parse(rec.state);
  const fontIds = new Set([st.layout && st.layout.cap && st.layout.cap.font, st.layout && st.layout.num && st.layout.num.font].concat((st.elements || []).map(e => e.font)).filter(f => f && f.startsWith('cf-')));
  const fonts = [];
  for (const fid of fontIds) {
    const f = await dbGet('fonts', fid);
    if (!f) continue;
    const file = `fonts/${fid}.font`;
    files.push({ name: file, data: new Uint8Array(await f.blob.arrayBuffer()) });
    fonts.push({ id: fid, name: f.name, file });
  }
  const json = { app: 'mememe', format: 1, appVersion: APP_VERSION, name: rec.name, created: rec.created, updated: rec.updated, state: st, images: meta, fonts };
  files.unshift({ name: 'project.json', data: new TextEncoder().encode(JSON.stringify(json)) });
  const blob = zipStore(files);
  const safe = rec.name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'project';
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = safe + '.mememe';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
async function importProjectFile(file) {
  if (!projectsOK) { toast('Projects need browser storage, which isn’t available here.'); return; }
  try {
    const files = await unzip(await file.arrayBuffer());
    if (!files['project.json']) throw new Error('no project.json');
    const json = JSON.parse(new TextDecoder().decode(files['project.json']));
    if (json.app !== 'mememe' || !json.state) throw new Error('not a mememe project');
    const recs = [];
    (json.images || []).forEach(m => {
      const data = files[m.file];
      if (!data || savedImgs.has(m.id)) return;
      recs.push({ id: m.id, blob: new Blob([data], { type: m.type || 'application/octet-stream' }), name: m.name || 'image', credit: m.credit || '', w: m.w, h: m.h });
    });
    if (recs.length) { await dbPut('images', recs); recs.forEach(r => savedImgs.add(r.id)); }
    for (const f of json.fonts || []) {
      if (!files[f.file] || FONTS.some(x => x.id === f.id)) continue;
      const fr = { id: f.id, name: f.name || 'Font', blob: new Blob([files[f.file]]) };
      try { await registerFontRecord(fr); await dbPut('fonts', fr); } catch (e) { /* skip broken font */ }
    }
    populateFontSelects();
    const existing = await dbAll('projects');
    let name = json.name || file.name.replace(/\.[^.]+$/, '');
    if (existing.some(p => p.name === name)) name += ' (imported)';
    const st = json.state;
    const ids = idsOfState(st);
    const rec = { id: uid(), name, created: json.created || Date.now(), updated: Date.now(), state: JSON.stringify(st), imageIds: ids, count: (st.panels || []).length, thumb: null };
    await dbPut('projects', rec);
    closeModal('projModal');
    await loadProject(rec.id);
    saveDirty = true;      // creates the thumbnail
    saveNow();
    toast(`Imported “${name}”.`);
  } catch (err) {
    toast('That file could not be opened as a mememe project.', 4000);
  }
}

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
$('menuProjectsBtn').addEventListener('click', () => { menu.style.display = 'none'; openProjects(); });

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

$('resetSettingsBtn').addEventListener('click', () => {
  if (!confirm('Reset all settings (theme, default format & resolution, view options, template source) to their defaults? Your current composition stays.')) return;
  try { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem('mememe-theme'); } catch (e) { /* ignore */ }
  Object.assign(settings, { format: 'png', quality: 90, width: '1080', snap: true, downscale: true, tplSource: 'imgflip', side: 'auto', pin: false });
  setTheme('dark');
  $('exFormat').value = settings.format; $('setFormat').value = settings.format; $('exQuality').value = settings.quality;
  $('setWidth').value = settings.width; $('setSide').value = settings.side;
  $('setSnap').checked = settings.snap; $('setDownscale').checked = settings.downscale;
  applyLayoutMode(); updateValueLabels();
  toast('Settings reset to defaults.');
});

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
document.addEventListener('fullscreenchange', () => { fsBtn.classList.toggle('active', !!document.fullscreenElement); applyLayoutMode(); });

window.addEventListener('beforeunload', (e) => {
  // with working storage, work is autosaved — only warn if something is still pending
  if ((projectsOK ? saveDirty : hasContent())) { saveNow(); e.preventDefault(); e.returnValue = ''; }
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && saveDirty) saveNow(); });

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
syncDrawUI();
ensureUsedFonts();
ensureFont('emoji');
ensureFont('anton');
ensureFont('comic');
if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', scheduleRender);
applyLayoutMode();
commit();
syncAll();
initProjects();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
