//----------------------------------------------------------
// ~~~~~~~~~~~~~~~~~~Helper Functions~~~~~~~~~~~~~~~~~~~~~~~
//----------------------------------------------------------

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

// Function to render markdown to HTML, returns array of inserted nodes
function renderMarkdownPartial(textarea) {
    const markdownText = textarea.value;
    const isIndentedList = detectIndentedList(markdownText);

    const parent = textarea.parentNode;
    const insertBefore = textarea.nextSibling;

    // Special case: indented list with a preceding list element.
    // Combine the previous list's markdown with the raw indented markdown from cell 2,
    // then re-parse the combined result. This lets markdown's own nesting rules handle
    // arbitrary indent depths correctly.
    if (isIndentedList) {
        const prevSibling = textarea.previousElementSibling;
        if (prevSibling && (prevSibling.tagName === 'UL' || prevSibling.tagName === 'OL')) {
            const prevMarkdown = turndownService.turndown(prevSibling.outerHTML);
            const combinedMarkdown = prevMarkdown + '\n' + markdownText;
            const html = marked.parse(combinedMarkdown);

            const temp = document.createElement('div');
            temp.innerHTML = html;

            // Remove the previous list and the textarea
            const refNode = prevSibling.nextSibling === textarea ? insertBefore : prevSibling.nextSibling;
            prevSibling.remove();
            textarea.remove();

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
            setupSelectionHandlers();
            processMermaidBlocks(parent);
            return resultNodes;
        }
    }

    // Default path: parse normally (dedent if indented but no preceding list to combine with)
    const textToParse = isIndentedList ? dedentMarkdown(markdownText) : markdownText;
    const html = marked.parse(textToParse);

    const temp = document.createElement('div');
    temp.innerHTML = html;

    textarea.remove();

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

    setupSelectionHandlers();

    // Process any mermaid code blocks that were just inserted
    processMermaidBlocks(parent);

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
        if (selectableTypes.includes(current.tagName)) {
            return current;
        }
        if (current.classList && current.classList.contains('mermaid-container')) {
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
    // Get all potential selectable elements - focus on block-level elements
    selectableElements = Array.from(preview.querySelectorAll(':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > p, :scope > ul, :scope > ol, :scope > pre, :scope > blockquote, :scope > table, :scope > hr, :scope > textarea, :scope > .mermaid-container'));

    // Add click event to each element
    selectableElements.forEach((el, index) => {
        el.setAttribute('data-index', index);
        el.addEventListener('click', function(e) {
            e.stopPropagation(); // Prevent event bubbling

            // Deselect all other elements
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

function handleEnter(e) {
    e.preventDefault();
    // Filter out textareas — they're already in edit mode (multi-edit support)
    let selectedItems = Array.from(document.getElementsByClassName('selected'))
        .filter(el => el.tagName !== 'TEXTAREA');
    if (selectedItems.length === 0) return;

    // 1. Combine HTML from all selected elements
    let combinedHTML = '';
    for (let item of selectedItems) {
        combinedHTML += item.outerHTML;
    }

    // 2. Convert combined HTML to Markdown
    const markdown = turndownService.turndown(combinedHTML);

    // 3. Get parent node and reference for insertion
    const parent = selectedItems[0].parentNode;
    const insertBefore = selectedItems[selectedItems.length - 1].nextSibling;

    // 4. Remove all selected elements
    let totalHeight = 0;
    for (const item of selectedItems) {
        totalHeight += item.offsetHeight;
        item.remove();
    }

    // 5. Create a textarea and insert it where the first element was
    const textarea = document.createElement('textarea');
    textarea.value = markdown;
    const lineHeight = 18;
    const estimatedRows = Math.round(totalHeight / lineHeight);
    textarea.rows = estimatedRows;
    textarea.style.width = '100%';

    // Auto-resize on input
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

    // set cursor
    textarea.focus()

    // Add event listener for Ctrl+Enter
    textarea.addEventListener('keydown', function(e) {
        handleTextareaEvent(e, textarea)
    });

    // make textarea selectable when blurred
    saveIndex = currentSelectedIndex;
    setupSelectionHandlers();
    currentSelectedIndex = saveIndex;
}

function handleClick(e) {
    e.stopPropagation();

    // Find the closest selectable parent
    const closestSelectable = findClosestSelectableParent(this);
    if (closestSelectable) {
        // Blur any focused textarea so keyboard navigation returns to block mode
        const focused = document.activeElement;
        if (focused && focused.tagName === 'TEXTAREA') {
            focused.blur();
        }

        // Deselect all other elements
        deselectAll();

        // Select the parent block
        toggleSelection(closestSelectable);
        currentSelectedIndex = parseInt(closestSelectable.getAttribute('data-index'));
    }
}

function insertTextArea(e, insertBefore = true) {
    e.stopPropagation();
    e.preventDefault()

    let selectedItems = document.getElementsByClassName('selected');

    // 3. Get parent node and reference for insertion
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


    // Create a textarea and insert it above the currently selected element
    const textarea = document.createElement('textarea');
    textarea.rows = 1;
    textarea.style.width = '100%';

    // Auto-resize on input
    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    // insert
    if (insertElement) {
        parent.insertBefore(textarea, insertElement);
    } else {
        parent.appendChild(textarea);
    }

    // Deselect all other elements
    deselectAll();

    // Multi-edit: mark textarea when blurred, unmark when focused
    textarea.addEventListener('focus', function() {
        this.classList.remove('selected');
    });
    textarea.addEventListener('blur', function() {
        if (this.parentNode) this.classList.add('selected');
    });

    // set cursor
    textarea.focus()

    // Add event listener for Ctrl+Enter
    textarea.addEventListener('keydown', function(e) {
        handleTextareaEvent(e, textarea);
    });

    // make textarea selectable when blurred
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

function handleTextareaEvent(e, textarea) {
    if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault();
        const savedIndex = currentSelectedIndex;
        const insertedNodes = renderMarkdownPartial(textarea);
        selectInsertedNodes(insertedNodes, savedIndex);
    }
    else if (e.key === "Escape") {
        e.preventDefault();
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
