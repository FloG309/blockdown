# Editor v2 — Feature Plan

New version will live in a new subfolder (e.g. `v2/`), using `tryout/` as the starting point.

## Design Philosophy

Inspired by the Jupyter notebook UI: rendered markdown blocks that can be edited in-place, not a side-by-side raw/preview split. The user sees clean rendered output and drops into a textarea only for the block they're editing. Must remain **pure HTML/CSS/JS** — no frameworks, no build step, lightweight.

---

## Feature 1: Selection persistence after Escape

**Problem:** Select a block → press Enter (opens textarea for editing) → press Escape → the block loses its selected (marked) state and appears to vanish from selection.

**Goal:** After pressing Escape in a textarea, the block should return to the rendered view AND remain visually selected/marked. The cursor leaves the textarea, but the block stays highlighted as the current selection.

**Affected area:** `handleTextareaEvent()` Escape branch, and potentially `handleEnter()` / `renderMarkdownPartial()`.

---

## Feature 2: Auto-merge adjacent lists

**Problem:** When a rendered list exists (e.g. `- item1\n- item2`), the user inserts a new textarea below it (via `b`), types more list items (`- item3`), and renders with Shift+Enter. The new items appear as a separate `<ul>` block instead of merging with the adjacent list above.

**Goal:** After rendering a textarea, check if the newly created block is a list (`<ul>` or `<ol>`) AND the immediately preceding sibling is a list of the same type. If so, merge the `<li>` items from the new list into the existing one so they form a single block.

**Affected area:** `renderMarkdownPartial()` — add a post-render merge step.

---

## Feature 3: Escape exits textarea and restores marked state

**Problem:** (Related to Feature 1) Pressing Escape in a focused textarea should cleanly: (a) blur the textarea, (b) render the markdown back to HTML, (c) mark/select the resulting block(s).

**Current behavior in code:** Escape calls `textarea.blur()` and adds `.selected` to the textarea element — but the textarea itself stays in the DOM as an unrendered textarea rather than converting back to rendered content.

**Decision needed:** Should Escape *render* the markdown (like Shift+Enter does) and then select the result? Or should it just blur and keep the textarea in the DOM but selected?

**My assumption:** Escape should render (same as Shift+Enter) and then select the resulting block, so the user seamlessly goes from editing back to navigation mode with the block highlighted.

---

## Feature 4: Rubber band (lasso) selection

**Problem:** Currently selection is keyboard-only (Arrow, Shift+Arrow) or single-click. There is no way to select multiple blocks by dragging.

**Goal:** Click and drag on the preview area to draw a selection rectangle (rubber band). On mouse release, all blocks that intersect with the rectangle become selected. This replaces or supplements the existing click-to-select behavior.

**Implementation sketch:**
1. On `mousedown` on `#preview`, record start coordinates, begin drawing a semi-transparent rectangle overlay.
2. On `mousemove`, update the rectangle dimensions.
3. On `mouseup`, compute which selectable block elements overlap with the rectangle (via `getBoundingClientRect()` intersection), mark them as `.selected`, remove the overlay.
4. Should respect modifier keys: plain drag = fresh selection; Shift+drag = add to existing selection (TBD).

---

## Testing Strategy — Playwright

All four features are interaction-heavy (keypresses, mouse drags, DOM state), so **Playwright end-to-end tests** are the primary test approach. No jsdom/Jest — `getBoundingClientRect()` and real keyboard events need a real browser.

**Setup:**
- Requires Node.js 18+ (currently blocked — Node 16 installed, needs upgrade)
- Config: `playwright.config.js` at project root, tests in `tests/` folder
- Serve `v2/editor.html` via Playwright's built-in `webServer` config (uses a simple static server)
- Run with `npx playwright test`, target Chromium only to keep it fast

**Test plan by feature:**

1. **Selection persistence (F1 + F3):**
   - Select a block via Arrow key → verify `.selected` class present
   - Press Enter → verify textarea appears with markdown content
   - Press Escape → verify textarea is gone, rendered block is back, `.selected` class is on the rendered block
   - Variant: select, Enter, edit content, Escape → verify edited content renders and block is selected

2. **Auto-merge lists (F2):**
   - Render a document with a bullet list → verify single `<ul>` block
   - Select the list, press `b` to insert textarea below, type `- new item`, Shift+Enter to render
   - Verify the new items are merged into the existing `<ul>` (still one `<ul>`, not two)
   - Same test for `<ol>`
   - Negative case: inserting a paragraph after a list should NOT merge

3. **Rubber band selection (F4):**
   - Mousedown on empty area above first block, drag across multiple blocks, mouseup
   - Verify all intersected blocks have `.selected` class
   - Verify `currentSelectedIndex` points to the bottommost selected block
   - Verify the rubber band overlay rectangle appears during drag and disappears on release
   - Verify clicking a single block still works (short click, no drag)

---

## Feature 5: Mermaid Diagram Rendering

