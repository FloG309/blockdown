// Mermaid diagram rendering, resize, zoom, and pan

let mermaidCounter = 0;

function initMermaid() {
    mermaid.initialize({
        startOnLoad: false,
        theme: 'default',
        securityLevel: 'loose'
    });
}

// Scan a container for mermaid code blocks and replace them with interactive SVG containers
async function processMermaidBlocks(container) {
    const codeBlocks = container.querySelectorAll('pre > code.language-mermaid');
    if (codeBlocks.length === 0) return;

    for (const code of codeBlocks) {
        const pre = code.parentElement;
        const source = code.textContent.trim();
        const id = 'mermaid-graph-' + (mermaidCounter++);
        try {
            const { svg } = await mermaid.render(id, source);
            // Check selection AFTER await — selectInsertedNodes may have run during the yield
            const wasSelected = pre.classList.contains('selected');
            const mermaidContainer = createMermaidContainer(svg, source);
            // Clean up any existing mermaid container's document listeners before replacing
            cleanupMermaidListeners(pre);
            pre.parentNode.replaceChild(mermaidContainer, pre);

            // Preserve selection state across the replacement
            if (wasSelected) {
                mermaidContainer.classList.add('selected');
            }
        } catch (err) {
            console.error('Mermaid render error:', err);
            // Leave the code block as-is on error
        }
    }

    setupSelectionHandlers();
}

function createMermaidContainer(svgString, source) {
    const container = document.createElement('div');
    container.className = 'mermaid-container';
    container.setAttribute('data-mermaid-source', source);

    // Viewport (clipping area)
    const viewport = document.createElement('div');
    viewport.className = 'mermaid-viewport';

    // Content wrapper (receives transforms)
    const content = document.createElement('div');
    content.className = 'mermaid-content';
    content.innerHTML = svgString;

    viewport.appendChild(content);
    container.appendChild(viewport);

    // Resize handles at 4 corners
    ['tl', 'tr', 'bl', 'br'].forEach(pos => {
        const handle = document.createElement('div');
        handle.className = 'mermaid-handle mermaid-handle-' + pos;
        container.appendChild(handle);
    });

    // Zoom indicator
    const indicator = document.createElement('div');
    indicator.className = 'mermaid-zoom-indicator';
    indicator.textContent = '100%';
    container.appendChild(indicator);

    // Button bar (top-right)
    const btnBar = document.createElement('div');
    btnBar.className = 'mermaid-btn-bar';

    // Edit button — opens mermaid source in a textarea inline
    const editBtn = document.createElement('button');
    editBtn.className = 'mermaid-btn';
    editBtn.title = 'Edit source';
    editBtn.textContent = '✎';
    editBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        enterMermaidEditMode(container);
    });
    btnBar.appendChild(editBtn);

    // Reset / fit-to-view button
    const resetBtn = document.createElement('button');
    resetBtn.className = 'mermaid-btn';
    resetBtn.title = 'Fit to view';
    resetBtn.textContent = '⊡';
    resetBtn.addEventListener('mousedown', (e) => e.stopPropagation());
    resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        resetToFit(container);
    });
    btnBar.appendChild(resetBtn);

    container.appendChild(btnBar);

    // Initialize zoom/pan state
    container._zoomPan = { scale: 1, translateX: 0, translateY: 0 };

    // Set up interactions after DOM insertion
    requestAnimationFrame(() => {
        autoFitContainer(container);
        setupZoomPan(container);
        setupResize(container);
    });

    return container;
}

function getSvgNaturalSize(svg) {
    let w = 300, h = 200;
    const viewBox = svg.getAttribute('viewBox');
    if (viewBox) {
        const parts = viewBox.split(/\s+/);
        if (parts.length === 4) {
            w = parseFloat(parts[2]) || w;
            h = parseFloat(parts[3]) || h;
        }
    } else {
        const attrW = parseFloat(svg.getAttribute('width'));
        const attrH = parseFloat(svg.getAttribute('height'));
        if (attrW && attrW > 1) w = attrW;
        if (attrH && attrH > 1) h = attrH;
    }
    return { w, h };
}

