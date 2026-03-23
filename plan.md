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

## Feature 9: Styled contenteditable edit mode

**Problem:** When the user presses Enter to edit a block, they see a plain `<textarea>` with raw markdown — no visual cues about what's a header, what's bold, what's a code span, etc. This creates a jarring context switch between the polished rendered view and the plain-text editing experience.

**Goal:** Replace the `<textarea>` in edit mode with a `contenteditable` div that applies live syntax highlighting to raw markdown text. The user still writes raw markdown, but inline tokens (`**bold**`, `*italic*`, `` `code` ``) and block-level prefixes (`# `, `> `, `- `) are visually styled in-place. Dynamic vertical spacing approximates rendered output, so the editing experience feels closer to WYSIWYG without actually being WYSIWYG.

### Markdown syntax highlighting in edit mode

When the user presses Enter on a rendered block, the replacement element is a `contenteditable` div (not a textarea). The raw markdown text is displayed with visual styling:

- `**bold**` text appears **bold** (the delimiter characters are dimmed/muted, inner text is `font-weight: 600`)
- `*italic*` text appears *italic* (delimiters dimmed, inner text is `font-style: italic`)
- `# Header` lines get a larger `font-size` proportional to heading level (`#` = 1.8em, `##` = 1.4em, `###` = 1.2em, etc.) with the `#` markers dimmed
- `` `inline code` `` gets `font-family: monospace`, a subtle background color (`#f0f0f0`), and `border-radius: 3px`
- `> blockquote` lines get a left border (`3px solid #ddd`) and muted text color (`#666`)
- List markers (`- `, `* `, `1. `) are styled in a muted color so they recede visually
- Fenced code block delimiters (`` ``` ``) are styled in muted monospace; lines between them get monospace font and a light background
- Links `[text](url)` — bracket/paren syntax is dimmed, link text is styled blue

### Dynamic vertical spacing

Lines inside the contenteditable div receive variable spacing to approximate the rendered output:

- Header lines (`#`, `##`, etc.) get extra `margin-bottom` proportional to their level (e.g., `#` = 0.6em, `##` = 0.4em, `###` = 0.3em)
- List item lines get consistent padding matching rendered `<li>` spacing
- Blank lines between paragraphs render as actual vertical gaps (a `<div>` with `margin-bottom: 0.8em` rather than collapsing)
- Lines inside fenced code blocks get tighter `line-height` (1.3) and monospace styling, matching `<pre>` rendering

### Implementation

#### New module: `editor/markdownHighlight.js`

A single exported function `highlightMarkdown(text)`:

1. **Input:** Raw markdown string (the plain text content of the contenteditable div).
2. **Processing:** Regex-based, two-pass tokenizer:
   - **Pass 1 — Block-level (line-by-line):** Identify heading lines, blockquote lines, list items, fenced code block delimiters, fenced code block body lines, blank lines. Wrap each line in a `<div>` with the appropriate CSS class (e.g., `class="md-h1"`, `class="md-blockquote"`, `class="md-code-fence"`).
   - **Pass 2 — Inline (within each line):** Within non-code lines, identify and wrap bold (`**...**`), italic (`*...*`), inline code (`` `...` ``), links (`[text](url)`), and other inline tokens in `<span>` elements with CSS classes (e.g., `class="md-bold"`, `class="md-italic"`). Delimiter characters get an additional `class="md-dim"` to mute them visually.
3. **Output:** HTML string ready to be set as `innerHTML` of the contenteditable div.

#### Cursor / caret management

Saving and restoring cursor position is critical since `innerHTML` replacement destroys the DOM:

1. **Before re-render:** Walk the contenteditable div's text nodes using `document.createTreeWalker(NodeFilter.SHOW_TEXT)` to compute a flat character offset from the start of the div to the current `Selection` anchor.
2. **After re-render:** Walk the new DOM's text nodes with the same TreeWalker approach to find the text node and local offset corresponding to the saved flat offset, then call `selection.collapse(node, offset)` to restore the caret.
3. Wrap this in helpers: `saveCaretOffset(editableDiv) → number` and `restoreCaretOffset(editableDiv, offset)`.

#### Modifications to `events.js`

- **`handleEnter()`:** Instead of creating a `<textarea>`, create a `<div contenteditable="true" class="md-editable">`. Populate it with `highlightMarkdown(markdownText)`. Attach an `input` event listener that re-highlights on content changes (with caret save/restore). Attach `paste` event listener for plain-text-only paste.
- **`handleTextareaEvent()`:** Rename or extend to `handleEditableEvent()`. The Shift+Enter (render) and Escape (blur + re-select) behaviors remain identical but now read `editableDiv.textContent` (plain text) instead of `textarea.value` to get the raw markdown for `marked.parse()`.
- **`setupSelectionHandlers()`:** Add `div[contenteditable]` to the selector list so contenteditable divs are indexed as block-level elements.
- **`renderMarkdownPartial()`:** Accept a contenteditable div in addition to a textarea. Extract plain text via `element.textContent`.

#### Modifications to `editor/base.js`

- The `keydown` listener's `isTextarea` guard needs to also detect `contenteditable` divs: `const isEditing = isTextarea || target.isContentEditable`.
- `turndownService` usage in `handleEnter()` remains unchanged — it still receives the rendered block's `outerHTML`.

#### Modifications to `editor/styles.css`

New CSS classes for markdown token styling:

```css
/* Contenteditable edit container */
.md-editable { /* base styles: font, padding, border, outline, width */ }

/* Block-level line types */
.md-h1 { font-size: 1.8em; font-weight: 600; margin-bottom: 0.6em; }
.md-h2 { font-size: 1.4em; font-weight: 600; margin-bottom: 0.4em; }
.md-h3 { font-size: 1.2em; font-weight: 600; margin-bottom: 0.3em; }
.md-h4, .md-h5, .md-h6 { font-size: 1em; font-weight: 600; }
.md-blockquote { border-left: 3px solid #ddd; padding-left: 0.8em; color: #666; }
.md-list-item { padding-left: 0.5em; }
.md-code-fence { font-family: monospace; color: #999; }
.md-code-line { font-family: monospace; background: #f6f6f6; line-height: 1.3; }
.md-blank-line { margin-bottom: 0.8em; }

/* Inline token styles */
.md-bold { font-weight: 600; }
.md-italic { font-style: italic; }
.md-inline-code { font-family: monospace; background: #f0f0f0; border-radius: 3px; padding: 0.1em 0.3em; }
.md-link-text { color: #0366d6; }
.md-dim { opacity: 0.4; } /* delimiter characters */
```

#### Modifications to `editor/editor.html`

- Add `<script src="markdownHighlight.js"></script>` before `events.js` (since `events.js` calls `highlightMarkdown()`).

### Edge cases

- **Paste handling:** Intercept `paste` events on the contenteditable div. Call `e.preventDefault()`, read `e.clipboardData.getData('text/plain')`, and insert via `document.execCommand('insertText', false, plainText)` to strip any HTML formatting.
- **Multi-line selections and cursor position across styled spans:** The TreeWalker-based caret save/restore handles arbitrary nesting of `<span>` and `<div>` elements by counting only text node characters.
- **Performance:** Only re-highlight on `input` events (content actually changed), not on every `keydown`. Debounce is unnecessary for typical block sizes (< 100 lines), but add a guard that skips re-highlight if `textContent` hasn't changed since last highlight.
- **`setupSelectionHandlers()` selector:** Add `div[contenteditable]` so these divs are picked up as selectable elements and can transition back to rendered blocks.
- **Tab key handling:** Intercept `keydown` for Tab inside the contenteditable div. Prevent default, insert 2 or 4 spaces at caret using `document.execCommand('insertText', false, '  ')`.
- **Undo behavior:** The browser's native contenteditable undo (`Ctrl+Z` while focused inside the div) handles character-level edits. The block-level undo/redo system (Feature 5) still snapshots before entering and exiting edit mode, so the user can undo the entire edit operation at the block level.
- **Empty contenteditable div:** Ensure an empty div still has a minimum height and shows the cursor. Use `:empty::before` pseudo-element with placeholder text if desired.
- **XSS safety:** The `highlightMarkdown()` function must HTML-escape the raw markdown text before wrapping in span/div tags. All user text goes through escaping; only the structural `<span>` / `<div>` tags added by the highlighter are unescaped.

### Affected files

- **New:** `editor/markdownHighlight.js` — `highlightMarkdown(text)`, `saveCaretOffset()`, `restoreCaretOffset()` functions
- **Modified:** `editor/events.js` — `handleEnter()` creates contenteditable div instead of textarea; `handleTextareaEvent()` extended to handle contenteditable; `setupSelectionHandlers()` updated selector; `renderMarkdownPartial()` accepts contenteditable div
- **Modified:** `editor/styles.css` — new `.md-editable`, `.md-h1`–`.md-h6`, `.md-bold`, `.md-italic`, `.md-inline-code`, `.md-dim`, etc. classes
- **Modified:** `editor/editor.html` — add `<script>` include for `markdownHighlight.js`
- **Modified:** `editor/base.js` — `isTextarea` guard expanded to include `isContentEditable` check

---

## Testing Strategy — Feature 9 (Styled contenteditable edit mode) — Playwright

**Edit mode entry and exit:**
- Select a rendered paragraph → press Enter → verify a `div[contenteditable]` appears (not a textarea)
- Type markdown text in the contenteditable div → press Shift+Enter → verify it renders correctly via `marked.parse()`
- Press Escape in the contenteditable div → verify it exits edit mode and re-selects the rendered block

**Syntax highlighting:**
- Enter edit mode on a block containing `**bold**` → verify a `.md-bold` span exists with the correct text
- Enter edit mode on a `# Heading` block → verify the line div has class `md-h1` and visually larger font
- Enter edit mode on a block with `` `code` `` → verify `.md-inline-code` span is present
- Enter edit mode on a blockquote → verify `.md-blockquote` class and left border style
- Enter edit mode on a fenced code block → verify `.md-code-fence` and `.md-code-line` classes
- Verify delimiter characters (`**`, `` ` ``, `#`) have `.md-dim` class (muted opacity)

**Live re-highlighting:**
- Enter edit mode → type `**hello**` → verify `.md-bold` span appears dynamically after input
- Enter edit mode → type text → verify cursor position is preserved after re-highlight (caret doesn't jump to start or end)
- Enter edit mode → make no changes → verify no unnecessary re-render occurs

**Dynamic vertical spacing:**
- Enter edit mode on a multi-paragraph block → verify blank lines produce visible vertical gaps (`.md-blank-line` elements with margin)
- Enter edit mode on a heading → verify extra bottom margin on the heading line div

**Paste handling:**
- Copy rich HTML from another source → paste into contenteditable div → verify only plain text is inserted (no HTML tags in content)

**Tab handling:**
- Focus the contenteditable div → press Tab → verify spaces are inserted at cursor position (not focus change)

**Integration with block navigation:**
- Contenteditable div should be reachable via `setupSelectionHandlers()` — verify arrow key navigation includes it
- After rendering (Shift+Enter), the new rendered block(s) should be navigable

**Integration with undo/redo (Feature 5):**
- Enter edit mode → modify content → Shift+Enter to render → Ctrl+Z → verify original rendered block is restored

---

## Implementation order

1. **Feature 7** (syntax highlighting) — smallest scope, no interaction with other features, immediate visual payoff.
2. **Feature 5** (undo/redo) — foundational; Features 6 depends on it for safe destructive actions.
3. **Feature 6** (copy/paste) — builds on undo infrastructure.
4. **Feature 8** (textarea height matching) — polish; improves edit-mode UX with no dependencies on other features.
5. **Feature 9** (styled contenteditable edit mode) — replaces textarea with contenteditable div; depends on Feature 8's block-type detection logic for font sizing; should come after Feature 5 (undo) since it changes how edit-mode snapshots work. Most impactful UX improvement but also largest scope.
