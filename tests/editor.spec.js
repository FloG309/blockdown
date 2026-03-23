const { test, expect } = require('@playwright/test');

// Helper: wait for editor to fully initialize (markdown rendered into blocks)
async function waitForEditor(page) {
  await page.goto('/editor/editor.html');
  // Wait for the preview to contain rendered markdown blocks
  await page.waitForSelector('#preview h2');
}

// Helper: get all selectable block elements (now includes div.md-editable)
async function getBlocks(page) {
  return page.locator('#preview > h1, #preview > h2, #preview > h3, #preview > h4, #preview > h5, #preview > h6, #preview > p, #preview > ul, #preview > ol, #preview > pre, #preview > blockquote, #preview > table, #preview > hr, #preview > div.md-editable');
}

// Helper: press a key on the page body (not inside an editable element)
async function pressKey(page, key) {
  await page.keyboard.press(key);
}

// Helper: get the contenteditable div in edit mode
function getEditable(page) {
  return page.locator('#preview div.md-editable');
}

// Helper: set contenteditable text content directly (replaces textarea.fill())
// This properly sets the text and triggers re-highlighting, then focuses the element
async function fillEditable(page, text) {
  await page.evaluate((t) => {
    const editable = document.querySelector('.md-editable');
    if (!editable) throw new Error('No .md-editable found');
    // Set the highlighted HTML via highlightMarkdown
    editable.innerHTML = highlightMarkdown(t);
    // Focus the element so subsequent keyboard events target it
    editable.focus();
    // Place cursor at end
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(editable);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, text);
}

// =============================================================
// Feature 1+3: Escape renders and restores selection
// =============================================================

test.describe('Feature 1+3: Escape renders and restores selection', () => {

  test('select block, Enter to edit, Escape returns to rendered+selected', async ({ page }) => {
    await waitForEditor(page);

    // Press ArrowDown to select the first block (h2)
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    await expect(blocks.first()).toHaveClass(/selected/);

    // Press Enter to open contenteditable div for editing
    await pressKey(page, 'Enter');

    // A contenteditable div should now exist
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Press Escape to exit editing
    await page.keyboard.press('Escape');

    // Editable div should be gone
    await expect(getEditable(page)).toHaveCount(0);

    // The rendered block should be back and selected
    const newBlocks = await getBlocks(page);
    const firstBlock = newBlocks.first();
    await expect(firstBlock).toHaveClass(/selected/);
    // It should be a rendered element, not an editable div
    const hasEditable = await firstBlock.evaluate(el => el.classList.contains('md-editable'));
    expect(hasEditable).toBe(false);
  });

  test('Shift+Enter renders and keeps block selected', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');
    await expect((await getBlocks(page)).first()).toHaveClass(/selected/);

    // Enter edit mode
    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Shift+Enter to render
    await page.keyboard.press('Shift+Enter');

    // Editable div should be gone
    await expect(getEditable(page)).toHaveCount(0);

    // The rendered block should be selected
    const selectedBlock = page.locator('#preview .selected');
    await expect(selectedBlock).toHaveCount(1);
    const hasEditable = await selectedBlock.evaluate(el => el.classList.contains('md-editable'));
    expect(hasEditable).toBe(false);
  });

  test('edit content, Escape renders the edited content and selects it', async ({ page }) => {
    await waitForEditor(page);

    // Select second block (a paragraph)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');

    // Enter edit mode
    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Clear and type new content
    await editable.evaluate(el => {
      el.textContent = '';
    });
    await editable.focus();
    await page.keyboard.type('This is **edited** content.');

    // Escape to render and select
    await page.keyboard.press('Escape');

    // Should be rendered HTML, not editable div
    await expect(getEditable(page)).toHaveCount(0);

    // The rendered block should contain the edited text
    const selectedBlock = page.locator('#preview .selected');
    await expect(selectedBlock).toContainText('edited');
  });
});

// =============================================================
// Feature 2: Auto-merge adjacent lists
// =============================================================