function autoFitContainer(container) {
    const svg = container.querySelector('svg');
    if (!svg) return;

    const { w: svgWidth, h: svgHeight } = getSvgNaturalSize(svg);
    container._svgNaturalSize = { w: svgWidth, h: svgHeight };

    // Force SVG to render at its natural dimensions (mermaid sets width="100%"
    // which collapses in an inline-block parent). The CSS transform handles scaling.
    svg.setAttribute('width', svgWidth);
    svg.setAttribute('height', svgHeight);
    svg.style.width = svgWidth + 'px';
    svg.style.height = svgHeight + 'px';

    // Size the container to match the diagram's aspect ratio so it fills well.
    // Constrain within max bounds.
    const parentWidth = container.parentElement ? container.parentElement.clientWidth : 600;
    const maxW = Math.min(parentWidth * 0.85, 900);
    const maxH = Math.min(window.innerHeight * 0.75, 600);

    // Scale to fill the max box while preserving aspect ratio
    const scaleToFitW = maxW / svgWidth;
    const scaleToFitH = maxH / svgHeight;
    const displayScale = Math.min(scaleToFitW, scaleToFitH, 1); // don't upscale

    const containerW = Math.max(200, Math.ceil(svgWidth * displayScale));
    const containerH = Math.max(150, Math.ceil(svgHeight * displayScale));

    container.style.width = containerW + 'px';
    container.style.height = containerH + 'px';

    // Compute a scale that fits the full diagram inside the container, then center
    fitDiagramInView(container);
}

// Scale and center the diagram so it's fully visible in the viewport
function fitDiagramInView(container) {
    const content = container.querySelector('.mermaid-content');
    const indicator = container.querySelector('.mermaid-zoom-indicator');
    const state = container._zoomPan;
    const nat = container._svgNaturalSize;
    if (!nat) return;

    const vw = container.offsetWidth;
    const vh = container.offsetHeight;

    // Scale so the diagram fills ~95% of the viewport (tight fit, almost touching edges)
    const margin = 0.95;
    const fitScale = Math.min((vw * margin) / nat.w, (vh * margin) / nat.h, 1);

    // Store per-container minimum scale so zoom-out can always return to fitted size
    container._minScale = Math.min(fitScale, 0.25);

    // Center the scaled diagram at the true midpoint of the box
    const scaledW = nat.w * fitScale;
    const scaledH = nat.h * fitScale;
    const tx = (vw - scaledW) / 2;
    const ty = (vh - scaledH) / 2;

    state.scale = fitScale;
    state.translateX = tx;
    state.translateY = ty;

    applyTransform(content, state);
    if (indicator) {
        indicator.textContent = Math.round(fitScale * 100) + '%';
    }
}

// ── Zoom & Pan ──────────────────────────────────────────────

function clampPan(container, state) {
    const nat = container._svgNaturalSize || { w: 300, h: 200 };
    const vw = container.offsetWidth;
    const vh = container.offsetHeight;

    const scaledW = nat.w * state.scale;
    const scaledH = nat.h * state.scale;

    // Wide limits with proportional offset — diagram can travel far but a portion
    // always stays visible so the user can find it
    const offsetX = Math.max(40, vw * 0.15);
    const offsetY = Math.max(40, vh * 0.15);

    state.translateX = Math.max(-(scaledW - offsetX), Math.min(vw - offsetX, state.translateX));
    state.translateY = Math.max(-(scaledH - offsetY), Math.min(vh - offsetY, state.translateY));
}

