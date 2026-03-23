# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Project

This is a static HTML/CSS/JS project with no build step or package manager. To run:

- Serve locally: `node serve.js` then visit `http://localhost:3999/editor/editor.html`
- Or open `editor/editor.html` directly in a browser (requires internet for CDN libs)

Requires internet connectivity — Marked.js (v4.3.0), Turndown.js, and Highlight.js (v11.9.0) are loaded from CDNs.

### Running Tests

Playwright E2E tests in `tests/editor.spec.js`. Run with:

```bash
npx playwright test
```

The Playwright config (`playwright.config.js`) auto-starts `node serve.js` on port 3999.

## Architecture

A block-based markdown editor (Jupyter-style) where rendered content is navigated and edited as discrete block elements rather than editing raw markdown in a single textarea. Pure HTML/CSS/JS — no frameworks, no build step.

### Directory Structure

```
editor/              — Main editor application
  editor.html        — Entry HTML (loads CDN libs + all JS/CSS)
  base.js            — Entry point: default markdown, TurndownService config,
                       DOMContentLoaded handler, keydown dispatcher
  events.js          — All DOM manipulation and event handling:
                       block selection, Enter/Escape edit mode, arrow nav,
                       Shift+Arrow multi-select, insert/delete/copy/paste blocks,
                       renderMarkdownPartial(), list merging, syntax highlighting
  undo.js            — Snapshot-based undo/redo (captures #preview innerHTML)
  rubberband.js      — Lasso/rubber-band drag selection over blocks
  styles.css         — All styling: layout, block selection (#e1f0ff),
                       pointer-events for compound blocks, textarea styles
tests/
  editor.spec.js     — Playwright E2E tests (all features)
playwright.config.js — Playwright config (chromium, port 3999)
serve.js             — Minimal Node.js static file server
plan.md              — Feature plan and implementation roadmap
```

### Core Flow

1. **base.js** — Initializes default markdown, configures TurndownService (fenced code blocks, dash bullets), renders via `marked.parse()`, sets up the main `keydown` listener dispatching to handlers in `events.js`.
2. **events.js** — All block-level operations:
   - `setupSelectionHandlers()` — Indexes `#preview` direct children as selectable (h1-h6, p, ul, ol, pre, blockquote, table, hr, textarea). Sets `data-index` and click handlers.
   - `handleEnter()` — Converts selected blocks to a textarea via `turndownService.turndown()`.
   - `renderMarkdownPartial(textarea)` — Parses textarea markdown back to HTML, splices nodes into DOM, handles indented sub-list merging.
   - `handleTextareaEvent()` — Shift+Enter / Escape render and exit. Tab inserts 4 spaces.
   - Navigation: Arrow keys, Shift+Arrow multi-select, `a`/`b` insert textareas, `dd` delete, `c`/`v`/`x` copy/paste/cut.
3. **undo.js** — `pushUndo()` snapshots `#preview.innerHTML` + selection index. `undo()`/`redo()` restore snapshots. Capped at 50 entries.
4. **rubberband.js** — IIFE that adds mousedown/move/up listeners for drag-selection with a visual overlay.
5. **styles.css** — Selected state uses `#e1f0ff` background. Inner elements of compound blocks have `pointer-events: none`.

### Key Globals (defined in base.js, used across files)

- `selectableElements` — Array of current block-level DOM elements in `#preview`
- `currentSelectedIndex` — Index of the currently focused block
- `turndownService` — Shared TurndownService instance

## Workflow Rules

- **Every new feature must be documented in `plan.md`** before implementation begins, following the existing format (problem, goal, implementation details, edge cases, affected files).
- **Every feature must have Playwright test coverage** in `tests/editor.spec.js`. Tests should be written as part of the feature implementation, not as a separate step.
