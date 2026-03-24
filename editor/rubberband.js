// Feature 4: Rubber band (lasso) selection
// Draws a selection rectangle on mousedown+drag over #preview.
// On mouseup, selects all block elements whose bounding rects intersect the rubber band.

(function () {
    let isSelecting = false;
    let startX = 0;
    let startY = 0;
    let bandEl = null;

    // Minimum drag distance (px) before we treat it as a rubber band vs a click
    const DRAG_THRESHOLD = 5;
    let didDrag = false;

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

    function updateBand(x, y) {
        const left = Math.min(startX, x);
        const top = Math.min(startY, y);
        const width = Math.abs(x - startX);
        const height = Math.abs(y - startY);
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

    document.addEventListener('DOMContentLoaded', function () {
        const preview = document.getElementById('preview');

        preview.addEventListener('mousedown', function (e) {
            // Only left click, and not on a textarea or inside one
            if (e.button !== 0) return;
            if (e.target.tagName === 'TEXTAREA') return;
            if (e.target.closest('textarea')) return;

            isSelecting = true;
            didDrag = false;
            startX = e.clientX;
            startY = e.clientY;

            if (!bandEl) {
                bandEl = createBandElement();
            }
            bandEl.style.display = 'none';

            // Don't preventDefault here — allow normal click behavior to work
            // We'll distinguish click vs drag on mouseup
        });

        document.addEventListener('mousemove', function (e) {
            if (!isSelecting) return;

            const dx = Math.abs(e.clientX - startX);
            const dy = Math.abs(e.clientY - startY);

            if (!didDrag && (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD)) {
                didDrag = true;
                bandEl.style.display = 'block';
            }

            if (didDrag) {
                updateBand(e.clientX, e.clientY);
            }
        });

        document.addEventListener('mouseup', function (e) {
            if (!isSelecting) return;
            isSelecting = false;

            if (!didDrag) {
                // This was a click, not a drag — let the normal click handlers deal with it
                if (bandEl) bandEl.style.display = 'none';
                return;
            }

            // Rubber band selection
            const bandRect = getBandRect();
            bandEl.style.display = 'none';

            // Don't clear selection if shift is held
            if (!e.shiftKey) {
                deselectAll();
            }

            let lastSelectedIndex = -1;
            selectableElements.forEach((el, index) => {
                // Skip textareas in rubber band selection
                if (el.tagName === 'TEXTAREA') return;

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
        });
    });
})();
