var selectableElements = [];
var currentSelectedIndex = -1;
var turndownService = new TurndownService();

// Allow other pages to pre-define markdownText (e.g. test pages with custom content)
if (typeof markdownText === 'undefined') {
var markdownText = `
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
}

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

// Turndown rule: convert mermaid placeholders back to fenced mermaid code blocks (undo/redo)
turndownService.addRule('mermaidPlaceholder', {
    filter: function (node) {
        return node.nodeName === 'DIV' && node.classList.contains('mermaid-placeholder');
    },
    replacement: function (content, node) {
        const source = node.getAttribute('data-mermaid-source') || '';
        return '\n\n```mermaid\n' + source + '\n```\n\n';
    }
});

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
        // Preserve the settings anchor across full re-renders
        const settingsAnchor = document.getElementById('settings-anchor');
        preview.innerHTML = html;
        if (settingsAnchor) preview.insertBefore(settingsAnchor, preview.firstChild);

        // Apply syntax highlighting to code blocks
        highlightCodeBlocks(preview);

        // Yield so the browser paints text content before mermaid processing starts
        await new Promise(r => requestAnimationFrame(r));

        // Replace mermaid code blocks with rendered SVG diagrams
        await processMermaidBlocks(preview);

        // After rendering, set up click handlers for all elements
        setupSelectionHandlers();
    }


    // Click on empty space (outside any block) → deselect all and blur editors
    document.getElementById('preview-container').addEventListener('click', function(e) {
        // Only act if the click landed directly on the container or #preview background
        // Skip if a rubber band drag just finished (it handles its own selection)
        if (window._rubberBandJustFinished) return;
        if (e.target === this || e.target === preview || e.target.id === 'settings-anchor') {
            deselectAll();
            currentSelectedIndex = -1;
            // Blur any active editor
            const focused = document.activeElement;
            if (focused && (focused.tagName === 'TEXTAREA' || focused.closest('.cm-editor'))) {
                focused.blur();
            }
            // Also blur any CM editors that might be open
            const cmWrappers = preview.querySelectorAll('.cm-wrapper');
            cmWrappers.forEach(w => {
                if (w._cmView) w._cmView.contentDOM.blur();
                w.classList.remove('selected');
            });
        }
    });

    // Handle keyboard navigation for marking several cells (shift + arrow)
    // Chord state for two-key sequences (e.g. "d d" for delete)
    let chordState = { action: null, pending: false, time: 0 };

    document.addEventListener('keydown', function(e) {
        const now = Date.now();
        const isTextarea = e.target.tagName === 'TEXTAREA';
        // Detect if focus is inside a CodeMirror editor (contenteditable div inside .cm-editor)
        const isCMEditor = e.target.closest && e.target.closest('.cm-editor');
        const isInput = e.target.tagName === 'INPUT' || e.target.isContentEditable;
        const isEditing = isTextarea || isCMEditor || isInput;

        const KB = window.Keybindings;

        // Layout keyboard shortcuts (Ctrl+= / Ctrl+- for font size, Ctrl+Shift+L for theme)
        // Not remappable — always hardcoded
        if (e.ctrlKey && (e.key === '=' || e.key === '+') && !isEditing) {
            e.preventDefault();
            if (window.LayoutSettings) window.LayoutSettings.cycleFontSize(1);
            return;
        }
        if (e.ctrlKey && e.key === '-' && !isEditing) {
            e.preventDefault();
            if (window.LayoutSettings) window.LayoutSettings.cycleFontSize(-1);
            return;
        }
        if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l') && !isEditing) {
            e.preventDefault();
            if (window.LayoutSettings) window.LayoutSettings.cycleTheme();
            return;
        }

        // Handle undo/redo (works everywhere, including edit mode)
        // But inside CM editor, let CM handle its own undo unless it's block-level
        if (KB.matchesBinding(e, 'undo')) {
            if (!isCMEditor) {
                e.preventDefault();
                undo();
                return;
            }
            return;
        }
        // Redo: check remappable binding + hardcoded Ctrl+Shift+Z fallback
        if (KB.matchesBinding(e, 'redo') ||
            (e.ctrlKey && e.shiftKey && (e.key === 'z' || e.key === 'Z'))) {
            if (!isCMEditor) {
                e.preventDefault();
                redo();
                return;
            }
            return;
        }

        // Ctrl+Enter: render all blurred editors in the selection (not remappable)
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

        // Clear native text selection on any key except those that use it
        // Also skip modifier keys themselves (Control, Shift, etc.)
        const isModifier = ['Control', 'Shift', 'Alt', 'Meta'].includes(e.key);
        const isTextSelectionKey = KB.matchesBinding(e, 'extendSelForward') ||
                                   KB.matchesBinding(e, 'extendSelBackward');
        const isTextCopyKey = KB.matchesBinding(e, 'copyText');
        if (!isModifier && !isTextSelectionKey && !isTextCopyKey) {
            window.getSelection().removeAllRanges();
        }

        // Select all blocks
        if (KB.matchesBinding(e, 'selectAll')) {
            e.preventDefault();
            deselectAll();
            selectableElements.forEach(el => el.classList.add('selected'));
            if (selectableElements.length > 0) {
                currentSelectedIndex = selectableElements.length - 1;
            }
            return;
        }

        // Copy text to system clipboard
        // Priority: native text selection (from rubber band) > all text in selected blocks
        if (KB.matchesBinding(e, 'copyText')) {
            const sel = window.getSelection();
            if (sel && sel.toString().length > 0) {
                // Native text selection exists — let browser handle the copy natively
                return;
            }
            // No text selection — copy all text from selected blocks
            const selectedItems = document.querySelectorAll('.selected');
            if (selectedItems.length > 0) {
                e.preventDefault();
                const text = Array.from(selectedItems).map(el => el.textContent).join('\n\n');
                navigator.clipboard.writeText(text);
            }
            return;
        }

        // Paste text from system clipboard as new blocks
        if (KB.matchesBinding(e, 'pasteText')) {
            e.preventDefault();
            navigator.clipboard.readText().then(text => {
                if (!text) return;
                pushUndo();
                const preview = document.getElementById('preview');
                const html = marked.parse(text);
                const temp = document.createElement('div');
                temp.innerHTML = html;

                let refNode = null;
                if (currentSelectedIndex >= 0 && currentSelectedIndex < selectableElements.length) {
                    refNode = selectableElements[currentSelectedIndex].nextSibling;
                }

                const insertedNodes = [];
                while (temp.firstChild) {
                    const node = temp.firstChild;
                    preview.insertBefore(node, refNode);
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        insertedNodes.push(node);
                    }
                }

                const resultNodes = mergeAdjacentLists(insertedNodes, preview);
                highlightInsertedNodes(resultNodes);
                setupSelectionHandlers();
                deselectAll();
                resultNodes.forEach(node => {
                    if (node.parentNode) node.classList.add('selected');
                });
                const lastNode = resultNodes[resultNodes.length - 1];
                if (lastNode) {
                    const idx = parseInt(lastNode.getAttribute('data-index'));
                    if (!isNaN(idx)) currentSelectedIndex = idx;
                }
            });
            return;
        }

        // Extend text selection forward by one word
        if (KB.matchesBinding(e, 'extendSelForward')) {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel.toString().length > 0) {
                sel.modify('extend', 'forward', 'word');
            } else {
                const selectedBlocks = Array.from(document.querySelectorAll('#preview > .selected'));
                const firstBlock = selectedBlocks.length > 0 ? selectedBlocks[0] :
                    (currentSelectedIndex >= 0 ? selectableElements[currentSelectedIndex] : null);
                if (firstBlock) {
                    const walker = document.createTreeWalker(firstBlock, NodeFilter.SHOW_TEXT);
                    const firstText = walker.nextNode();
                    if (firstText) {
                        const range = document.createRange();
                        range.setStart(firstText, 0);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        sel.modify('extend', 'forward', 'word');
                    }
                }
            }
            ensureTextSelectionWithinBoxes();
            scrollSelectionFocusIntoView();
            return;
        }

        // Extend text selection backward by one word
        if (KB.matchesBinding(e, 'extendSelBackward')) {
            e.preventDefault();
            const sel = window.getSelection();
            if (sel.toString().length > 0) {
                sel.modify('extend', 'backward', 'word');
            } else {
                const selectedBlocks = Array.from(document.querySelectorAll('#preview > .selected'));
                const lastBlock = selectedBlocks.length > 0 ? selectedBlocks[selectedBlocks.length - 1] :
                    (currentSelectedIndex >= 0 ? selectableElements[currentSelectedIndex] : null);
                if (lastBlock) {
                    const walker = document.createTreeWalker(lastBlock, NodeFilter.SHOW_TEXT);
                    let lastText = null;
                    let node;
                    while (node = walker.nextNode()) lastText = node;
                    if (lastText) {
                        const range = document.createRange();
                        range.setStart(lastText, lastText.textContent.length);
                        range.collapse(true);
                        sel.removeAllRanges();
                        sel.addRange(range);
                        sel.modify('extend', 'backward', 'word');
                    }
                }
            }
            ensureTextSelectionWithinBoxes();
            scrollSelectionFocusIntoView();
            return;
        }

        // Handle chord bindings (e.g. "d d" for delete)
        const deleteResult = KB.matchesBinding(e, 'deleteBlocks', chordState);
        if (deleteResult === 'partial') {
            chordState = { action: 'deleteBlocks', pending: true, time: now };
        } else if (deleteResult === 'complete' && (now - chordState.time) < 1000) {
            chordState = { action: null, pending: false, time: 0 };
            pushUndo();
            const selectedElements = document.querySelectorAll('.selected');
            const firstSelectedIdx = currentSelectedIndex;
            selectedElements.forEach(el => {
                if (el._cmView && window.CM) {
                    window.CM.destroyEditor(el._cmView);
                }
                el.remove();
            });
            setupSelectionHandlers();
            if (selectableElements.length > 0) {
                const newIndex = Math.min(Math.max(0, firstSelectedIdx - 1), selectableElements.length - 1);
                deselectAll();
                selectableElements[newIndex].classList.add('selected');
                currentSelectedIndex = newIndex;
                selectableElements[newIndex].scrollIntoView({ behavior: 'auto', block: 'nearest' });
            } else {
                currentSelectedIndex = -1;
            }
        } else {
            // Reset chord if a different key was pressed
            if (chordState.pending && deleteResult !== 'partial') {
                chordState = { action: null, pending: false, time: 0 };
            }
        }

        // Handle special case where textarea/CM wrapper is selected but not focused
        const selectedElement = selectableElements[currentSelectedIndex]
        if (selectedElement && selectedElement.tagName === 'TEXTAREA') {
            if (KB.matchesBinding(e, 'editMode')) {
                e.preventDefault();
                selectedElement.focus();
                selectedElement.classList.remove('selected');
                return;
            }
        }
        if (selectedElement && selectedElement.classList && selectedElement.classList.contains('cm-wrapper')) {
            if (KB.matchesBinding(e, 'editMode')) {
                e.preventDefault();
                if (selectedElement._cmView) {
                    const view = selectedElement._cmView;
                    view.focus();
                    scrollCMCursorIntoView(view);
                }
                selectedElement.classList.remove('selected');
                return;
            }
        }

        // Arrow navigation (not remappable)
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
        else if (KB.matchesBinding(e, 'editMode')) {
            handleEnter(e)
        }
        else if (KB.matchesBinding(e, 'insertAbove')) {
            insertTextArea(e, insertBefore = true)
        }
        else if (KB.matchesBinding(e, 'insertBelow')) {
            insertTextArea(e, insertBefore = false)
        }
        else if (KB.matchesBinding(e, 'copyBlocks')) {
            copyBlocks();
        }
        else if (KB.matchesBinding(e, 'pasteBlocks')) {
            pasteBlocks();
        }
        else if (KB.matchesBinding(e, 'cutBlocks')) {
            cutBlocks();
        }
        else if (KB.matchesBinding(e, 'deselect')) {
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
        selectableElements[targetIndex].scrollIntoView({ behavior: 'auto', block: 'nearest' });
    });

    // Initial render
    renderMarkdown();
});
