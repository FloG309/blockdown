//----------------------------------------------------------
// ~~~~~~~~~~~~~~~~~~Helper Functions~~~~~~~~~~~~~~~~~~~~~~~
//----------------------------------------------------------

/**
 * Scroll the #preview container so the CM cursor is visible.
 * Uses setTimeout to wait for CM to fully render the cursor after focus.
 */
function scrollCMCursorIntoView(view) {
    setTimeout(() => {
        const preview = document.getElementById('preview');
        if (!preview) return;
        const coords = view.coordsAtPos(view.state.selection.main.head);
        if (!coords) return;
        const previewRect = preview.getBoundingClientRect();
        const cursorInPreview = coords.top - previewRect.top;
        // Only scroll if the cursor is outside the visible area
        if (cursorInPreview < 0 || cursorInPreview > preview.clientHeight) {
            const targetScrollTop = preview.scrollTop + cursorInPreview - preview.clientHeight / 2;
            preview.scrollTo({ top: targetScrollTop, behavior: 'smooth' });
        }
    }, 50);
}

// Internal block clipboard (array of markdown strings)
var blockClipboard = [];

// Copy selected blocks to internal clipboard
function copyBlocks() {
    const selectedItems = document.querySelectorAll('.selected');
    if (selectedItems.length === 0) return;

    blockClipboard = [];
    selectedItems.forEach(el => {
        blockClipboard.push(turndownService.turndown(el.outerHTML));
    });
}

// Cut selected blocks (copy + delete)
function cutBlocks() {
    const selectedItems = document.querySelectorAll('.selected');
    if (selectedItems.length === 0) return;

    pushUndo();
    copyBlocks();

    // Delete the selected blocks
    selectedItems.forEach(el => el.remove());
    setupSelectionHandlers();
    currentSelectedIndex = Math.min(currentSelectedIndex, selectableElements.length - 1);
}

// Paste blocks from internal clipboard below current selection
function pasteBlocks() {
    if (blockClipboard.length === 0) return;

    pushUndo();

    const preview = document.getElementById('preview');
    const markdown = blockClipboard.join('\n\n');
    const html = marked.parse(markdown);

    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Find insertion point: after the last selected element, or at the end
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

    // Merge adjacent lists
    const resultNodes = mergeAdjacentLists(insertedNodes, preview);

    // Highlight code blocks
    highlightInsertedNodes(resultNodes);

    // Rebuild and select pasted blocks
    setupSelectionHandlers();
    deselectAll();
    resultNodes.forEach(node => {
        if (node.parentNode) node.classList.add('selected');
    });
    // Set currentSelectedIndex to the last pasted block
    const lastNode = resultNodes[resultNodes.length - 1];
    if (lastNode) {
        const idx = parseInt(lastNode.getAttribute('data-index'));
        if (!isNaN(idx)) currentSelectedIndex = idx;
    }
}

// Apply syntax highlighting to all code blocks within a container or node list
function highlightCodeBlocks(container) {
    const codeBlocks = container.querySelectorAll
        ? container.querySelectorAll('pre code')
        : [];
    codeBlocks.forEach(block => {
        hljs.highlightElement(block);
    });
}

// Highlight code blocks within a list of inserted nodes
function highlightInsertedNodes(nodes) {
    nodes.forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.tagName === 'PRE') {
                const code = node.querySelector('code');
                if (code) hljs.highlightElement(code);
            } else {
                const codeBlocks = node.querySelectorAll('pre code');
                codeBlocks.forEach(block => hljs.highlightElement(block));
            }
        }
    });
}

// Apply typography to a textarea to match the rendered block type
function applyBlockTypography(textarea, tagName) {
    switch (tagName) {
        case 'H1':
            textarea.style.fontSize = '2em';
            textarea.style.lineHeight = '1.2';
            textarea.style.fontWeight = '600';
            break;
        case 'H2':
            textarea.style.fontSize = '1.5em';
            textarea.style.lineHeight = '1.3';
            textarea.style.fontWeight = '600';
            break;
        case 'H3':
            textarea.style.fontSize = '1.25em';
            textarea.style.lineHeight = '1.4';
            textarea.style.fontWeight = '600';
            break;
        case 'H4':
        case 'H5':
        case 'H6':
            textarea.style.fontSize = '1em';
            textarea.style.lineHeight = '1.4';
            textarea.style.fontWeight = '600';
            break;
        case 'PRE':
            textarea.style.fontFamily = "'Courier New', Courier, monospace";
            textarea.style.fontSize = '0.9rem';
            textarea.style.lineHeight = '1.4';
            break;
        // P, BLOCKQUOTE, UL, OL, TABLE, HR — keep default textarea styles
    }
}