**Problem:** Mermaid code blocks (` ```mermaid `) render as plain `<pre><code>` blocks like any other code. There is no way to visualize flowcharts, sequence diagrams, etc.

**Goal:** Detect mermaid code blocks after markdown rendering and replace them with interactive SVG diagrams inside a resizable, zoomable, pannable container.

### 5a: Rendering

- Load **Mermaid.js** from CDN (same pattern as Marked.js/Turndown)
- After `marked.parse()` produces `<pre><code class="language-mermaid">`, intercept and call `mermaid.render()` to produce an inline SVG
- Wrap each rendered SVG in a `.mermaid-container` div that acts as the viewport
- Apply to both initial render and `renderMarkdownPartial()` (textarea → rendered block)

### 5b: Resizable Container

- Custom drag handles at all 4 corners of `.mermaid-container`
- Small visual indicators (e.g. triangular or square grip icons) at each corner
- `mousedown` on a handle → `mousemove` updates container width/height → `mouseup` commits
- Container has `overflow: hidden` so the SVG is clipped to the viewport
- Default size: auto-fit to SVG content with a `max-height` cap; user resizes from there
- Min size constraint to prevent collapsing the container to nothing

### 5c: Zoom

- `wheel` event on `.mermaid-container` adjusts a scale factor applied via CSS `transform: scale()`
- Zoom toward cursor position using `transform-origin` computed from pointer coordinates
- Clamp scale to a reasonable range (e.g. 0.25x – 4x)
- Visual zoom level indicator (optional, e.g. small "150%" label in a corner)

### 5d: Pan / Navigate

- Click+drag inside `.mermaid-container` to pan (translate the SVG)
- Track both `scale` and `translate(x, y)`, combine into a single CSS `transform`
- `cursor: grab` at rest, `cursor: grabbing` while dragging
- Pan gestures must NOT trigger block selection or rubber band — stop propagation from inside the container
- **Double-click** to reset zoom to 1x and pan to origin (0, 0)

### 5e: Edit Cycle Integration

- Pressing **Enter** on a selected mermaid block opens a textarea with the raw mermaid source (same as other blocks)
- **Escape** or **Shift+Enter** re-renders the mermaid source back into an interactive SVG container
- The container's resize/zoom/pan state resets on re-render (fresh diagram, fresh viewport)
- Each mermaid block maintains its own independent container with its own zoom/pan state

### Affected areas

- `editor.html` — add Mermaid.js CDN `<script>` tag
- `base.js` — call `mermaid.initialize()` on load
- `events.js` — hook into `renderMarkdownPartial()` and initial render to detect and transform mermaid blocks
- `styles.css` — `.mermaid-container`, resize handles, cursor states, zoom indicator
- New file: `editor/mermaid.js` — all mermaid-specific logic (render, resize, zoom, pan) to keep it modular

### Implementation order

1. Basic rendering (5a) — mermaid blocks become SVGs
2. Resizable container with corner handles (5b)
3. Zoom via scroll wheel (5c)
4. Pan via click+drag, double-click reset (5d)
5. Edit cycle integration and testing (5e)

---

## Bug Fix 1: Mermaid Event Listener Cleanup

**Problem:** When a mermaid container is replaced during the edit cycle (Enter → edit → Escape/Shift+Enter), the `mousemove` and `mouseup` listeners that were added to `document` for resize/pan are never removed. Over repeated edits this causes memory leaks and potential ghost interactions from stale handlers.

**Goal:** Before replacing a mermaid container (in `enterMermaidEditMode()` or anywhere a container is removed from the DOM), clean up all document-level event listeners that were attached by that container's resize and pan logic.

**Affected area:** `mermaid.js` — `setupResize()`, `setupZoomPan()`, and `enterMermaidEditMode()`.

---

## Bug Fix 2: Mermaid Syntax Error UI Feedback

**Problem:** When a user writes invalid mermaid syntax, `mermaid.render()` throws and the error is logged to `console.error()` only. The `<pre><code>` block remains unchanged with no visual indication that rendering failed. The user has no way to know the diagram is broken without opening DevTools.

**Goal:** Show an inline error message to the user when mermaid rendering fails. Display the error text in a styled error block (e.g. red-bordered container with the error message) so the user can see what went wrong and fix their syntax.

**Affected area:** `mermaid.js` — `processMermaidBlocks()` catch block. `styles.css` — new `.mermaid-error` styling.

---

## Bug Fix 3: Encapsulate Global State

**Problem:** `selectableElements`, `currentSelectedIndex`, and `turndownService` are bare globals defined in `base.js` and mutated freely across `events.js`, `rubberband.js`, and `mermaid.js`. This makes the code fragile — any script can silently overwrite state, and there's no single place to inspect or debug state changes.

**Goal:** Wrap shared state in a single `EditorState` object (or module-pattern namespace) that all files reference. Provide getter/setter functions so state changes are explicit and could later support logging or undo hooks.

**Affected area:** `base.js` (define the state object), `events.js`, `rubberband.js`, `mermaid.js` (update all references).

---

## Open questions

- [ ] Should Escape render or just blur? (Feature 3 — see above)
- [ ] Should rubber band selection update `currentSelectedIndex`? If multiple blocks are selected, which one is "current" for arrow-key navigation? Likely the last (bottommost) one.
- [ ] Any other features to add before starting implementation?
