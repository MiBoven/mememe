# mememe

*To Me, or not to Me, that's the Meme!*

A privacy-friendly web app for making memes, image grids, mosaics, comic pages and illustrated storylines — entirely in your browser. Your images are never uploaded.

**Live at:** [meme.michels.world](https://meme.michels.world)

## Features

### Images & panels
- Add one or many images by tapping, drag & drop (onto the drop zone or the canvas) or pasting from the clipboard
- **Blank panels** — plain colored panels (color picker + color code) for text next to an image, e.g. the classic two-column "no / yes" meme
- Panel strip with thumbnails: tap to select, **drag & drop to reorder** (long-press first on touch screens)
- Per panel: caption / subtitle, fit (fill & crop, letterbox, stretch), mirror, move earlier/later, replace image, remove; under *More options*: zoom, crop position (or drag inside the selected image), column span, own number label / colors / hide badge
- Very large photos are downscaled to 4096 px on import to save memory (can be turned off in Settings)

### Layout
- **Presets:** Classic meme, Caption on top, Two columns, Grid, Mosaic, Comic page, Storyline
- Columns: auto or 1–6
- **Same size cells** (ratio like the first image, 1:1, 4:3, 3:4, 16:9 or 9:16) or **Original ratios (mosaic)**; in same-size mode a panel can span several columns
- **Resolution:** 720 – 4096 px wide, like the first image, or **all images at original size** — the width is chosen so no image loses pixels. Results above the browser limit (≈16 MP on phones, ≈40 MP on desktop) are scaled down evenly; the result size is shown above the download button
- Background color for letterboxed images and empty areas

### Frame & spacing
- Lines **between the images** and an **outer frame**, each with its own color and width
- *More options:* an edge drawn on every image (comic look) and rounded corners

### Numbering
- One switch puts a badge on every image — default: numbers in a circle, top left
- Styles 1 2 3 / A B C / a b c / I II III, size and colors; *More options:* circle / rounded square / text only, font, border, position (3×3) and distance to the edge
- Per image: own label (e.g. "1a"), own colors or hidden; numbering continues automatically after reordering

### Captions & subtitles
- One caption per panel, styled globally: on the image (bottom like a movie subtitle, or top like a comic narration box) or as a bar above / below the image
- Font, size, color; *More caption options:* outline, background box (color & opacity), alignment, bold / italic / UPPERCASE
- Caption and number sizes are relative to one column, so they stay readable in big grids

### Text & speech bubbles
- Texts and bubbles **belong to the image they sit on**: their position and size are relative to that image, they move along when images are reordered and switch images automatically when dragged onto another one. Optionally attach them to the whole canvas instead
- Drag to move, drag the corner handle to resize, double-tap to edit; "+ Text" / "+ Bubble" put the cursor straight into the text field
- **Snapping** to the centers and edges of images and the canvas — an element's edge snaps to an image's edge (can be turned off in Settings)
- Font, size, color, outline ("frame around the letters"), alignment, bold / italic / UPPERCASE
- *More options:* position buttons (3×3: top / middle / bottom × left / center / right, with distance to the edge), attach to image or canvas, clip at the image edge, **auto-fit** (shrink the text so it fits its box — can be switched off), background box with opacity, drop shadow, rotation
- **Top/Bottom** adds the classic meme text pair (Anton/Impact style, white with black outline) to the selected image or the whole canvas
- Bubble shapes: speech (oval), speech (rounded box), thought (cloud — one continuous outline), shout (spiky), whisper (dashed), caption box (narration); fill color & opacity, border, tail with draggable tip, auto height or free size
- New texts / bubbles reuse the style of the last edited one

### Detail view
- Double-tap an image (or press 🔍) to zoom into it and place elements precisely; ◀ ▶ steps through the images, ✕ / Esc / double-tap returns to the overview

### Fonts
- Bundled (offline, SIL OFL): Anton (Impact-style), Comic Relief, Archivo Black, Montserrat, Bitter, Anonymous Pro — plus system Impact, system sans and handwriting fallbacks
- Load your own font file (.ttf / .otf / .woff / .woff2) with the **＋** button next to the font menu (kept for the current session)

### Templates & free images (optional, third party)
- **Imgflip** (top 100 popular memes) and **Memegen.link** (~200 classic memes) — loaded as a list, filterable
- **Reddit r/MemeTemplatesOfficial** (experimental — older and niche templates; empty search = all-time top), **Wikimedia Commons** (public-domain art & old photos) and **Openverse** (openly licensed images) — searchable, with suggestion chips and author / license credits
- Thumbnails are shown in chunks of 36 with a "Show more" button, so no source loads hundreds of images at once
- Nothing is requested until you press **Load** / **Search**. Requests go directly from your device (`no-referrer`, no cookies). If the full image is blocked, a smaller preview is used where available; otherwise the app offers a link to save the image and add it manually
- Images can also be added from any `https://` address (works only if that site allows it via CORS)

### Editing & export
- Undo / redo (40 steps), keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z, Delete, arrow keys (Shift = 10 px), Esc
- Clicking outside the canvas and the editing controls deselects everything
- Click a setting's label to reset it to its default; every control has a tooltip
- Export as PNG, JPG or WebP (quality slider); falls back to PNG if a format isn't supported. File name: `mememe_YYYYMMDD_HHMMSS.ext`
- **Share…** button on devices that support sharing files
- Warning before an accidental reload discards your work

### General
- Side-by-side view on wide landscape screens: canvas fixed on the left, settings on the right (Auto / Always / Never in Settings)
- 📌 pins the canvas to the top while scrolling the settings (portrait)
- Rarely used settings are tucked away under *More options*; Layout, Frame & spacing and Numbering start collapsed
- Dark mode by default, light mode via the menu; Settings and About in the menu; fullscreen toggle
- Faster preview on phones (the on-screen canvas renders at screen resolution, exports at full size)
- Installable PWA, works offline (service worker, stale-while-revalidate)

## How it works

Everything is drawn onto a `<canvas>`. The layout engine computes the panel rectangles (same-size grid with column spans, or justified rows for the mosaic), adds caption bars where needed, then draws the outer frame, the lines between images, panels, captions, number badges, texts and bubbles in that order.

Each text / bubble stores the id of the image it belongs to; its position is a fraction of that image's width / height and its sizes are relative to the image width. When it is dragged onto another image (or attached to the canvas), its values are converted so it looks exactly the same in the new frame.

The on-screen canvas shows a "view" of the composition: the whole result or, in the detail view, one image plus a small margin. On phones it renders only at screen resolution for speed; exports always render the full composition at full size on a separate canvas without selection handles.

Speech bubbles are drawn on two small scratch canvases: one for the fill (applied with the fill opacity as a whole, so overlapping parts like body + tail never get darker) and one for the border (stroked at double width, interior punched out) — one seamless outline around body + tail.

Decoded images are kept outside the serializable state, so undo/redo only snapshots a small JSON description of the composition.

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
