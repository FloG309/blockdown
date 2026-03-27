var EditorState = {
    selectableElements: [],
    currentSelectedIndex: -1,
    turndownService: new TurndownService(),
    blockClipboard: [],
    undoStack: [],
    redoStack: []
};

let markdownText = `
## Small Mermaid Graph Test

A simple login flow:

\`\`\`mermaid
graph LR
    A[User] --> B[Login Page]
    B --> C{Valid?}
    C -->|Yes| D[Dashboard]
    C -->|No| B
\`\`\`

### Sequence Diagram

A basic API call:

\`\`\`mermaid
sequenceDiagram
    Client->>Server: GET /api/data
    Server->>DB: SELECT * FROM items
    DB-->>Server: rows
    Server-->>Client: 200 OK (JSON)
\`\`\`

### Pie Chart

\`\`\`mermaid
pie title Browser Market Share
    "Chrome" : 65
    "Safari" : 19
    "Firefox" : 4
    "Edge" : 4
    "Other" : 8
\`\`\`

### Some regular content

- Item one
- Item two
- Item three

> This page tests small, simple mermaid diagrams.
`;

EditorState.turndownService.addRule('fencedCodeBlock', {
    filter: function (node, options) {
        return (
        options.codeBlockStyle === 'fenced' &&
        node.nodeName === 'PRE' &&
        node.firstChild &&
        node.firstChild.nodeName === 'CODE'
        );
    },
    replacement: function (content, node, options) {
        const code = node.firstChild;
        const className = code.getAttribute('class') || '';
        const language = className.match(/language-(\w+)/) ? className.match(/language-(\w+)/)[1] : '';

        const fence = options.fence;
        const codeContent = code.textContent || '';

        return '\n\n' + fence + language + '\n' + codeContent + '\n' + fence + '\n\n';
    }
});

EditorState.turndownService.options.codeBlockStyle = 'fenced';
EditorState.turndownService.options.bulletListMarker = '-';

EditorState.turndownService.addRule('mermaidContainer', {
    filter: function (node) {
        return node.nodeName === 'DIV' && node.classList.contains('mermaid-container');
    },
    replacement: function (content, node) {
        const source = node.getAttribute('data-mermaid-source') || '';
        return '\n\n```mermaid\n' + source + '\n```\n\n';
    }
});

document.addEventListener('DOMContentLoaded', function() {
    const preview = document.getElementById('preview');

    initMermaid();

    async function renderMarkdown() {
        const html = marked.parse(markdownText);
        preview.innerHTML = html;
        await processMermaidBlocks(preview);
        setupSelectionHandlers();
    }

    let lastKey = null;
    let lastKeyTime = 0;
    document.addEventListener('keydown', function(e) {
        const now = Date.now();
        const isTextarea = e.target.tagName === 'TEXTAREA';
        const isInput = e.target.tagName === 'INPUT' || e.target.isContentEditable;

        // Ctrl+Enter: render all editors (selected + currently focused)
        if (e.ctrlKey && e.key === 'Enter') {
            const selected = Array.from(document.querySelectorAll('.selected'));
            const editors = selected.filter(el =>
                el.tagName === 'TEXTAREA' ||
                (el.classList && el.classList.contains('cm-wrapper'))
            );
            // Also include the currently focused textarea/CM editor
            const focused = document.activeElement;
            if (focused && focused.tagName === 'TEXTAREA' && !editors.includes(focused)) {
                editors.push(focused);
            }
            const cmWrapper = focused && focused.closest && focused.closest('.cm-wrapper');
            if (cmWrapper && !editors.includes(cmWrapper)) {
                editors.push(cmWrapper);
            }
            if (editors.length > 0) {
                e.preventDefault();
                pushUndo();
                for (let i = editors.length - 1; i >= 0; i--) {
                    const el = editors[i];
                    if (el.classList.contains('cm-wrapper') && el._cmView) {
                        el.setAttribute('data-markdown-text', el._cmView.state.doc.toString());
                    }
                    renderMarkdownPartial(el);
                }
                setupSelectionHandlers();
                return;
            }
        }

        if (isTextarea || isInput) return;

        if (e.key === 'd') {
            if (lastKey === 'd' && (now - lastKeyTime) < 1000) {
                const selectedElements = document.querySelectorAll('.selected');
                selectedElements.forEach(el => el.remove());
                lastKey = null;
            } else {
                lastKey = 'd';
                lastKeyTime = now;
            }
        } else {
            lastKey = null;
        }

        const selectedElement = EditorState.selectableElements[EditorState.currentSelectedIndex]
        if (selectedElement && selectedElement.tagName === 'TEXTAREA') {
            if (e.key === 'Enter') {
                e.preventDefault();
                selectedElement.focus();
                selectedElement.classList.remove('selected');
                return;
            }
        }

        if (e.shiftKey) {
            if (e.key === 'ArrowUp') handleShiftArrowUp(e);
            else if (e.key === 'ArrowDown') handleShiftArrowDown(e);
        }
        else if (e.key === 'ArrowUp') handleArrowUp(e);
        else if (e.key === 'ArrowDown') handleArrowDown(e);
        else if (e.key === 'Enter') handleEnter(e);
        else if (e.key === 'a') insertTextArea(e, insertBefore = true);
        else if (e.key === 'b') insertTextArea(e, insertBefore = false);
    });

    renderMarkdown();
});
