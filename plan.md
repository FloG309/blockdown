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

## Open questions

- [ ] Should Escape render or just blur? (Feature 3 — see above)
- [ ] Should rubber band selection update `currentSelectedIndex`? If multiple blocks are selected, which one is "current" for arrow-key navigation? Likely the last (bottommost) one.
- [ ] Any other features to add before starting implementation?
