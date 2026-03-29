// CodeMirror 6 setup module for markdown editing.
// This file is the source for bundling with esbuild into codemirrorBundle.js.
// It creates a configured EditorView with markdown syntax highlighting,
// custom theme, and keybindings for the block editor.

import { EditorView, keymap, ViewPlugin, Decoration, WidgetType } from '@codemirror/view';
import { EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language';
import { tags } from '@lezer/highlight';

// Custom highlight style matching the editor aesthetic
const markdownHighlightStyle = HighlightStyle.define([
  { tag: tags.heading1, fontSize: '1.8em', fontWeight: '600' },
  { tag: tags.heading2, fontSize: '1.4em', fontWeight: '600' },
  { tag: tags.heading3, fontSize: '1.2em', fontWeight: '600' },
  { tag: tags.heading4, fontWeight: '600' },
  { tag: tags.heading5, fontWeight: '600' },
  { tag: tags.heading6, fontWeight: '600' },
  { tag: tags.strong, fontWeight: '600' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.strikethrough, textDecoration: 'line-through' },
  { tag: tags.monospace, fontFamily: "'Courier New', Courier, monospace", backgroundColor: '#f0f0f0', borderRadius: '3px' },
  { tag: tags.url, color: '#0366d6' },
  { tag: tags.link, color: '#0366d6' },
  { tag: tags.processingInstruction, color: '#999', fontFamily: "'Courier New', Courier, monospace" },
  { tag: tags.quote, color: '#666', fontStyle: 'italic' },
  { tag: tags.meta, opacity: '0.6' },
  { tag: tags.contentSeparator, color: '#999' },
]);

// Custom theme matching existing editor aesthetic
const editorTheme = EditorView.theme({
  '&': {
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif",
    fontSize: '1rem',
    lineHeight: '1.6',
    color: '#222',
    border: '1px solid #555',
    borderRadius: '4px',
    backgroundColor: '#ffffff',
  },
  '&.cm-focused': {
    outline: 'none',
    borderColor: '#888',
  },
  '.cm-content': {
    padding: '0.5em',
    caretColor: '#333',
    fontFamily: 'inherit',
  },
  '.cm-line': {
    padding: '0 2px',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground': {
    backgroundColor: '#e1f0ff !important',
  },
  '.cm-cursor': {
    borderLeftColor: '#333',
  },
  '.cm-gutters': {
    display: 'none',
  },
  '.cm-scroller': {
    overflow: 'auto',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
});

/**
 * ViewPlugin for line-level decorations based on markdown content.
 * Walks lines in document order, tracking code fence state,
 * and applies CSS classes for visual styling.
 */
function markdownLineDecorationsPlugin() {
  return ViewPlugin.fromClass(class {
    decorations;

    constructor(view) {
      this.decorations = this.buildDecorations(view);
    }

    update(update) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = this.buildDecorations(update.view);
      }
    }

    buildDecorations(view) {
      const builder = new RangeSetBuilder();
      const doc = view.state.doc;
      let inCodeBlock = false;

      for (let i = 1; i <= doc.lines; i++) {
        const line = doc.line(i);
        const text = line.text;
        const trimmed = text.trimStart();

        if (/^```/.test(trimmed)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-code-fence' }));
          inCodeBlock = !inCodeBlock;
          continue;
        }

        if (inCodeBlock) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-code-line' }));
          continue;
        }

        // Heading lines (check from most specific to least)
        if (/^#{3}\s/.test(trimmed) && !/^#{4}/.test(trimmed)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-h3' }));
        } else if (/^#{2}\s/.test(trimmed) && !/^#{3}/.test(trimmed)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-h2' }));
        } else if (/^#{1}\s/.test(trimmed) && !/^#{2}/.test(trimmed)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-h1' }));
        }
        // Blockquote lines
        else if (/^>\s?/.test(trimmed)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-blockquote' }));
        }
        // List items
        else if (/^[-*+]\s/.test(trimmed) || /^\d+\.\s/.test(trimmed)) {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-list-item' }));
        }
        // Blank lines (paragraph gaps)
        else if (trimmed === '') {
          builder.add(line.from, line.from, Decoration.line({ class: 'cm-md-blank-line' }));
        }
      }

      return builder.finish();
    }
  }, {
    decorations: v => v.decorations,
  });
}

/**
 * Creates a CodeMirror 6 editor with markdown language support.
 * @param {HTMLElement} container - The DOM element to mount the editor in
 * @param {string} initialContent - The initial markdown text
 * @param {function} onExit - Callback called with the editor text when user exits
 * @returns {EditorView} The created editor view
 */
function createMarkdownEditor(container, initialContent, onExit) {
  const exitKeymap = keymap.of([
    {
      key: 'Shift-Enter',
      run: (view) => {
        onExit(view.state.doc.toString());
        return true;
      },
    },
    {
      key: 'Ctrl-Enter',
      run: (view) => {
        onExit(view.state.doc.toString());
        return true;
      },
    },
    {
      key: 'Escape',
      run: (view) => {
        view.contentDOM.blur();
        const wrapper = view.dom.parentElement;
        if (wrapper) wrapper.classList.add('selected');
        return true;
      },
    },
    {
      key: 'ArrowUp',
      run: (view) => {
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        if (line.number === 1) {
          view.contentDOM.blur();
          const wrapper = view.dom.parentElement;
          window.dispatchEvent(new CustomEvent('cm-step-out', { detail: { direction: 'up', wrapper } }));
          return true;
        }
        return false;
      },
    },
    {
      key: 'ArrowDown',
      run: (view) => {
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        if (line.number === view.state.doc.lines) {
          view.contentDOM.blur();
          const wrapper = view.dom.parentElement;
          window.dispatchEvent(new CustomEvent('cm-step-out', { detail: { direction: 'down', wrapper } }));
          return true;
        }
        return false;
      },
    },
    {
      key: 'Tab',
      run: (view) => {
        view.dispatch(view.state.replaceSelection('    '));
        return true;
      },
    },
  ]);

  // Clear container min-height on first edit so the editor shrinks to fit content
  const autoShrink = EditorView.updateListener.of(update => {
    if (update.docChanged && container.style.minHeight) {
      container.style.minHeight = '';
    }
  });

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      exitKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      markdown(),
      syntaxHighlighting(markdownHighlightStyle),
      editorTheme,
      markdownLineDecorationsPlugin(),
      EditorView.lineWrapping,
      autoShrink,
    ],
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  return view;
}

// ── Mermaid validation: self-contained plugin ─────────────────────────
// Validates mermaid source on a debounced timer and renders inline error
// widgets + line highlights directly, without depending on @codemirror/lint.

const setMermaidError = StateEffect.define();

// The error field stores a DecorationSet directly (built at dispatch time with positions).
// This allows the StateField to provide block decorations, which ViewPlugins cannot.
const mermaidErrorField = StateField.define({
  create() { return Decoration.none; },
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setMermaidError)) return e.value; // DecorationSet or Decoration.none
    }
    // Remap positions on doc changes
    if (tr.docChanged) return value.map(tr.changes);
    return value;
  },
  provide(field) {
    return EditorView.decorations.from(field);
  },
});

/**
 * Removes error elements that mermaid.js injects into the DOM on parse/render failure.
 * Mermaid@10 creates SVGs and container divs with error icons/text outside the editor.
 */
function cleanupMermaidErrorElements() {
  // Mermaid renders error diagrams as SVGs with ids like "dmermaid-graph-..." or "d..."
  // and wraps them in divs with matching ids. These appear at the bottom of <body>.
  document.querySelectorAll('body > [id^="d"]').forEach(el => {
    // Only remove if it looks like a mermaid-generated error container
    if (el.tagName === 'DIV' && (
      el.querySelector('.error-icon, .error-text') ||
      el.style.position === 'absolute' ||
      el.innerHTML.includes('Syntax error')
    )) {
      el.remove();
    }
  });
  // Also remove any orphaned mermaid SVGs with error content
  document.querySelectorAll('body > svg[id^="d"]').forEach(el => el.remove());
}

/**
 * Extracts mermaid source from between ```mermaid fences.
 * Returns { source, fenceStartLine (0-indexed) } or null.
 */
function extractMermaidSource(doc) {
  const lines = doc.split('\n');
  let fenceStartLine = -1;
  const sourceLines = [];

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trimStart();
    if (fenceStartLine === -1 && /^```mermaid/.test(trimmed)) {
      fenceStartLine = i;
      continue;
    }
    if (fenceStartLine !== -1 && /^```\s*$/.test(trimmed)) {
      break;
    }
    if (fenceStartLine !== -1) {
      sourceLines.push(lines[i]);
    }
  }

  if (sourceLines.length === 0) return null;
  return { source: sourceLines.join('\n'), sourceLines, fenceStartLine };
}

/**
 * Extension that validates mermaid syntax on a debounced timer.
 * Uses EditorView.updateListener to avoid ViewPlugin dispatch restrictions.
 */
function mermaidValidationListener() {
  let timer = null;

  async function validate(view) {
    const doc = view.state.doc.toString();
    const parsed = extractMermaidSource(doc);
    if (!parsed) {
      view.dispatch({ effects: setMermaidError.of(Decoration.none) });
      return;
    }

    try {
      await mermaid.parse(parsed.source);
      cleanupMermaidErrorElements();
      view.dispatch({ effects: setMermaidError.of(Decoration.none) });
    } catch (err) {
      cleanupMermaidErrorElements();
      let errorLine = 0;
      let message = '';

      if (err && typeof err === 'object') {
        if (err.hash && typeof err.hash.line === 'number') {
          errorLine = err.hash.line;
        }
        const lineMatch = (err.str || err.message || String(err)).match(/on line (\d+)/i);
        if (lineMatch) {
          errorLine = parseInt(lineMatch[1], 10) - 1;
        }
        message = err.str || err.message || String(err);
      } else {
        message = String(err);
      }

      errorLine = Math.max(0, Math.min(errorLine, parsed.sourceLines.length - 1));
      const docLineNumber = parsed.fenceStartLine + 1 + errorLine + 1;
      const clampedLine = Math.min(docLineNumber, view.state.doc.lines);
      const line = view.state.doc.line(clampedLine);

      // Build decorations: line highlight + block widget below the line
      const builder = new RangeSetBuilder();
      builder.add(line.from, line.from, Decoration.line({ class: 'cm-mermaid-error-line' }));
      builder.add(line.to, line.to, Decoration.widget({
        widget: new ErrorWidget(message),
        side: 1,
        block: true,
      }));

      view.dispatch({ effects: setMermaidError.of(builder.finish()) });
    }
  }

  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      clearTimeout(timer);
      timer = setTimeout(() => validate(update.view), 400);
    }
    // Also validate on first load
    if (update.transactions.length === 0 && !timer) {
      timer = setTimeout(() => validate(update.view), 100);
    }
  });
}


class ErrorWidget extends WidgetType {
  constructor(message) {
    super();
    this.message = message;
  }
  eq(other) { return this.message === other.message; }
  toDOM() {
    const div = document.createElement('div');
    div.className = 'cm-mermaid-error-widget';

    const lines = this.message.split('\n');
    const formattedParts = [];
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || /^-+$/.test(trimmed)) continue;
      formattedParts.push(trimmed);
    }

    const header = document.createElement('div');
    header.className = 'cm-mermaid-error-header';
    header.textContent = formattedParts[0] || 'Syntax error';
    div.appendChild(header);

    if (formattedParts.length > 1) {
      const details = document.createElement('div');
      details.className = 'cm-mermaid-error-details';
      details.textContent = formattedParts.slice(1).join('\n');
      div.appendChild(details);
    }

    return div;
  }
  get estimatedHeight() { return 40; }
  ignoreEvent() { return false; }
}

