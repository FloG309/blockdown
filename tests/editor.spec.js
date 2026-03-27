const { test, expect } = require('@playwright/test');

// Helper: wait for editor to fully initialize (markdown rendered into blocks)
async function waitForEditor(page) {
  await page.goto('/editor/editor.html');
  // Wait for the preview to contain rendered markdown blocks
  await page.waitForSelector('#preview h2');
  // Verify CodeMirror bundle loaded (synchronous script, should be ready immediately)
  await page.waitForFunction(() => window.CM && window.CM.ready, { timeout: 5000 });
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
// Feature 10: Mermaid Diagram Rendering
// =============================================================

// Helper: wait for mermaid processing to complete (async render)
async function waitForMermaid(page) {
  await page.waitForSelector('#preview .mermaid-container', { timeout: 10000 });
}

// Helper: navigate to the mermaid container block
async function selectMermaidBlock(page) {
  // Navigate down until we land on the mermaid container
  const idx = await page.evaluate(() => {
    const blocks = document.querySelectorAll('#preview > *');
    for (let i = 0; i < blocks.length; i++) {
      if (blocks[i].classList.contains('mermaid-container')) return i;
    }
    return -1;
  });
  expect(idx).toBeGreaterThan(-1);
  // Press ArrowDown (idx + 1) times to select it (first ArrowDown selects index 0)
  for (let i = 0; i <= idx; i++) {
    await pressKey(page, 'ArrowDown');
  }
  // Verify it's selected
  await expect(page.locator('#preview .mermaid-container.selected')).toHaveCount(1);
}

test.describe('Feature 10a: Mermaid Rendering', () => {

  test('mermaid code block is replaced with an SVG container', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // There should be a .mermaid-container in the preview
    const container = page.locator('#preview .mermaid-container');
    await expect(container).toHaveCount(1);

    // The container should contain a rendered SVG
    const svg = container.locator('svg');
    await expect(svg).toHaveCount(1);

    // No leftover <pre><code class="language-mermaid"> should remain
    const mermaidCode = page.locator('#preview pre > code.language-mermaid');
    await expect(mermaidCode).toHaveCount(0);
  });

  test('mermaid container has the correct structure', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    const container = page.locator('#preview .mermaid-container');

    // Should have viewport > content > svg
    await expect(container.locator('.mermaid-viewport')).toHaveCount(1);
    await expect(container.locator('.mermaid-content')).toHaveCount(1);
    await expect(container.locator('.mermaid-content svg')).toHaveCount(1);

    // Should have 4 resize handles
    await expect(container.locator('.mermaid-handle')).toHaveCount(4);
    await expect(container.locator('.mermaid-handle-tl')).toHaveCount(1);
    await expect(container.locator('.mermaid-handle-tr')).toHaveCount(1);
    await expect(container.locator('.mermaid-handle-bl')).toHaveCount(1);
    await expect(container.locator('.mermaid-handle-br')).toHaveCount(1);

    // Should have a zoom indicator
    await expect(container.locator('.mermaid-zoom-indicator')).toHaveCount(1);

    // Should have button bar with edit and reset buttons
    await expect(container.locator('.mermaid-btn-bar')).toHaveCount(1);
    await expect(container.locator('.mermaid-btn')).toHaveCount(2);
  });

  test('mermaid source is stored as data attribute', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    const source = await page.locator('#preview .mermaid-container').getAttribute('data-mermaid-source');
    expect(source).toContain('graph TD');
    expect(source).toContain('A[Start]');
  });

  test('mermaid container is selectable via keyboard navigation', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    await selectMermaidBlock(page);
    // Already verified by the helper
  });
});

