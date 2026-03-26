var selectableElements = [];
var currentSelectedIndex = -1;
var turndownService = new TurndownService();

let markdownText = `
## Welcome to the Markdown Editor

This is a *lightweight* editor that renders **Markdown** on demand.

### Features:
- Press **Ctrl+Enter** to render the markdown
- Simple and fast interface
- Live preview updates when you press the shortcut

#### Code Example
\`\`\`javascript
function hello() {
    console.log("Hello, Markdown!");
}
\`\`\`

#### Mermaid Diagram
\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do something]
    B -->|No| D[Do something else]
    C --> E[End]
    D --> E
\`\`\`

> Press Ctrl+Enter to see the rendered markdown.
`

turndownService.addRule('fencedCodeBlock', {
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

// Ensure fenced code block style is used
turndownService.options.codeBlockStyle = 'fenced';
// Use dashes for bullet lists (classic markdown style)
turndownService.options.bulletListMarker = '-';
// Use ATX-style headings (## heading) instead of setext (underline) —
// required for CodeMirror line decorations to detect heading lines
turndownService.options.headingStyle = 'atx';

// Turndown rule: convert mermaid containers back to fenced mermaid code blocks
turndownService.addRule('mermaidContainer', {
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

    // Initialize mermaid
    initMermaid();

    // Function to render markdown to HTML
    async function renderMarkdown() {
        const html = marked.parse(markdownText);
        preview.innerHTML = html;

        // Apply syntax highlighting to code blocks
        highlightCodeBlocks(preview);

        // Replace mermaid code blocks with rendered SVG diagrams
        await processMermaidBlocks(preview);

        // After rendering, set up click handlers for all elements
        setupSelectionHandlers();
    }


    // Handle keyboard navigation for marking several cells (shift + arrow)
    let lastKey = null;
    let lastKeyTime = 0;
    document.addEventListener('keydown', function(e) {
        const now = Date.now();
        const isTextarea = e.target.tagName === 'TEXTAREA';
        // Detect if focus is inside a CodeMirror editor (contenteditable div inside .cm-editor)
        const isCMEditor = e.target.closest && e.target.closest('.cm-editor');
        const isInput = e.target.tagName === 'INPUT' || e.target.isContentEditable;
        const isEditing = isTextarea || isCMEditor || isInput;

        // Handle undo/redo (works everywhere, including edit mode)
        // But inside CM editor, let CM handle its own undo unless it's block-level
        if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
            if (!isCMEditor) {
                e.preventDefault();
                undo();
                return;
            }
            // Let CM handle its own undo
            return;
        }
        if (e.ctrlKey && (e.key === 'y' || (e.key === 'z' && e.shiftKey)) || (e.ctrlKey && e.shiftKey && e.key === 'Z')) {
            if (!isCMEditor) {
                e.preventDefault();
                redo();
                return;
            }
            // Let CM handle its own redo
            return;
        }

        // Ctrl+Enter: render all blurred editors in the selection
        if (e.ctrlKey && e.key === 'Enter') {
            const selected = Array.from(document.querySelectorAll('.selected'));
            const editors = selected.filter(el =>
                el.tagName === 'TEXTAREA' ||
                (el.classList && el.classList.contains('cm-wrapper'))
            );
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

        // Handle keys for form inputs / edit mode
        if (isEditing) return;

        // Handle delete option

        if (e.key === 'd') {
            if (lastKey === 'd' && (now - lastKeyTime) < 1000) {  // 400ms threshold
                // Double 'd' detected — perform delete
                console.log('Double D pressed: delete triggered!');
                pushUndo();
                const selectedElements = document.querySelectorAll('.selected');
                // Find the index of the first selected element before removing
                const firstSelectedIdx = currentSelectedIndex;
                selectedElements.forEach(el => {
                    // Destroy CM editors before removing
                    if (el._cmView && window.CM) {
                        window.CM.destroyEditor(el._cmView);
                    }
                    el.remove();
                });
                setupSelectionHandlers();
                // Select the cell above (or the first cell if deleted from the top)
                if (selectableElements.length > 0) {
                    const newIndex = Math.min(Math.max(0, firstSelectedIdx - 1), selectableElements.length - 1);
                    deselectAll();
                    selectableElements[newIndex].classList.add('selected');
                    currentSelectedIndex = newIndex;
                    selectableElements[newIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                } else {
                    currentSelectedIndex = -1;
                }
                lastKey = null;  // reset
            } else {
                lastKey = 'd';
                lastKeyTime = now;
            }
        } else {
            // Reset if a different key is pressed
            lastKey = null;
        }

        // Handle special case where textarea/CM wrapper is selected but not focused
        const selectedElement = selectableElements[currentSelectedIndex]
        if (selectedElement && selectedElement.tagName === 'TEXTAREA') {
            if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                selectedElement.focus();
                selectedElement.classList.remove('selected');
                return;
            }
        }
        // Handle special case where CM wrapper is selected but not focused
        if (selectedElement && selectedElement.classList && selectedElement.classList.contains('cm-wrapper')) {
            if (e.key === 'Enter' && !e.ctrlKey) {
                e.preventDefault();
                // Focus the CM editor inside
                if (selectedElement._cmView) {
                    selectedElement._cmView.focus();
                }
                selectedElement.classList.remove('selected');
                return;
            }
        }

        // Only handle if Ctrl key is pressed
        if (e.shiftKey) {
            if (e.key === 'ArrowUp') {
                handleShiftArrowUp(e)
            } else if (e.key === 'ArrowDown') {
                handleShiftArrowDown(e)
            }
        }
        else if (e.key === 'ArrowUp') {
            handleArrowUp(e)
        }
        else if (e.key === 'ArrowDown') {
            handleArrowDown(e)
        }
        else if (e.key === 'ArrowRight') {
            // Re-enter a blurred editor with Right arrow
            if (selectedElement && selectedElement.classList && selectedElement.classList.contains('cm-wrapper')) {
                e.preventDefault();
                if (selectedElement._cmView) {
                    selectedElement._cmView.focus();
                }
                selectedElement.classList.remove('selected');
            } else if (selectedElement && selectedElement.tagName === 'TEXTAREA') {
                e.preventDefault();
                selectedElement.focus();
                selectedElement.classList.remove('selected');
            }
        }
        else if (e.key === 'Enter') {
            handleEnter(e)
        }
        else if (e.key === 'a') {
            insertTextArea(e, insertBefore = true)
        }
        else if (e.key === 'b') {
            insertTextArea(e, insertBefore = false)
        }
        else if (e.key === 'c') {
            copyBlocks();
        }
        else if (e.key === 'v') {
            pasteBlocks();
        }
        else if (e.key === 'x') {
            cutBlocks();
        }
        else if (e.key === 'Escape') {
            deselectAll();
            currentSelectedIndex = -1;
        }
    });

    // Handle stepping out of CM editor with arrow keys
    window.addEventListener('cm-step-out', (e) => {
        const { direction, wrapper } = e.detail;
        setupSelectionHandlers();
        const wrapperIndex = selectableElements.indexOf(wrapper);
        if (wrapperIndex === -1) return;

        let targetIndex;
        if (direction === 'up') {
            targetIndex = Math.max(0, wrapperIndex - 1);
        } else {
            targetIndex = Math.min(selectableElements.length - 1, wrapperIndex + 1);
        }

        deselectAll();
        selectableElements[targetIndex].classList.add('selected');
        currentSelectedIndex = targetIndex;
        selectableElements[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    // Initial render
    renderMarkdown();
});