test.describe('Feature 2: Auto-merge adjacent lists', () => {

  test('new list items merge with preceding list of same type', async ({ page }) => {
    await waitForEditor(page);

    // Find the UL block (the features list)
    const blocks = await getBlocks(page);
    const count = await blocks.count();

    // Navigate to the UL (it's the list of features)
    let ulIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'UL') {
        ulIndex = i;
        break;
      }
    }
    expect(ulIndex).toBeGreaterThan(-1);

    // Navigate to the UL
    for (let i = 0; i <= ulIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // Count original li items
    const originalLiCount = await page.locator('#preview > ul').first().locator('li').count();

    // Press 'b' to insert editable div after the list
    await pressKey(page, 'b');
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Set list item text directly (typing \n in contenteditable is slow due to re-highlighting)
    await fillEditable(page, '- new item from test\n- another test item');

    // Shift+Enter to render
    await page.keyboard.press('Shift+Enter');

    // Should still be only one UL (merged)
    const ulCount = await page.locator('#preview > ul').count();
    expect(ulCount).toBe(1);

    // The UL should have original + 2 new items
    const newLiCount = await page.locator('#preview > ul').first().locator('li').count();
    expect(newLiCount).toBe(originalLiCount + 2);
  });

  test('paragraph after list does NOT merge', async ({ page }) => {
    await waitForEditor(page);

    // Find UL
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let ulIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'UL') {
        ulIndex = i;
        break;
      }
    }

    // Navigate to UL
    for (let i = 0; i <= ulIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // Insert editable div after
    await pressKey(page, 'b');
    const editable = getEditable(page);
    await page.keyboard.type('Just a plain paragraph.');
    await page.keyboard.press('Shift+Enter');

    // The paragraph should be its own block, not merged
    const ulCount = await page.locator('#preview > ul').count();
    expect(ulCount).toBeGreaterThanOrEqual(1);
    // A new <p> should exist after the ul
    const pBlocks = await page.locator('#preview > p').count();
    expect(pBlocks).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================
// Bullet marker: dashes not asterisks
// =============================================================

test.describe('Bullet marker uses dashes', () => {

  test('editing a list and returning shows dashes not asterisks', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the UL
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let ulIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'UL') {
        ulIndex = i;
        break;
      }
    }
    expect(ulIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= ulIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // Enter edit mode to get the markdown
    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    const value = await editable.evaluate(el => el.textContent);
    // Should use dashes, not asterisks
    expect(value).toMatch(/^- /m);
    expect(value).not.toMatch(/^\* /m);

    // Escape back
    await page.keyboard.press('Escape');
  });
});

// =============================================================
// Sub-list merging (single and multi-level indent)
// =============================================================

