// markdownHighlight.js — Syntax highlighting for raw markdown in contenteditable edit mode
// Provides: highlightMarkdown(text), saveCaretOffset(editableDiv), restoreCaretOffset(editableDiv, offset)

/**
 * HTML-escape user text to prevent XSS.
 * All user-provided text MUST pass through this before being inserted into innerHTML.
 */
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

/**
 * Apply inline markdown highlighting to a single line of text.
 * Handles: bold (**...**), italic (*...*), inline code (`...`), links [text](url)
 * Delimiter characters get the .md-dim class.
 */
function highlightInline(escapedLine) {
    // Inline code: `...` (must be processed first to avoid conflicts with bold/italic inside code)
    escapedLine = escapedLine.replace(/`([^`]+)`/g, function(match, code) {
        return '<span class="md-dim">`</span><span class="md-inline-code">' + code + '</span><span class="md-dim">`</span>';
    });

    // Bold: **...** (non-greedy, no nesting)
    escapedLine = escapedLine.replace(/\*\*(.+?)\*\*/g, function(match, inner) {
        return '<span class="md-dim">**</span><span class="md-bold">' + inner + '</span><span class="md-dim">**</span>';
    });

    // Italic: *...* (non-greedy, avoid matching ** which is bold)
    // Use a negative lookbehind/lookahead for * to avoid matching bold delimiters
    escapedLine = escapedLine.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, function(match, inner) {
        return '<span class="md-dim">*</span><span class="md-italic">' + inner + '</span><span class="md-dim">*</span>';
    });

    // Links: [text](url)
    escapedLine = escapedLine.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(match, text, url) {
        return '<span class="md-dim">[</span><span class="md-link-text">' + text + '</span><span class="md-dim">](</span><span class="md-dim">' + url + '</span><span class="md-dim">)</span>';
    });

    return escapedLine;
}

/**
 * highlightMarkdown(text) — Main highlighting function
 *
 * Input: Raw markdown string (plain text from contenteditable div's textContent).
 * Output: HTML string ready to be set as innerHTML of the contenteditable div.
 *
 * Two-pass approach:
 *   Pass 1 — Block-level (line-by-line): Identify heading lines, blockquote lines, list items,
 *            fenced code block delimiters, code block body lines, blank lines.
 *   Pass 2 — Inline (within each non-code line): Bold, italic, inline code, links.
 */
function highlightMarkdown(text) {
    const lines = text.split('\n');
    const result = [];
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
        const rawLine = lines[i];
        const escaped = escapeHtml(rawLine);

        // Fenced code block delimiters: ``` or ~~~
        if (/^(`{3,}|~{3,})/.test(rawLine)) {
            if (inCodeBlock) {
                // Closing fence
                result.push('<div class="md-code-fence"><span class="md-dim">' + escaped + '</span></div>');
                inCodeBlock = false;
            } else {
                // Opening fence
                result.push('<div class="md-code-fence"><span class="md-dim">' + escaped + '</span></div>');
                inCodeBlock = true;
            }
            continue;
        }

        // Inside a code block: monospace, no inline highlighting
        if (inCodeBlock) {
            result.push('<div class="md-code-line">' + escaped + '</div>');
            continue;
        }

        // Blank line
        if (rawLine.trim() === '') {
            result.push('<div class="md-blank-line">\n</div>');
            continue;
        }

        // Heading lines: # through ######
        const headingMatch = rawLine.match(/^(#{1,6})\s/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const prefix = escapeHtml(headingMatch[1] + ' ');
            const rest = escapeHtml(rawLine.substring(headingMatch[0].length));
            const inlineHighlighted = highlightInline(rest);
            result.push('<div class="md-h' + level + '"><span class="md-dim">' + prefix + '</span>' + inlineHighlighted + '</div>');
            continue;
        }

        // Blockquote lines: > ...
        if (/^>\s?/.test(rawLine)) {
            const markerMatch = rawLine.match(/^(>\s?)/);
            const prefix = escapeHtml(markerMatch[1]);
            const rest = escapeHtml(rawLine.substring(markerMatch[0].length));
            const inlineHighlighted = highlightInline(rest);
            result.push('<div class="md-blockquote"><span class="md-dim">' + prefix + '</span>' + inlineHighlighted + '</div>');
            continue;
        }

        // List item lines: - , * , + , or 1. 2. etc (with optional leading whitespace)
        const listMatch = rawLine.match(/^(\s*)([-*+]|\d+\.)\s/);
        if (listMatch) {
            const indent = escapeHtml(listMatch[1]);
            const marker = escapeHtml(listMatch[2] + ' ');
            const rest = escapeHtml(rawLine.substring(listMatch[0].length));
            const inlineHighlighted = highlightInline(rest);
            result.push('<div class="md-list-item">' + indent + '<span class="md-dim">' + marker + '</span>' + inlineHighlighted + '</div>');
            continue;
        }

        // Default: paragraph line with inline highlighting
        result.push('<div>' + highlightInline(escaped) + '</div>');
    }

    return result.join('');
}

/**
 * saveCaretOffset(editableDiv) — Compute flat character offset from the start
 * of the contenteditable div to the current Selection anchor.
 * Uses TreeWalker to walk text nodes and accumulate character counts.
 * Returns -1 if no valid selection is found within the div.
 */
function saveCaretOffset(editableDiv) {
    const selection = window.getSelection();
    if (!selection.rangeCount) return -1;

    const range = selection.getRangeAt(0);

    // Ensure the anchor is within our editable div
    if (!editableDiv.contains(range.startContainer)) return -1;

    let offset = 0;
    const walker = document.createTreeWalker(editableDiv, NodeFilter.SHOW_TEXT, null);
    let node;

    while ((node = walker.nextNode())) {
        if (node === range.startContainer) {
            offset += range.startOffset;
            return offset;
        }
        offset += node.textContent.length;
    }

    // Fallback: if anchor is the element itself (e.g., empty div), use child offset
    return offset;
}

/**
 * restoreCaretOffset(editableDiv, offset) — Restore the caret position
 * after innerHTML replacement by walking text nodes to find the target offset.
 */
function restoreCaretOffset(editableDiv, offset) {
    if (offset < 0) return;

    const walker = document.createTreeWalker(editableDiv, NodeFilter.SHOW_TEXT, null);
    let currentOffset = 0;
    let node;

    while ((node = walker.nextNode())) {
        const len = node.textContent.length;
        if (currentOffset + len >= offset) {
            const selection = window.getSelection();
            const range = document.createRange();
            range.setStart(node, offset - currentOffset);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            return;
        }
        currentOffset += len;
    }

    // If offset exceeds total text length, place caret at end
    const lastNode = walker.currentNode || editableDiv;
    if (lastNode.nodeType === Node.TEXT_NODE) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(lastNode, lastNode.textContent.length);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    } else {
        // Place caret at the end of the div
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableDiv);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}