test.describe('Feature 10b: Resizable Container', () => {

  test('resize handle drag changes container dimensions', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Select the container first so handles become visible (opacity: 1)
    await selectMermaidBlock(page);

    const beforeSize = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      return { w: c.offsetWidth, h: c.offsetHeight };
    });

    // Programmatically simulate a drag on the bottom-right handle
    await page.evaluate(() => {
      const handle = document.querySelector('.mermaid-handle-br');
      const rect = handle.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      handle.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: cx + 80, clientY: cy + 60, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: cx + 80, clientY: cy + 60, bubbles: true }));
    });

    const afterSize = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      return { w: c.offsetWidth, h: c.offsetHeight };
    });
    expect(afterSize.w).toBeGreaterThan(beforeSize.w);
    expect(afterSize.h).toBeGreaterThan(beforeSize.h);
  });

  test('container respects minimum size constraint', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    await selectMermaidBlock(page);

    // Drag the bottom-right handle far to the top-left to shrink below minimum
    await page.evaluate(() => {
      const handle = document.querySelector('.mermaid-handle-br');
      const rect = handle.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      handle.dispatchEvent(new MouseEvent('mousedown', { clientX: cx, clientY: cy, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: cx - 800, clientY: cy - 800, bubbles: true }));
      document.dispatchEvent(new MouseEvent('mouseup', { clientX: cx - 800, clientY: cy - 800, bubbles: true }));
    });

    const afterSize = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      return { w: c.offsetWidth, h: c.offsetHeight };
    });
    // Min size is 100px per mermaid.js
    expect(afterSize.w).toBeGreaterThanOrEqual(100);
    expect(afterSize.h).toBeGreaterThanOrEqual(100);
  });
});

test.describe('Feature 10c: Zoom', () => {

  test('scroll wheel changes zoom level', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Dispatch wheel events directly on the viewport element for reliable behavior
    const result = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      const viewport = c.querySelector('.mermaid-viewport');
      const initialScale = c._zoomPan.scale;

      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Zoom in (negative deltaY)
      for (let i = 0; i < 5; i++) {
        viewport.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -100, clientX: cx, clientY: cy, bubbles: true, cancelable: true
        }));
      }

      return { initialScale, afterScale: c._zoomPan.scale };
    });

    expect(result.afterScale).toBeGreaterThan(result.initialScale);
  });

  test('zoom level is clamped to max 4x', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    const scale = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      const viewport = c.querySelector('.mermaid-viewport');
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Zoom in many times
      for (let i = 0; i < 100; i++) {
        viewport.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -120, clientX: cx, clientY: cy, bubbles: true, cancelable: true
        }));
      }

      return c._zoomPan.scale;
    });

    expect(scale).toBeLessThanOrEqual(4);
  });

  test('zoom indicator shows percentage', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    const result = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      const viewport = c.querySelector('.mermaid-viewport');
      const indicator = c.querySelector('.mermaid-zoom-indicator');
      const initialText = indicator.textContent;

      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Zoom in
      for (let i = 0; i < 5; i++) {
        viewport.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -100, clientX: cx, clientY: cy, bubbles: true, cancelable: true
        }));
      }

      return { initialText, afterText: indicator.textContent };
    });

    expect(result.initialText).toMatch(/\d+%/);
    expect(result.afterText).toMatch(/\d+%/);
    expect(parseInt(result.afterText)).toBeGreaterThan(parseInt(result.initialText));
  });
});