test.describe('Sub-list merging', () => {

  // Helper: navigate to the first UL block
  async function navigateToUl(page) {
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let ulIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'UL') {
        ulIndex = i;
        break;
      }
    }
    expect(ulIndex).toBeGreaterThan(-1);
    for (let i = 0; i <= ulIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }
    return ulIndex;
  }

  test('indented list merges as sub-list of last item in preceding list', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    // Enter edit mode to replace the list with a known structure
    await pressKey(page, 'Enter');
    await fillEditable(page, '- xxx\n- yyy');
    await page.keyboard.press('Shift+Enter');

    // Insert editable div after the list and add indented sub-list (4 spaces = 1 level)
    await pressKey(page, 'b');
    await fillEditable(page, '    - zzz');
    await page.keyboard.press('Shift+Enter');

    // Should be 1 top-level UL
    expect(await page.locator('#preview > ul').count()).toBe(1);

    // zzz should be nested inside last li (yyy): ul > li:last-child > ul > li
    const nestedUl = page.locator('#preview > ul').first().locator(':scope > li:last-child > ul');
    await expect(nestedUl).toHaveCount(1);
    await expect(nestedUl.locator('li')).toHaveText(['zzz']);
  });

  test('double-indented list merges at level 2 under last item', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    await fillEditable(page, '- xxx\n- yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    // 8 spaces = 2 levels of indent
    await fillEditable(page, '        - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

    // zzz should be nested under yyy
    await expect(page.locator('#preview > ul').first().locator(':scope > li:last-child')).toContainText('zzz');
  });

  test('indented list merges as sibling when preceding list has same-level sub-items', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    await fillEditable(page, '- xxx\n    - yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    await fillEditable(page, '    - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

    // yyy and zzz should be siblings in the nested list under xxx
    const nestedLis = page.locator('#preview > ul').first()
      .locator(':scope > li:first-child > ul > li');
    await expect(nestedLis).toHaveCount(2);
    await expect(nestedLis.nth(0)).toHaveText('yyy');
    await expect(nestedLis.nth(1)).toHaveText('zzz');
  });

  test('double-indented list nests under existing sub-list item', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    await fillEditable(page, '- xxx\n    - yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    await fillEditable(page, '        - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

    // zzz should be nested under yyy: ul > li(xxx) > ul > li(yyy) > ul > li(zzz)
    const deepNested = page.locator('#preview > ul').first()
      .locator(':scope > li:first-child > ul > li:last-child > ul > li');
    await expect(deepNested).toHaveCount(1);
    await expect(deepNested).toHaveText('zzz');
  });
});

// =============================================================
// Selection after list merge
// =============================================================

test.describe('Selection after list merge', () => {

  // Helper: navigate to the first UL block
  async function navigateToUl(page) {
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let ulIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'UL') {
        ulIndex = i;
        break;
      }
    }
    for (let i = 0; i <= ulIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }
  }

  test('flat merge keeps the merged list selected', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'b');
    const editable = getEditable(page);
    await page.keyboard.type('- merged item');
    await page.keyboard.press('Shift+Enter');

    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
    const tag = await selected.evaluate(el => el.tagName);
    expect(tag).toBe('UL');
  });

  test('indented merge keeps the parent list selected', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'b');
    const editable = getEditable(page);
    await page.keyboard.type('    - sub item');
    await page.keyboard.press('Shift+Enter');

    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
    const isDirectChild = await selected.evaluate(el => el.parentElement.id === 'preview');
    expect(isDirectChild).toBe(true);
  });

  test('no ghost selection after navigating away from merged list', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'b');
    const editable = getEditable(page);
    await page.keyboard.type('    - sub item');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'ArrowUp');
    expect(await page.locator('#preview .selected').count()).toBe(1);

    await pressKey(page, 'ArrowDown');
    expect(await page.locator('#preview .selected').count()).toBe(1);
  });
});

// =============================================================
// Tab inserts spaces in edit mode
// =============================================================

