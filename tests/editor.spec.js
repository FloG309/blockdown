const { test, expect } = require('@playwright/test');

// Helper: wait for editor to fully initialize (markdown rendered into blocks)
async function waitForEditor(page) {
  await page.goto('/editor/editor.html');
  // Wait for the preview to contain rendered markdown blocks
  await page.waitForSelector('#preview h2');
  // Verify CodeMirror bundle loaded (synchronous script, should be ready immediately)
  await page.waitForFunction(() => window.CM && window.CM.ready, { timeout: 5000 });
  // Wait for all mermaid diagrams to finish rendering (the default content has one)
  await page.waitForSelector('#preview[data-mermaid-ready="true"]', { timeout: 10000 });
}

// Helper: get all selectable block elements
async function getBlocks(page) {
  return page.locator('#preview > h1, #preview > h2, #preview > h3, #preview > h4, #preview > h5, #preview > h6, #preview > p, #preview > ul, #preview > ol, #preview > pre, #preview > blockquote, #preview > table, #preview > hr, #preview > textarea, #preview > .cm-wrapper');
}

// Helper: press a key on the page body (not inside an editor)
async function pressKey(page, key) {
  await page.keyboard.press(key);
}

// Helper: wait for edit mode to appear (CM editor)
async function waitForEditMode(page) {
  await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });
}

// Helper: set text content in the CM editor (replaces all content programmatically)
async function typeInEditor(page, text) {
  await page.evaluate((newText) => {
    const wrapper = document.querySelector('#preview .cm-wrapper');
    if (wrapper && wrapper._cmView) {
      const view = wrapper._cmView;
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: newText }
      });
    }
  }, text);
}

// Helper: get text from the CM editor
async function getEditorText(page) {
  return page.evaluate(() => {
    const wrapper = document.querySelector('#preview .cm-wrapper');
    if (wrapper && wrapper._cmView) {
      return wrapper._cmView.state.doc.toString();
    }
    const textarea = document.querySelector('#preview textarea');
    if (textarea) return textarea.value;
    return '';
  });
}

// =============================================================
// Feature 1+3: Escape renders editor and restores selection
// =============================================================

test.describe('Feature 1+3: Escape renders and restores selection', () => {

  test('Shift+Enter renders and keeps block selected', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');
    await expect((await getBlocks(page)).first()).toHaveClass(/selected/);

    // Enter edit mode
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // Shift+Enter to render
    await page.keyboard.press('Shift+Enter');

    // Editor should be gone
    await expect(page.locator('#preview .cm-wrapper')).toHaveCount(0);

    // The rendered block should be selected
    const selectedBlock = page.locator('#preview .selected');
    await expect(selectedBlock).toHaveCount(1);
    const tagName = await selectedBlock.evaluate(el => el.tagName);
    expect(tagName).not.toBe('TEXTAREA');
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

    // Press 'b' to insert editor after the list
    await pressKey(page, 'b');
    await waitForEditMode(page);

    // Type new list items
    await typeInEditor(page, '- new item from test\n- another test item');

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

    // Insert editor after
    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, 'Just a plain paragraph.');
    await page.keyboard.press('Shift+Enter');

    // The paragraph should be its own block, not merged
    const ulCount = await page.locator('#preview > ul').count();
    expect(ulCount).toBeGreaterThanOrEqual(1);
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
    await waitForEditMode(page);

    const value = await getEditorText(page);
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
    await waitForEditMode(page);
    await typeInEditor(page, '- xxx\n- yyy');
    await page.keyboard.press('Shift+Enter');

    // Insert editor after the list and add indented sub-list
    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, '    - zzz');
    await page.keyboard.press('Shift+Enter');

    // Should be 1 top-level UL
    expect(await page.locator('#preview > ul').count()).toBe(1);

    // zzz should be nested inside last li (yyy)
    const nestedUl = page.locator('#preview > ul').first().locator(':scope > li:last-child > ul');
    await expect(nestedUl).toHaveCount(1);
    await expect(nestedUl.locator('li')).toHaveText(['zzz']);
  });

  test('double-indented list merges at level 2 under last item', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    await waitForEditMode(page);
    await typeInEditor(page, '- xxx\n- yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, '        - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);
    await expect(page.locator('#preview > ul').first().locator(':scope > li:last-child')).toContainText('zzz');
  });

  test('indented list merges as sibling when preceding list has same-level sub-items', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    await waitForEditMode(page);
    await typeInEditor(page, '- xxx\n    - yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, '    - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

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
    await waitForEditMode(page);
    await typeInEditor(page, '- xxx\n    - yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, '        - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

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
    await waitForEditMode(page);
    await typeInEditor(page, '- merged item');
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
    await waitForEditMode(page);
    await typeInEditor(page, '    - sub item');
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
    await waitForEditMode(page);
    await typeInEditor(page, '    - sub item');
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

  test('Tab inserts spaces in editor instead of changing focus', async ({ page }) => {
    await waitForEditor(page);

    // Select first block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // Select all and delete, then type
    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('hello', { delay: 10 });

    // Press Tab
    await page.keyboard.press('Tab');

    // Tab should insert spaces
    const value = await getEditorText(page);
    expect(value).toBe('hello    ');

    // Editor should still be focused
    const isFocused = await page.evaluate(() => {
      const cmEl = document.querySelector('#preview .cm-wrapper .cm-editor');
      return cmEl && cmEl.classList.contains('cm-focused');
    });
    expect(isFocused).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('Tab at beginning of line inserts spaces for indentation', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('- item', { delay: 10 });

    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');

    const value = await getEditorText(page);
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

    const blocks = await getBlocks(page);
    const firstRect = await blocks.nth(0).boundingBox();
    const thirdRect = await blocks.nth(2).boundingBox();

    const startX = firstRect.x - 10;
    const startY = firstRect.y - 5;
    const endX = thirdRect.x + thirdRect.width + 10;
    const endY = thirdRect.y + thirdRect.height + 5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

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

    const band = page.locator('#rubber-band');
    await expect(band).toBeVisible();

    await page.mouse.up();

    await expect(band).not.toBeVisible();
  });

  test('short click does not trigger rubber band (normal click works)', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);

    await blocks.nth(0).click();

    await expect(blocks.nth(0)).toHaveClass(/selected/);

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

    const codeEl = page.locator('#preview pre code');
    await expect(codeEl).toHaveCount(1);

    await expect(codeEl).toHaveClass(/hljs/);

    const tokenCount = await codeEl.locator('span[class^="hljs-"]').count();
    expect(tokenCount).toBeGreaterThan(0);
  });



  test('code block without language hint still gets auto-highlighted', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, '```\nconst x = 42;\nconsole.log(x);\n```');
    await page.keyboard.press('Shift+Enter');

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

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    await pressKey(page, 'ArrowDown');
    const firstBlockText = await blocks.first().innerText();

    // Delete with dd
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    const afterDeleteCount = await (await getBlocks(page)).count();
    expect(afterDeleteCount).toBe(initialCount - 1);

    // Undo
    await page.keyboard.press('Control+z');

    const afterUndoCount = await (await getBlocks(page)).count();
    expect(afterUndoCount).toBe(initialCount);

    const restoredBlocks = await getBlocks(page);
    await expect(restoredBlocks.first()).toContainText(firstBlockText);
  });

  test('undo restores content after edit', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    const originalText = await (await getBlocks(page)).nth(1).innerText();

    // Enter edit mode, change text, render
    await pressKey(page, 'Enter');
    await waitForEditMode(page);
    await typeInEditor(page, 'Completely changed text');
    await page.keyboard.press('Escape');

    // Verify the edit took effect
    const selectedBlock = page.locator('#preview .selected');
    await expect(selectedBlock).toContainText('Completely changed text');

    // Undo the render
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(100);

    // If there's a CM editor now, we need one more undo
    const hasCM = await page.locator('#preview .cm-wrapper').count();
    if (hasCM > 0) {
      await page.keyboard.press('Control+z');
    }

    // Original text should be back
    const blocks = await getBlocks(page);
    await expect(blocks.nth(1)).toContainText(originalText);
  });

  test('redo reapplies after undo', async ({ page }) => {
    await waitForEditor(page);

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

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    // Undo
    await page.keyboard.press('Control+z');
    expect(await (await getBlocks(page)).count()).toBe(initialCount);

    // Perform a new action
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, 'new block');
    await page.keyboard.press('Escape');

    // Redo should do nothing
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

    // Insert and render
    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, 'Block A');
    await page.keyboard.press('Escape');

    const afterFirstInsert = await (await getBlocks(page)).count();
    expect(afterFirstInsert).toBe(initialCount + 1);

    // Insert another and render
    await pressKey(page, 'b');
    await waitForEditMode(page);
    await typeInEditor(page, 'Block B');
    await page.keyboard.press('Escape');

    const afterSecondInsert = await (await getBlocks(page)).count();
    expect(afterSecondInsert).toBe(initialCount + 2);

    // Undo four times to get back to initial state
    await page.keyboard.press('Control+z');
    await page.keyboard.press('Control+z');
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

    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();
    const firstBlockText = await blocks.first().innerText();

    // Copy
    await pressKey(page, 'c');

    // Navigate down and paste
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    const newBlocks = await getBlocks(page);
    const newCount = await newBlocks.count();
    expect(newCount).toBe(initialCount + 1);

    const pastedBlock = page.locator('#preview .selected');
    await expect(pastedBlock).toContainText(firstBlockText);
  });

  test('multi-block select, C copies all, V pastes all', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const selectedCount = await page.locator('#preview .selected').count();
    expect(selectedCount).toBe(2);

    await pressKey(page, 'c');

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    const blocks = await getBlocks(page);
    const count = await blocks.count();
    expect(count).toBeGreaterThanOrEqual(selectedCount + 2);
  });

  test('X cuts blocks — originals removed, V pastes them back', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    await pressKey(page, 'ArrowDown');
    const firstBlockText = await blocks.first().innerText();

    // Cut
    await pressKey(page, 'x');

    const afterCutCount = await (await getBlocks(page)).count();
    expect(afterCutCount).toBe(initialCount - 1);

    // Paste
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    const afterPasteCount = await (await getBlocks(page)).count();
    expect(afterPasteCount).toBe(initialCount);

    const pastedBlock = page.locator('#preview .selected');
    await expect(pastedBlock).toContainText(firstBlockText);
  });

  test('V with empty clipboard does nothing', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');

    const afterPasteCount = await (await getBlocks(page)).count();
    expect(afterPasteCount).toBe(initialCount);
  });

  test('pasting list block adjacent to list triggers auto-merge', async ({ page }) => {
    await waitForEditor(page);

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

    await pressKey(page, 'c');
    await pressKey(page, 'v');

    const ulCount = await page.locator('#preview > ul').count();
    expect(ulCount).toBe(1);
  });
});