function setupZoomPan(container) {
    const viewport = container.querySelector('.mermaid-viewport');
    const content = container.querySelector('.mermaid-content');
    const indicator = container.querySelector('.mermaid-zoom-indicator');
    const state = container._zoomPan;

    // Zoom via scroll wheel
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const rect = viewport.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const oldScale = state.scale;
        const factor = e.deltaY > 0 ? 0.9 : 1.1;
        const minScale = container._minScale || 0.25;
        const newScale = Math.min(4, Math.max(minScale, oldScale * factor));

        // Zoom toward cursor position
        state.translateX = mouseX - (mouseX - state.translateX) * (newScale / oldScale);
        state.translateY = mouseY - (mouseY - state.translateY) * (newScale / oldScale);
        state.scale = newScale;

        clampPan(container, state);
        applyTransform(content, state);
        indicator.textContent = Math.round(state.scale * 100) + '%';
        showIndicator(indicator);
    }, { passive: false });

    // Pan via click+drag
    let isPanning = false;
    let panStartX, panStartY, startTransX, startTransY;
    let hasMoved = false;

    viewport.addEventListener('mousedown', (e) => {
        // Ignore if clicking a resize handle or the reset button
        if (e.target.closest('.mermaid-handle') || e.target.closest('.mermaid-reset-btn')) return;
        e.preventDefault();
        e.stopPropagation();

        isPanning = true;
        hasMoved = false;
        panStartX = e.clientX;
        panStartY = e.clientY;
        startTransX = state.translateX;
        startTransY = state.translateY;
        viewport.style.cursor = 'grabbing';
    });

    container._onMouseMove = (e) => {
        if (!isPanning) return;

        const dx = e.clientX - panStartX;
        const dy = e.clientY - panStartY;

        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
            hasMoved = true;
        }

        state.translateX = startTransX + dx;
        state.translateY = startTransY + dy;
        clampPan(container, state);
        applyTransform(content, state);
    };

    container._onMouseUp = () => {
        if (!isPanning) return;
        isPanning = false;
        viewport.style.cursor = '';

        // Short click with no drag → select the block
        if (!hasMoved) {
            const focused = document.activeElement;
            if (focused && focused.tagName === 'TEXTAREA') {
                focused.blur();
            }
            deselectAll();
            container.classList.add('selected');
            const idx = parseInt(container.getAttribute('data-index'));
            if (!isNaN(idx)) EditorState.currentSelectedIndex = idx;
        }
    };

    document.addEventListener('mousemove', container._onMouseMove);
    document.addEventListener('mouseup', container._onMouseUp);

    // Double-click to reset zoom & pan
    viewport.addEventListener('dblclick', (e) => {
        e.stopPropagation();
        resetToFit(container);
    });
}

// ── Resize ──────────────────────────────────────────────────

function setupResize(container) {
    const handles = container.querySelectorAll('.mermaid-handle');
    const content = container.querySelector('.mermaid-content');
    const minSize = 100;

    handles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = container.offsetWidth;
            const startHeight = container.offsetHeight;

            const pos = handle.className.match(/mermaid-handle-(\w+)/)[1];
            const state = container._zoomPan;
            const startTx = state.translateX;
            const startTy = state.translateY;

            function onMove(e) {
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;

                let w = startWidth;
                let h = startHeight;

                if (pos === 'br') {
                    w = startWidth + dx;
                    h = startHeight + dy;
                } else if (pos === 'bl') {
                    w = startWidth - dx;
                    h = startHeight + dy;
                } else if (pos === 'tr') {
                    w = startWidth + dx;
                    h = startHeight - dy;
                } else if (pos === 'tl') {
                    w = startWidth - dx;
                    h = startHeight - dy;
                }

                const oldW = container.offsetWidth;
                const oldH = container.offsetHeight;

                const newW = Math.max(minSize, w);
                const newH = Math.max(minSize, h);

                container.style.width = newW + 'px';
                container.style.height = newH + 'px';

                // Shift diagram so it travels with the dragged edge
                const dw = newW - oldW;
                const dh = newH - oldH;

                const nat = container._svgNaturalSize || { w: 300, h: 200 };
                const scaledW = nat.w * state.scale;
                const scaledH = nat.h * state.scale;

                // Left-side handles: shift diagram with the edge
                if (pos === 'bl' || pos === 'tl') {
                    state.translateX += dw;
                }
                // Top handles: shift diagram with the top edge
                if (pos === 'tl' || pos === 'tr') {
                    state.translateY += dh;
                }

                // Tight resize clamp: edges stay within viewport (so the diagram
                // travels with the boundary but stops when the opposite edge hits
                // the opposite viewport). Don't snap if already outside bounds.
                if (scaledW <= newW) {
                    state.translateX = Math.max(0, Math.min(newW - scaledW, state.translateX));
                } else {
                    state.translateX = Math.max(newW - scaledW, Math.min(0, state.translateX));
                }
                if (scaledH <= newH) {
                    state.translateY = Math.max(0, Math.min(newH - scaledH, state.translateY));
                } else {
                    state.translateY = Math.max(newH - scaledH, Math.min(0, state.translateY));
                }

                applyTransform(content, state);
            }

            function onUp() {
                document.removeEventListener('mousemove', onMove);
                document.removeEventListener('mouseup', onUp);
            }

            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
        });
    });
}