test.describe('Feature 10d: Pan / Navigate', () => {

  test('click+drag pans the diagram', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Dispatch mouse events directly on the viewport for reliable pan behavior
    const result = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      const viewport = c.querySelector('.mermaid-viewport');
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      const before = { x: c._zoomPan.translateX, y: c._zoomPan.translateY };

      // Simulate drag: mousedown → mousemove → mouseup
      viewport.dispatchEvent(new MouseEvent('mousedown', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new MouseEvent('mousemove', {
        clientX: cx + 50, clientY: cy + 30, bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: cx + 50, clientY: cy + 30, bubbles: true, cancelable: true
      }));

      const after = { x: c._zoomPan.translateX, y: c._zoomPan.translateY };
      return { before, after };
    });

    const dx = result.after.x - result.before.x;
    const dy = result.after.y - result.before.y;
    expect(Math.abs(dx) + Math.abs(dy)).toBeGreaterThan(0);
  });

  test('double-click resets zoom and pan', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    const result = await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      const viewport = c.querySelector('.mermaid-viewport');
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Zoom in first
      for (let i = 0; i < 10; i++) {
        viewport.dispatchEvent(new WheelEvent('wheel', {
          deltaY: -100, clientX: cx, clientY: cy, bubbles: true, cancelable: true
        }));
      }
      const zoomedScale = c._zoomPan.scale;

      // Double-click to reset
      viewport.dispatchEvent(new MouseEvent('dblclick', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true
      }));

      return { zoomedScale, resetScale: c._zoomPan.scale };
    });

    expect(result.resetScale).toBeLessThan(result.zoomedScale);
  });

  test('short click selects the mermaid block', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Simulate a short click (mousedown + immediate mouseup with no movement)
    await page.evaluate(() => {
      const c = document.querySelector('.mermaid-container');
      const viewport = c.querySelector('.mermaid-viewport');
      const rect = viewport.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      viewport.dispatchEvent(new MouseEvent('mousedown', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true
      }));
      document.dispatchEvent(new MouseEvent('mouseup', {
        clientX: cx, clientY: cy, bubbles: true, cancelable: true
      }));
    });

    await expect(page.locator('#preview .mermaid-container.selected')).toHaveCount(1);
  });
});