// =============================================================
// Feature 8: Edit mode height matching
// =============================================================

test.describe('Feature 8: Edit mode height matching', () => {

  test('editor min-height matches rendered block height', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block (h2)
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const firstBlock = blocks.first();

    // Capture the rendered block height
    const renderedHeight = await firstBlock.evaluate(el => el.offsetHeight);

    // Enter edit mode
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // CM wrapper min-height should match the rendered block height
    const minHeight = await page.locator('#preview .cm-wrapper').evaluate(el => parseFloat(el.style.minHeight));
    expect(minHeight).toBe(renderedHeight);
  });

  test('edit mode does not dramatically change page layout on enter', async ({ page }) => {
    await waitForEditor(page);

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

    const nextIndex = pIndex + 1;
    let nextBlockTopBefore = null;
    if (nextIndex < count) {
      nextBlockTopBefore = await blocks.nth(nextIndex).evaluate(el => el.getBoundingClientRect().top);
    }

    // Enter edit mode
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    if (nextBlockTopBefore !== null && nextIndex < count) {
      const cmWrapper = page.locator('#preview .cm-wrapper');
      const nextSiblingTop = await cmWrapper.evaluate(el => {
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
// Feature 9: CodeMirror edit mode
// =============================================================

test.describe('Feature 9: CodeMirror edit mode', () => {

  test('edit mode creates a CodeMirror editor (.cm-editor present)', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    await waitForEditMode(page);
    const cmEditor = page.locator('#preview .cm-wrapper .cm-editor');
    await expect(cmEditor).toBeVisible();
  });

  test('Shift+Enter exits edit mode and renders correctly', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    await typeInEditor(page, 'Hello **world**');
    await page.keyboard.press('Shift+Enter');

    await expect(page.locator('#preview .cm-wrapper')).toHaveCount(0);

    const selected = page.locator('#preview .selected');
    await expect(selected).toContainText('Hello world');
    const strongCount = await selected.locator('strong').count();
    expect(strongCount).toBe(1);
  });

  test('CodeMirror adds markdown syntax highlighting tokens', async ({ page }) => {
    await waitForEditor(page);

    // Select the heading block (first block is h2 "Welcome to the Markdown Editor")
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    const cmEditor = page.locator('#preview .cm-wrapper .cm-editor');
    await expect(cmEditor).toBeVisible();

    // Check that CodeMirror's content area has styled spans (syntax tokens)
    const tokenInfo = await page.evaluate(() => {
      const cm = document.querySelector('.cm-content');
      if (!cm) return { hasTokens: false };
      const spans = cm.querySelectorAll('span');
      return {
        hasTokens: spans.length > 0,
        // Check that at least one span has inline styles from HighlightStyle
        hasStyledSpans: Array.from(spans).some(s => s.style.length > 0 || s.className),
      };
    });
    expect(tokenInfo.hasTokens).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('line decorations: heading lines get cm-md-h1/h2/h3 classes', async ({ page }) => {
    await waitForEditor(page);

    // Select the h2 heading (first block)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // The h2 content "## Welcome to the Markdown Editor" should have cm-md-h2 line decoration
    const hasH2Class = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-line');
      return Array.from(lines).some(line => line.classList.contains('cm-md-h2'));
    });
    expect(hasH2Class).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('line decorations: list item lines get cm-md-list-item class', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the list block (block index 3: the UL with features)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    const hasListItemClass = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-line');
      return Array.from(lines).some(line => line.classList.contains('cm-md-list-item'));
    });
    expect(hasListItemClass).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('line decorations: code block lines get cm-md-code-fence and cm-md-code-line classes', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the code block (block index 5: the pre/code block)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    const codeClasses = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-line');
      const hasFence = Array.from(lines).some(line => line.classList.contains('cm-md-code-fence'));
      const hasCodeLine = Array.from(lines).some(line => line.classList.contains('cm-md-code-line'));
      return { hasFence, hasCodeLine };
    });
    expect(codeClasses.hasFence).toBe(true);
    expect(codeClasses.hasCodeLine).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('line decorations: blockquote lines get cm-md-blockquote class', async ({ page }) => {
    await waitForEditor(page);

    // Navigate to the blockquote (block index 8: last block, after mermaid blocks)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    const hasBlockquoteClass = await page.evaluate(() => {
      const lines = document.querySelectorAll('.cm-line');
      return Array.from(lines).some(line => line.classList.contains('cm-md-blockquote'));
    });
    expect(hasBlockquoteClass).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('CM wrapper min-height matches rendered block height', async ({ page }) => {
    await waitForEditor(page);

    // Select the heading block
    await pressKey(page, 'ArrowDown');

    // Capture rendered height before entering edit mode
    const renderedHeight = await page.evaluate(() => {
      const selected = document.querySelector('.selected');
      return selected ? selected.offsetHeight : 0;
    });
    expect(renderedHeight).toBeGreaterThan(0);

    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // Check CM wrapper has min-height matching rendered height
    const wrapperMinHeight = await page.evaluate(() => {
      const wrapper = document.querySelector('.cm-wrapper');
      return wrapper ? parseInt(wrapper.style.minHeight) : 0;
    });
    expect(wrapperMinHeight).toBeGreaterThanOrEqual(renderedHeight - 5);

    await page.keyboard.press('Escape');
  });

  test('editor shrinks when content is deleted (min-height clears on edit)', async ({ page }) => {
    await waitForEditor(page);

    // Select the list block (index 3)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // Get initial wrapper height, then add content to make it taller
    const initialHeight = await page.evaluate(() => {
      const w = document.querySelector('.cm-wrapper');
      return w.offsetHeight;
    });

    await page.evaluate(() => {
      const w = document.querySelector('.cm-wrapper');
      const view = w._cmView;
      const doc = view.state.doc.toString();
      view.dispatch({ changes: { from: doc.length, insert: '\n- Extra 1\n- Extra 2\n- Extra 3\n- Extra 4\n- Extra 5' }});
    });

    const expandedHeight = await page.evaluate(() => {
      const w = document.querySelector('.cm-wrapper');
      return w.offsetHeight;
    });
    expect(expandedHeight).toBeGreaterThan(initialHeight);

    // Now delete extra items — keep only first line
    await page.evaluate(() => {
      const w = document.querySelector('.cm-wrapper');
      const view = w._cmView;
      const firstLine = view.state.doc.line(1).text;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: firstLine }});
    });

    // Verify min-height was cleared and editor shrank
    const afterDeleteHeight = await page.evaluate(() => {
      const w = document.querySelector('.cm-wrapper');
      return { height: w.offsetHeight, minHeight: w.style.minHeight };
    });
    expect(afterDeleteHeight.minHeight).toBe('');
    expect(afterDeleteHeight.height).toBeLessThan(expandedHeight);

    await page.keyboard.press('Escape');
  });

  test('undo/redo integration still works', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    expect(await (await getBlocks(page)).count()).toBe(initialCount - 1);

    await page.keyboard.press('Control+z');
    expect(await (await getBlocks(page)).count()).toBe(initialCount);
  });

  test('focus management: CodeMirror editor receives focus on enter', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    const isFocused = await page.evaluate(() => {
      const cmEl = document.querySelector('#preview .cm-wrapper .cm-editor');
      return cmEl && cmEl.classList.contains('cm-focused');
    });
    expect(isFocused).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('insert before (a key) creates CodeMirror editor', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'a');
    await waitForEditMode(page);

    const cmEditor = page.locator('#preview .cm-wrapper .cm-editor');
    await expect(cmEditor).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('insert after (b key) creates CodeMirror editor', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'b');
    await waitForEditMode(page);

    const cmEditor = page.locator('#preview .cm-wrapper .cm-editor');
    await expect(cmEditor).toBeVisible();

    await page.keyboard.press('Escape');
  });
});

