const { test, expect } = require('@playwright/test');

// Helper: wait for editor to fully initialize (markdown rendered into blocks)
async function waitForEditor(page) {
  await page.goto('/v2/editor.html');
  // Wait for the preview to contain rendered markdown blocks
  await page.waitForSelector('#preview h2');
}

// Helper: get all selectable block elements
async function getBlocks(page) {
  return page.locator('#preview > h1, #preview > h2, #preview > h3, #preview > h4, #preview > h5, #preview > h6, #preview > p, #preview > ul, #preview > ol, #preview > pre, #preview > blockquote, #preview > table, #preview > hr, #preview > textarea');
}

// Helper: press a key on the page body (not inside a textarea)
async function pressKey(page, key) {
  await page.keyboard.press(key);
}

// =============================================================
// Feature 1+3: Escape renders textarea and restores selection
// =============================================================

test.describe('Feature 1+3: Escape renders and restores selection', () => {

  test('select block, Enter to edit, Escape returns to rendered+selected', async ({ page }) => {
    await waitForEditor(page);

    // Press ArrowDown to select the first block (h2)
    await pressKey(page, 'ArrowDown');
    const blocks = await getBlocks(page);
    await expect(blocks.first()).toHaveClass(/selected/);

    // Press Enter to open textarea for editing
    await pressKey(page, 'Enter');

    // A textarea should now exist
    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    // Press Escape to exit editing
    await page.keyboard.press('Escape');

    // Textarea should be gone
    await expect(page.locator('#preview textarea')).toHaveCount(0);

    // The rendered block should be back and selected
    const newBlocks = await getBlocks(page);
    const firstBlock = newBlocks.first();
    await expect(firstBlock).toHaveClass(/selected/);
    // It should be a rendered element, not a textarea
    const tagName = await firstBlock.evaluate(el => el.tagName);
    expect(tagName).not.toBe('TEXTAREA');
  });

  test('Shift+Enter renders and keeps block selected', async ({ page }) => {
    await waitForEditor(page);

    // Select the first block
    await pressKey(page, 'ArrowDown');
    await expect((await getBlocks(page)).first()).toHaveClass(/selected/);

    // Enter edit mode
    await pressKey(page, 'Enter');
    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    // Shift+Enter to render
    await page.keyboard.press('Shift+Enter');

    // Textarea should be gone
    await expect(page.locator('#preview textarea')).toHaveCount(0);

    // The rendered block should be selected
    const selectedBlock = page.locator('#preview .selected');
    await expect(selectedBlock).toHaveCount(1);
    const tagName = await selectedBlock.evaluate(el => el.tagName);
    expect(tagName).not.toBe('TEXTAREA');
  });

  test('edit content, Escape renders the edited content and selects it', async ({ page }) => {
    await waitForEditor(page);

    // Select second block (a paragraph)
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'ArrowDown');

    // Enter edit mode
    await pressKey(page, 'Enter');
    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    // Clear and type new content
    await textarea.fill('This is **edited** content.');

    // Escape to render and select
    await page.keyboard.press('Escape');

    // Should be rendered HTML, not textarea
    await expect(page.locator('#preview textarea')).toHaveCount(0);

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
    // Navigate down to find the ul
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

    // Press 'b' to insert textarea after the list
    await pressKey(page, 'b');
    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    // Type a new list item
    await textarea.fill('- new item from test\n- another test item');

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

    // Insert textarea after
    await pressKey(page, 'b');
    const textarea = page.locator('#preview textarea');
    await textarea.fill('Just a plain paragraph.');
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
    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    const value = await textarea.inputValue();
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

  // Example: cell1="- xxx\n- yyy", cell2="    - zzz" → zzz becomes sub-item of yyy
  test('indented list merges as sub-list of last item in preceding list', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    // Enter edit mode to replace the list with a known structure
    await pressKey(page, 'Enter');
    let textarea = page.locator('#preview textarea');
    await textarea.fill('- xxx\n- yyy');
    await page.keyboard.press('Shift+Enter');

    // Insert textarea after the list and add indented sub-list (4 spaces = 1 level)
    await pressKey(page, 'b');
    textarea = page.locator('#preview textarea');
    await textarea.fill('    - zzz');
    await page.keyboard.press('Shift+Enter');

    // Should be 1 top-level UL
    expect(await page.locator('#preview > ul').count()).toBe(1);

    // zzz should be nested inside last li (yyy): ul > li:last-child > ul > li
    const nestedUl = page.locator('#preview > ul').first().locator(':scope > li:last-child > ul');
    await expect(nestedUl).toHaveCount(1);
    await expect(nestedUl.locator('li')).toHaveText(['zzz']);
  });

  // Example: cell1="- xxx\n- yyy", cell2="        - zzz" → zzz nested 2 levels under yyy
  test('double-indented list merges at level 2 under last item', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    let textarea = page.locator('#preview textarea');
    await textarea.fill('- xxx\n- yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    textarea = page.locator('#preview textarea');
    // 8 spaces = 2 levels of indent
    await textarea.fill('        - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

    // zzz should be nested under yyy
    await expect(page.locator('#preview > ul').first().locator(':scope > li:last-child')).toContainText('zzz');
  });

  // Example: cell1="- xxx\n    - yyy", cell2="    - zzz" → zzz is sibling of yyy
  test('indented list merges as sibling when preceding list has same-level sub-items', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    let textarea = page.locator('#preview textarea');
    await textarea.fill('- xxx\n    - yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    textarea = page.locator('#preview textarea');
    await textarea.fill('    - zzz');
    await page.keyboard.press('Shift+Enter');

    expect(await page.locator('#preview > ul').count()).toBe(1);

    // yyy and zzz should be siblings in the nested list under xxx
    const nestedLis = page.locator('#preview > ul').first()
      .locator(':scope > li:first-child > ul > li');
    await expect(nestedLis).toHaveCount(2);
    await expect(nestedLis.nth(0)).toHaveText('yyy');
    await expect(nestedLis.nth(1)).toHaveText('zzz');
  });

  // Example: cell1="- xxx\n    - yyy", cell2="        - zzz" → zzz is sub-item of yyy
  test('double-indented list nests under existing sub-list item', async ({ page }) => {
    await waitForEditor(page);
    await navigateToUl(page);

    await pressKey(page, 'Enter');
    let textarea = page.locator('#preview textarea');
    await textarea.fill('- xxx\n    - yyy');
    await page.keyboard.press('Shift+Enter');

    await pressKey(page, 'b');
    textarea = page.locator('#preview textarea');
    await textarea.fill('        - zzz');
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
    const textarea = page.locator('#preview textarea');
    await textarea.fill('- merged item');
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
    const textarea = page.locator('#preview textarea');
    await textarea.fill('    - sub item');
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
    const textarea = page.locator('#preview textarea');
    await textarea.fill('    - sub item');
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

  test('Tab inserts 2 spaces in textarea instead of changing focus', async ({ page }) => {
    await waitForEditor(page);

    // Select first block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    // Clear and type some text
    await textarea.fill('');
    await textarea.type('hello');

    // Press Tab
    await page.keyboard.press('Tab');

    // Tab should insert 2 spaces, not move focus
    const value = await textarea.inputValue();
    expect(value).toBe('hello    ');

    // Textarea should still be focused
    const isFocused = await textarea.evaluate(el => document.activeElement === el);
    expect(isFocused).toBe(true);

    await page.keyboard.press('Escape');
  });

  test('Tab at beginning of line inserts spaces for indentation', async ({ page }) => {
    await waitForEditor(page);

    // Select first block and enter edit mode
    await pressKey(page, 'ArrowDown');
    await pressKey(page, 'Enter');

    const textarea = page.locator('#preview textarea');
    await expect(textarea).toBeVisible();

    await textarea.fill('- item');
    // Move cursor to beginning
    await page.keyboard.press('Home');
    await page.keyboard.press('Tab');

    const value = await textarea.inputValue();
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
    const firstRect = await blocks.nth(0).boundingBox();

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
