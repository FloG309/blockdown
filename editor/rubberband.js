// Feature 4: Rubber band (lasso) selection
// Draws a selection rectangle on mousedown+drag over #preview.
// On mouseup, selects all block elements whose bounding rects intersect the rubber band.
// Also creates a native text selection for the text under the rubber band.

(function () {
    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let startScrollTop = 0;   // scroll position at mousedown
    let lastMouseX = 0;
    let lastMouseY = 0;
    let bandEl = null;
    let startCaret = null;
    let scrollContainer = null; // set in DOMContentLoaded

    // Minimum drag distance (px) before we treat it as a rubber band vs a click
    const DRAG_THRESHOLD = 5;
    let didDrag = false;

    // Auto-scroll config
    const EDGE_THRESHOLD = 50;  // px from container edge to start scrolling
    const MAX_SCROLL_SPEED = 15;

    // Cross-browser caret position from viewport coordinates
    function getCaretAtPoint(x, y) {
        if (document.caretRangeFromPoint) {
            return document.caretRangeFromPoint(x, y);
        }
        if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(x, y);
            if (pos) {
                const range = document.createRange();
                range.setStart(pos.offsetNode, pos.offset);
                range.setEnd(pos.offsetNode, pos.offset);
                return range;
            }
        }
        return null;
    }

    function createBandElement() {
        const el = document.createElement('div');
        el.id = 'rubber-band';
        el.style.position = 'fixed';
        el.style.border = '1px dashed #2b77d9';
        el.style.backgroundColor = 'rgba(43, 119, 217, 0.08)';
        el.style.pointerEvents = 'none';
        el.style.zIndex = '9999';
        el.style.display = 'none';
        document.body.appendChild(el);
        return el;
    }

    // Compute the scroll-adjusted start Y in current viewport coordinates
    function getAdjustedStartY() {
        if (!scrollContainer) return startY;
        const scrollDelta = scrollContainer.scrollTop - startScrollTop;
        return startY - scrollDelta;
    }

    function updateBand(x, y) {
        const adjStartY = getAdjustedStartY();
        const left = Math.min(startX, x);
        const top = Math.min(adjStartY, y);
        const width = Math.abs(x - startX);
        const height = Math.abs(y - adjStartY);
        bandEl.style.left = left + 'px';
        bandEl.style.top = top + 'px';
        bandEl.style.width = width + 'px';
        bandEl.style.height = height + 'px';
    }

    function rectsIntersect(a, b) {
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    function getBandRect() {
        return bandEl.getBoundingClientRect();
    }

    // Auto-scroll the container when the mouse is near the top/bottom edge
    function autoScroll(mouseY) {
        if (!scrollContainer) return;
        const rect = scrollContainer.getBoundingClientRect();

        if (mouseY > rect.bottom - EDGE_THRESHOLD) {
            const overshoot = mouseY - (rect.bottom - EDGE_THRESHOLD);
            scrollContainer.scrollTop += Math.min(MAX_SCROLL_SPEED, overshoot * 0.5);
        } else if (mouseY < rect.top + EDGE_THRESHOLD) {
            const overshoot = (rect.top + EDGE_THRESHOLD) - mouseY;
            scrollContainer.scrollTop -= Math.min(MAX_SCROLL_SPEED, overshoot * 0.5);
        }
    }

    // Update the native text selection between start and current mouse position
    function updateTextSelection(curX, curY) {
        if (!startCaret) return;

        const endCaret = getCaretAtPoint(curX, curY);
        if (!endCaret) return;

        const sel = window.getSelection();
        sel.removeAllRanges();

        const range = document.createRange();
        const startNode = startCaret.startContainer;
        const startOffset = startCaret.startOffset;
        const endNode = endCaret.startContainer;
        const endOffset = endCaret.startOffset;

        // Determine DOM order and set range accordingly
        if (startNode === endNode) {
            if (startOffset <= endOffset) {
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);
            } else {
                range.setStart(endNode, endOffset);
                range.setEnd(startNode, startOffset);
            }
        } else {
            const position = startNode.compareDocumentPosition(endNode);
            if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
                range.setStart(startNode, startOffset);
                range.setEnd(endNode, endOffset);
            } else {
                range.setStart(endNode, endOffset);
                range.setEnd(startNode, startOffset);
            }
        }

        sel.addRange(range);
    }

    document.addEventListener('DOMContentLoaded', function () {
        const preview = document.getElementById('preview');
        const previewContainer = document.getElementById('preview-container');
        scrollContainer = previewContainer;

        // Prevent browser's native drag behavior on selected text
        previewContainer.addEventListener('dragstart', function (e) {
            e.preventDefault();
        });

        previewContainer.addEventListener('mousedown', function (e) {
            // Only left click, and not on a textarea, CM editor, or settings UI
            if (e.button !== 0) return;
            if (e.target.tagName === 'TEXTAREA') return;
            if (e.target.closest('textarea')) return;
            if (e.target.closest('.cm-editor')) return;
            if (e.target.closest('.settings-popover')) return;
            if (e.target.closest('#settings-btn')) return;

            // Clear any existing text selection so it doesn't interfere
            window.getSelection().removeAllRanges();

            isSelecting = true;
            didDrag = false;
            startX = e.clientX;
            startY = e.clientY;
            startScrollTop = previewContainer.scrollTop;
            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            // Capture the caret position at the mousedown point for text selection
            startCaret = getCaretAtPoint(startX, startY);

            if (!bandEl) {
                bandEl = createBandElement();
            }
            bandEl.style.display = 'none';

            // Don't preventDefault here — allow normal click behavior to work
            // We'll distinguish click vs drag on mouseup
        });

        document.addEventListener('mousemove', function (e) {
            if (!isSelecting) return;

            lastMouseX = e.clientX;
            lastMouseY = e.clientY;

            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);

            if (!didDrag && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
                didDrag = true;
                bandEl.style.display = 'block';
            }

            if (didDrag) {
                updateBand(e.clientX, e.clientY);
                updateTextSelection(e.clientX, e.clientY);
                autoScroll(e.clientY);
            }
        });

        // When the container scrolls during a drag (from auto-scroll, wheel, etc.),
        // update the rubber band and text selection to track the document position
        previewContainer.addEventListener('scroll', function () {
            if (!isSelecting || !didDrag) return;
            updateBand(lastMouseX, lastMouseY);
            updateTextSelection(lastMouseX, lastMouseY);
        });

        document.addEventListener('mouseup', function (e) {
            if (!isSelecting) return;
            isSelecting = false;

            if (!didDrag) {
                // This was a click, not a drag — let the normal click handlers deal with it
                if (bandEl) bandEl.style.display = 'none';
                startCaret = null;
                return;
            }

            // Flag so background click handler knows not to deselect
            window._rubberBandJustFinished = true;
            setTimeout(() => { window._rubberBandJustFinished = false; }, 0);

            // Rubber band block selection
            const bandRect = getBandRect();
            bandEl.style.display = 'none';

            // Don't clear block selection if shift is held
            if (!e.shiftKey) {
                deselectAll();
            }

            let lastSelectedIndex = -1;
            selectableElements.forEach((el, index) => {
                // Skip textareas and CM editors in rubber band selection
                if (el.tagName === 'TEXTAREA') return;
                if (el.classList && el.classList.contains('cm-wrapper')) return;

                const elRect = el.getBoundingClientRect();
                if (rectsIntersect(bandRect, elRect)) {
                    el.classList.add('selected');
                    lastSelectedIndex = index;
                }
            });

            // Set currentSelectedIndex to the bottommost selected block
            if (lastSelectedIndex !== -1) {
                currentSelectedIndex = lastSelectedIndex;
            }

            // Text selection is already set by updateTextSelection in mousemove
            // It persists after mouseup for Ctrl+C to pick up
            startCaret = null;
        });
    });
})();