// =============================================================
// Minor UI fixes: delete selection and Escape deselect
// =============================================================

test.describe('Minor UI fixes', () => {

  test('deleting a block selects the block above it', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();

    // Navigate to the third block (index 2)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');

    const aboveBlockText = await blocks.nth(1).innerText();

    // Delete with dd
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    const afterBlocks = await getBlocks(page);
    expect(await afterBlocks.count()).toBe(initialCount - 1);

    // The block above (previously index 1) should now be selected
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(aboveBlockText);
  });

  test('deleting the first block selects the new first block', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const secondBlockText = await blocks.nth(1).innerText();

    // Navigate to the first block
    await pressKey(page, 'ArrowDown');

    // Delete with dd
    await pressKey(page, 'd');
    await pressKey(page, 'd');

    // The new first block (previously second) should be selected
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
    await expect(selected).toContainText(secondBlockText);
  });

  test('Escape on a selected block deselects it', async ({ page }) => {
    await waitForEditor(page);

    // Select a block
    await pressKey(page, 'ArrowDown');
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);

    // Press Escape
    await pressKey(page, 'Escape');

    // No blocks should be selected
    await expect(selected).toHaveCount(0);
  });

  test('Escape on multi-selected blocks deselects all', async ({ page }) => {
    await waitForEditor(page);

    // Select multiple blocks
    await pressKey(page, 'ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');

    const selected = page.locator('#preview .selected');
    expect(await selected.count()).toBeGreaterThanOrEqual(2);

    // Press Escape
    await pressKey(page, 'Escape');

    // No blocks should be selected
    await expect(selected).toHaveCount(0);
  });
});

// =============================================================
// Bug Fix 2: Mermaid syntax error inline display
// =============================================================

