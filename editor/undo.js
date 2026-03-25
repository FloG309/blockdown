// Undo/Redo system — snapshot-based
// Captures the full block-level state of #preview before each destructive action.

let undoStack = [];
let redoStack = [];
const UNDO_LIMIT = 50;

// Take a snapshot of the current preview state
function takeSnapshot() {
    const preview = document.getElementById('preview');
    return {
        html: preview.innerHTML,
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
    preview.innerHTML = snapshot.html;

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
