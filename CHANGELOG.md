# Changelog

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