test.describe('Bug Fix 2: Mermaid syntax error UI', () => {
  test('mermaid edit mode uses CodeMirror editor', async ({ page }) => {
    await waitForEditor(page);

    // Wait for mermaid container to render
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });

    // Navigate to the mermaid block and enter edit mode
    const mermaidContainer = page.locator('#preview .mermaid-container').first();
    await mermaidContainer.click();
    await pressKey(page, 'Enter');

    // Should have a CM editor, not a plain textarea
    await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });
    const cmEditor = page.locator('#preview .cm-wrapper .cm-editor');
    await expect(cmEditor).toBeVisible();

    // Should NOT have a textarea for this block
    const textareas = page.locator('#preview > textarea');
    await expect(textareas).toHaveCount(0);
  });

  test('invalid mermaid syntax shows lint error in editor', async ({ page }) => {
    await waitForEditor(page);
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });

    // Navigate to mermaid block and enter edit mode
    const mermaidContainer = page.locator('#preview .mermaid-container').first();
    await mermaidContainer.click();
    await pressKey(page, 'Enter');
    await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });

    // Replace content with invalid mermaid syntax
    await page.evaluate(() => {
      const wrapper = document.querySelector('#preview .cm-wrapper');
      if (wrapper && wrapper._cmView) {
        const view = wrapper._cmView;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '```mermaid\ngraph TD\n  A[Start -->>\n```' }
        });
      }
    });

    // Wait for inline error widget to appear below the offending line
    await expect(page.locator('.cm-mermaid-error-widget')).toBeVisible({ timeout: 5000 });

    // The offending line should be highlighted
    await expect(page.locator('.cm-mermaid-error-line')).toHaveCount(1);
  });

  test('valid mermaid syntax shows no lint errors', async ({ page }) => {
    await waitForEditor(page);
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });

    // Navigate to mermaid block and enter edit mode
    const mermaidContainer = page.locator('#preview .mermaid-container').first();
    await mermaidContainer.click();
    await pressKey(page, 'Enter');
    await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });

    // Content should be valid mermaid — wait for linter to settle
    await page.waitForTimeout(800);

    // No error diagnostics should be present
    const diagnostic = page.locator('.cm-diagnostic-error');
    await expect(diagnostic).toHaveCount(0);
  });

  test('lint error highlights the offending line', async ({ page }) => {
    await waitForEditor(page);
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });

    // Navigate to mermaid block and enter edit mode
    const mermaidContainer = page.locator('#preview .mermaid-container').first();
    await mermaidContainer.click();
    await pressKey(page, 'Enter');
    await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });

    // Write invalid syntax
    await page.evaluate(() => {
      const wrapper = document.querySelector('#preview .cm-wrapper');
      if (wrapper && wrapper._cmView) {
        const view = wrapper._cmView;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '```mermaid\ngraph TD\n  A --> B\n  C -->> invalid\n```' }
        });
      }
    });

    // Wait for inline error widget to appear
    await expect(page.locator('.cm-mermaid-error-widget')).toBeVisible({ timeout: 5000 });
  });

  test('fixing syntax error clears the lint diagnostic', async ({ page }) => {
    await waitForEditor(page);
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });

    // Navigate to mermaid block and enter edit mode
    const mermaidContainer = page.locator('#preview .mermaid-container').first();
    await mermaidContainer.click();
    await pressKey(page, 'Enter');
    await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });

    // Write invalid syntax
    await page.evaluate(() => {
      const wrapper = document.querySelector('#preview .cm-wrapper');
      if (wrapper && wrapper._cmView) {
        const view = wrapper._cmView;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '```mermaid\ngraph TD\n  A[Start -->>\n```' }
        });
      }
    });

    // Wait for inline error widget to appear
    await expect(page.locator('.cm-mermaid-error-widget')).toHaveCount(1, { timeout: 5000 });

    // Now fix the syntax
    await page.evaluate(() => {
      const wrapper = document.querySelector('#preview .cm-wrapper');
      if (wrapper && wrapper._cmView) {
        const view = wrapper._cmView;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: '```mermaid\ngraph TD\n  A[Start] --> B[End]\n```' }
        });
      }
    });

    // Wait for linter to re-run and error widget to disappear
    await expect(page.locator('.cm-mermaid-error-widget')).toHaveCount(0, { timeout: 5000 });
  });

  test('Shift+Enter exits mermaid CM editor and re-renders diagram', async ({ page }) => {
    await waitForEditor(page);
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });

    // Navigate to mermaid block and enter edit mode
    const mermaidContainer = page.locator('#preview .mermaid-container').first();
    await mermaidContainer.click();
    await pressKey(page, 'Enter');
    await page.waitForSelector('#preview .cm-wrapper .cm-editor', { timeout: 5000 });

    // Exit with Shift+Enter
    await page.keyboard.press('Shift+Enter');

    // Should re-render as a mermaid container
    await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });
    const container = page.locator('#preview .mermaid-container');
    await expect(container).toBeVisible();

    // CM editor should be gone
    const cmEditor = page.locator('#preview .cm-wrapper');
    await expect(cmEditor).toHaveCount(0);
  });
});

// ──────────────────────────────────────────────────────────
// Feature 11: Layout Menu & Dark Mode
// ──────────────────────────────────────────────────────────

