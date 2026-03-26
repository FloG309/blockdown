// Undo/Redo system — snapshot-based
// Captures the full block-level state of #preview before each destructive action.

const UNDO_LIMIT = 50;

// Take a snapshot of the current preview state
function takeSnapshot() {
    const preview = document.getElementById('preview');
    return {
        html: preview.innerHTML,
        selectedIndex: EditorState.currentSelectedIndex
    };
}

// Push a snapshot onto the undo stack (call before every destructive action)
function pushUndo() {
    EditorState.undoStack.push(takeSnapshot());
    if (EditorState.undoStack.length > UNDO_LIMIT) {
        EditorState.undoStack.shift();
    }
    // Any new action clears the redo stack
    EditorState.redoStack.length = 0;
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
    if (snapshot.selectedIndex >= 0 && snapshot.selectedIndex < EditorState.selectableElements.length) {
        EditorState.currentSelectedIndex = snapshot.selectedIndex;
        EditorState.selectableElements[EditorState.currentSelectedIndex].classList.add('selected');
    }
}

function undo() {
    if (EditorState.undoStack.length === 0) return;

    // Save current state to redo stack
    EditorState.redoStack.push(takeSnapshot());

    // Pop and restore
    const snapshot = EditorState.undoStack.pop();
    restoreSnapshot(snapshot);
}

function redo() {
    if (EditorState.redoStack.length === 0) return;

    // Save current state to undo stack
    EditorState.undoStack.push(takeSnapshot());

    // Pop and restore
    const snapshot = EditorState.redoStack.pop();
    restoreSnapshot(snapshot);
}
