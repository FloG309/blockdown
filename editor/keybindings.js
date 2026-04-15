// Keybinding registry for Blockdown editor.
// Defines default bindings, loads/saves overrides from localStorage,
// and provides matchesBinding() for the keydown handler.

(function () {
    const STORAGE_KEY = 'blockdown-keybindings';

    // Default key bindings. Each entry has:
    //   key: e.key value (case-sensitive for plain keys, 'ArrowRight' for arrows, etc.)
    //   ctrlKey, shiftKey, altKey: modifier flags (default false)
    //   chord: optional second key descriptor for two-key sequences (e.g. "d d")
    const DEFAULT_BINDINGS = {
        selectAll:          { key: 'a', ctrlKey: true },
        copyText:           { key: 'c', ctrlKey: true },
        pasteText:          { key: 'v', ctrlKey: true },
        extendSelForward:   { key: 'ArrowRight', shiftKey: true },
        extendSelBackward:  { key: 'ArrowLeft', shiftKey: true },
        copyBlocks:         { key: 'c' },
        pasteBlocks:        { key: 'v' },
        cutBlocks:          { key: 'x' },
        insertAbove:        { key: 'a' },
        insertBelow:        { key: 'b' },
        deleteBlocks:       { key: 'd', chord: { key: 'd' } },
        editMode:           { key: 'Enter' },
        deselect:           { key: 'Escape' },
        undo:               { key: 'z', ctrlKey: true },
        redo:               { key: 'y', ctrlKey: true },
    };

    // Human-readable labels for each action
    const LABELS = {
        selectAll:          'Select all',
        copyText:           'Copy text',
        pasteText:          'Paste text',
        extendSelForward:   'Extend selection \u2192',
        extendSelBackward:  'Extend selection \u2190',
        copyBlocks:         'Copy blocks',
        pasteBlocks:        'Paste blocks',
        cutBlocks:          'Cut blocks',
        insertAbove:        'Insert above',
        insertBelow:        'Insert below',
        deleteBlocks:       'Delete blocks',
        editMode:           'Edit mode',
        deselect:           'Deselect',
        undo:               'Undo',
        redo:               'Redo',
    };

    // ── Persistence ──────────────────────────────────────────

    function loadOverrides() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    }

    function saveOverrides(overrides) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    }

    // ── Binding access ───────────────────────────────────────

    function getBindings() {
        const overrides = loadOverrides();
        const merged = {};
        for (const id in DEFAULT_BINDINGS) {
            merged[id] = overrides[id] || DEFAULT_BINDINGS[id];
        }
        return merged;
    }

    function getDefault(actionId) {
        return DEFAULT_BINDINGS[actionId] || null;
    }

    function setBinding(actionId, descriptor) {
        const overrides = loadOverrides();
        overrides[actionId] = descriptor;
        saveOverrides(overrides);
    }

    function resetBinding(actionId) {
        const overrides = loadOverrides();
        delete overrides[actionId];
        saveOverrides(overrides);
    }

    function resetAll() {
        localStorage.removeItem(STORAGE_KEY);
    }

    // ── Key matching ─────────────────────────────────────────

    function keyMatches(event, descriptor) {
        if (!descriptor || !descriptor.key) return false;
        // Case-insensitive for letter keys when Ctrl is involved
        let eventKey = event.key;
        let descKey = descriptor.key;
        if (descriptor.ctrlKey && descKey.length === 1) {
            eventKey = eventKey.toLowerCase();
            descKey = descKey.toLowerCase();
        }
        return eventKey === descKey &&
            !!event.ctrlKey === !!descriptor.ctrlKey &&
            !!event.shiftKey === !!descriptor.shiftKey &&
            !!event.altKey === !!descriptor.altKey;
    }

    // Match an event against a binding.
    // For chord bindings, returns 'partial' on first key, 'complete' on second.
    // For single bindings, returns true or false.
    // chordState: { action, pending, time } — managed by the caller.
    function matchesBinding(event, actionId, chordState) {
        const bindings = getBindings();
        const binding = bindings[actionId];
        if (!binding) return false;

        // Chord binding
        if (binding.chord) {
            if (chordState && chordState.action === actionId && chordState.pending) {
                // Second key of chord
                return keyMatches(event, binding.chord) ? 'complete' : false;
            }
            // First key of chord
            return keyMatches(event, binding) ? 'partial' : false;
        }

        // Single key binding
        return keyMatches(event, binding);
    }

    // ── Conflict detection ───────────────────────────────────

    function descriptorsEqual(a, b) {
        if (!a || !b) return false;
        return a.key === b.key &&
            !!a.ctrlKey === !!b.ctrlKey &&
            !!a.shiftKey === !!b.shiftKey &&
            !!a.altKey === !!b.altKey;
    }

    // Returns the actionId that conflicts with the given descriptor, or null.
    function findConflict(actionId, descriptor) {
        const bindings = getBindings();
        for (const id in bindings) {
            if (id === actionId) continue;
            const b = bindings[id];
            if (descriptorsEqual(b, descriptor)) return id;
            // Also check chord first-key conflicts
            if (b.chord && descriptorsEqual(b, descriptor)) return id;
        }
        return null;
    }

    // ── Formatting ───────────────────────────────────────────

    const KEY_DISPLAY = {
        ArrowUp: '\u2191', ArrowDown: '\u2193',
        ArrowLeft: '\u2190', ArrowRight: '\u2192',
        Enter: '\u21B5', Escape: 'Esc',
        ' ': 'Space', Backspace: '\u232B', Delete: 'Del',
        Tab: 'Tab',
    };

    function formatKey(descriptor) {
        if (!descriptor || !descriptor.key) return '—';
        const parts = [];
        if (descriptor.ctrlKey) parts.push('Ctrl');
        if (descriptor.shiftKey) parts.push('Shift');
        if (descriptor.altKey) parts.push('Alt');
        const display = KEY_DISPLAY[descriptor.key] || descriptor.key.toUpperCase();
        parts.push(display);
        return parts.join('+');
    }

    function formatBinding(descriptor) {
        if (!descriptor) return '—';
        const first = formatKey(descriptor);
        if (descriptor.chord) {
            return first + ' ' + formatKey(descriptor.chord);
        }
        return first;
    }

    // ── Public API ───────────────────────────────────────────

    window.Keybindings = {
        getBindings,
        getDefault,
        setBinding,
        resetBinding,
        resetAll,
        matchesBinding,
        getActionIds: () => Object.keys(DEFAULT_BINDINGS),
        getLabel: (id) => LABELS[id] || id,
        formatBinding: (desc) => formatBinding(desc || {}),
        formatKey,
        findConflict,
        DEFAULT_BINDINGS,
    };
})();