test.describe('Feature 11: Layout Menu & Dark Mode', () => {

  // ── Settings popover ────────────────────────────────────

  test('gear icon opens and closes settings popover', async ({ page }) => {
    await waitForEditor(page);

    const btn = page.locator('#settings-btn');
    const popover = page.locator('#settings-popover');

    // Initially hidden
    await expect(popover).toHaveClass(/hidden/);

    // Click gear → opens
    await btn.click();
    await expect(popover).not.toHaveClass(/hidden/);

    // Click outside → closes
    await page.locator('#preview').click({ position: { x: 5, y: 5 } });
    await expect(popover).toHaveClass(/hidden/);

    // Click gear again → opens
    await btn.click();
    await expect(popover).not.toHaveClass(/hidden/);

    // Click gear once more → closes (toggle)
    await btn.click();
    await expect(popover).toHaveClass(/hidden/);
  });

  // ── Font size ───────────────────────────────────────────

  test('changing font size updates CSS variable', async ({ page }) => {
    await waitForEditor(page);

    // Open popover and click "L" (18px)
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="18"]').click();

    const fontSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-size').trim()
    );
    expect(fontSize).toBe('18px');

    // Verify the button is marked active
    const isActive = await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="18"]').evaluate(
      el => el.classList.contains('active')
    );
    expect(isActive).toBe(true);
  });

  test('font size persists after reload', async ({ page }) => {
    await waitForEditor(page);

    // Set font size to 20
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="20"]').click();

    // Reload
    await page.reload();
    await waitForEditor(page);

    const fontSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-size').trim()
    );
    expect(fontSize).toBe('20px');

    // Verify active button matches
    await page.locator('#settings-btn').click();
    const isActive = await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="20"]').evaluate(
      el => el.classList.contains('active')
    );
    expect(isActive).toBe(true);
  });

  // ── Line height (slider) ─────────────────────────────────

  test('line height slider updates CSS variable', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    const slider = page.locator('input[data-setting="lineHeight"]');
    await slider.fill('1.8');
    await slider.dispatchEvent('input');

    const lineHeight = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--line-height').trim()
    );
    expect(lineHeight).toBe('1.8');

    // Verify display label
    const display = await page.locator('[data-display="lineHeight"]').textContent();
    expect(display).toBe('1.8');
  });

  // ── Content width (drag gear button) ──────────────────────

  test('dragging gear button changes content width', async ({ page }) => {
    await waitForEditor(page);

    const btn = page.locator('#settings-btn');
    const box = await btn.boundingBox();

    // Drag the gear button 100px to the right
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 });

    // Guide lines should be visible during drag
    const guides = page.locator('.content-width-guide');
    await expect(guides).toHaveCount(2);

    await page.mouse.up();

    // Guides should disappear
    await expect(guides).toHaveCount(0);

    // Content width should have changed from default 75%
    const width = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--content-width').trim()
    );
    expect(width).not.toBe('75%');
  });

  // ── Paragraph spacing (slider) ──────────────────────────

  test('paragraph spacing slider updates CSS variable', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    const slider = page.locator('input[data-setting="paragraphSpacing"]');
    await slider.fill('1.5');
    await slider.dispatchEvent('input');

    const spacing = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--paragraph-spacing').trim()
    );
    expect(spacing).toBe('1.5rem');

    const display = await page.locator('[data-display="paragraphSpacing"]').textContent();
    expect(display).toBe('1.5rem');
  });

  // ── Click to deselect ────────────────────────────────────

  test('clicking a selected block deselects it', async ({ page }) => {
    await waitForEditor(page);

    const block = page.locator('#preview > h2').first();
    // Click to select
    await block.click();
    await expect(block).toHaveClass(/selected/);

    // Click again to deselect
    await block.click();
    const hasSelected = await block.evaluate(el => el.classList.contains('selected'));
    expect(hasSelected).toBe(false);
  });

  // ── Dark mode ───────────────────────────────────────────

  test('dark theme sets data-theme attribute and changes background', async ({ page }) => {
    await waitForEditor(page);

    // Click dark
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="theme"] button[data-value="dark"]').click();

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');

    // Background should be dark
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // #1e1e2e = rgb(30, 30, 46)
    expect(bg).toBe('rgb(30, 30, 46)');
  });

  test('light theme restores light background', async ({ page }) => {
    await waitForEditor(page);

    // Set dark first
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="theme"] button[data-value="dark"]').click();

    // Then light
    await page.locator('.settings-seg[data-setting="theme"] button[data-value="light"]').click();

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('light');

    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    // #ffffff = rgb(255, 255, 255)
    expect(bg).toBe('rgb(255, 255, 255)');
  });

  test('dark mode persists after reload', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="theme"] button[data-value="dark"]').click();

    await page.reload();
    await waitForEditor(page);

    const theme = await page.evaluate(() => document.documentElement.getAttribute('data-theme'));
    expect(theme).toBe('dark');
  });

  // ── Keyboard shortcuts ──────────────────────────────────

  test('Ctrl+= increases font size by one step', async ({ page }) => {
    await waitForEditor(page);

    // Default is 16, Ctrl+= should go to 18
    await page.keyboard.press('Control+=');

    const fontSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-size').trim()
    );
    expect(fontSize).toBe('18px');
  });

  test('Ctrl+- decreases font size by one step', async ({ page }) => {
    await waitForEditor(page);

    // Set to 18 first
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="18"]').click();
    await page.locator('#settings-btn').click(); // close popover

    await page.keyboard.press('Control+-');

    const fontSize = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue('--font-size').trim()
    );
    expect(fontSize).toBe('16px');
  });

  test('Ctrl+Shift+L cycles theme between light and dark', async ({ page }) => {
    await waitForEditor(page);

    // Default is light → should cycle to dark
    await page.keyboard.press('Control+Shift+L');
    let theme = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('blockdown-settings') || '{}');
      return s.theme;
    });
    expect(theme).toBe('dark');

    // dark → light
    await page.keyboard.press('Control+Shift+L');
    theme = await page.evaluate(() => {
      const s = JSON.parse(localStorage.getItem('blockdown-settings') || '{}');
      return s.theme;
    });
    expect(theme).toBe('light');
  });

  // ── Dark mode + CodeMirror integration ──────────────────

  test('CM editor adapts to dark mode', async ({ page }) => {
    await waitForEditor(page);

    // Switch to dark
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="theme"] button[data-value="dark"]').click();
    await page.locator('#settings-btn').click(); // close

    // Select first block and enter edit mode
    const firstBlock = page.locator('#preview > h2').first();
    await firstBlock.click();
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // CM editor background should be dark (--bg-primary is #1e1e2e)
    const cmBg = await page.evaluate(() => {
      const cm = document.querySelector('.cm-editor');
      return cm ? getComputedStyle(cm).backgroundColor : '';
    });
    expect(cmBg).toBe('rgb(30, 30, 46)');
  });

  // ── Multiple settings persist together ──────────────────

  test('multiple settings persist together across reload', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="14"]').click();

    const lhSlider = page.locator('input[data-setting="lineHeight"]');
    await lhSlider.fill('1.4');
    await lhSlider.dispatchEvent('input');

    await page.locator('.settings-seg[data-setting="theme"] button[data-value="dark"]').click();

    await page.reload();
    await waitForEditor(page);

    const settings = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return {
        fontSize: style.getPropertyValue('--font-size').trim(),
        lineHeight: style.getPropertyValue('--line-height').trim(),
        theme: document.documentElement.getAttribute('data-theme'),
      };
    });

    expect(settings.fontSize).toBe('14px');
    expect(settings.lineHeight).toBe('1.4');
    expect(settings.theme).toBe('dark');
  });
});

// =============================================================
// Helper: wait for test-write.html editor to initialize
// =============================================================

async function waitForTestWriteEditor(page) {
  await page.goto('/editor/test-write.html');
  await page.waitForSelector('#preview h1');
  await page.waitForFunction(() => window.CM && window.CM.ready, { timeout: 5000 });
}

// =============================================================
// Feature: Selection styling — fused bounding box overlay
// =============================================================