test.describe('Tab key in edit mode', () => {

  test('Tab inserts spaces in contenteditable instead of changing focus', async ({ page }) => {
    await waitForEditor(page);

    // Select first block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Clear and type some text
    await editable.evaluate(el => { el.textContent = ''; });
    await editable.focus();
    await page.keyboard.type('hello');

    // Press Tab
    await page.keyboard.press('Tab');

    // Tab should insert 4 spaces, not move focus
    const value = await editable.evaluate(el => el.textContent);
    expect(value).toBe('hello    ');

    // Editable should still be focused
    const isFocused = await editable.evaluate(el => document.activeElement === el);
    expect(isFocused).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('Tab at beginning of line inserts spaces for indentation', async ({ page }) => {
    await waitForEditor(page);

    // Select first block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    await editable.evaluate(el => { el.textContent = ''; });
    await editable.focus();
    await page.keyboard.type('- item');
    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');

    const value = await editable.evaluate(el => el.textContent);
    expect(value).toBe('    - item');

    await page.keyboard.press('Escape');
  });
});

// =============================================================
// Feature 4: Rubber band (lasso) selection
// =============================================================

test.describe('Feature 4: Rubber band selection', () => {

  test('drag across multiple blocks selects them', async ({ page }) => {
    await waitForEditor(page);

    // Get bounding rects of the first few blocks
    const blocks = await getBlocks(page);
    const firstRect = await blocks.nth(0).boundingBox();
    const thirdRect = await blocks.nth(2).boundingBox();

    // Drag from above the first block to below the third block
    const startX = firstRect.x - 10;
    const startY = firstRect.y - 5;
    const endX = thirdRect.x + thirdRect.width + 10;
    const endY = thirdRect.y + thirdRect.height + 5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // At least the first 3 blocks should be selected
    const selectedCount = await page.locator('#preview .selected').count();
    expect(selectedCount).toBeGreaterThanOrEqual(3);
  });

  test('rubber band overlay appears during drag and disappears after', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const firstRect = await blocks.nth(0).boundingBox();

    const startX = firstRect.x - 10;
    const startY = firstRect.y - 5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX + 200, startY + 200, { steps: 5 });

    // Rubber band should be visible
    const band = page.locator('#rubber-band');
    await expect(band).toBeVisible();

    await page.mouse.up();

    // Rubber band should be hidden
    await expect(band).not.toBeVisible();
  });

  test('short click does not trigger rubber band (normal click works)', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);

    // Click on the first block
    await blocks.nth(0).click();

    // First block should be selected
    await expect(blocks.nth(0)).toHaveClass(/selected/);

    // Rubber band should NOT be visible
    const band = page.locator('#rubber-band');
    const bandVisible = await band.isVisible().catch(() => false);
    expect(bandVisible).toBe(false);
  });
});

// =============================================================
// Feature 7: Syntax highlighting for code blocks
// =============================================================

test.describe('Feature 7: Syntax highlighting', () => {

  test('code block with language hint gets hljs classes on initial render', async ({ page }) => {
    await waitForEditor(page);

    // The default markdown has a ```javascript code block
    const codeEl = page.locator('#preview pre code');
    await expect(codeEl).toHaveCount(1);

    // hljs should have added the 'hljs' class
    await expect(codeEl).toHaveClass(/hljs/);

    // Should contain highlighted tokens (spans with hljs- prefixed classes)
    const tokenCount = await codeEl.locator('span[class^="hljs-"]').count();
    expect(tokenCount).toBeGreaterThan(0);
  });

  test('code block re-highlighted after edit and re-render', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the pre block
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let preIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'PRE') {
        preIndex = i;
        break;
      }
    }
    expect(preIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= preIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // Enter edit mode
    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Replace with new code
    await fillEditable(page, '```python\ndef greet():\n    print("hello")\n```');
    await page.keyboard.press('Escape');

    // The new code block should have hljs classes
    const codeEl = page.locator('#preview pre code');
    await expect(codeEl.first()).toHaveClass(/hljs/);
    const tokenCount = await codeEl.first().locator('span[class^="hljs-"]').count();
    expect(tokenCount).toBeGreaterThan(0);
  });

  test('code block without language hint still gets auto-highlighted', async ({ page }) => {
    await waitForEditor(page);

    // Select first block, insert a code block without language hint
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'b');
    const editable = getEditable(page);
    await fillEditable(page, '```\nconst x = 42;\nconsole.log(x);\n```');
    await page.keyboard.press('Shift+Enter');

    // Should still have hljs class (auto-detection)
    const codeEls = page.locator('#preview pre code');
    const lastCode = codeEls.last();
    await expect(lastCode).toHaveClass(/hljs/);
  });
});

// =============================================================
// Feature 5: Undo / Redo
// =============================================================

