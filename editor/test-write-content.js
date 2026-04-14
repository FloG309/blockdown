var markdownText = `
# The Blockdown Editor

A comprehensive test document covering **many** markdown features for thorough editor testing.

## Inline Formatting

This paragraph has **bold text**, *italic text*, ***bold italic***, \`inline code\`, and ~~strikethrough~~. Here is a [link to GitHub](https://github.com) and an auto-link: https://example.com. You can also combine them: **bold with \`code\` inside** or *italic with [a link](https://example.com)*.

## Headings at Every Level

### Third-Level Heading

#### Fourth-Level Heading

##### Fifth-Level Heading

###### Sixth-Level Heading

## Block Quotes

> This is a simple blockquote.

> This is a multi-paragraph blockquote.
>
> It has a second paragraph with **bold** and *italic* text inside it.
>
> > And this is a nested blockquote inside the outer one.

## Unordered Lists

- Apples
- Bananas
- Cherries
    - Bing cherries
    - Rainier cherries
- Dates

## Ordered Lists

1. First step: clone the repository
2. Second step: install dependencies
3. Third step: run the dev server
4. Fourth step: open the browser

## Mixed Nested Lists

- Frontend frameworks:
    1. React
    2. Vue
    3. Svelte
- Backend languages:
    1. Go
    2. Rust
    3. Python
- Databases:
    - SQL: PostgreSQL, MySQL
    - NoSQL: MongoDB, Redis

## Code Blocks

Inline example: use \`console.log()\` for debugging.

\`\`\`javascript
function fibonacci(n) {
    if (n <= 1) return n;
    let a = 0, b = 1;
    for (let i = 2; i <= n; i++) {
        [a, b] = [b, a + b];
    }
    return b;
}

console.log(fibonacci(10)); // 55
\`\`\`

\`\`\`python
def quicksort(arr):
    if len(arr) <= 1:
        return arr
    pivot = arr[len(arr) // 2]
    left = [x for x in arr if x < pivot]
    middle = [x for x in arr if x == pivot]
    right = [x for x in arr if x > pivot]
    return quicksort(left) + middle + quicksort(right)

print(quicksort([3, 6, 8, 10, 1, 2, 1]))
\`\`\`

\`\`\`css
.container {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 1.5rem;
    padding: 2rem;
}

.container > .card {
    border-radius: 8px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s ease;
}
\`\`\`

\`\`\`sql
SELECT u.name, COUNT(o.id) AS order_count, SUM(o.total) AS total_spent
FROM users u
LEFT JOIN orders o ON u.id = o.user_id
WHERE u.created_at >= '2025-01-01'
GROUP BY u.id, u.name
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC
LIMIT 20;
\`\`\`

## Tables

| Feature       | Status      | Priority |
|---------------|-------------|----------|
| Block editing | Done        | High     |
| Undo/Redo     | Done        | High     |
| Mermaid       | Done        | Medium   |
| Tables        | In Progress | Medium   |
| Export PDF     | Planned     | Low      |

## Horizontal Rules

Content above the rule.

---

Content below the rule.

## Images and Media

![Placeholder image](https://via.placeholder.com/600x200?text=Blockdown+Editor)

## Longer Prose

Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.

Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.

## Task-Like Content

Here is a checklist-style list for testing:

- [x] Set up project structure
- [x] Implement block selection
- [x] Add keyboard navigation
- [ ] Add drag-and-drop reordering
- [ ] Support collaborative editing

## Math-Like Formatting

The quadratic formula is: \`x = (-b +/- sqrt(b^2 - 4ac)) / 2a\`

For a right triangle: \`a^2 + b^2 = c^2\`

## Deeply Nested Content

> **Note:** This section tests nesting depth.
>
> - Item inside a blockquote
>     - Sub-item with \`code\`
>     - Another sub-item
>         - Third level nesting
>
> 1. Ordered inside a quote
> 2. Second ordered item

## Escape Characters

Use backslashes to show literal characters: \\*not italic\\*, \\\`not code\\\`, \\[not a link\\].

## Final Section

This document covers headings, paragraphs, bold, italic, strikethrough, inline code, code blocks in four languages, blockquotes (including nested), ordered lists, unordered lists, nested/mixed lists, tables, horizontal rules, images, links, task lists, and deeply nested structures.

**End of test content.**
`;