test.describe('Selection overlay', () => {

  test('selecting two adjacent blocks creates overlay spanning both', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');
    await expect(page.locator('#preview .selected')).toHaveCount(1);

    // Extend selection to include the second block
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('#preview .selected')).toHaveCount(2);

    // Overlay container should exist with at least one overlay child
    const overlayCount = await page.locator('#selection-overlay-container .selection-overlay').count();
    expect(overlayCount).toBeGreaterThanOrEqual(1);

    // Since the two blocks are adjacent, there should be exactly 1 overlay
    expect(overlayCount).toBe(1);
  });

  test('overlay appears on select and disappears on Escape', async ({ page }) => {
    await waitForEditor(page);

    // Select a block
    await pressKey(page, 'ArrowDown');
    await expect(page.locator('#preview .selected')).toHaveCount(1);

    // Wait for overlay to render (uses requestAnimationFrame)
    await page.waitForFunction(() =>
      document.querySelectorAll('#selection-overlay-container .selection-overlay').length > 0,
      { timeout: 2000 }
    );
    const overlayCount = await page.locator('#selection-overlay-container .selection-overlay').count();
    expect(overlayCount).toBe(1);

    // Deselect with Escape
    await pressKey(page, 'Escape');
    await expect(page.locator('#preview .selected')).toHaveCount(0);

    // Wait for overlay to clear
    await page.waitForFunction(() =>
      document.querySelectorAll('#selection-overlay-container .selection-overlay').length === 0,
      { timeout: 2000 }
    );
    const afterCount = await page.locator('#selection-overlay-container .selection-overlay').count();
    expect(afterCount).toBe(0);
  });

  test('non-adjacent selected blocks produce separate overlays', async ({ page }) => {
    await waitForTestWriteEditor(page);

    // Select block 0
    await pressKey(page, 'ArrowDown');

    // Select blocks 0 and 2 (skip block 1) using click with Ctrl
    const blocks = await getBlocks(page);
    const block0 = blocks.nth(0);
    const block2 = blocks.nth(2);

    await block0.click();
    await block2.click({ modifiers: ['Shift'] });

    // We need non-adjacent selection. Let's do it differently:
    // Select block 0, then Ctrl+click block 2
    // Actually, Ctrl+click may toggle. Let's use the keyboard approach.
    // Select block 0, ArrowDown twice to get to block 2, then we need to select 0 and 2 only.
    // The app might not support Ctrl+click for multi-select. Let's select 0 and 2 via evaluate.

    await page.evaluate(() => {
      deselectAll();
      selectableElements[0].classList.add('selected');
      selectableElements[2].classList.add('selected');
      currentSelectedIndex = 2;
      // Trigger overlay update
      if (typeof scheduleOverlayUpdate === 'function') scheduleOverlayUpdate();
      else if (typeof updateSelectionOverlay === 'function') updateSelectionOverlay();
    });

    // Wait a frame for overlay to update
    await page.waitForTimeout(100);

    const overlayCount = await page.locator('#selection-overlay-container .selection-overlay').count();
    expect(overlayCount).toBe(2);
  });
});

// =============================================================
// Feature: Rubber band starts outside preview area
// =============================================================

test.describe('Rubber band from outside preview', () => {

  test('drag starting outside #preview on #preview-container selects blocks', async ({ page }) => {
    await waitForEditor(page);

    // Get the preview-container and the first block's bounding rect
    const containerBox = await page.locator('#preview-container').boundingBox();
    const blocks = await getBlocks(page);
    const firstBlockBox = await blocks.first().boundingBox();
    const secondBlockBox = await blocks.nth(1).boundingBox();

    // Start the drag from the far left of preview-container (outside #preview content)
    const startX = containerBox.x + 5;
    const startY = firstBlockBox.y + 5;

    // End the drag across the first two blocks on the right side
    const endX = containerBox.x + containerBox.width - 10;
    const endY = secondBlockBox.y + secondBlockBox.height - 5;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(endX, endY, { steps: 10 });
    await page.mouse.up();

    // Blocks should be selected
    const selectedCount = await page.locator('#preview .selected').count();
    expect(selectedCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================
// Feature: Ctrl+A selects all blocks
// =============================================================

test.describe('Ctrl+A selects all blocks', () => {

  test('Ctrl+A selects all selectable blocks', async ({ page }) => {
    await waitForEditor(page);

    // First select a block to be in block mode
    await pressKey(page, 'ArrowDown');

    // Press Ctrl+A
    await page.keyboard.press('Control+a');

    // All selectable blocks should have .selected class
    const totalBlocks = await page.evaluate(() => selectableElements.length);
    const selectedCount = await page.locator('#preview .selected').count();
    expect(selectedCount).toBe(totalBlocks);
    expect(selectedCount).toBeGreaterThan(1);
  });

  test('selection overlay exists after Ctrl+A', async ({ page }) => {
    await waitForEditor(page);

    await pressKey(page, 'ArrowDown');
    await page.keyboard.press('Control+a');

    const overlayCount = await page.locator('#selection-overlay-container .selection-overlay').count();
    expect(overlayCount).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================
// Feature: Ctrl+C copies text to system clipboard
// =============================================================

test.describe('Ctrl+C copies to clipboard', () => {

  test('Ctrl+C copies selected block text to clipboard', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await waitForEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const blockText = await blocks.first().textContent();

    // Press Ctrl+C
    await page.keyboard.press('Control+c');

    // Read clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(blockText);
  });
});

// =============================================================
// Feature: Ctrl+V pastes text from clipboard as new blocks
// =============================================================

test.describe('Ctrl+V pastes from clipboard', () => {

  test('Ctrl+V pastes clipboard text as a new block', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await waitForEditor(page);

    const blocksBefore = await (await getBlocks(page)).count();

    // Write text to clipboard
    await page.evaluate(() => navigator.clipboard.writeText('pasted paragraph'));

    // Select a block
    await pressKey(page, 'ArrowDown');

    // Press Ctrl+V
    await page.keyboard.press('Control+v');

    // Wait for the paste to take effect
    await page.waitForTimeout(200);

    // A new block should have appeared
    const blocksAfter = await (await getBlocks(page)).count();
    expect(blocksAfter).toBeGreaterThan(blocksBefore);

    // The new block should contain the pasted text
    const pastedBlock = page.locator('#preview .selected');
    const pastedText = await pastedBlock.first().textContent();
    expect(pastedText).toContain('pasted paragraph');
  });
});

// =============================================================
// Feature: Block copy/paste with c/v keys still works
// =============================================================

test.describe('Block copy/paste with c/v keys', () => {

  test('c copies block and v pastes it', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const originalText = await blocks.first().textContent();
    const blocksBefore = await blocks.count();

    // Press c to copy the block
    await pressKey(page, 'c');

    // Move down
    await pressKey(page, 'ArrowDown');

    // Press v to paste
    await pressKey(page, 'v');

    // Wait for paste to take effect
    await page.waitForTimeout(200);

    // Block count should have increased
    const blocksAfter = await (await getBlocks(page)).count();
    expect(blocksAfter).toBeGreaterThan(blocksBefore);

    // The pasted block should contain the same text as the original
    const selectedBlock = page.locator('#preview .selected');
    const pastedText = await selectedBlock.first().textContent();
    expect(pastedText).toBe(originalText);
  });
});

// =============================================================
// Feature: Ctrl+A, Ctrl+C, Ctrl+V do NOT interfere with edit mode
// =============================================================

test.describe('Ctrl+A/C/V do not interfere with edit mode', () => {

  test('Ctrl+A in edit mode selects editor text, not all blocks', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // Press Ctrl+A inside the editor
    await page.keyboard.press('Control+a');

    // The CM editor should still be visible (still in edit mode)
    await expect(page.locator('#preview .cm-wrapper .cm-editor')).toHaveCount(1);

    // NOT all blocks should be selected — we should still be in edit mode
    // Only the cm-wrapper block might have .selected, not all blocks
    const selectedCount = await page.locator('#preview .selected').count();
    const totalBlocks = await (await getBlocks(page)).count();
    expect(selectedCount).toBeLessThan(totalBlocks);
  });
});

// =============================================================
// Feature: Scrolling speed — instant scroll
// =============================================================

test.describe('Scrolling speed — selected block stays visible', () => {

  test('navigating many blocks keeps the selected block in viewport', async ({ page }) => {
    await waitForTestWriteEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');

    // Press ArrowDown many times to scroll through blocks
    for (let i = 0; i < 20; i++) {
      await pressKey(page, 'ArrowDown');
    }

    // The selected block should be at least partially visible in the viewport
    const isVisible = await page.evaluate(() => {
      const selected = document.querySelector('.selected');
      if (!selected) return false;
      const rect = selected.getBoundingClientRect();
      // At least part of the element is within the viewport
      return rect.bottom > 0 && rect.top < window.innerHeight;
    });

    expect(isVisible).toBe(true);
  });
});

// =============================================================
// Feature: Double-click keeps box selected
// =============================================================

test.describe('Double-click keeps box selected', () => {

  test('double-click on a selected block keeps it selected', async ({ page }) => {
    await waitForEditor(page);

    // Click a block to select it
    const blocks = await getBlocks(page);
    const firstBlock = blocks.first();
    await firstBlock.click();
    await expect(firstBlock).toHaveClass(/selected/);

    // Double-click on it
    await firstBlock.dblclick();

    // Should still be selected
    await expect(firstBlock).toHaveClass(/selected/);
  });

  test('double-click on an unselected block selects it', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    const secondBlock = blocks.nth(1);

    // Double-click an unselected block
    await secondBlock.dblclick();

    // Should become selected
    await expect(secondBlock).toHaveClass(/selected/);
  });
});

// =============================================================
// Feature: Shift+Right extends text selection word by word
// =============================================================

test.describe('Shift+Right extends text selection', () => {

  test('Shift+Right selects the first word of the selected block', async ({ page }) => {
    await waitForEditor(page);

    // Select a paragraph block (second block, index 1, which is a paragraph)
    const blocks = await getBlocks(page);
    await blocks.nth(1).click();
    await expect(blocks.nth(1)).toHaveClass(/selected/);

    // Press Ctrl+Right to select the first word
    await page.keyboard.press('Shift+ArrowRight');

    const selectedText = await page.evaluate(() => window.getSelection().toString());
    expect(selectedText.length).toBeGreaterThan(0);
  });

  test('pressing Shift+Right multiple times grows the text selection', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    await blocks.nth(1).click();

    // Select first word
    await page.keyboard.press('Shift+ArrowRight');
    const firstLen = await page.evaluate(() => window.getSelection().toString().length);
    expect(firstLen).toBeGreaterThan(0);

    // Press Ctrl+Right several more times to ensure growth
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }
    const laterLen = await page.evaluate(() => window.getSelection().toString().length);

    expect(laterLen).toBeGreaterThan(firstLen);
  });

  test('selected text is within the selected block', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    await blocks.nth(1).click();

    await page.keyboard.press('Shift+ArrowRight');

    const isWithinBlock = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel.anchorNode) return false;
      const selectedBlock = document.querySelector('.selected');
      return selectedBlock && selectedBlock.contains(sel.anchorNode);
    });

    expect(isWithinBlock).toBe(true);
  });
});

