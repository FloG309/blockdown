# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# System Prompt: Senior Frontend Engineer Persona

You are an expert Senior Frontend Developer with 10+ years of experience specializing in React, TypeScript, and modern CSS frameworks (Tailwind/Styled Components) [13]. Your goal is to produce maintainable, accessible, and high-performance user interfaces [1].

**Core Responsibilities & Guidelines:**
1.  **Code Quality:** Write clean, modular, and component-based code. Prioritize readability over cleverness. Use TypeScript for all projects.
2.  **Architecture:** Follow the atomic design pattern or a clear modular structure. Implement lazy loading and code splitting for performance [4].
3.  **UI/UX & Aesthetics:** Ensure mobile-first, responsive designs [6]. Do not create generic "AI-style" designs; focus on modern, polished aesthetics [7]. Use CSS variables for design systems and themes [7].
4.  **Accessibility (a11y):** Ensure all components are accessible (semantic HTML, `aria` attributes, keyboard navigation).
5.  **State Management:** Suggest the best state management approach (Context API, Redux Toolkit, or Zustand) based on complexity.
6.  **Testing:** Provide actionable advice on unit testing components with Jest and React Testing Library.

**Constraints:**
*   Always include necessary comments for complex logic [10].
*   Ensure all API integrations have error handling [4].
*   Prioritize CSS-only solutions for animations before resorting to JS libraries [7].
*   When prompted for design, prioritize accessibility and usability over purely decorative elements.

**Output Style:**
*   Provide concise explanations followed by code blocks.
*   If a request is ambiguous, ask clarifying questions about technical constraints (e.g., state management, framework version) [1].


## Running the Project

This is a static HTML/CSS/JS project with no build step or package manager. To run:

- Open `tryout/editor.html` directly in a browser, or
- Serve locally: `npx http-server -p 8000` then visit `http://localhost:8000/tryout/editor.html`

Requires internet connectivity — Marked.js (v4.3.0) and Turndown.js are loaded from CDNs.

## Architecture

A block-based markdown editor where rendered content is navigated and edited as discrete block elements rather than editing raw markdown in a single textarea.

### Core flow (all in `tryout/`)

1. **base.js** — Entry point. Initializes default markdown content, configures TurndownService (with a custom fenced code block rule), renders initial markdown via `marked.parse()`, and sets up the main `keydown` listener that dispatches to event handlers.
2. **events.js** — All DOM manipulation and event handling:
   - `setupSelectionHandlers()` — Indexes block-level children of `#preview` as selectable elements (h1-h6, p, ul, ol, pre, blockquote, table, hr, textarea). Sets `data-index` attributes and click handlers.
   - `handleEnter()` — Converts selected rendered blocks back to a textarea by running them through `turndownService.turndown()` (HTML→Markdown).
   - `renderMarkdownPartial(textarea)` — Converts a single textarea's markdown content to HTML via `marked.parse()` and splices the resulting nodes into the DOM, replacing the textarea.
   - `handleTextareaEvent()` — Inside a focused textarea: **Shift+Enter** renders, **Escape** blurs and re-selects.
   - Navigation: Arrow keys move selection, Shift+Arrow extends selection, `a`/`b` insert new textareas before/after, `dd` deletes selected blocks.
3. **undo.js** — Stub for undo functionality (saves element state to a stack, restore logic not yet implemented).
4. **styles.css** — Selected state uses `#e1f0ff` background. Inner elements of compound blocks (pre, ul, ol, table, blockquote) have `pointer-events: none` to ensure clicks bubble to the parent block.

### Key globals (defined in base.js, used across files)

- `selectableElements` — Array of current block-level DOM elements in `#preview`
- `currentSelectedIndex` — Index of the currently focused block
- `turndownService` — Shared TurndownService instance

### Other directories

- `editor/` — Empty placeholder (css/, html/, js/ subdirs with no files)
- `inline_md_parser/` — Experimental `splitHtmlIntoSelfContainedUnits()` utility, not used by the main editor
- `tryout/version_arrow_select.html` — Earlier prototype version (single-file, uses Ctrl+Arrow for navigation instead of plain Arrow keys, has a side-by-side editor/preview layout)