// Detect if markdown text starts with an indented list (sub-list)
function detectIndentedList(markdownText) {
    const lines = markdownText.split('\n');
    for (const line of lines) {
        const trimmed = line.trimStart();
        if (trimmed === '') continue;
        const leadingSpaces = line.length - trimmed.length;
        if (leadingSpaces >= 2 && /^[-*+]|\d+\./.test(trimmed)) {
            return true;
        }
        return false;
    }
    return false;
}

// Strip leading indentation from all lines (for sub-list parsing)
function dedentMarkdown(markdownText) {
    const lines = markdownText.split('\n');
    // Find minimum indentation of non-empty lines
    let minIndent = Infinity;
    for (const line of lines) {
        if (line.trim() === '') continue;
        const indent = line.length - line.trimStart().length;
        minIndent = Math.min(minIndent, indent);
    }
    if (minIndent === 0 || minIndent === Infinity) return markdownText;
    return lines.map(line => line.substring(Math.min(minIndent, line.length))).join('\n');
}

/**
 * Render markdown text from a given element (textarea or CM wrapper div).
 * Accepts either a textarea or a .cm-wrapper div.
 * Returns array of inserted DOM nodes.
 */
function renderMarkdownPartial(element) {
    // Extract markdown text: textarea uses .value, CM wrapper uses data attribute
    let markdownText;
    if (element.tagName === 'TEXTAREA') {
        markdownText = element.value;
    } else if (element.classList && element.classList.contains('cm-wrapper')) {
        // For CM wrapper, the text was passed via the onExit callback
        // and stored in the data attribute by the exit handler
        markdownText = element.getAttribute('data-markdown-text') || '';
    } else {
        markdownText = element.textContent || '';
    }

    const isIndentedList = detectIndentedList(markdownText);

    const parent = element.parentNode;
    const insertBefore = element.nextSibling;

    // Special case: indented list with a preceding list element.
    if (isIndentedList) {
        const prevSibling = element.previousElementSibling;
        if (prevSibling && (prevSibling.tagName === 'UL' || prevSibling.tagName === 'OL')) {
            const prevMarkdown = turndownService.turndown(prevSibling.outerHTML);
            const combinedMarkdown = prevMarkdown + '\n' + markdownText;
            const html = marked.parse(combinedMarkdown);

            const temp = document.createElement('div');
            temp.innerHTML = html;

            const refNode = prevSibling.nextSibling === element ? insertBefore : prevSibling.nextSibling;
            prevSibling.remove();
            // Destroy CM editor if present before removing
            destroyCMEditor(element);
            element.remove();

            const insertedNodes = [];
            while (temp.firstChild) {
                const node = temp.firstChild;
                parent.insertBefore(node, refNode);
                if (node.nodeType === Node.ELEMENT_NODE) {
                    insertedNodes.push(node);
                }
            }

            const resultNodes = mergeAdjacentLists(insertedNodes, parent, false);
            highlightInsertedNodes(resultNodes);
            setupSelectionHandlers();
            processMermaidBlocks(parent);
            return resultNodes;
        }
    }

    // Default path
    const textToParse = isIndentedList ? dedentMarkdown(markdownText) : markdownText;
    const html = marked.parse(textToParse);

    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Destroy CM editor if present before removing
    destroyCMEditor(element);
    element.remove();

    const insertedNodes = [];
    while (temp.firstChild) {
        const node = temp.firstChild;
        parent.insertBefore(node, insertBefore);
        if (node.nodeType === Node.ELEMENT_NODE) {
            insertedNodes.push(node);
        }
    }

    const resultNodes = mergeAdjacentLists(insertedNodes, parent, false);

    highlightInsertedNodes(resultNodes);
    setupSelectionHandlers();

    // Process any mermaid code blocks that were just inserted
    processMermaidBlocks(parent);

    return resultNodes;
}