test.describe('Feature 5: Undo / Redo', () => {

  test('undo restores a deleted block', async ({ page }) => {
    await waitForEditor(page);

    // Get initial block count
    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    // Select the first block
    await pressKey(page, 'ArrowDown');
    const firstBlockText = await blocks.first().innerText();

    // Delete with dd
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    // Block count should decrease
    const afterDeleteCount = await (await getBlocks(page)).count();
    expect(afterDeleteCount).toBe(initialCount - 1);

    // Undo
    await page.keyboard.press('Control+z');

    // Block count should be restored
    const afterUndoCount = await (await getBlocks(page)).count();
    expect(afterUndoCount).toBe(initialCount);

    // The first block text should be back
    const restoredBlocks = await getBlocks(page);
    await expect(restoredBlocks.first()).toContainText(firstBlockText);
  });

  test('undo restores content after edit', async ({ page }) => {
    await waitForEditor(page);

    // Select second block (paragraph)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    const originalText = await (await getBlocks(page)).nth(1).innerText();

    // Enter edit mode, change text, render
    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    await editable.evaluate(el => { el.textContent = ''; });
    await editable.focus();
    await page.keyboard.type('Completely changed text');
    await page.keyboard.press('Escape');

    // Verify the edit took effect
    const selectedBlock = page.locator('#preview .selected');
    await expect(selectedBlock).toContainText('Completely changed text');

    // Undo the render
    await page.keyboard.press('Control+z');

    // Should now have an editable div (back to edit mode state)
    // Undo again to restore original rendered content
    await page.keyboard.press('Control+z');

    // Original text should be back
    const blocks = await getBlocks(page);
    await expect(blocks.nth(1)).toContainText(originalText);
  });

  test('redo reapplies after undo', async ({ page }) => {
    await waitForEditor(page);

    // Select first block and delete
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    const blocks = await getBlocks(page);
    const afterDeleteCount = await blocks.count();

    // Undo
    await page.keyboard.press('Control+z');
    const afterUndoCount = await (await getBlocks(page)).count();
    expect(afterUndoCount).toBe(afterDeleteCount + 1);

    // Redo
    await page.keyboard.press('Control+Shift+z');
    const afterRedoCount = await (await getBlocks(page)).count();
    expect(afterRedoCount).toBe(afterDeleteCount);
  });

  test('redo stack clears after a new action', async ({ page }) => {
    await waitForEditor(page);

    const initialCount = await (await getBlocks(page)).count();

    // Select and delete first block
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    // Undo
    await page.keyboard.press('Control+z');
    expect(await (await getBlocks(page)).count()).toBe(initialCount);

    // Perform a new action (insert editable div)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'b');
    const editable = getEditable(page);
    await page.keyboard.type('new block');
    await page.keyboard.press('Escape');

    // Redo should do nothing (stack cleared by new action)
    const countBeforeRedo = await (await getBlocks(page)).count();
    await page.keyboard.press('Control+Shift+z');
    const countAfterRedo = await (await getBlocks(page)).count();
    expect(countAfterRedo).toBe(countBeforeRedo);
  });

  test('multiple undos in sequence', async ({ page }) => {
    await waitForEditor(page);

    const initialCount = await (await getBlocks(page)).count();

    // Select first block
    await pressKey(page, 'ArrowDown');

    // Insert an editable div and render
    await pressKey(page, 'b');
    let editable = getEditable(page);
    await page.keyboard.type('Block A');
    await page.keyboard.press('Escape');

    const afterFirstInsert = await (await getBlocks(page)).count();
    expect(afterFirstInsert).toBe(initialCount + 1);

    // Insert another editable div and render
    await pressKey(page, 'b');
    editable = getEditable(page);
    await page.keyboard.type('Block B');
    await page.keyboard.press('Escape');

    const afterSecondInsert = await (await getBlocks(page)).count();
    expect(afterSecondInsert).toBe(initialCount + 2);

    // Undo twice to get back to after first insert (undo render, undo insert)
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');

    // Undo twice more to get back to initial state (undo first render, undo first insert)
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');

    const finalCount = await (await getBlocks(page)).count();
    expect(finalCount).toBe(initialCount);
  });
});

// =============================================================
// Feature 6: Copy / Paste / Cut blocks (C / V / X)
// =============================================================