/**
 * Creates a CodeMirror 6 editor configured for mermaid diagram editing.
 * Includes the mermaid linter for inline error display, plus a lint gutter.
 * @param {HTMLElement} container - The DOM element to mount the editor in
 * @param {string} initialContent - The initial mermaid text (with ```mermaid fences)
 * @param {function} onExit - Callback called with the editor text when user exits
 * @returns {EditorView} The created editor view
 */
function createMermaidEditor(container, initialContent, onExit) {
  const exitKeymap = keymap.of([
    {
      key: 'Shift-Enter',
      run: (view) => {
        onExit(view.state.doc.toString());
        return true;
      },
    },
    {
      key: 'Escape',
      run: (view) => {
        view.contentDOM.blur();
        const wrapper = view.dom.parentElement;
        if (wrapper) wrapper.classList.add('selected');
        return true;
      },
    },
    {
      key: 'ArrowUp',
      run: (view) => {
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        if (line.number === 1) {
          view.contentDOM.blur();
          const wrapper = view.dom.parentElement;
          window.dispatchEvent(new CustomEvent('cm-step-out', { detail: { direction: 'up', wrapper } }));
          return true;
        }
        return false;
      },
    },
    {
      key: 'ArrowDown',
      run: (view) => {
        const cursor = view.state.selection.main.head;
        const line = view.state.doc.lineAt(cursor);
        if (line.number === view.state.doc.lines) {
          view.contentDOM.blur();
          const wrapper = view.dom.parentElement;
          window.dispatchEvent(new CustomEvent('cm-step-out', { detail: { direction: 'down', wrapper } }));
          return true;
        }
        return false;
      },
    },
    {
      key: 'Tab',
      run: (view) => {
        view.dispatch(view.state.replaceSelection('    '));
        return true;
      },
    },
  ]);

  // Mermaid-specific theme overrides (monospace for diagram source)
  const mermaidTheme = EditorView.theme({
    '.cm-content': {
      fontFamily: "'Courier New', Courier, monospace",
      fontSize: '0.9rem',
    },
    // Lint gutter styling
    '.cm-gutter-lint': {
      width: '1.2em',
    },
    '.cm-lint-marker-error': {
      content: '"!"',
    },
  });

  // Clear container min-height on first edit
  const autoShrink = EditorView.updateListener.of(update => {
    if (update.docChanged && container.style.minHeight) {
      container.style.minHeight = '';
    }
  });

  const state = EditorState.create({
    doc: initialContent,
    extensions: [
      exitKeymap,
      keymap.of([...defaultKeymap, ...historyKeymap]),
      history(),
      markdown(),
      syntaxHighlighting(markdownHighlightStyle),
      editorTheme,
      mermaidTheme,
      markdownLineDecorationsPlugin(),
      mermaidErrorField,
      mermaidValidationListener(),
      EditorView.lineWrapping,
      autoShrink,
    ],
  });

  const view = new EditorView({
    state,
    parent: container,
  });

  return view;
}

/**
 * Destroys a CodeMirror editor and cleans up.
 * @param {EditorView} view - The editor view to destroy
 */
function destroyEditor(view) {
  if (view) {
    view.destroy();
  }
}

// Export to window for non-module scripts to access
window.CM = {
  createMarkdownEditor,
  createMermaidEditor,
  destroyEditor,
  ready: true,
};

// Dispatch a custom event so other scripts know CM is ready
window.dispatchEvent(new CustomEvent('cm-ready'));