/**
 * Destroy a CodeMirror editor inside a wrapper element, if any.
 */
function destroyCMEditor(element) {
    if (element._cmView && window.CM) {
        window.CM.destroyEditor(element._cmView);
        element._cmView = null;
    }
}

// Merge adjacent lists of the same type (flat merge only).
function mergeAdjacentLists(insertedNodes, parent) {
    const resultNodes = new Set(insertedNodes);

    insertedNodes.forEach(node => {
        if (node.tagName === 'UL' || node.tagName === 'OL') {
            const prev = node.previousElementSibling;
            if (prev && prev.tagName === node.tagName) {
                while (node.firstChild) {
                    prev.appendChild(node.firstChild);
                }
                node.remove();
                resultNodes.delete(node);
                resultNodes.add(prev);
            }
        }
    });

    const currentNodes = Array.from(resultNodes);
    currentNodes.forEach(node => {
        if (node.parentNode && (node.tagName === 'UL' || node.tagName === 'OL')) {
            const next = node.nextElementSibling;
            if (next && next.tagName === node.tagName) {
                while (next.firstChild) {
                    node.appendChild(next.firstChild);
                }
                next.remove();
            }
        }
    });

    return Array.from(resultNodes).filter(n => n.parentNode);
}

// Find the closest parent that is a selectable block element
function findClosestSelectableParent(element) {
    const selectableTypes = ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'UL', 'OL', 'PRE', 'BLOCKQUOTE', 'TABLE', 'HR', 'TEXTAREA'];

    let current = element;
    while (current && current !== preview) {
        if (selectableTypes.includes(current.tagName)) {
            return current;
        }
        if (current.classList && current.classList.contains('mermaid-container')) {
            return current;
        }
        // Check for CM wrapper div
        if (current.classList && current.classList.contains('cm-wrapper')) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

// Deselect all elements (blurred textareas keep .selected for multi-edit visibility)
function deselectAll() {
    selectableElements.forEach(el => {
        if (el.tagName === 'TEXTAREA' && el !== document.activeElement) return;
        el.classList.remove('selected');
    });
}

// Set up click handlers for selectable elements
function setupSelectionHandlers() {
    // Get all potential selectable elements - include .cm-wrapper and .mermaid-container
    selectableElements = Array.from(preview.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p, :scope > ul, :scope > ol, :scope > pre, :scope > blockquote, :scope > table, :scope > hr, :scope > textarea, :scope > .cm-wrapper, :scope > .mermaid-container'));

    // Add click event to each element
    selectableElements.forEach((el, index) => {
        el.setAttribute('data-index', index);
        el.addEventListener('click', function(e) {
            e.stopPropagation();

            deselectAll();

            if (this.tagName === 'TEXTAREA') {
                // Clicking a textarea re-focuses it — focus/blur handlers manage .selected
                this.focus();
            } else {
                // Blur any focused textarea so keyboard navigation returns to block mode
                const focused = document.activeElement;
                if (focused && focused.tagName === 'TEXTAREA') {
                    focused.blur();
                }
                toggleSelection(this);
            }
            currentSelectedIndex = parseInt(this.getAttribute('data-index'));
        });
    });

    // Add click handlers to inner elements
    const innerElements = Array.from(preview.querySelectorAll('li, code, td, th, a, img'));
    innerElements.forEach(el => {
        el.addEventListener('click', function(e) {
            handleClick(e)
        });
    });

    currentSelectedIndex = -1;
}

// Toggle selection state of an element
function toggleSelection(element) {
    element.classList.toggle('selected');
}

//----------------------------------------------------------
// ~~~~~~~~~~~~~~~~~~~~Event Handlers~~~~~~~~~~~~~~~~~~~~~~~
//----------------------------------------------------------


function handleArrowUp(e) {
    e.preventDefault();
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        newIndex = selectableElements.length - 1;
    } else {
        newIndex = Math.max(0, newIndex - 1);
    }

    const targetElement = selectableElements[newIndex];
    deselectAll();
    targetElement.classList.add('selected');
    currentSelectedIndex = newIndex;

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleArrowDown(e) {
    e.preventDefault();
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        newIndex = 0;
    } else {
        newIndex = Math.min(selectableElements.length - 1, newIndex + 1);
    }

    const targetElement = selectableElements[newIndex];
    deselectAll();
    targetElement.classList.add('selected');
    currentSelectedIndex = newIndex;

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleShiftArrowUp(e) {
    e.preventDefault();
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        newIndex = selectableElements.length - 1;
    } else {
        newIndex = Math.max(0, newIndex - 1);
    }

    const targetElement = selectableElements[newIndex];
    if (targetElement.classList.contains('selected') && newIndex != 0) {
        const currentElement = selectableElements[currentSelectedIndex];
        currentElement.classList.remove('selected');
    }
    else {
        targetElement.classList.add('selected');
    }
    currentSelectedIndex = newIndex;

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleShiftArrowDown(e) {
    e.preventDefault();
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        newIndex = 0;
    } else {
        newIndex = Math.min(selectableElements.length - 1, newIndex + 1);
    }

    const targetElement = selectableElements[newIndex];
    if (targetElement.classList.contains('selected') && newIndex != selectableElements.length - 1) {
        const currentElement = selectableElements[currentSelectedIndex];
        currentElement.classList.remove('selected');
    }
    else {
        targetElement.classList.add('selected');
    }
    currentSelectedIndex = newIndex;

    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleShiftEnter(e) {
    e.preventDefault();
    renderMarkdownPartial(textarea);
}

/**
 * Creates a CodeMirror editor in a wrapper div, or falls back to a textarea
 * if CodeMirror hasn't loaded yet.
 */
function createEditElement(markdown, totalHeight, firstTag, parent, insertBefore) {
    if (window.CM && window.CM.ready) {
        // Create wrapper div for CodeMirror
        const wrapper = document.createElement('div');
        wrapper.className = 'cm-wrapper';
        wrapper.style.width = '100%';
        if (totalHeight > 0) {
            wrapper.style.minHeight = totalHeight + 'px';
        }
        if (insertBefore) {
            parent.insertBefore(wrapper, insertBefore);
        } else {
            parent.appendChild(wrapper);
        }

        // onExit callback: store text in wrapper, then render
        const onExit = (text) => {
            wrapper.setAttribute('data-markdown-text', text);
            pushUndo();
            const savedIndex = currentSelectedIndex;
            const insertedNodes = renderMarkdownPartial(wrapper);
            selectInsertedNodes(insertedNodes, savedIndex);
        };

        // Use mermaid-specific editor (with linting) if content is a mermaid block
        const isMermaid = /^```mermaid\b/m.test(markdown.trim());
        const createFn = isMermaid && window.CM.createMermaidEditor
            ? window.CM.createMermaidEditor
            : window.CM.createMarkdownEditor;
        const view = createFn(wrapper, markdown, onExit);
        wrapper._cmView = view;

        // Focus the editor and scroll the cursor into view
        view.focus();
        scrollCMCursorIntoView(view);

        return wrapper;
    } else {
        // Fallback to textarea if CM not loaded
        return createTextareaElement(markdown, totalHeight, firstTag, parent, insertBefore);
    }
}

/**
 * Creates a textarea element (fallback when CM isn't available).
 */
function createTextareaElement(markdown, totalHeight, firstTag, parent, insertBefore) {
    const textarea = document.createElement('textarea');
    textarea.value = markdown;
    textarea.style.width = '100%';

    if (firstTag) {
        applyBlockTypography(textarea, firstTag);
    }

    if (totalHeight > 0) {
        textarea.style.height = totalHeight + 'px';
        textarea.style.minHeight = totalHeight + 'px';
    } else {
        textarea.rows = 1;
    }

    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    if (insertBefore) {
        parent.insertBefore(textarea, insertBefore);
    } else {
        parent.appendChild(textarea);
    }

    // Multi-edit: mark textarea when blurred, unmark when focused
    textarea.addEventListener('focus', function() {
        this.classList.remove('selected');
    });
    textarea.addEventListener('blur', function() {
        if (this.parentNode) this.classList.add('selected');
    });

    textarea.focus();

    textarea.addEventListener('keydown', function(e) {
        handleTextareaEvent(e, textarea);
    });

    return textarea;
}

function handleEnter(e) {
    e.preventDefault();
    pushUndo();
    let selectedItems = Array.from(document.getElementsByClassName('selected'));

    // 1. Extract markdown from each selected block, handling editors and rendered blocks
    const markdownParts = [];
    let firstRenderedTag = null;
    for (const item of selectedItems) {
        if (item.tagName === 'TEXTAREA') {
            markdownParts.push(item.value);
        } else if (item.classList && item.classList.contains('cm-wrapper')) {
            // Extract text directly from the CM editor instance
            if (item._cmView) {
                markdownParts.push(item._cmView.state.doc.toString());
            } else {
                markdownParts.push(item.getAttribute('data-markdown-text') || '');
            }
        } else {
            if (!firstRenderedTag) firstRenderedTag = item.tagName;
            markdownParts.push(turndownService.turndown(item.outerHTML));
        }
    }
    const markdown = markdownParts.join('\n\n');

    // 2. Get parent node and reference for insertion
    const parent = selectedItems[0].parentNode;
    const firstTag = firstRenderedTag || selectedItems[0].tagName;
    const insertBeforeRef = selectedItems[selectedItems.length - 1].nextSibling;

    // 3. Remove all selected elements, destroying CM editors
    let totalHeight = 0;
    for (const item of selectedItems) {
        totalHeight += item.offsetHeight;
        destroyCMEditor(item);
        item.remove();
    }

    // 4. Create edit element (CodeMirror or textarea fallback)
    const editEl = createEditElement(markdown, totalHeight, firstTag, parent, insertBeforeRef);

    // make edit element selectable when blurred
    saveIndex = currentSelectedIndex;
    setupSelectionHandlers();
    currentSelectedIndex = saveIndex;
}

function handleClick(e) {
    e.stopPropagation();

    const closestSelectable = findClosestSelectableParent(this);
    if (closestSelectable) {
        // Blur any focused textarea so keyboard navigation returns to block mode
        const focused = document.activeElement;
        if (focused && focused.tagName === 'TEXTAREA') {
            focused.blur();
        }

        deselectAll();

        toggleSelection(closestSelectable);
        currentSelectedIndex = parseInt(closestSelectable.getAttribute('data-index'));
    }
}

function insertTextArea(e, insertBefore = true) {
    e.stopPropagation();
    e.preventDefault();
    pushUndo();

    let selectedItems = document.getElementsByClassName('selected');

    const parent = selectedItems[0].parentNode;
    let newIndex;
    let insertElement;
    if (insertBefore) {
        insertElement = selectableElements[currentSelectedIndex];
        newIndex = currentSelectedIndex;
    } else {
        insertElement = selectableElements[currentSelectedIndex + 1];
        newIndex = currentSelectedIndex + 1;
    }

    // Create edit element (CodeMirror or textarea fallback)
    const editEl = createEditElement('', 0, null, parent, insertElement);

    deselectAll();

    setupSelectionHandlers();
    currentSelectedIndex = newIndex;
}


function selectInsertedNodes(insertedNodes, savedIndex) {
    if (insertedNodes.length > 0) {
        deselectAll();
        insertedNodes.forEach(node => {
            if (node.parentNode) {
                node.classList.add('selected');
            }
        });
        const firstNode = insertedNodes.find(n => n.parentNode);
        if (firstNode) {
            const idx = parseInt(firstNode.getAttribute('data-index'));
            if (!isNaN(idx)) {
                currentSelectedIndex = idx;
            } else {
                currentSelectedIndex = savedIndex;
            }
        }
    }
}

function handleTextareaEvent(e, textarea) {
    if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        pushUndo();
        const savedIndex = currentSelectedIndex;
        const insertedNodes = renderMarkdownPartial(textarea);
        selectInsertedNodes(insertedNodes, savedIndex);
    }
    else if (e.key === "Escape") {
        e.preventDefault();
        textarea.blur();
        textarea.classList.add('selected');
    }
    else if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const spaces = '    ';
        textarea.value = textarea.value.substring(0, start) + spaces + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
        textarea.dispatchEvent(new Event('input'));
    }
}