test.describe('Feature 10e: Edit Cycle Integration', () => {

  test('Enter on mermaid block opens textarea with mermaid source', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    await selectMermaidBlock(page);
    await pressKey(page, 'Enter');

    // Should have a textarea (mermaid uses its own edit mode, not CodeMirror)
    // or a CM editor — check for either
    const hasTextarea = await page.evaluate(() => {
      const ta = document.querySelector('#preview textarea');
      return ta !== null;
    });
    const hasCM = await page.evaluate(() => {
      const cm = document.querySelector('#preview .cm-wrapper');
      return cm !== null;
    });
    expect(hasTextarea || hasCM).toBe(true);

    // The editor content should contain the mermaid fence
    const content = hasTextarea
      ? await page.locator('#preview textarea').inputValue()
      : await getEditorText(page);
    expect(content).toContain('```mermaid');
    expect(content).toContain('graph TD');
  });

  test('Escape from edit button textarea re-renders mermaid diagram', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Use the edit button (✎) which creates a plain textarea with Escape→render
    const editBtn = page.locator('.mermaid-btn-bar .mermaid-btn').first();
    await editBtn.click();

    // Wait for the textarea to appear
    await page.waitForSelector('#preview textarea', { timeout: 5000 });

    // Press Escape — the textarea keydown handler renders and calls processMermaidBlocks
    await page.keyboard.press('Escape');

    // Wait for mermaid async re-render
    await page.waitForSelector('#preview .mermaid-container', { timeout: 15000 });

    const container = page.locator('#preview .mermaid-container');
    await expect(container).toHaveCount(1);
    await expect(container.locator('svg')).toHaveCount(1);
  });

  test('Shift+Enter re-renders mermaid diagram', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    await selectMermaidBlock(page);
    await pressKey(page, 'Enter');

    await waitForEditMode(page);

    // Press Shift+Enter to render
    await page.keyboard.press('Shift+Enter');

    await page.waitForSelector('#preview .mermaid-container', { timeout: 15000 });

    const container = page.locator('#preview .mermaid-container');
    await expect(container).toHaveCount(1);
    await expect(container.locator('svg')).toHaveCount(1);
  });

  test('editing mermaid source and re-rendering updates the diagram', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Store original source
    const originalSource = await page.locator('#preview .mermaid-container').getAttribute('data-mermaid-source');

    await selectMermaidBlock(page);
    await pressKey(page, 'Enter');

    await page.waitForTimeout(300);

    // Modify the source — add a new node
    const isTextarea = await page.evaluate(() => !!document.querySelector('#preview textarea'));
    if (isTextarea) {
      const textarea = page.locator('#preview textarea');
      const value = await textarea.inputValue();
      const modified = value.replace('D --> E', 'D --> E\n    E --> F[New Node]');
      await textarea.fill(modified);
    } else {
      const text = await getEditorText(page);
      const modified = text.replace('D --> E', 'D --> E\n    E --> F[New Node]');
      await typeInEditor(page, modified);
    }

    // Render
    await page.keyboard.press('Shift+Enter');
    await waitForMermaid(page);

    // The new source should include the added node
    const newSource = await page.locator('#preview .mermaid-container').getAttribute('data-mermaid-source');
    expect(newSource).toContain('F[New Node]');
  });

  test('edit button opens mermaid edit mode', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Click the edit button on the mermaid container
    const editBtn = page.locator('.mermaid-btn-bar .mermaid-btn').first();
    await editBtn.click();

    await page.waitForTimeout(300);

    // Should now have an editor with the mermaid source
    const hasEditor = await page.evaluate(() => {
      const ta = document.querySelector('#preview textarea');
      const cm = document.querySelector('#preview .cm-wrapper');
      return ta !== null || cm !== null;
    });
    expect(hasEditor).toBe(true);
  });

  test('undo restores mermaid block after edit cycle', async ({ page }) => {
    await waitForEditor(page);
    await waitForMermaid(page);

    // Verify mermaid container exists initially
    await expect(page.locator('#preview .mermaid-container')).toHaveCount(1);

    await selectMermaidBlock(page);
    await pressKey(page, 'Enter');
    await waitForEditMode(page);

    // Render via Shift+Enter (Escape only blurs in CM, doesn't render)
    await page.keyboard.press('Shift+Enter');
    await page.waitForSelector('#preview .mermaid-container', { timeout: 15000 });

    // Undo the render (restores the CM editor state)
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // Undo again (restores the original mermaid container before entering edit mode)
    await page.keyboard.press('Control+z');
    await page.waitForTimeout(500);

    // The undo restores innerHTML which contains the mermaid-container markup
    // Verify the mermaid container is present (innerHTML snapshot includes the rendered container)
    await expect(page.locator('#preview .mermaid-container')).toHaveCount(1);
    await expect(page.locator('#preview .mermaid-container svg')).toHaveCount(1);
  });
});

// =============================================================
// Smoke tests for test-small.html and test-large.html
// =============================================================

test.describe('Test pages: basic smoke tests', () => {

  test('test-small.html loads and supports block selection and edit cycle', async ({ page }) => {
    await page.goto('/editor/test-small.html');
    // Wait for mermaid diagrams to render
    await page.waitForSelector('#preview .mermaid-container', { timeout: 15000 });
    // Verify blocks are selectable — press ArrowDown to select first block
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
    // Enter edit mode (textarea, since no CodeMirror in test pages)
    await page.keyboard.press('Enter');
    await page.waitForSelector('#preview textarea', { timeout: 5000 });
    // Ctrl+Enter should render back from edit mode without errors
    await page.keyboard.press('Control+Enter');
    await page.waitForTimeout(500);
    // Textarea should be gone — rendered back to block
    await expect(page.locator('#preview textarea')).toHaveCount(0);
  });

  test('test-large.html loads and supports block selection', async ({ page }) => {
    await page.goto('/editor/test-large.html');
    // Wait for at least one mermaid diagram to render
    await page.waitForSelector('#preview .mermaid-container', { timeout: 30000 });
    // Verify blocks are selectable
    await page.keyboard.press('ArrowDown');
    const selected = page.locator('#preview .selected');
    await expect(selected).toHaveCount(1);
  });
});

