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

## Feature 10: Mermaid Diagram Rendering

**Problem:** Mermaid code blocks (` ```mermaid `) render as plain `<pre><code>` blocks like any other code. There is no way to visualize flowcharts, sequence diagrams, etc.

**Goal:** Detect mermaid code blocks after markdown rendering and replace them with interactive SVG diagrams inside a resizable, zoomable, pannable container.

### 10a: Rendering

- Load **Mermaid.js** from CDN (same pattern as Marked.js/Turndown)
- After `marked.parse()` produces `<pre><code class="language-mermaid">`, intercept and call `mermaid.render()` to produce an inline SVG
- Wrap each rendered SVG in a `.mermaid-container` div that acts as the viewport
- Apply to both initial render and `renderMarkdownPartial()` (textarea → rendered block)

### 10b: Resizable Container

- Custom drag handles at all 4 corners of `.mermaid-container`
- Small visual indicators (e.g. triangular or square grip icons) at each corner
- `mousedown` on a handle → `mousemove` updates container width/height → `mouseup` commits
- Container has `overflow: hidden` so the SVG is clipped to the viewport
- Default size: auto-fit to SVG content with a `max-height` cap; user resizes from there
- Min size constraint to prevent collapsing the container to nothing

### 10c: Zoom

- `wheel` event on `.mermaid-container` adjusts a scale factor applied via CSS `transform: scale()`
- Zoom toward cursor position using `transform-origin` computed from pointer coordinates
- Clamp scale to a reasonable range (e.g. 0.25x – 4x)
- Visual zoom level indicator (optional, e.g. small "150%" label in a corner)

### 10d: Pan / Navigate

- Click+drag inside `.mermaid-container` to pan (translate the SVG)
- Track both `scale` and `translate(x, y)`, combine into a single CSS `transform`
- `cursor: grab` at rest, `cursor: grabbing` while dragging
- Pan gestures must NOT trigger block selection or rubber band — stop propagation from inside the container
- **Double-click** to reset zoom to 1x and pan to origin (0, 0)

### 10e: Edit Cycle Integration

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

1. Basic rendering (10a) — mermaid blocks become SVGs
2. Resizable container with corner handles (10b)
3. Zoom via scroll wheel (10c)
4. Pan via click+drag, double-click reset (10d)
5. Edit cycle integration and testing (10e)

---

## Bug Fix 1: Mermaid Event Listener Cleanup

**Problem:** When a mermaid container is replaced during the edit cycle (Enter → edit → Escape/Shift+Enter), the `mousemove` and `mouseup` listeners that were added to `document` for resize/pan are never removed. Over repeated edits this causes memory leaks and potential ghost interactions from stale handlers.

**Goal:** Before replacing a mermaid container (in `enterMermaidEditMode()` or anywhere a container is removed from the DOM), clean up all document-level event listeners that were attached by that container's resize and pan logic.

**Affected area:** `mermaid.js` — `setupResize()`, `setupZoomPan()`, and `enterMermaidEditMode()`.

---

## Bug Fix 2: Mermaid Syntax Error UI Feedback ✅

**Problem:** When a user writes invalid mermaid syntax, `mermaid.render()` throws and the error is logged to `console.error()` only. The `<pre><code>` block remains unchanged with no visual indication that rendering failed. The user has no way to know the diagram is broken without opening DevTools.

**Goal:** Show inline error feedback while editing mermaid blocks, so the user can see and fix syntax errors without leaving edit mode.

**Approach: CodeMirror + inline linting (Option D)**

Instead of a static error block shown after render failure, mermaid blocks now use a dedicated CodeMirror editor with `@codemirror/lint` integration. When editing a mermaid block, the linter calls `mermaid.parse()` on a 500ms debounce as the user types. Errors produce:
- A **red gutter marker** on the offending line
- A **red underline highlight** (`cm-lintRange-error`) on the error line
- A **tooltip with the full error message** on hover/click of the gutter marker
- Errors include mermaid's parser output: line number, caret position, and expected tokens

**Implementation:**
1. Added `@codemirror/lint` to dependencies and imported `linter` + `lintGutter` in `codemirrorSetup.src.js`
2. Created `mermaidLinter()` — a CM linter source that extracts mermaid source from between fences, calls `mermaid.parse()`, parses the error line number from the error message, and maps it back to the editor's coordinate space
3. Created `createMermaidEditor()` — like `createMarkdownEditor()` but with monospace font, lint gutter, and the mermaid linter extension
4. Updated `enterMermaidEditMode()` in `mermaid.js` to use CM instead of a plain textarea (with textarea fallback)
5. Updated `createEditElement()` in `events.js` to detect mermaid content and use the mermaid-specific editor
6. Added lint-related CSS in `styles.css` for error diagnostics, underlines, and tooltips

**Affected files:** `codemirrorSetup.src.js`, `codemirrorBundle.js` (rebuilt), `mermaid.js`, `events.js`, `styles.css`, `package.json`

---

## Bug Fix 3: Encapsulate Global State

**Problem:** `selectableElements`, `currentSelectedIndex`, and `turndownService` are bare globals defined in `base.js` and mutated freely across `events.js`, `rubberband.js`, and `mermaid.js`. This makes the code fragile — any script can silently overwrite state, and there's no single place to inspect or debug state changes.

**Goal:** Wrap shared state in a single `EditorState` object (or module-pattern namespace) that all files reference. Provide getter/setter functions so state changes are explicit and could later support logging or undo hooks.

**Affected area:** `base.js` (define the state object), `events.js`, `rubberband.js`, `mermaid.js` (update all references).

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

## Feature 9: CodeMirror 6 styled edit mode

**Problem:** When the user presses Enter to edit a block, the plain `<textarea>` provides zero visual feedback about markdown syntax. Headers, bold, code spans, and list markers all look the same — plain monochrome text. This makes it hard to orient within complex blocks and breaks the visual connection between edit mode and the rendered output.

**Goal:** Replace the plain textarea with a CodeMirror 6 editor instance that provides markdown syntax highlighting and context-aware vertical spacing, so edit mode feels like a styled, semi-rendered view of the markdown source.

---

### 9A: Markdown syntax highlighting in edit mode

When the user presses Enter to edit a block, instead of a plain textarea, they get a CodeMirror 6 editor with full markdown language support:

- **Bold**, *italic*, `code`, headers, links, etc. are styled via CodeMirror's decoration system
- Uses `@codemirror/lang-markdown` for parsing the markdown syntax tree
- Custom theme that matches the editor's existing light aesthetic:
  - Selection color: `#e1f0ff` (matches block selection background)
  - Font stack: `system-ui, -apple-system, sans-serif` (matches rendered output)
  - Border style: consistent with existing textarea borders
  - Background: white, with subtle differentiation for code spans

### 9B: Dynamic vertical spacing via line decorations

CodeMirror's `Decoration` API allows per-line styling based on the syntax tree. This makes the edit mode feel closer to the rendered output without actually rendering HTML:

- **Header lines** get extra `margin-bottom` proportional to heading level (h1 > h2 > h3)
- **List item lines** get left padding matching rendered `<li>` spacing
- **Blank lines** get a visible vertical gap (not collapsed)
- **Fenced code block content** gets monospace font + tighter line-height
- **Blockquote lines** (starting with `>`) get a left border or indent

This is implemented as a custom `ViewPlugin` that:
1. Reads the Lezer syntax tree from `@codemirror/lang-markdown`
2. Maps syntax node types to `Decoration.line()` decorations with appropriate CSS classes
3. Rebuilds decorations on document changes via the `update()` method

---

### Implementation approach

**CDN loading strategy:**

CodeMirror 6 is ESM-native. Load modules via `esm.sh` or `esm.run` CDN using an import map in `editor.html`:

- `@codemirror/view` — `EditorView`, `ViewPlugin`, `Decoration`, `keymap`
- `@codemirror/state` — `EditorState`
- `@codemirror/lang-markdown` — markdown language support + syntax tree
- `@codemirror/commands` — basic editing keybindings (default keymap)
- `@lezer/highlight` — syntax highlighting tag system
- `@codemirror/language` — `syntaxTree` access for the line decoration plugin

Alternative: use a pre-bundled UMD build if ESM dynamic `import()` proves unreliable across browsers.

**New file: `editor/codemirrorSetup.js`**

Exports a single function:

```js
function createMarkdownEditor(container, initialContent, onExit) → EditorView
```

Responsibilities:
- Creates an `EditorView` with:
  - Markdown language extension (`@codemirror/lang-markdown`)
  - Custom theme (selection color, font, borders)
  - Line decoration plugin (Feature 9B)
  - Custom keybindings:
    - **Shift+Enter** → exit edit mode, call `onExit(editorText)`
    - **Escape** → exit edit mode, call `onExit(editorText)`
    - **Tab** → insert 4 spaces (consistent with current textarea behavior)
- Returns the `EditorView` instance so the caller can destroy it on exit

**Modifications to `events.js`:**

- `handleEnter()`:
  - Instead of creating a `<textarea>`, create a `<div class="cm-edit-wrapper">` container
  - Call `createMarkdownEditor(container, markdownText, onExitCallback)`
  - The `onExit` callback:
    1. Extracts the plain text from the CodeMirror editor
    2. Destroys the CodeMirror instance (`view.destroy()`)
    3. Calls the existing `renderMarkdownPartial()` pipeline
  - Set `min-height` on the container to match the rendered block's height (reuse Feature 8 logic)

- `handleTextareaEvent()`:
  - No longer needed for CodeMirror instances — keybindings are handled internally by CodeMirror
  - Keep the existing textarea handling as a fallback (in case CodeMirror fails to load)

- `setupSelectionHandlers()`:
  - Must recognize `.cm-edit-wrapper` divs as valid selectable elements (alongside existing tags)

**Modifications to `renderMarkdownPartial()`:**

- Currently expects a `<textarea>` element. Adapt to also accept a container div + text content:
  - Accept either a textarea (reads `.value`) or a wrapper div + explicit text string
  - The DOM replacement logic (inserting parsed nodes, removing the editor element) stays the same

**Custom theme details:**

```js
EditorView.theme({
  '&': {
    fontSize: '1rem',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: 'white',
    border: '2px solid #e1f0ff',
    borderRadius: '4px',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: '#90c8ff',
  },
  '.cm-content': {
    padding: '0.5em',
    caretColor: '#333',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#e1f0ff',
  },
  // Syntax token styles
  '.cm-md-header': { fontWeight: '600', color: '#1a1a1a' },
  '.cm-md-header-1': { fontSize: '1.8em' },
  '.cm-md-header-2': { fontSize: '1.4em' },
  '.cm-md-header-3': { fontSize: '1.2em' },
  '.cm-md-emphasis': { fontStyle: 'italic' },
  '.cm-md-strong': { fontWeight: '700' },
  '.cm-md-code': { fontFamily: 'monospace', backgroundColor: '#f5f5f5', borderRadius: '2px' },
  '.cm-md-link': { color: '#0366d6', textDecoration: 'underline' },
  '.cm-md-url': { color: '#999' },
})
```

**Line decoration plugin (ViewPlugin):**

```js
// Pseudocode for the ViewPlugin
ViewPlugin.fromClass(class {
  decorations; // DecorationSet

  constructor(view) { this.decorations = this.buildDecorations(view); }

  update(update) {
    if (update.docChanged || update.viewportChanged) {
      this.decorations = this.buildDecorations(update.view);
    }
  }

  buildDecorations(view) {
    // Walk syntaxTree(view.state) nodes
    // For ATXHeading nodes → Decoration.line({ class: 'cm-line-h1' }) etc.
    // For ListItem nodes → Decoration.line({ class: 'cm-line-li' })
    // For FencedCode content → Decoration.line({ class: 'cm-line-code' })
    // For Blockquote → Decoration.line({ class: 'cm-line-blockquote' })
  }
}, { decorations: v => v.decorations })
```

---

### Edge cases

- **CDN loading failure:** If CodeMirror modules fail to load (network issue, CDN down), fall back to the existing plain textarea behavior. Wrap the `import()` in a try/catch; on failure, call the existing textarea creation logic.
- **`setupSelectionHandlers()` recognition:** The CodeMirror wrapper div must be recognized as a valid block in the selectable elements array. Add `.cm-edit-wrapper` to the selector list alongside `textarea`.
- **Focus management:** When creating the CodeMirror editor, call `view.focus()` to place the cursor inside it. When exiting, ensure focus returns to the `#preview` container for keyboard navigation.
- **Undo integration:** CodeMirror 6 has its own internal undo/redo system (Ctrl+Z/Ctrl+Y within the editor). Block-level undo (Feature 5) still captures snapshots before entering and after exiting edit mode. The two systems are independent and do not conflict.
- **Height management:** Set `min-height` on the `.cm-edit-wrapper` container to match the original rendered block height. CodeMirror auto-sizes vertically by default, so it will grow beyond `min-height` if the content requires it.
- **Performance:** CodeMirror instances must be destroyed (`view.destroy()`) when exiting edit mode. Do not keep dormant instances alive — they hold references to DOM nodes and event listeners.
- **Multiple blocks:** When entering edit mode on multiple selected blocks, they are concatenated into a single CodeMirror instance (same as the current textarea behavior). The line decoration plugin handles mixed content (e.g., a heading followed by a paragraph) correctly because it reads the full syntax tree.
- **Import map browser support:** Import maps are supported in all modern browsers (Chrome 89+, Firefox 108+, Safari 16.4+). For older browsers, the textarea fallback applies.

**Affected files:**
- **New:** `editor/codemirrorSetup.js` — CodeMirror editor factory, theme, line decoration plugin
- **Modified:** `editor/events.js` — `handleEnter()`, `handleTextareaEvent()`, `setupSelectionHandlers()`, `renderMarkdownPartial()`
- **Modified:** `editor/styles.css` — `.cm-edit-wrapper` styles, line decoration CSS classes (`.cm-line-h1`, `.cm-line-li`, `.cm-line-code`, `.cm-line-blockquote`)
- **Modified:** `editor/editor.html` — import map for CodeMirror CDN modules (or `<script type="module">` with dynamic imports)
- **Modified:** `editor/base.js` — potentially adjust global keydown handler to ignore events when CodeMirror is focused

---

### Testing — Playwright (Feature 9)

**9A — Syntax highlighting:**
- Select a block containing a header → press Enter → verify `.cm-editor` exists (not a `<textarea>`)
- Inside the CodeMirror editor, verify that header text has `.cm-md-header` styling class
- Verify bold markers (`**text**`) produce `.cm-md-strong` decorated spans
- Verify code spans (`` `code` ``) produce `.cm-md-code` decorated spans
- Press Shift+Enter → verify CodeMirror is destroyed and rendered block reappears
- Press Escape → verify same exit behavior as Shift+Enter

**9B — Line decorations:**
- Edit a block containing an h1 line → verify the line has `.cm-line-h1` decoration class
- Edit a block with a fenced code block → verify code lines have `.cm-line-code` class with monospace font
- Edit a list block → verify list item lines have `.cm-line-li` class

**Integration tests:**
- Full round-trip: render → Enter (CodeMirror opens) → edit text → Shift+Enter (renders) → verify edited content appears correctly
- Undo integration: Enter edit mode → edit → exit → Ctrl+Z → verify original content restored
- CDN fallback: (optional, hard to test) — mock CDN failure → verify textarea is used instead
- Focus management: Enter edit mode → verify CodeMirror has focus → Escape → verify navigation mode works (arrow keys move selection)
- Height: Enter edit mode on a tall block → verify `.cm-edit-wrapper` min-height matches original block height

---

## Implementation order

1. **Feature 7** (syntax highlighting) — smallest scope, no interaction with other features, immediate visual payoff.
2. **Feature 5** (undo/redo) — foundational; Features 6 depends on it for safe destructive actions.
3. **Feature 6** (copy/paste) — builds on undo infrastructure.
4. **Feature 8** (textarea height matching) — polish; improves edit-mode UX with no dependencies on other features.
5. **Feature 9** (CodeMirror 6 edit mode) — depends on Features 7 and 8 being stable. Feature 8's height-matching logic is reused for the CodeMirror container's min-height. Feature 7's syntax highlighting covers rendered blocks; Feature 9 covers edit-mode highlighting — together they provide syntax coloring in both states. Should be implemented last because it replaces a core interaction (textarea → CodeMirror) and all other features must be solid before changing the edit substrate.
