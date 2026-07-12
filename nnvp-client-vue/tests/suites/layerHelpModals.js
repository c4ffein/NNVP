/**
 * Migrated from tests/layer-help-modals.spec.js. The help modal is exercised
 * AS UI (hover affordances, overlay hit-testing, fade-out animations), so
 * every test is an e2eOnly mechanical wrap.
 */
import { e2eOnly } from '../harness/define';

e2eOnly(
  'help: should show help button when layer is selected',
  'Selects a node with a real mouse click at its boundingBox center and asserts the right-panel DOM (.ParamsBlock, #layerOptions .help-icon) renders the help affordance — layout hit-testing and panel chrome.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== LAYER HELP BUTTON TEST ===');
    // Load a template to get some layers
    console.log('Loading template...');
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    await fileMenu.click();
    await page.waitForTimeout(100);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(200);
    // Click on a Dense layer in the canvas to select it
    console.log('Selecting a layer...');
    // Find a layer node on the board
    const layerNode = await page.$(canvas.layer);
    expect(layerNode).not.toBeNull();
    // Click center of the layer
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Check if the right panel shows the layer (ParamsBlock with title)
    console.log('Checking right panel shows layer...');
    const layerTitle = await page.$('.ParamsBlock.layer-title');
    expect(layerTitle).not.toBeNull();
    // Check for help button (? icon)
    console.log('Checking for help button...');
    const helpButton = await page.$('#layerOptions .help-icon');
    expect(helpButton).not.toBeNull();
    console.log('✓ Help button found');
  },
);

e2eOnly(
  'help: should open and close help modal when clicking help button',
  'Exercises the help modal as UI: opens it from the panel button, asserts overlay/container/body DOM, then closes with the X and waits out the ~350ms fade-out before the overlay unmounts — modal lifecycle only a browser renders.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== HELP MODAL OPEN/CLOSE TEST ===');
    // Load template
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    await fileMenu.click();
    await page.waitForTimeout(100);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(200);
    // Select a layer
    const layerNode = await page.$(canvas.layer);
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Click help button
    console.log('Clicking help button...');
    const helpButton = await page.$('#layerOptions .help-icon');
    await helpButton.click();
    await page.waitForTimeout(100);
    // Check modal appeared
    console.log('Checking modal appeared...');
    const modal = await page.$('.layer-help-modal-overlay');
    expect(modal).not.toBeNull();
    const modalContent = await page.$('.layer-help-modal-container');
    expect(modalContent).not.toBeNull();
    console.log('✓ Modal opened');
    // Check modal has content
    const modalBody = await page.$('.layer-help-modal-body');
    expect(modalBody).not.toBeNull();
    const bodyText = await modalBody.textContent();
    expect(bodyText.length).toBeGreaterThan(50); // Should have substantial content
    console.log('✓ Modal has content');
    // Close modal by clicking X button
    console.log('Closing modal...');
    const closeButton = await page.$('.layer-help-modal-close');
    await closeButton.click();
    await page.waitForTimeout(100);
    // Check modal disappeared
    // Auto-retrying: the modal fades/slides out over ~350ms before unmounting.
    await expect(page.locator('.layer-help-modal-overlay')).toHaveCount(0);
    console.log('✓ Modal closed');
  },
);

e2eOnly(
  'help: should show Dense layer help content',
  'Reads the rendered modal body text for Dense-specific help copy after selecting the node via boundingBox mouse hit-testing — modal DOM content in the real UI.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== DENSE LAYER HELP CONTENT TEST ===');
    // Load template
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    await fileMenu.click();
    await page.waitForTimeout(100);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(200);
    // Select a Dense layer
    const layerNode = await page.$(canvas.layer);
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Get layer name from title
    const layerTitle = await page.$('.ParamsBlock.layer-title');
    const titleText = await layerTitle.textContent();
    console.log('Selected layer:', titleText.trim());
    // Click help button
    const helpButton = await page.$('#layerOptions .help-icon');
    await helpButton.click();
    await page.waitForTimeout(100);
    // Check modal content for Dense layer
    const modalBody = await page.$('.layer-help-modal-body');
    const bodyText = await modalBody.textContent();
    // Verify Dense-specific content
    if (titleText.includes('Dense')) {
      expect(bodyText).toContain('Dense Layer');
      expect(bodyText).toContain('Fully Connected');
      expect(bodyText).toContain('units');
      expect(bodyText).toContain('activation');
      console.log('✓ Dense layer help content verified');
    }
    // Close modal
    const closeButton = await page.$('.layer-help-modal-close');
    await closeButton.click();
    await page.waitForTimeout(50);
  },
);

e2eOnly(
  'help: should open layer help from the catalog hover ? button',
  'Depends on hover pointer-events to reveal the catalog row\'s hidden ? affordance before clicking it, and asserts the click did NOT add a node — hover semantics only exist in a real browser.',
  async ({ page, expect }) => {
    console.log('\n=== CATALOG HELP BUTTON TEST ===');
    const row = page.locator('#layer-template-Dense');
    await row.hover();
    const help = row.locator('.layer-template-help');
    await expect(help).toBeVisible();
    await help.click();
    await page.waitForTimeout(100);
    const modalBody = page.locator('.layer-help-modal-body');
    await expect(modalBody).toBeVisible();
    await expect(modalBody).toContainText('Dense Layer');
    // The help click must NOT have added a layer to the board.
    await expect(page.locator('.vue-flow__node-layer')).toHaveCount(0);
    // Close with the X.
    await page.click('.layer-help-modal-close');
    await expect(page.locator('.layer-help-modal-overlay')).toHaveCount(0);
    console.log('✓ Catalog help works');
  },
);

e2eOnly(
  'help: should close modal when clicking overlay',
  'Closes the modal by clicking overlay coordinates outside the content box (boundingBox hit-testing) and waits for the fade-out unmount — overlay geometry needs a real layout engine.',
  async ({ page, canvas, expect }) => {
    console.log('\n=== MODAL OVERLAY CLOSE TEST ===');
    // Load template and select layer
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    await fileMenu.click();
    await page.waitForTimeout(100);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(200);
    const layerNode = await page.$(canvas.layer);
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Open modal
    const helpButton = await page.$('#layerOptions .help-icon');
    await helpButton.click();
    await page.waitForTimeout(100);
    // Click overlay (not the modal content)
    console.log('Clicking overlay to close...');
    const overlay = await page.$('.layer-help-modal-overlay');
    // Click at the top-left corner of the overlay (outside modal content)
    const overlayBox = await overlay.boundingBox();
    await page.mouse.click(overlayBox.x + 10, overlayBox.y + 10);
    await page.waitForTimeout(100);
    // Check modal closed
    // Auto-retrying: the modal fades/slides out over ~350ms before unmounting.
    await expect(page.locator('.layer-help-modal-overlay')).toHaveCount(0);
    console.log('✓ Modal closed by clicking overlay');
  },
);
