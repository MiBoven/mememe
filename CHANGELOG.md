# Changelog

### 1.0.0 — 2026-11-23 — First stable release
- **Elements list** (collapsed, only shown when there are elements): all texts, bubbles, stickers, shapes and drawings — topmost first — for the selected image or the whole composition; select, hide / show, delete
- **🧲 Magnet** button in the toolbar to switch snapping on and off (same setting as in Settings)
- **↗ Share** is always available: shares the file on phones, copies the image to the clipboard on desktop
- Unfilled shapes can now be clicked through — only their outline selects them, so elements behind them stay reachable
- Emoji: new groups People, Nature, Activities, Travel and **Flags**; **Recently used** and **Most used** emoji on top
- **★ My stickers:** your own pictures are kept in the browser for all projects (add several at once, remove them again); a picture on the canvas can be saved there with “★ Save”
- Template search suggestions are labelled “Examples” with an explanation
- **❓ Help** in the menu with tips & gestures, plus a one-time welcome hint
- Link preview image with a dark background (chat apps showed the transparent logo corners in white)
- Visible keyboard focus outlines

### 0.5.1 — 2026-11-23 — Link previews
- Added Open Graph / Twitter meta tags so shared links show the logo, the title with subtitle and a short description in chats (WhatsApp, Signal, Telegram, …) and social media

### 0.5.0 — 2026-11-23 — Real eraser, shapes, filters
- **Real eraser:** rubs out parts of a drawing pixel by pixel (each drawing is painted on its own layer, so the image below is never touched); every eraser stroke can be undone
- **+ Shape:** rectangle (with rounded corners), ellipse, line and arrow — fill on/off with color and opacity, line color and width, dashed lines, arrow heads at the end / start / both ends, rotation and opacity; lines and arrows have two draggable end handles (Shift = 15° steps)
- **Filters** for every image and picture: brightness, contrast, saturation, black & white, sepia, blur and a “Deep fried 🔥” look (over-saturated, grainy, JPEG-crunched); presets None, B & W, Noir, Sepia, Vivid, Faded, Dreamy, Deep fried; “Hold: before” to compare; filtered versions are cached, exports always wait for them
- Browsers without canvas filters (older Safari) get a built-in pixel fallback

### 0.4.0 — 2026-11-23 — Stickers, drawing, zoom, rotation, comic rows
- **+ Sticker:** ~400 emoji (scale like stickers, optional outline), 8 built-in vector stickers (red arrow, red circle, pixel sunglasses, laser eye, censor bar, heart, crown, star burst) and your own pictures (PNG, JPG, WebP, SVG, GIF first frame, …) on top of the images
- **Opacity** for every element (text, bubble, emoji, picture, drawing); rotation for texts, pictures and drawings (−180° … 180°)
- **Freehand drawing** (✏️): pen, translucent marker and stroke eraser, colors, size, opacity; every image gets its own drawing, which afterwards can be moved, resized, rotated, faded or continued (“Draw more”)
- **Zoom & move the view:** pinch with two fingers, Ctrl + wheel / trackpad pinch, + / − / 1× buttons on the canvas; move around with two fingers, the wheel, Space + drag or the middle mouse button — also inside the detail view
- **Rotate images** in 90° steps (⟲ ⟳) and straighten them (−45° … 45°, under More options)
- **Comic rows (custom):** new cell mode with rows of different panel counts and heights, ready-made page layouts (1·4·1, 2·3·2, 1·2·2, 2·1·2, 3·3·3, Big + 2, Strip of 4) and a per-panel width share; the Comic page preset uses it
- **Bring to front / send to back** for elements, next to the one-step buttons
- Rows that aren't full are filled with the line color (when lines between images are on)
- Custom fonts are now stored in the browser (available in all projects after reloading) and travel inside exported `.mememe` files
- “All images at original size” now uses an exact calculation for every layout mode
- Fixed: very long words / emoji are no longer split in the middle of a character

### 0.3.0 — 2026-11-23 — Projects
- Projects are saved automatically in the browser (IndexedDB, images included) about a second after every change, and when the tab is hidden or closed
- The last open project is restored automatically when the app is opened again
- New 📁 Projects dialog (button next to “Blank panel” and in the menu): open, rename, duplicate (independent copy), export, delete, start a new project; shows how much storage is used
- Export / import projects as `.mememe` files (a plain ZIP with `project.json` and the images, written by the app itself — no library); `.mememe` files can also be dropped onto the app
- “Start over” is now “＋ New project” — the previous project stays saved
- Settings: “Delete all projects…” (with double confirmation)
- Save status shown above the download button; images no longer referenced by any project are cleaned up automatically