test.describe('Feature 6: Copy / Paste / Cut blocks', () => {

  test('C copies and V pastes a block below selection', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block (h2)
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();
    const firstBlockText = await blocks.first().innerText();

    // Copy
    await pressKey(page, 'c');

    // Navigate down and paste
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    // Should have one more block
    const newBlocks = await getBlocks(page);
    const newCount = await newBlocks.count();
    expect(newCount).toBe(initialCount + 1);

    // The pasted block should contain the same text
    const pastedBlock = page.locator('#preview .selected');
    await expect(pastedBlock).toContainText(firstBlockText);
  });

  test('multi-block select, C copies all, V pastes all', async ({ page }) => {
    await waitForEditor(page);

    // Select first two blocks with Shift+ArrowDown
    await pressKey(page, 'ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const selectedCount = await page.locator('#preview .selected').count();
    expect(selectedCount).toBe(2);

    // Copy
    await pressKey(page, 'c');

    // Navigate to end and paste
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    // Should have 2 more blocks
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    expect(count).toBeGreaterThanOrEqual(selectedCount + 2);
  });

  test('X cuts blocks — originals removed, V pastes them back', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    // Select first block
    await pressKey(page, 'ArrowDown');
    const firstBlockText = await blocks.first().innerText();

    // Cut
    await pressKey(page, 'x');

    // One block removed
    const afterCutCount = await (await getBlocks(page)).count();
    expect(afterCutCount).toBe(initialCount - 1);

    // Paste — should add it back
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    const afterPasteCount = await (await getBlocks(page)).count();
    expect(afterPasteCount).toBe(initialCount);

    // Pasted block should have the original text
    const pastedBlock = page.locator('#preview .selected');
    await expect(pastedBlock).toContainText(firstBlockText);
  });

  test('V with empty clipboard does nothing', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    // Select a block and press V without having copied anything
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    const afterPasteCount = await (await getBlocks(page)).count();
    expect(afterPasteCount).toBe(initialCount);
  });

  test('pasting list block adjacent to list triggers auto-merge', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the UL
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let ulIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'UL') {
        ulIndex = i;
        break;
      }
    }
    expect(ulIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= ulIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // Copy the list
    await pressKey(page, 'c');

    // Paste immediately after — should merge
    await pressKey(page, 'v');

    // Should still be only 1 UL (merged)
    const ulCount = await page.locator('#preview > ul').count();
    expect(ulCount).toBe(1);
  });
});

// =============================================================
// Feature 8: Height matching on edit mode entry
// =============================================================

