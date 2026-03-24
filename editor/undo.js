let undoStack = [];

function saveSelectedElementState(elementList, action) {
    const filtered = [];
    elementList.forEach((el, index) => {
        if (el.classList.contains('selected')) {
            filtered.push({ element: el, index: index });
        }
    });
    saveElementState(filtered, action);

}

function saveElementState(saveState, action) {
    // Save a reference AND its current content
    undoStack.push({
        saveState: saveState,
        action: action
    });
}

function undo() {
    const last = undoStack.pop();
    if (last) {
        saveState = last.saveState;
        action = last.action;
        // insert into preview dom element at index
    }

}
