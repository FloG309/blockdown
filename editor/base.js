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

document.addEventListener('DOMContentLoaded', function() {
    const preview = document.getElementById('preview');

    // Function to render markdown to HTML
    function renderMarkdown() {
        const html = marked.parse(markdownText);
        preview.innerHTML = html;

        // Apply syntax highlighting to code blocks
        highlightCodeBlocks(preview);

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

        // Handle keys for form inputs / edit mode
        if (isEditing) return;

        // Handle delete option

        if (e.key === 'd') {
            if (lastKey === 'd' && (now - lastKeyTime) < 1000) {  // 400ms threshold
                // Double 'd' detected — perform delete
                console.log('Double D pressed: delete triggered!');
                pushUndo();
                const selectedElements = document.querySelectorAll('.selected');
                selectedElements.forEach(el => {
                    // Destroy CM editors before removing
                    if (el._cmView && window.CM) {
                        window.CM.destroyEditor(el._cmView);
                    }
                    el.remove();
                });
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
            if (e.key === 'Enter') {
                e.preventDefault();
                selectedElement.focus();
                selectedElement.classList.remove('selected');
                return;
            }
        }
        // Handle special case where CM wrapper is selected but not focused
        if (selectedElement && selectedElement.classList && selectedElement.classList.contains('cm-wrapper')) {
            if (e.key === 'Enter') {
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
    });

    // Initial render
    renderMarkdown();
});
