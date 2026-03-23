# Editor — Feature Plan

## Design Philosophy

Inspired by the Jupyter notebook UI: rendered markdown blocks that can be edited in-place, not a side-by-side raw/preview split. The user sees clean rendered output and drops into a textarea only for the block they're editing. Must remain **pure HTML/CSS/JS** — no frameworks, no build step, lightweight.

---

## Feature 5: Undo / Redo

**Problem:** There is no way to reverse actions. A stub exists in `undo.js` with an `undoStack[]` and skeleton `saveElementState()` / `undo()` functions, but no restore logic.

**Goal:** Track destructive actions (delete, edit/render, insert, merge) on a stack and allow the user to walk backward (`Ctrl+Z`) and forward (`Ctrl+Shift+Z` / `Ctrl+Y`).

**What to capture per snapshot:**
- The full list of `#preview` block-level children (tag + HTML content) and which indices were selected.
- Pushing a snapshot before every destructive action: `dd` delete, `renderMarkdownPartial()`, `insertTextArea()`, list merge.

**Undo (`Ctrl+Z`):**
1. Pop the most recent snapshot from `undoStack`.
2. Push the *current* state onto a `redoStack` before restoring.
3. Replace `#preview` innerHTML with the snapshot's children, rebuild `selectableElements` via `setupSelectionHandlers()`, restore selection indices.

**Redo (`Ctrl+Shift+Z` / `Ctrl+Y`):**
1. Pop from `redoStack`, push current state onto `undoStack`, restore.

