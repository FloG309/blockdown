//----------------------------------------------------------
// ~~~~~~~~~~~~~~~~~~Helper Functions~~~~~~~~~~~~~~~~~~~~~~~
//----------------------------------------------------------

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

// Apply typography to a contenteditable div to match the rendered block type
function applyBlockTypography(editable, tagName) {
    switch (tagName) {
        case 'H1':
            editable.style.fontSize = '2em';
            editable.style.lineHeight = '1.2';
            editable.style.fontWeight = '600';
            break;
        case 'H2':
            editable.style.fontSize = '1.5em';
            editable.style.lineHeight = '1.3';
            editable.style.fontWeight = '600';
            break;
        case 'H3':
            editable.style.fontSize = '1.25em';
            editable.style.lineHeight = '1.4';
            editable.style.fontWeight = '600';
            break;
        case 'H4':
        case 'H5':
        case 'H6':
            editable.style.fontSize = '1em';
            editable.style.lineHeight = '1.4';
            editable.style.fontWeight = '600';
            break;
        case 'PRE':
            editable.style.fontFamily = "'Courier New', Courier, monospace";
            editable.style.fontSize = '0.9rem';
            editable.style.lineHeight = '1.4';
            break;
        // P, BLOCKQUOTE, UL, OL, TABLE, HR — keep default styles
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
 * Extract plain text from a contenteditable div, preserving line breaks.
 * Uses innerText which respects visual line breaks from <div>/<br> elements.
 */
function getEditableText(el) {
    if (el.tagName === 'TEXTAREA') return el.value;
    // innerText preserves line breaks from <div> and <br> elements in contenteditable
    return el.innerText;
}

// Function to render markdown to HTML, returns array of inserted nodes
// Accepts either a textarea or a contenteditable div
function renderMarkdownPartial(editableEl) {
    const markdownText = getEditableText(editableEl);
    const isIndentedList = detectIndentedList(markdownText);

    const parent = editableEl.parentNode;
    const insertBefore = editableEl.nextSibling;

    // Special case: indented list with a preceding list element.
    if (isIndentedList) {
        const prevSibling = editableEl.previousElementSibling;
        if (prevSibling && (prevSibling.tagName === 'UL' || prevSibling.tagName === 'OL')) {
            const prevMarkdown = turndownService.turndown(prevSibling.outerHTML);
            const combinedMarkdown = prevMarkdown + '\n' + markdownText;
            const html = marked.parse(combinedMarkdown);

            const temp = document.createElement('div');
            temp.innerHTML = html;

            // Remove the previous list and the editable element
            const refNode = prevSibling.nextSibling === editableEl ? insertBefore : prevSibling.nextSibling;
            prevSibling.remove();
            editableEl.remove();

            const insertedNodes = [];
            while (temp.firstChild) {
                const node = temp.firstChild;
                parent.insertBefore(node, refNode);
                if (node.nodeType === Node.ELEMENT_NODE) {
                    insertedNodes.push(node);
                }
            }

            // Still run forward-merge in case the next sibling is also a same-type list
            const resultNodes = mergeAdjacentLists(insertedNodes, parent, false);
            highlightInsertedNodes(resultNodes);
            setupSelectionHandlers();
            return resultNodes;
        }
    }

    // Default path: parse normally (dedent if indented but no preceding list to combine with)
    const textToParse = isIndentedList ? dedentMarkdown(markdownText) : markdownText;
    const html = marked.parse(textToParse);

    const temp = document.createElement('div');
    temp.innerHTML = html;

    editableEl.remove();

    const insertedNodes = [];
    while (temp.firstChild) {
        const node = temp.firstChild;
        parent.insertBefore(node, insertBefore);
        if (node.nodeType === Node.ELEMENT_NODE) {
            insertedNodes.push(node);
        }
    }

    // Auto-merge adjacent lists (flat merge only in default path)
    const resultNodes = mergeAdjacentLists(insertedNodes, parent, false);

    highlightInsertedNodes(resultNodes);
    setupSelectionHandlers();
    return resultNodes;
}

// Merge adjacent lists of the same type (flat merge only).
// Returns the array of top-level nodes that should be selected after merging.
function mergeAdjacentLists(insertedNodes, parent) {
    const resultNodes = new Set(insertedNodes);

    // Backward merge: if an inserted list has a same-type list before it, merge into it
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

    // Forward merge: if an inserted/merged list has a same-type list after it, absorb it
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
        if (selectableTypes.includes(current.tagName) || (current.classList && current.classList.contains('md-editable'))) {
            return current;
        }
        current = current.parentElement;
    }
    return null;
}

// Deselect all elements
function deselectAll() {
    selectableElements.forEach(el => {
        el.classList.remove('selected');
    });
}

// Set up click handlers for selectable elements
function setupSelectionHandlers() {
    // Get all potential selectable elements - focus on block-level elements
    // Include contenteditable divs (div.md-editable) alongside rendered blocks
    selectableElements = Array.from(preview.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p, :scope > ul, :scope > ol, :scope > pre, :scope > blockquote, :scope > table, :scope > hr, :scope > textarea, :scope > div.md-editable'));

    // Add click event to each element
    selectableElements.forEach((el, index) => {
        el.setAttribute('data-index', index);
        el.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent event bubbling

            // Deselect all other elements
            deselectAll();

            // Select only this element
            toggleSelection(this);
            currentSelectedIndex = parseInt(this.getAttribute('data-index'));
        });
    });

    // Add click handlers to inner elements to prevent event bubbling and ensure proper selection
    const innerElements = Array.from(preview.querySelectorAll('li, code, td, th, a, img'));
    innerElements.forEach(el => {
        el.addEventListener('click', function(e) {
            handleClick(e)
        });
    });

    // Reset currentSelectedIndex
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
    // Move selection up
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        // If nothing selected, select the last element
        newIndex = selectableElements.length - 1;
    } else {
        newIndex = Math.max(0, newIndex - 1);
    }

    const targetElement = selectableElements[newIndex];
    deselectAll();
    targetElement.classList.add('selected');
    currentSelectedIndex = newIndex;

    // Scroll element into view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleArrowDown(e) {
    e.preventDefault();
    // Move selection down
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        // If nothing selected, select the first element
        newIndex = 0;
    } else {
        newIndex = Math.min(selectableElements.length - 1, newIndex + 1);
    }

    const targetElement = selectableElements[newIndex];
    deselectAll();
    targetElement.classList.add('selected');
    currentSelectedIndex = newIndex;

    // Scroll element into view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleShiftArrowUp(e) {
    e.preventDefault();
    // Move selection up
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        // If nothing selected, select the last element
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

    // Scroll element into view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleShiftArrowDown(e) {
    e.preventDefault();
    // Move selection down
    let newIndex = currentSelectedIndex;
    if (newIndex === -1) {
        // If nothing selected, select the first element
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

    // Scroll element into view
    targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function handleShiftEnter(e) {
    e.preventDefault();
    renderMarkdownPartial(textarea);
}

/**
 * Create a contenteditable div for editing, replacing textarea usage.
 * Applies syntax highlighting to raw markdown and supports live re-highlighting.
 */
function createEditableDiv(markdown, totalHeight, firstTag) {
    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.className = 'md-editable';
    editable.style.width = '100%';

    // Apply block-type typography for minimal layout shift
    applyBlockTypography(editable, firstTag);

    // Use captured height directly for min-height
    if (totalHeight > 0) {
        editable.style.height = totalHeight + 'px';
        editable.style.minHeight = totalHeight + 'px';
    }

    // Apply initial syntax highlighting
    editable.innerHTML = highlightMarkdown(markdown);

    // Track last content to avoid unnecessary re-highlights
    let lastContent = editable.innerText;

    // Live re-highlighting on input with caret save/restore
    editable.addEventListener('input', function() {
        const currentContent = getEditableText(this);
        if (currentContent === lastContent) return;
        lastContent = currentContent;

        const offset = saveCaretOffset(this);
        this.innerHTML = highlightMarkdown(currentContent);
        restoreCaretOffset(this, offset);
    });

    // Plain-text-only paste handler — strip HTML formatting
    editable.addEventListener('paste', function(e) {
        e.preventDefault();
        const plainText = e.clipboardData.getData('text/plain');
        document.execCommand('insertText', false, plainText);
    });

    // Keyboard event handler for Shift+Enter, Escape, Tab
    editable.addEventListener('keydown', function(e) {
        handleEditableEvent(e, editable);
    });

    return editable;
}

function handleEnter(e) {
    e.preventDefault();
    pushUndo();
    let selectedItems = document.getElementsByClassName('selected');
    // 1. Combine HTML from all selected elements
    let combinedHTML = '';
    for (let item of selectedItems) {
        combinedHTML += item.outerHTML;
    }

    // 2. Convert combined HTML to Markdown
    const markdown = turndownService.turndown(combinedHTML);

    // 3. Get parent node and reference for insertion
    const parent = selectedItems[0].parentNode;
    const firstTag = selectedItems[0].tagName;
    const insertBefore = selectedItems[selectedItems.length - 1].nextSibling;

    // 4. Remove all selected elements
    let totalHeight = 0;
    while (selectedItems.length > 0) {
        totalHeight += selectedItems[0].offsetHeight
        selectedItems[0].remove();
    }

    // 5. Create a contenteditable div instead of textarea
    const editable = createEditableDiv(markdown, totalHeight, firstTag);

    if (insertBefore) {
        parent.insertBefore(editable, insertBefore);
    } else {
        parent.appendChild(editable);
    }

    // set cursor at end of content
    editable.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);

    // make editable div selectable when blurred
    saveIndex = currentSelectedIndex;
    setupSelectionHandlers();
    currentSelectedIndex = saveIndex;
}

