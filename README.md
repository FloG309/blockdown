# Blockdown

A block-based markdown editor inspired by Jupyter notebooks. Edit rendered markdown in-place by dropping individual blocks into edit mode — no side-by-side split, no raw/preview toggle.

**[Try it live](https://flog309.github.io/blockdown/editor/editor.html)** (GitHub Pages)

## What it does

Blockdown renders your markdown as styled HTML, then lets you click into any block (heading, paragraph, list, code block, table, etc.) to edit the underlying markdown directly. Press Escape or Shift+Enter to render it back. Navigate between blocks with arrow keys, select multiple blocks, copy/paste, undo/redo — all without leaving the rendered view.

## Features

- **Block navigation** — Arrow keys move between blocks. Shift+Arrow multi-selects. Click or rubber-band to select.
- **In-place editing** — Press Enter on any block to open a CodeMirror 6 editor with syntax highlighting, then Escape to render back.
- **Rubber band selection** — Click and drag to lasso-select blocks. Also creates a native text selection for Ctrl+C.
- **Text selection** — Shift+Right/Left extends a word-by-word text selection within selected blocks. Blocks grow automatically when the selection reaches a boundary.
- **Copy & paste** — `c`/`v`/`x` for block-level copy/paste/cut. Ctrl+C/V for plain text copy/paste to the system clipboard.
- **Undo / redo** — Ctrl+Z / Ctrl+Y with snapshot-based history (50 levels).
- **Mermaid diagrams** — Fenced `mermaid` blocks render as interactive SVGs with resize, zoom, and pan.
- **Syntax highlighting** — Code blocks auto-highlight via Highlight.js.
- **Customizable shortcuts** — All keyboard shortcuts are remappable from the settings panel.
- **Dark mode** — Toggle between light and dark themes. Layout settings (font size, line height, spacing, content width) persist in localStorage.
- **No frameworks, no build step** — Pure HTML/CSS/JS. The only build artifact is the pre-bundled CodeMirror IIFE.

## Quick start

```bash
git clone https://github.com/FloG309/blockdown.git
cd blockdown
npm install
node serve.js
```

Open [http://localhost:3999/editor/editor.html](http://localhost:3999/editor/editor.html)

Or just open `editor/editor.html` directly in a browser (requires internet for CDN libraries).

## Keyboard shortcuts

All shortcuts below are the defaults. They can be changed from the settings panel (gear icon > Shortcuts).

### Block mode (rendered view)

| Key | Action |
|-----|--------|
| Arrow Up/Down | Navigate between blocks |
| Shift+Arrow Up/Down | Multi-select blocks |
| Enter | Edit the selected block(s) |
| Escape | Deselect all |
| `a` / `b` | Insert new block above / below |
| `c` / `v` / `x` | Copy / paste / cut blocks (internal clipboard) |
| `d d` | Delete selected blocks |
| Ctrl+A | Select all blocks |
| Ctrl+C | Copy text to system clipboard |
| Ctrl+V | Paste text from system clipboard |
| Ctrl+Z / Ctrl+Y | Undo / redo |
| Shift+Right/Left | Extend text selection word by word |
| Ctrl+= / Ctrl+- | Increase / decrease font size |
| Ctrl+Shift+L | Cycle theme |

### Edit mode (inside CodeMirror)

| Key | Action |
|-----|--------|
| Escape | Exit editor, keep block selected |
| Shift+Enter | Render and exit editor |
| Arrow Up/Down (at edge) | Step out of editor to adjacent block |
| Tab | Insert 4 spaces |
| Ctrl+Z / Ctrl+Y | Undo / redo (editor-level) |

## Architecture

```
editor/
  editor.html           Entry point HTML (CDN libs + all JS/CSS)
  base.js               Init, keydown dispatcher, Turndown config
  events.js             Block operations, selection, rendering
  keybindings.js        Remappable shortcut registry (localStorage)
  settings.js           Settings popover, keybinding panel, theme
  rubberband.js         Lasso drag-selection + native text selection
  undo.js               Snapshot-based undo/redo
  mermaid.js            Mermaid diagram rendering, resize, zoom, pan
  styles.css            All styling via CSS custom properties
  codemirrorSetup.src.js  CodeMirror 6 source (bundled by esbuild)
  codemirrorBundle.js     Pre-built IIFE bundle (checked in)
tests/
  editor.spec.js        Playwright E2E tests (97 tests)
serve.js                Minimal Node.js static file server
```

### Key design decisions

- **No frameworks** — Pure DOM manipulation. Small footprint, no toolchain to configure.
- **Block-level editing** — Treats rendered markdown as discrete block elements. Edit one at a time or select many.
- **CSS custom properties** — All colors, sizing, and spacing driven by variables. Themes are a single attribute swap.
- **CDN libraries** — Marked.js, Turndown.js, Highlight.js, and Mermaid loaded from CDN. No local bundling needed.
- **Snapshot undo** — Captures full `#preview` innerHTML before destructive actions. Simple and reliable.

## Running tests

```bash
npx playwright test
```

Playwright auto-starts the dev server. Tests cover rendering, selection, navigation, edit mode, copy/paste, undo/redo, rubber band, mermaid, syntax highlighting, layout settings, and keybinding customization.

## Building the CodeMirror bundle

Only needed if you modify `editor/codemirrorSetup.src.js`:

```bash
npx esbuild editor/codemirrorSetup.src.js --bundle --format=iife --outfile=editor/codemirrorBundle.js
```

## Deploying

**GitHub Pages** — Push to `main`, enable Pages in repo settings pointing to the root. The editor is then live at `https://<user>.github.io/blockdown/editor/editor.html`.

**Self-hosted** — Any static file server works. `node serve.js` on port 3999, or nginx, Caddy, etc.

## License

ISC