**Edge cases:**
- Typing inside a textarea is *not* tracked (browser's native undo handles that). Only block-level structural changes are tracked.
- Entering edit mode (Enter) and exiting (Escape/Shift+Enter) each push a snapshot so the user can undo back to the pre-edit state.
- `redoStack` clears whenever a new action is performed (standard undo/redo behavior).
- Cap `undoStack` at a reasonable limit (e.g. 50 entries) to avoid memory bloat.

**Affected files:** `undo.js` (rewrite), `base.js` (add Ctrl+Z / Ctrl+Y key handlers), `events.js` (call `pushSnapshot()` before destructive operations).

---

## Feature 6: Copy / Paste blocks (Jupyter-style `C` / `V`)

**Problem:** No way to duplicate or move blocks without manually editing markdown.

**Goal:** Jupyter-style block clipboard — press `C` to copy selected block(s), `V` to paste below the current selection. Works in navigation mode (not inside a textarea). Uses an internal clipboard variable, not the system clipboard.

**Copy (`C` key):**
1. Read all `.selected` elements.
2. For each, run `turndownService.turndown(el.outerHTML)` to get the markdown source.
3. Store the array of markdown strings in a module-level `blockClipboard` variable.

**Paste (`V` key):**
1. If `blockClipboard` is empty, do nothing.
2. Join the stored markdown strings with `\n\n`.
3. Create a textarea after the current selection (same logic as `insertTextArea(e, insertBefore=false)`), pre-fill it with the clipboard markdown.
4. Immediately render it (call `renderMarkdownPartial()`) so the pasted blocks appear as rendered content, not a textarea.
5. Select the newly inserted blocks.
6. Push an undo snapshot before pasting (integrates with Feature 5).

**Cut (`X` key):**
1. Same as Copy, but also delete the selected blocks after copying (like `dd`).
2. Push an undo snapshot before deleting.

**Edge cases:**
- `C`, `V`, `X` are only active in navigation mode (guard: `if (isTextarea || isInput) return` already exists in the keydown handler).
- Pasting multiple blocks should go through the same merge logic as normal rendering (adjacent lists auto-merge).
- Clipboard persists until overwritten by a new `C` or `X`.

**Affected files:** `base.js` (add `C`/`V`/`X` key handlers), `events.js` (new `copyBlocks()`, `pasteBlocks()`, `cutBlocks()` functions), new global `blockClipboard` variable (in `base.js` or `events.js`).

---

## Feature 7: Syntax highlighting for code blocks

**Problem:** Fenced code blocks render as plain `<pre><code>` with no syntax coloring.

**Goal:** Add syntax highlighting to rendered code blocks using a lightweight, CDN-hosted library.

**Library:** [Highlight.js](https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js) — zero dependencies, supports 190+ languages, many themes, works with the existing `<pre><code class="language-xxx">` structure that `marked.parse()` already produces.

**Implementation:**
1. Add Highlight.js CSS theme and JS to `editor.html` via CDN:
   - `highlight.min.js`
   - A theme CSS file (e.g. `github.min.css` for a clean light theme, or `github-dark.min.css`).
2. After every `marked.parse()` call that inserts code blocks into the DOM, run `hljs.highlightElement(el)` on each `pre code` element within the inserted nodes.
3. Wrap this in a helper: `highlightCodeBlocks(containerOrNodeList)` — finds all `pre code` children and applies highlighting.
4. Call sites:
   - `renderMarkdown()` in `base.js` (initial render)
   - `renderMarkdownPartial()` in `events.js` (after rendering a textarea)
   - Undo/redo restore (Feature 5) — after restoring innerHTML, re-highlight.

**Edge cases:**
- Highlight.js auto-detects language if no `class="language-xxx"` is present, but explicit language hints from fenced blocks (` ```js `) produce better results — this already works because `marked` adds the class.
- Re-highlighting an already-highlighted block is safe (Highlight.js is idempotent when called via `highlightElement`).
- Theme should respect the editor's light aesthetic (`#e1f0ff` selection color). `github.min.css` is a good default.

**Affected files:** `editor.html` (add CDN links), `events.js` (add `highlightCodeBlocks()` helper, call after render), `base.js` (call after initial render).

---

## Testing Strategy — Playwright

All features are interaction-heavy, so **Playwright E2E tests** remain the primary approach.

**Feature 5 (Undo/Redo):**
- Delete a block with `dd` → Ctrl+Z → verify block is restored
- Edit a block (Enter → change text → Escape) → Ctrl+Z → verify original content
- Undo then Redo (Ctrl+Shift+Z) → verify the edit is reapplied
- Multiple undos in sequence
- Redo stack clears after a new action

**Feature 6 (Copy/Paste):**
- Select a block → press `C` → navigate elsewhere → press `V` → verify duplicate block appears
- Multi-block select → `C` → `V` → verify all blocks duplicated
- `X` (cut) removes originals and `V` pastes them
- Paste a list block adjacent to another list → verify auto-merge still works
- `V` with empty clipboard does nothing

**Feature 7 (Syntax Highlighting):**
- Render a fenced code block with a language hint → verify `hljs` classes are present on the `<code>` element
- Edit a code block → re-render → verify highlighting is reapplied
- Code block with no language hint → verify auto-detection applies some highlighting

---

## Feature 8: Textarea height matching on edit mode entry

**Problem:** When pressing Enter on a rendered block to edit it, the textarea that replaces it can be noticeably taller or shorter than the original rendered element. This causes a jarring layout shift — surrounding blocks jump up or down.

**Root cause:** `handleEnter()` in `events.js` estimates textarea rows via `Math.round(totalHeight / 18)` using a hardcoded line height of 18px. The textarea's actual font size (1rem), line height (1.5), padding (0.5em), and border don't match the rendered block's typography (headers are larger, code blocks use monospace, paragraphs have different margins).

**Goal:** Minimize the visual jump when transitioning between rendered and edit mode. The textarea should approximate the rendered block's appearance and never be dramatically smaller or larger.

**Approach: Hybrid — match font per block type + min-height fallback (Option 3)**

1. **Capture rendered height** — Before removing selected elements, store `totalHeight` (sum of `offsetHeight` for all selected blocks). Already done.
2. **Detect block type** — Check the tag name of the first selected element to determine typography:
   - `H1` → `font-size: 2em; line-height: 1.2; font-weight: 600`
   - `H2` → `font-size: 1.5em; line-height: 1.3; font-weight: 600`
   - `H3` → `font-size: 1.25em; line-height: 1.4; font-weight: 600`
   - `H4`–`H6` → `font-size: 1em; line-height: 1.4; font-weight: 600`
   - `PRE` → `font-family: monospace; font-size: 0.9rem; line-height: 1.4`
   - `P`, `BLOCKQUOTE`, `UL`, `OL`, `TABLE` → keep default textarea styles (`font-size: 1rem; line-height: 1.5`)
3. **Apply styles to textarea** — Set the detected font properties on the textarea element.
4. **Set min-height** — Set `textarea.style.minHeight = totalHeight + 'px'` instead of calculating `rows`. This ensures the textarea never shrinks below the rendered block's height.
5. **Let auto-resize grow beyond** — The existing `input` event listener (`this.style.height = this.scrollHeight + 'px'`) handles growth if the markdown text needs more vertical space than the rendered output.
6. **Initial height** — After inserting the textarea, set `textarea.style.height = totalHeight + 'px'` as the starting height, then trigger a resize check so it adjusts to content if needed.

**Edge cases:**
- Multi-block selection (Enter on several blocks): use the first block's type for font matching, and the combined `totalHeight` for min-height. This is a reasonable approximation since editing multiple blocks together is less common.
- `insertTextArea()` (pressing `a`/`b` for new empty blocks): no rendered block to match — keep default styles and `rows: 1`. No change needed.
- Very short blocks (e.g., an `<hr>`): min-height ensures the textarea is at least as tall as the rendered element.

**Affected files:** `events.js` (`handleEnter()` — replace rows calculation with font matching + min-height logic), possibly `styles.css` (if we want CSS classes per block type instead of inline styles).

---

## Implementation order

1. **Feature 7** (syntax highlighting) — smallest scope, no interaction with other features, immediate visual payoff.
2. **Feature 5** (undo/redo) — foundational; Features 6 depends on it for safe destructive actions.
3. **Feature 6** (copy/paste) — builds on undo infrastructure.
4. **Feature 8** (textarea height matching) — polish; improves edit-mode UX with no dependencies on other features.