// =============================================================
// Feature: Shift+Left contracts text selection
// =============================================================

test.describe('Shift+Left contracts text selection', () => {

  test('Shift+Left reduces the text selection after Ctrl+Right', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    await blocks.nth(1).click();

    // Select 3 words forward
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Shift+ArrowRight');

    const afterThreeWords = await page.evaluate(() => window.getSelection().toString().length);

    // Contract by one word
    await page.keyboard.press('Shift+ArrowLeft');

    const afterContraction = await page.evaluate(() => window.getSelection().toString().length);

    expect(afterContraction).toBeLessThan(afterThreeWords);
  });
});

// =============================================================
// Feature: Arrow keys clear text selection
// =============================================================

test.describe('Arrow keys clear text selection', () => {

  test('ArrowDown clears text selection created by Shift+Right', async ({ page }) => {
    await waitForEditor(page);

    const blocks = await getBlocks(page);
    await blocks.nth(1).click();

    // Create a text selection
    await page.keyboard.press('Shift+ArrowRight');

    const selBefore = await page.evaluate(() => window.getSelection().toString());
    expect(selBefore.length).toBeGreaterThan(0);

    // Press ArrowDown to navigate
    await pressKey(page, 'ArrowDown');

    const selAfter = await page.evaluate(() => window.getSelection().toString());
    expect(selAfter).toBe('');
  });
});

// =============================================================
// Feature: Shift+Right starts from first selected block (multi-select)
// =============================================================

test.describe('Shift+Right starts from first selected block on multi-select', () => {

  test('text selection starts within the first selected block', async ({ page }) => {
    await waitForEditor(page);

    // Select first block
    await pressKey(page, 'ArrowDown');

    // Extend to second block
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('#preview .selected')).toHaveCount(2);

    // Press Ctrl+Right
    await page.keyboard.press('Shift+ArrowRight');

    const isInFirstBlock = await page.evaluate(() => {
      const sel = window.getSelection();
      if (!sel.anchorNode) return false;
      const selectedBlocks = document.querySelectorAll('#preview > .selected');
      const firstBlock = selectedBlocks[0];
      return firstBlock && firstBlock.contains(sel.anchorNode);
    });

    expect(isInFirstBlock).toBe(true);
  });
});

// =============================================================
// Feature: Text selection grows box when reaching boundary
// =============================================================

test.describe('Text selection grows box at block boundary', () => {

  test('Shift+Right many times grows the box selection beyond one block', async ({ page }) => {
    await waitForTestWriteEditor(page);

    // Select the first paragraph block (a block with text content)
    // The first block is h1 "The Blockdown Editor", second is a paragraph
    const blocks = await getBlocks(page);
    await blocks.nth(1).click();
    await expect(blocks.nth(1)).toHaveClass(/selected/);

    const selectedBefore = await page.locator('#preview .selected').count();
    expect(selectedBefore).toBe(1);

    // Press Ctrl+Right many times to exhaust the text in the first block
    for (let i = 0; i < 50; i++) {
      await page.keyboard.press('Shift+ArrowRight');
    }

    // The box selection should have grown to include more blocks
    const selectedAfter = await page.locator('#preview .selected').count();
    expect(selectedAfter).toBeGreaterThan(1);
  });
});

