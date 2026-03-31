// Undo/Redo system — snapshot-based
// Captures the full block-level state of #preview before each destructive action.

let undoStack = [];
let redoStack = [];
const UNDO_LIMIT = 50;

// Take a snapshot of the current preview state (excluding the settings anchor)
function takeSnapshot() {
    const preview = document.getElementById('preview');
    const anchor = document.getElementById('settings-anchor');
    // Temporarily remove settings anchor so it's not included in snapshot
    if (anchor) anchor.remove();
    const html = preview.innerHTML;
    if (anchor) preview.insertBefore(anchor, preview.firstChild);
    return {
        html: html,
        selectedIndex: currentSelectedIndex
    };
}

// Push a snapshot onto the undo stack (call before every destructive action)
function pushUndo() {
    undoStack.push(takeSnapshot());
    if (undoStack.length > UNDO_LIMIT) {
        undoStack.shift();
    }
    // Any new action clears the redo stack
    redoStack = [];
}

// Restore a snapshot
function restoreSnapshot(snapshot) {
    const preview = document.getElementById('preview');
    const anchor = document.getElementById('settings-anchor');
    preview.innerHTML = snapshot.html;
    if (anchor) preview.insertBefore(anchor, preview.firstChild);

    // Re-apply syntax highlighting
    highlightCodeBlocks(preview);

    // Rebuild selectable elements
    setupSelectionHandlers();

    // Restore selection
    if (snapshot.selectedIndex >= 0 && snapshot.selectedIndex < selectableElements.length) {
        currentSelectedIndex = snapshot.selectedIndex;
        selectableElements[currentSelectedIndex].classList.add('selected');
    }
}

function undo() {
    if (undoStack.length === 0) return;

    // Save current state to redo stack
    redoStack.push(takeSnapshot());

    // Pop and restore
    const snapshot = undoStack.pop();
    restoreSnapshot(snapshot);
}

function redo() {
    if (redoStack.length === 0) return;

    // Save current state to undo stack
    undoStack.push(takeSnapshot());

    // Pop and restore
    const snapshot = redoStack.pop();
    restoreSnapshot(snapshot);
}