### 0.2.1 — 2026-11-23 — Polish: fullscreen side view, transparent background
- Side-by-side view “Auto” now only kicks in while fullscreen is on (and the screen is wide); in the side view the toolbar moves to the right column with the other controls
- The header stays fixed at the top in fullscreen
- Selected images and blank panels can be removed with Del / Backspace
- New ⚙ button next to an image's caption jumps to the caption style settings; “Captions & subtitles” renamed to “Captions” (a subtitle is just the caption placed at the bottom of the image)
- Background opacity: the layout background can be (semi-)transparent for PNG / WebP; JPG exports get a white background instead
- Settings: “Reset all settings…” (with confirmation)
- Thought bubbles: bumps are spaced along the outline, so flat or small clouds get fewer, round bumps instead of squashed ones
- Fixed a thin vertical line that could appear at the edge of bubbles (stale pixels on the scratch canvas)
- Fixed missing spacing between some rows (e.g. Resolution / Cells, text field / Shape)

### 0.2.0 — 2026-11-23 — Bound elements, detail view, numbering, frames
- Texts and bubbles now belong to the image they sit on: positions and sizes are relative to that image, they move along when images are reordered and switch images automatically when dragged onto another one (or can be attached to the whole canvas)
- Detail view: double-tap an image (or 🔍) to zoom into it for precise placing; ◀ ▶ to step through images
- Snapping to image/canvas centers **and** edges (an element's edge snaps to an image's edge)
- Position buttons (3×3) with distance to the edge, “Clip at image edge” and “Auto-fit” (shrink text to fit its box) under “More options”
- Numbering: badges on every image (1 2 3 / A B C / a b c / I II III), circle / square / text only, size, colors, border, position; per-image own label, colors or hiding
- New “Frame & spacing” section: separate color and width for the lines between images and for the outer frame; image edge and corners moved there
- Resolution up to 4096 px plus “All images at original size” (with an on-screen note about the browser limit); result size shown above the download button; import limit raised to 4096 px
- Faster preview on phones: the on-screen canvas only renders at screen resolution, exports stay full size
- Thought bubbles are now one continuous cloud outline; semi-transparent bubbles no longer show darker overlapping areas
- Panel strip: reorder images by drag & drop (long-press first on touch screens)
- Side-by-side view on wide landscape screens (canvas left, settings right; Auto / Always / Never in Settings) and a 📌 button to pin the canvas while scrolling in portrait
- Blank panels: color code input next to the color picker
- Clicking outside the canvas and the editing controls deselects everything
- “+ Text” / “+ Bubble” put the cursor straight into the text field
- Fixed: switching between two text elements now always shows the right text
- Layout, Frame & spacing and Numbering are collapsed by default; rarely used settings moved into “More options”
- Tooltips on all controls; clicking a setting's label resets it to its default
- Templates: three new sources — Reddit r/MemeTemplatesOfficial (experimental), Wikimedia Commons and Openverse — with search, suggestions, license/author credits, and thumbnails loaded in chunks of 36 (“Show more”) instead of all at once

### 0.1.0 — 2026-11-23 — Initial release
- Canvas-based composer for memes, grids, mosaics, comic pages and storylines
- Add images via picker, drag & drop or paste; blank color panels; panel strip with reordering
- Layout: columns (auto / 1–6), same-size cells with selectable ratio or original-ratio mosaic, column spans, fit modes, gap, margin, background, frame and rounded corners
- Seven presets: Classic meme, Caption on top, Two columns, Grid, Mosaic, Comic page, Storyline
- Per-panel captions/subtitles (on image top/bottom or as a bar above/below) with global styling
- Free text boxes with font, size, color, outline, background box, alignment, bold/italic/uppercase, shadow and rotation; classic Top/Bottom text button
- Speech bubbles: oval, rounded, thought, shout, whisper, caption box — fill & opacity, border, draggable tail, auto height or free resize
- Six bundled OFL fonts plus loading your own font file
- Optional templates from Imgflip and Memegen.link (only on request, with notice), plus images from a web address
- Per-panel zoom, crop position (drag or sliders) and mirroring
- Undo/redo, keyboard shortcuts, center snapping
- Export as PNG/JPG/WebP with quality setting, file sharing on supported devices
- Dark/light theme, settings and about dialogs, fullscreen, installable offline PWA