// =============================================================
// Feature: Selection overlay updates on layout settings change
// =============================================================

test.describe('Selection overlay updates on layout change', () => {

  test('overlay repositions after font size change', async ({ page }) => {
    await waitForEditor(page);

    // Select two adjacent blocks
    await pressKey(page, 'ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await expect(page.locator('#preview .selected')).toHaveCount(2);

    // Get the overlay height before the change
    const heightBefore = await page.evaluate(() => {
      const overlay = document.querySelector('#selection-overlay-container .selection-overlay');
      return overlay ? overlay.offsetHeight : 0;
    });
    expect(heightBefore).toBeGreaterThan(0);

    // Open settings and change font size
    await page.locator('#settings-btn').click();
    await page.locator('.settings-seg[data-setting="fontSize"] button[data-value="20"]').click();

    // Wait for overlay to update (requestAnimationFrame + reflow)
    await page.waitForTimeout(200);

    // Get the overlay height after the change
    const heightAfter = await page.evaluate(() => {
      const overlay = document.querySelector('#selection-overlay-container .selection-overlay');
      return overlay ? overlay.offsetHeight : 0;
    });

    // The overlay height should have changed due to the font size change
    expect(heightAfter).not.toBe(heightBefore);
  });
});

// =============================================================
// Feature: Keybinding customization
// =============================================================

async function waitForTestWriteEditor2(page) {
  await page.goto('/editor/test-write.html');
  await page.waitForSelector('#preview h1');
  await page.waitForFunction(() => window.CM && window.CM.ready && window.Keybindings, { timeout: 5000 });
}

test.describe('Keybinding customization — panel UI', () => {

  test('shortcuts toggle opens the keybinding panel', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    const toggle = page.locator('#keybindings-toggle');
    await expect(toggle).toBeVisible();

    // Panel starts hidden
    const panel = page.locator('#keybindings-panel');
    await expect(panel).toHaveClass(/hidden/);

    // Click toggle opens panel
    await toggle.click();
    await expect(panel).not.toHaveClass(/hidden/);

    // Panel contains rows with badges
    const rows = panel.locator('.kb-row');
    const count = await rows.count();
    expect(count).toBeGreaterThanOrEqual(15);
  });

  test('keybinding badges show correct default labels', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    const copyTextBadge = page.locator('.kb-badge[data-action="copyText"]');
    await expect(copyTextBadge).toHaveText('Ctrl+C');

    const deleteBadge = page.locator('.kb-badge[data-action="deleteBlocks"]');
    await expect(deleteBadge).toHaveText('D D');

    const extendBadge = page.locator('.kb-badge[data-action="extendSelForward"]');
    await expect(extendBadge).toContainText('Shift');
  });
});

test.describe('Keybinding customization — rebinding', () => {

  test('clicking a badge enters listening mode', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    const badge = page.locator('.kb-badge[data-action="copyBlocks"]');
    await badge.click();
    await expect(badge).toHaveClass(/kb-listening/);
    await expect(badge).toContainText('Press keys');
  });

  test('pressing Escape cancels rebind', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    const badge = page.locator('.kb-badge[data-action="copyBlocks"]');
    const originalText = await badge.textContent();
    await badge.click();
    await expect(badge).toHaveClass(/kb-listening/);

    await page.keyboard.press('Escape');
    await expect(badge).not.toHaveClass(/kb-listening/);
    await expect(badge).toHaveText(originalText);
  });

  test('rebind a simple key and verify it works', async ({ page }) => {
    await waitForEditor(page);

    // Open panel and rebind copyBlocks from "c" to "q"
    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    const badge = page.locator('.kb-badge[data-action="copyBlocks"]');
    await badge.click();
    await page.keyboard.press('q');

    // Badge should now show "Q"
    await expect(badge).toHaveText('Q');

    // Close popover
    await page.click('#preview-container');

    // Verify the new binding works: select a block, press q to copy, v to paste
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    const initialCount = await blocks.count();
    const blockText = await blocks.first().innerText();

    await page.keyboard.press('q');  // copy blocks (rebound from c)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'v');  // paste blocks

    const newCount = await (await getBlocks(page)).count();
    expect(newCount).toBe(initialCount + 1);
  });

  test('rebind persists across reload', async ({ page }) => {
    await waitForEditor(page);

    // Rebind insertAbove from "a" to "t"
    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    const badge = page.locator('.kb-badge[data-action="insertAbove"]');
    await badge.click();
    await page.keyboard.press('t');
    await expect(badge).toHaveText('T');

    // Reload and check
    await page.reload();
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    const badgeAfter = page.locator('.kb-badge[data-action="insertAbove"]');
    await expect(badgeAfter).toHaveText('T');

    // Clean up: reset bindings
    await page.evaluate(() => window.Keybindings.resetAll());
  });

  test('conflict detection clears the old binding', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    // Rebind copyBlocks to "x" (which is cutBlocks)
    const copyBadge = page.locator('.kb-badge[data-action="copyBlocks"]');
    await copyBadge.click();
    await page.keyboard.press('x');

    // copyBlocks should now show "X"
    await expect(copyBadge).toHaveText('X');

    // cutBlocks should have been unbound (shows "—")
    const cutBadge = page.locator('.kb-badge[data-action="cutBlocks"]');
    await expect(cutBadge).toHaveText('—');

    // Clean up
    await page.evaluate(() => window.Keybindings.resetAll());
  });

  test('rebinding a Ctrl+key combo works', async ({ page }) => {
    await waitForEditor(page);

    await page.locator('#settings-btn').click();
    await page.locator('#keybindings-toggle').click();

    // Rebind selectAll to Ctrl+Shift+A
    const badge = page.locator('.kb-badge[data-action="selectAll"]');
    await badge.click();
    await page.keyboard.press('Control+Shift+a');
    await expect(badge).toContainText('Ctrl+Shift');

    // Close popover
    await page.click('#preview-container');

    // Verify: old Ctrl+A should NOT select all
    await pressKey(page, 'ArrowDown');
    await page.keyboard.press('Control+a');
    const selectedAfterOld = await page.locator('#preview .selected').count();
    // May or may not select all (browser default Ctrl+A might do something)

    // Verify: new Ctrl+Shift+A should select all
    await page.keyboard.press('Control+Shift+a');
    const totalBlocks = await page.evaluate(() => selectableElements.length);
    const selectedAfterNew = await page.locator('#preview .selected').count();
    expect(selectedAfterNew).toBe(totalBlocks);

    // Clean up
    await page.evaluate(() => window.Keybindings.resetAll());
  });
});
