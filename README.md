# mememe

*To Me, or not to Me, that's the Meme!*

A privacy-friendly web app for making memes, image grids, mosaics, comic pages and illustrated storylines — entirely in your browser. Your images are never uploaded.

**Live at:** [meme.michels.world](https://meme.michels.world)

## Features

### Images & panels
- Add one or many images by tapping, drag & drop (onto the drop zone or the canvas) or pasting from the clipboard
- **Blank panels** — plain colored panels for text next to an image (e.g. the classic two-column "no / yes" meme)
- Panel strip with thumbnails; tap one to select it
- Per panel: caption / subtitle, fit (fill & crop, letterbox, stretch), zoom, crop position (sliders **or** drag inside the selected image), mirror, move earlier/later, replace image, remove
- Big photos are downscaled to 2560 px on import to save memory (can be turned off in Settings)

### Layout
- **Presets:** Classic meme, Caption on top, Two columns, Grid, Mosaic, Comic page, Storyline
- Columns: auto or 1–6
- **Same size cells** — every image gets the same cell size (ratio like the first image, 1:1, 4:3, 3:4, 16:9 or 9:16), so differently sized pictures line up in a clean grid
- **Original ratios (mosaic)** — images keep their aspect ratio; each row is scaled to the full width
- In same-size mode a panel can span several columns (wide comic panels)
- Output width (720 / 1080 / 1440 / 2048 px or like the first image), gap, outer margin, background color, panel frame (color & width) and rounded corners

### Captions & subtitles
- One caption per panel, styled globally: on the image (bottom like a movie subtitle, or top like a comic narration box) or as a bar above / below the image
- Font, size, color, outline, background box (color & opacity), alignment, bold / italic / UPPERCASE

### Text
- Free text boxes anywhere on the canvas — drag to move, drag the corner handle to change the width, double-tap to edit
- Font, size, color, outline ("frame around the letters"), background box with opacity, alignment, bold / italic / UPPERCASE, drop shadow, rotation
- **Top/Bottom** button adds the classic meme text pair (Anton/Impact style, white with black outline) to the selected panel or the whole canvas
- New texts reuse the style of the last edited text

### Speech bubbles (comic script)
- Shapes: speech (oval), speech (rounded box), thought (cloud), shout (spiky), whisper (dashed), caption box (narration)
- Fill color & opacity (fully transparent to opaque), border color & width, tail on/off — drag the orange handle to point the tail at the speaker
- Auto height (bubble grows with the text) or free resizing via the corner handle
- Same text styling as text boxes; bring forward / send backward / duplicate / delete

### Fonts
- Bundled (offline, SIL OFL): Anton (Impact-style), Comic Relief, Archivo Black, Montserrat, Bitter, Anonymous Pro — plus system Impact, system sans and handwriting fallbacks
- Load your own font file (.ttf / .otf / .woff / .woff2) with the **＋** button next to the font menu (kept for the current session)

### Templates (optional, third party)
- **Templates…** opens a picker with two sources: **Imgflip** (top 100 popular templates) and **Memegen.link** (open-source catalogue), with a filter field
- Nothing is requested until you press **Load**. The app then contacts that site directly (`no-referrer`, no cookies). A notice explains that the images may be copyrighted
- Images can also be added from any `https://` address — this only works if the site allows other web apps to use its images (CORS). If a site blocks it, the app offers a link to open the image so you can save and add it manually

### Editing & export
- Undo / redo (40 steps), keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z, Delete, arrow keys (Shift = 10 px), Esc
- Snap to the horizontal / vertical center while dragging (Settings)
- Export as PNG, JPG or WebP (quality slider); falls back to PNG if a format isn't supported. File name: `mememe_YYYYMMDD_HHMMSS.ext`
- **Share…** button on devices that support sharing files (e.g. Android, iOS)
- Warning before an accidental reload discards your work

### General
- Dark mode by default, light mode via the menu; Settings and About in the menu; fullscreen toggle
- Installable PWA, works offline (service worker, stale-while-revalidate)
- Mobile-first layout

## How it works

Everything is drawn onto a single `<canvas>`. The layout engine computes the panel rectangles (same-size grid with column spans, or justified rows for the mosaic), adds caption bars where needed, then draws panels, captions, texts and bubbles in that order. Text and bubble positions are stored relative to the canvas width, so changing the output width scales everything consistently, and adding panels below doesn't move existing bubbles.

Speech bubbles are drawn on a small scratch canvas: the body and tail are stroked with double the border width, the interior is punched out (`destination-out`) and then filled. That gives one seamless outline around body + tail and allows semi-transparent fills.

Decoded images are kept outside the serializable state, so undo/redo only snapshots a small JSON description of the composition. Exports are rendered at full resolution on a separate canvas without selection handles. Very tall compositions are automatically reduced to stay under mobile browser canvas limits (~16 megapixels).

## Files

- `index.html` — markup
- `style.css` — styling and `@font-face` rules
- `app.js` — app logic
- `sw.js` — service worker (offline support)
- `manifest.json` — PWA manifest
- `netlify.toml` — security headers (CSP allows `https:` images/requests for templates and web addresses)
- `fonts/` — bundled WOFF fonts, `OFL.txt` license and `README.md` with copyrights
- `icons/` — `favicon-16x16.png`, `favicon-32x32.png`, `apple-touch-icon.png`
- Repo root — `favicon.ico`, `android-chrome-192x192.png`, `android-chrome-512x512.png`

## Browser support

Works in current Chrome, Edge, Firefox and Safari (desktop and mobile). Formats the browser can't decode (e.g. HEIC outside Safari) can't be added. Animated GIFs are used as a still image (first frame). WebP export isn't available in older Safari versions (falls back to PNG).

## Credits

Fonts are licensed under the SIL Open Font License — see `fonts/README.md`. Meme templates belong to their respective owners; template lists are provided by [Imgflip](https://imgflip.com/api) and [Memegen.link](https://memegen.link).