// ── Helpers ─────────────────────────────────────────────────

// Remove all document-level event listeners attached by a mermaid container's
// zoom/pan and resize logic. Call before removing a container from the DOM.
function cleanupMermaidListeners(container) {
    if (container._onMouseMove) {
        document.removeEventListener('mousemove', container._onMouseMove);
        container._onMouseMove = null;
    }
    if (container._onMouseUp) {
        document.removeEventListener('mouseup', container._onMouseUp);
        container._onMouseUp = null;
    }
}

// Enter edit mode for a single mermaid container (independent of other blocks)
function enterMermaidEditMode(container) {
    const source = container.getAttribute('data-mermaid-source') || '';
    const parent = container.parentNode;
    const nextSibling = container.nextSibling;

    cleanupMermaidListeners(container);

    const textarea = document.createElement('textarea');
    textarea.value = '```mermaid\n' + source + '\n```';
    textarea.style.width = '100%';
    textarea.rows = Math.max(5, source.split('\n').length + 2);

    // Auto-resize
    textarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });

    // Handle Shift+Enter / Escape to re-render
    textarea.addEventListener('keydown', function(e) {
        if ((e.key === 'Enter' && e.shiftKey) || e.key === 'Escape') {
            e.preventDefault();
            const savedIndex = EditorState.currentSelectedIndex;
            const insertedNodes = renderMarkdownPartial(textarea);
            selectInsertedNodes(insertedNodes, savedIndex);
        } else if (e.key === 'Tab') {
            e.preventDefault();
            const start = textarea.selectionStart;
            const end = textarea.selectionEnd;
            const spaces = '    ';
            textarea.value = textarea.value.substring(0, start) + spaces + textarea.value.substring(end);
            textarea.selectionStart = textarea.selectionEnd = start + spaces.length;
            textarea.dispatchEvent(new Event('input'));
        }
    });

    // Replace the container with the textarea
    parent.insertBefore(textarea, nextSibling);
    container.remove();

    textarea.focus();
    setupSelectionHandlers();
}

function resetToFit(container) {
    // Reset only the diagram zoom/pan — preserve the user's bounding box size
    fitDiagramInView(container);
    const indicator = container.querySelector('.mermaid-zoom-indicator');
    if (indicator) showIndicator(indicator);
}

function applyTransform(content, state) {
    content.style.transform =
        'translate(' + state.translateX + 'px, ' + state.translateY + 'px) scale(' + state.scale + ')';
}

function showIndicator(indicator) {
    indicator.classList.add('visible');
    clearTimeout(indicator._hideTimeout);
    indicator._hideTimeout = setTimeout(() => {
        indicator.classList.remove('visible');
    }, 1200);
}
