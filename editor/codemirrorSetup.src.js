// CodeMirror 6 setup module for markdown editing.
// This file is the source for bundling with esbuild into codemirrorBundle.js.
// It creates a configured EditorView with markdown syntax highlighting,
// custom theme, and keybindings for the block editor.

import { EditorView, keymap, ViewPlugin, Decoration } from '@codemirror/view';
import { EditorState, RangeSetBuilder } from '@codemirror/state';
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
      key: 'Escape',
      run: (view) => {
        onExit(view.state.doc.toString());
        return true;
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
  destroyEditor,
  ready: true,
};

// Dispatch a custom event so other scripts know CM is ready
window.dispatchEvent(new CustomEvent('cm-ready'));