test.describe('Feature 8: Height matching', () => {

  test('contenteditable min-height matches rendered block height', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block (h2)
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const firstBlock = blocks.first();

    // Capture the rendered block height
    const renderedHeight = await firstBlock.evaluate(el => el.offsetHeight);

    // Enter edit mode
    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Editable min-height should match the rendered block height
    const minHeight = await editable.evaluate(el => parseFloat(el.style.minHeight));
    expect(minHeight).toBe(renderedHeight);
  });

  test('h2 editable gets larger font-size than paragraph editable', async ({ page }) => {
    await waitForEditor(page);

    // Select the h2 block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    const h2FontSize = await editable.evaluate(el => parseFloat(getComputedStyle(el).fontSize));

    // Exit edit mode
    await page.keyboard.press('Escape');

    // Navigate to a paragraph block
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let pIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'P') {
        pIndex = i;
        break;
      }
    }
    expect(pIndex).toBeGreaterThan(-1);

    // Navigate to it
    for (let i = 0; i <= pIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }
    await pressKey(page, 'Enter');

    const pEditable = getEditable(page);
    const pFontSize = await pEditable.evaluate(el => parseFloat(getComputedStyle(el).fontSize));

    // h2 font should be larger than paragraph font
    expect(h2FontSize).toBeGreaterThan(pFontSize);

    await page.keyboard.press('Escape');
  });

  test('code block editable gets monospace font', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the pre block
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let preIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'PRE') {
        preIndex = i;
        break;
      }
    }
    expect(preIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= preIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    await pressKey(page, 'Enter');
    const editable = getEditable(page);
    const fontFamily = await editable.evaluate(el => getComputedStyle(el).fontFamily);

    // Should contain a monospace font
    expect(fontFamily).toMatch(/courier|monospace/i);

    await page.keyboard.press('Escape');
  });

  test('editable does not dramatically change page layout on enter', async ({ page }) => {
    await waitForEditor(page);

    // Select a paragraph block
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let pIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'P') {
        pIndex = i;
        break;
      }
    }
    expect(pIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= pIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // Get position of the block after the paragraph (to measure layout shift)
    const nextIndex = pIndex + 1;
    let nextBlockTopBefore = null;
    if (nextIndex < count) {
      nextBlockTopBefore = await blocks.nth(nextIndex).evaluate(el => el.getBoundingClientRect().top);
    }

    // Enter edit mode
    await pressKey(page, 'Enter');

    // If there was a next block, its position shouldn't have shifted more than 50px
    if (nextBlockTopBefore !== null && nextIndex < count) {
      const editable = getEditable(page);
      const nextSiblingTop = await editable.evaluate(el => {
        let next = el.nextElementSibling;
        return next ? next.getBoundingClientRect().top : null;
      });

      if (nextSiblingTop !== null) {
        const shift = Math.abs(nextSiblingTop - nextBlockTopBefore);
        expect(shift).toBeLessThan(50);
      }
    }

    await page.keyboard.press('Escape');
  });
});

// =============================================================
// Feature 9: Styled contenteditable edit mode
// =============================================================

test.describe('Feature 9: Contenteditable edit mode', () => {

  test('edit mode creates contenteditable div, not textarea', async ({ page }) => {
    await waitForEditor(page);

    // Select a block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    // Should have a contenteditable div
    const editable = getEditable(page);
    await expect(editable).toBeVisible();
    const isContentEditable = await editable.evaluate(el => el.contentEditable === 'true');
    expect(isContentEditable).toBe(true);

    // Should NOT have a textarea
    await expect(page.locator('#preview textarea')).toHaveCount(0);

    await page.keyboard.press('Escape');
  });

  test('Shift+Enter exits edit mode and renders correctly', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    await page.keyboard.press('Shift+Enter');

    // Editable div should be gone
    await expect(getEditable(page)).toHaveCount(0);

    // Rendered block should be selected
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
  });

  test('Escape exits edit mode and renders correctly', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(getEditable(page)).toHaveCount(0);
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
  });
});

