import { test, expect } from '@playwright/test';

test.describe('Layer Help Modals', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForTimeout(100);
  });

  test('should show help button when layer is selected', async ({ page }) => {
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
    // Find a layer node (they have class 'd3Layer')
    const layerNode = await page.$('.d3Layer');
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
    const helpButton = await page.$('.help-icon');
    expect(helpButton).not.toBeNull();
    console.log('✓ Help button found');
  });

  test('should open and close help modal when clicking help button', async ({ page }) => {
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
    const layerNode = await page.$('.d3Layer');
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Click help button
    console.log('Clicking help button...');
    const helpButton = await page.$('.help-icon');
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
    const modalAfterClose = await page.$('.layer-help-modal-overlay');
    expect(modalAfterClose).toBeNull();
    console.log('✓ Modal closed');
  });

  test('should show Dense layer help content', async ({ page }) => {
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
    const layerNode = await page.$('.d3Layer');
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Get layer name from title
    const layerTitle = await page.$('.ParamsBlock.layer-title');
    const titleText = await layerTitle.textContent();
    console.log('Selected layer:', titleText.trim());
    // Click help button
    const helpButton = await page.$('.help-icon');
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
  });

  test('should close modal when clicking overlay', async ({ page }) => {
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
    const layerNode = await page.$('.d3Layer');
    const box = await layerNode.boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(100);
    // Open modal
    const helpButton = await page.$('.help-icon');
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
    const modalAfterClick = await page.$('.layer-help-modal-overlay');
    expect(modalAfterClick).toBeNull();
    console.log('✓ Modal closed by clicking overlay');
  });
});
