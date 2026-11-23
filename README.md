# mememe

*To Me, or not to Me, that's the Meme!*

A privacy-friendly web app for making memes, image grids, mosaics, comic pages and illustrated storylines — entirely in your browser. Your images are never uploaded.

**Live at:** [meme.michels.world](https://meme.michels.world)

## Features

### Images & panels
- Add one or many images by tapping, drag & drop (onto the drop zone or the canvas) or pasting from the clipboard
- **Blank panels** — plain colored panels (color picker + color code) for text next to an image, e.g. the classic two-column "no / yes" meme
- Panel strip with thumbnails: tap to select, **drag & drop to reorder** (long-press first on touch screens)
- Per panel: caption, fit (fill & crop, letterbox, stretch), **rotate 90°** (⟲ ⟳), mirror, move earlier/later, replace image, remove (also with Del); under *More options*: zoom, crop position (or drag inside the selected image), **straighten** (−45° … 45°), column span / width share, own number label / colors / hide badge
- Very large photos are downscaled to 4096 px on import to save memory (can be turned off in Settings)

### Layout
- **Presets:** Classic meme, Caption on top, Two columns, Grid, Mosaic, Comic page, Storyline
- Columns: auto or 1–6
- **Same size cells** (ratio like the first image, 1:1, 4:3, 3:4, 16:9 or 9:16), **Original ratios (mosaic)** or **Comic rows (custom)** — rows with their own panel count and height, ready-made page layouts (1·4·1, 2·3·2, Big + 2, …) and a width share per panel; in same-size mode a panel can span several columns
- **Resolution:** 720 – 4096 px wide, like the first image, or **all images at original size** — the width is chosen so no image loses pixels. Results above the browser limit (≈16 MP on phones, ≈40 MP on desktop) are scaled down evenly; the result size is shown above the download button
- Background color and opacity (transparent backgrounds for PNG / WebP; JPG gets white) for letterboxed images and empty areas

### Frame & spacing
- Lines **between the images** and an **outer frame**, each with its own color and width; the empty rest of an unfinished row is filled with the line color
- *More options:* an edge drawn on every image (comic look) and rounded corners

### Numbering
- One switch puts a badge on every image — default: numbers in a circle, top left
- Styles 1 2 3 / A B C / a b c / I II III, size and colors; *More options:* circle / rounded square / text only, font, border, position (3×3) and distance to the edge
- Per image: own label (e.g. "1a"), own colors or hidden; numbering continues automatically after reordering

### Captions
- One caption per panel (⚙ next to the caption field jumps to the caption style), styled globally: on the image (bottom like a movie subtitle, or top like a comic narration box) or as a bar above / below the image
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

### Stickers, emoji & pictures
- **+ Sticker** opens three tabs: ~400 **emoji** (they scale like stickers; an outline gives them a sticker edge), **built-in vector stickers** (red arrow, red circle, pixel “deal with it” sunglasses, laser eye, censor bar, heart, crown, star burst) and **your own picture** — icons, logos, cut-outs, PNG / JPG / WebP / SVG / GIF (first frame)
- Pictures can be resized (keeps the ratio), rotated, mirrored, replaced and faded (opacity), and belong to the image they sit on like texts

### Freehand drawing
- ✏️ switches to drawing: **pen**, translucent **marker** and a real pixel **eraser** (only affects drawings, never the image below), 8 quick colors + color picker, size and opacity
- Every image gets its own drawing; afterwards it behaves like any element (move, resize, rotate, opacity, layer order) and can be continued with “Draw more” or a double-tap
- Undo removes the last stroke

### Shapes
- **+ Shape:** rectangle (rounded corners optional), ellipse, line, arrow
- Fill on/off with color and opacity, line color and width, dashed lines, arrow heads (end / start / both), rotation and opacity
- Lines and arrows: drag the two round end handles (Shift = 15° steps); rectangles and ellipses: corner handle

### Filters
- For every image and every picture (the *Filters* card appears when one is selected): brightness, contrast, saturation, black & white, sepia, blur and **Deep fried 🔥**
- Presets: None, B & W, Noir, Sepia, Vivid, Faded, Dreamy, Deep fried; **Hold: before** shows the original while pressed
- Filtered versions are computed once and cached; exports wait until all filters are ready

### Zoom & view
- Pinch with two fingers, Ctrl + wheel (or trackpad pinch) or the **+ / − / 1×** buttons on the canvas; move the zoomed view with two fingers, the mouse wheel, **Space + drag** or the middle mouse button
- Works in the overview and in the detail view; Esc / 1× resets

### Layer order & opacity
- Every element has an **opacity**; ⇊ ⤓ ⤒ ⇈ send it to the back, one step back, one step forward or to the front

### Detail view
- Double-tap an image (or press 🔍) to zoom into it and place elements precisely; ◀ ▶ steps through the images, ✕ / Esc / double-tap returns to the overview

### Fonts
- Bundled (offline, SIL OFL): Anton (Impact-style), Comic Relief, Archivo Black, Montserrat, Bitter, Anonymous Pro — plus system Impact, system sans and handwriting fallbacks
- Load your own font file (.ttf / .otf / .woff / .woff2) with the **＋** button next to the font menu — it is stored in the browser and available in all projects; exported `.mememe` files include the fonts they use

### Templates & free images (optional, third party)
- **Imgflip** (top 100 popular memes) and **Memegen.link** (~200 classic memes) — loaded as a list, filterable
- **Reddit r/MemeTemplatesOfficial** (experimental — older and niche templates; empty search = all-time top), **Wikimedia Commons** (public-domain art & old photos) and **Openverse** (openly licensed images) — searchable, with suggestion chips and author / license credits
- Thumbnails are shown in chunks of 36 with a "Show more" button, so no source loads hundreds of images at once
- Nothing is requested until you press **Load** / **Search**. Requests go directly from your device (`no-referrer`, no cookies). If the full image is blocked, a smaller preview is used where available; otherwise the app offers a link to save the image and add it manually
- Images can also be added from any `https://` address (works only if that site allows it via CORS)

### Projects
- Everything is **saved automatically** in the browser (IndexedDB, including the images) about a second after each change; the last project is restored when the app is opened again
- **📁 Projects** (next to “Blank panel” and in the menu): open, rename, duplicate, export, delete, start a new project, see the storage used
- **Export / import** as `.mememe` files — a plain, uncompressed ZIP with `project.json` and the images — for backups or to continue on another device; `.mememe` files can also be dropped onto the app
- *Settings → Delete all projects…* removes everything (double confirmation)

### Editing & export
- Undo / redo (40 steps), keyboard shortcuts: Ctrl/Cmd+Z, Ctrl/Cmd+Y or Shift+Ctrl/Cmd+Z, Delete (selected text, bubble, image or blank panel), arrow keys (Shift = 10 px), Esc
- Clicking outside the canvas and the editing controls deselects everything
- Click a setting's label to reset it to its default; every control has a tooltip; *Settings → Reset all settings…* restores factory defaults
- Export as PNG, JPG or WebP (quality slider); falls back to PNG if a format isn't supported. File name: `mememe_YYYYMMDD_HHMMSS.ext`
- **Share…** button on devices that support sharing files
- Warning before closing only if a save is still pending

### General
- Side-by-side view: canvas fixed on the left, toolbar and settings on the right (Auto = in fullscreen on wide screens / Always / Never in Settings); in fullscreen the header stays at the top
- 📌 pins the canvas to the top while scrolling the settings (portrait)
- Rarely used settings are tucked away under *More options*; Layout, Frame & spacing and Numbering start collapsed
- Dark mode by default, light mode via the menu; Settings and About in the menu; fullscreen toggle
- Faster preview on phones (the on-screen canvas renders at screen resolution, exports at full size)
- Installable PWA, works offline (service worker, stale-while-revalidate)

## How it works

Everything is drawn onto a `<canvas>`. The layout engine computes the panel rectangles (same-size grid with column spans, or justified rows for the mosaic), adds caption bars where needed, then draws the outer frame, the lines between images, panels, captions, number badges, texts and bubbles in that order.

Each text / bubble / picture / drawing stores the id of the image it belongs to; its position is a fraction of that image's width / height and its sizes are relative to the image width. When it is dragged onto another image (or attached to the canvas), its values are converted so it looks exactly the same in the new frame.

The on-screen canvas shows a "view" of the composition: the whole result or, in the detail view, one image plus a small margin — optionally zoomed in. On phones it renders only at screen resolution for speed; exports always render the full composition at full size on a separate canvas without selection handles.

Speech bubbles are drawn on two small scratch canvases: one for the fill (applied with the fill opacity as a whole, so overlapping parts like body + tail never get darker) and one for the border (stroked at double width, interior punched out) — one seamless outline around body + tail.

Every drawing is rendered on its own layer, so eraser strokes (`destination-out`) only cut holes into that drawing. Filters are applied with the canvas `filter` property (pixel fallback for older Safari) to a cached copy of the image; “Deep fried” adds grain and two rounds of low-quality JPEG re-encoding. Freehand strokes are stored as point lists relative to the drawing's center (in units of the image width), so they scale and rotate with the drawing and are smoothed with quadratic curves when drawn. Image rotation combines 90° steps with a fine angle; the fill / fit scale is computed for the rotated bounding box.

Decoded images are kept outside the serializable state, so undo/redo only snapshots a small JSON description of the composition.

Projects live in IndexedDB in three stores — `fonts` (custom font files) plus `projects` (name, dates, the JSON state, the ids of the images used, a small JPEG thumbnail) and `images` (one record per image with its blob, shared between duplicated projects). Images that no project references anymore are removed automatically. The `.mememe` export is a stored ZIP built by a small built-in writer (CRC-32 + headers); the importer also accepts deflate-compressed ZIPs via `DecompressionStream`.

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