function handleClick(e) {
    e.stopPropagation();

    // Find the closest selectable parent
    const closestSelectable = findClosestSelectableParent(this);
    if (closestSelectable) {
        // Deselect all other elements
        deselectAll();

        // Select the parent block
        toggleSelection(closestSelectable);
        currentSelectedIndex = parseInt(closestSelectable.getAttribute('data-index'));
    }
}

function insertTextArea(e, insertBefore = true) {
    e.stopPropagation();
    e.preventDefault();
    pushUndo();

    let selectedItems = document.getElementsByClassName('selected');

    // Get parent node and reference for insertion
    const parent = selectedItems[0].parentNode;
    let newIndex
    let insertElement
    if (insertBefore) {
        insertElement = selectableElements[currentSelectedIndex];
        newIndex = currentSelectedIndex
    } else {
        insertElement = selectableElements[currentSelectedIndex + 1];
        newIndex = currentSelectedIndex + 1
    }

    // Create a contenteditable div (empty, for new content)
    const editable = createEditableDiv('', 0, '');

    // insert
    if (insertElement) {
        parent.insertBefore(editable, insertElement);
    } else {
        parent.appendChild(editable);
    }

    // Deselect all other elements
    deselectAll();

    // set cursor
    editable.focus()

    // make editable div selectable when blurred
    setupSelectionHandlers();
    currentSelectedIndex = newIndex
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

/**
 * Handle keyboard events inside a contenteditable div (edit mode).
 * Shift+Enter and Escape exit edit mode and render.
 * Tab inserts spaces.
 */
function handleEditableEvent(e, editable) {
    if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        pushUndo();
        const savedIndex = currentSelectedIndex;
        const insertedNodes = renderMarkdownPartial(editable);
        selectInsertedNodes(insertedNodes, savedIndex);
    }
    else if (e.key === "Escape") {
        e.preventDefault();
        pushUndo();
        const savedIndex = currentSelectedIndex;
        const insertedNodes = renderMarkdownPartial(editable);
        selectInsertedNodes(insertedNodes, savedIndex);
    }
    else if (e.key === 'Tab') {
        e.preventDefault();
        // Insert spaces at cursor position using execCommand
        document.execCommand('insertText', false, '    ');
    }
}

// Keep backward compatibility: handleTextareaEvent still works for any leftover textareas
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
        pushUndo();
        const savedIndex = currentSelectedIndex;
        const insertedNodes = renderMarkdownPartial(textarea);
        selectInsertedNodes(insertedNodes, savedIndex);
    }
    else if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const spaces = '    ';
        textarea.value = textarea.value.substring(0, start) + spaces + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
        // Trigger input event for auto-resize
        textarea.dispatchEvent(new Event('input'));
    }
}