test.describe('Feature 9: Syntax highlighting in edit mode', () => {

  test('bold text gets md-bold class', async ({ page }) => {
    await waitForEditor(page);

    // Select the paragraph that contains **Markdown**
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Check for md-bold span
    const boldSpan = editable.locator('.md-bold');
    await expect(boldSpan).toHaveCount(1);
    await expect(boldSpan).toContainText('Markdown');
  });

  test('heading line gets md-h2 class', async ({ page }) => {
    await waitForEditor(page);

    // Select the h2 block
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    const h2Line = editable.locator('.md-h2');
    await expect(h2Line).toHaveCount(1);
  });

  test('inline code gets md-inline-code class', async ({ page }) => {
    await waitForEditor(page);

    // Insert a new block with inline code
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'b');
    const editable = getEditable(page);
    await page.keyboard.type('Use `console.log` for debugging');

    // Wait a moment for re-highlighting
    await page.waitForTimeout(100);

    const codeSpan = editable.locator('.md-inline-code');
    await expect(codeSpan).toHaveCount(1);
    await expect(codeSpan).toContainText('console.log');

    await page.keyboard.press('Escape');
  });

  test('delimiter characters have md-dim class', async ({ page }) => {
    await waitForEditor(page);

    // Select the paragraph with **Markdown** and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    const dimSpans = editable.locator('.md-dim');
    const dimCount = await dimSpans.count();
    // Should have dim spans for ** delimiters and * delimiters
    expect(dimCount).toBeGreaterThan(0);
  });

  test('code block gets md-code-fence and md-code-line classes', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the pre block
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let preIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'PRE') {
        preIndex = i;
        break;
      }
    }
    expect(preIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= preIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    await pressKey(page, 'Enter');
    const editable = getEditable(page);

    // Should have code fence lines
    const fenceLines = editable.locator('.md-code-fence');
    await expect(fenceLines.first()).toBeVisible();

    // Should have code content lines
    const codeLines = editable.locator('.md-code-line');
    const codeLineCount = await codeLines.count();
    expect(codeLineCount).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
  });

  test('blockquote gets md-blockquote class', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the blockquote
    const blocks = await getBlocks(page);
    const count = await blocks.count();
    let bqIndex = -1;
    for (let i = 0; i < count; i++) {
      const tag = await blocks.nth(i).evaluate(el => el.tagName);
      if (tag === 'BLOCKQUOTE') {
        bqIndex = i;
        break;
      }
    }
    expect(bqIndex).toBeGreaterThan(-1);

    for (let i = 0; i <= bqIndex; i++) {
      await pressKey(page, 'ArrowDown');
    }

    await pressKey(page, 'Enter');
    const editable = getEditable(page);

    const bqLine = editable.locator('.md-blockquote');
    await expect(bqLine).toHaveCount(1);

    await page.keyboard.press('Escape');
  });
});

test.describe('Feature 9: Paste handling', () => {

  test('paste strips HTML and inserts plain text', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await expect(editable).toBeVisible();

    // Clear content
    await editable.evaluate(el => { el.textContent = ''; });
    await editable.focus();

    // Simulate pasting HTML content
    await page.evaluate(() => {
      const editable = document.querySelector('.md-editable');
      const dt = new DataTransfer();
      dt.setData('text/plain', 'plain text only');
      dt.setData('text/html', '<b>bold html</b>');
      const pasteEvent = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: dt
      });
      editable.dispatchEvent(pasteEvent);
    });

    // The content should be plain text, not HTML
    const content = await editable.evaluate(el => el.textContent);
    expect(content).not.toContain('<b>');

    await page.keyboard.press('Escape');
  });
});

test.describe('Feature 9: Tab handling in contenteditable', () => {

  test('Tab inserts spaces in contenteditable', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const editable = getEditable(page);
    await editable.evaluate(el => { el.textContent = ''; });
    await editable.focus();
    await page.keyboard.type('test');
    await page.keyboard.press('Tab');

    const content = await editable.evaluate(el => el.textContent);
    expect(content).toContain('    ');

    // Focus should still be on the editable div
    const isFocused = await editable.evaluate(el => document.activeElement === el);
    expect(isFocused).toBe(true);

    await page.keyboard.press('Escape');
  });
});

test.describe('Feature 9: Undo/redo integration', () => {

  test('Ctrl+Z after render undoes to edit mode, then to original', async ({ page }) => {
    await waitForEditor(page);

    // Select a block
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const originalText = await blocks.first().innerText();

    // Enter edit mode
    await pressKey(page, 'Enter');
    const editable = getEditable(page);

    // Modify content
    await editable.evaluate(el => { el.textContent = ''; });
    await editable.focus();
    await page.keyboard.type('Modified content');

    // Render
    await page.keyboard.press('Shift+Enter');

    // Verify edit took effect
    const selected = page.locator('#preview .selected');
    await expect(selected).toContainText('Modified content');

    // Undo render (back to edit mode)
    await page.keyboard.press('Control+z');

    // Undo enter (back to original)
    await page.keyboard.press('Control+z');

    // Original content should be restored
    const restoredBlocks = await getBlocks(page);
    await expect(restoredBlocks.first()).toContainText(originalText);
  });
});
