import { test, expect } from '@playwright/test';

test.describe('Training Compile Options', () => {
  let consoleMessages = [];
  let consoleErrors = [];

  // Helper function to open Training panel and CompileOptions
  async function openCompileOptions(page) {
    // Click on Training menu (direct function, not dropdown)
    const trainingMenu = await page.$('#GeneralMenu .menuTitle:has-text("Training")');
    await trainingMenu.click();
    await page.waitForTimeout(100);
    // Click on Options tab
    const optionsTab = await page.$('.TrainingZone.bar-button:has-text("Options")');
    await optionsTab.click();
    await page.waitForTimeout(50);
  }

  test.beforeEach(async ({ page }) => {
    consoleMessages = [];
    consoleErrors = [];
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();
      consoleMessages.push({ type, text });
      if (type === 'error') {
        consoleErrors.push(text);
      }
    });
    page.on('pageerror', error => {
      consoleErrors.push(`PAGE ERROR: ${error.message}`);
    });
    await page.goto('/');
    await page.waitForTimeout(50);
  });

  test.afterEach(async () => {
    if (consoleErrors.length > 0) {
      console.log('\n=== CONSOLE ERRORS ===');
      consoleErrors.forEach(error => console.log(`❌ ${error}`));
    }
  });

  test('should open Training panel and show CompileOptions', async ({ page }) => {
    console.log('\n=== TRAINING PANEL TEST ===');
    // Click on Training menu (it's a direct function call, not a dropdown)
    const trainingMenu = await page.$('#GeneralMenu .menuTitle:has-text("Training")');
    expect(trainingMenu).not.toBeNull();
    await trainingMenu.click();
    await page.waitForTimeout(100);
    // Check if TrainingZone is visible
    const trainingZone = await page.$('#TrainingZone');
    expect(trainingZone).not.toBeNull();
    console.log('Training panel opened successfully');
    // Click on Options tab
    const optionsTab = await page.$('.TrainingZone.bar-button:has-text("Options")');
    expect(optionsTab).not.toBeNull();
    await optionsTab.click();
    await page.waitForTimeout(50);
    // Check if CompileOptions is visible
    const compileOptions = await page.$('#CompileOptions');
    expect(compileOptions).not.toBeNull();
    console.log('CompileOptions panel visible');
    expect(consoleErrors.length).toBe(0);
  });

  test('should show optimizer selector with all available optimizers', async ({ page }) => {
    console.log('\n=== OPTIMIZER SELECTOR TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Check optimizer selector exists (first section)
    const optimizerSelector = await page.$('.option-section:first-child select');
    expect(optimizerSelector).not.toBeNull();
    // Get all optimizer options
    const optimizers = await page.$$eval('.option-section:first-child select option',
      options => options.map(opt => opt.value)
    );
    console.log('Available optimizers:', optimizers);
    // Should have all 6 optimizers
    expect(optimizers).toContain('sgd');
    expect(optimizers).toContain('adagrad');
    expect(optimizers).toContain('adadelta');
    expect(optimizers).toContain('adam');
    expect(optimizers).toContain('adamax');
    expect(optimizers).toContain('rmsprop');
    expect(optimizers.length).toBe(6);
    expect(consoleErrors.length).toBe(0);
  });

  test('should show different parameters when switching optimizers', async ({ page }) => {
    console.log('\n=== DYNAMIC OPTIMIZER PARAMETERS TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Get initial parameters (rmsprop is default)
    const initialParams = await page.$$eval('.optimizer-param label',
      labels => labels.map(label => label.textContent.trim())
    );
    console.log('Initial params (rmsprop):', initialParams);
    expect(initialParams.some(p => p.includes('Learning Rate'))).toBe(true);
    expect(initialParams.some(p => p.includes('Momentum'))).toBe(true);
    expect(initialParams.some(p => p.includes('Decay'))).toBe(true);
    expect(initialParams.some(p => p.includes('Epsilon'))).toBe(true);
    // Switch to SGD
    await page.selectOption('.option-section:first-child select', 'sgd');
    await page.waitForTimeout(50);
    const sgdParams = await page.$$eval('.optimizer-param label',
      labels => labels.map(label => label.textContent.trim())
    );
    console.log('SGD params:', sgdParams);
    expect(sgdParams.some(p => p.includes('Learning Rate'))).toBe(true);
    expect(sgdParams.some(p => p.includes('Momentum'))).toBe(true);
    expect(sgdParams.some(p => p.includes('Nesterov'))).toBe(true);
    expect(sgdParams.some(p => p.includes('Decay'))).toBe(false); // SGD doesn't have decay
    expect(sgdParams.some(p => p.includes('Epsilon'))).toBe(false); // SGD doesn't have epsilon
    // Switch to Adam
    await page.selectOption('.option-section:first-child select', 'adam');
    await page.waitForTimeout(50);
    const adamParams = await page.$$eval('.optimizer-param label',
      labels => labels.map(label => label.textContent.trim())
    );
    console.log('Adam params:', adamParams);
    expect(adamParams.some(p => p.includes('Learning Rate'))).toBe(true);
    expect(adamParams.some(p => p.includes('Beta 1'))).toBe(true);
    expect(adamParams.some(p => p.includes('Beta 2'))).toBe(true);
    expect(adamParams.some(p => p.includes('Epsilon'))).toBe(true);
    expect(adamParams.some(p => p.includes('Momentum'))).toBe(false); // Adam doesn't have momentum
    expect(consoleErrors.length).toBe(0);
  });

  test('should show loss function selector with all available losses', async ({ page }) => {
    console.log('\n=== LOSS FUNCTION SELECTOR TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Check loss selector exists (second section)
    const lossSelector = await page.$('.option-section:nth-child(2) select');
    expect(lossSelector).not.toBeNull();
    // Get all loss options
    const losses = await page.$$eval('.option-section:nth-child(2) select option',
      options => options.map(opt => opt.value)
    );
    console.log('Available loss functions:', losses);
    // Should have all 5 loss functions
    expect(losses).toContain('categoricalCrossentropy');
    expect(losses).toContain('sparseCategoricalCrossentropy');
    expect(losses).toContain('binaryCrossentropy');
    expect(losses).toContain('meanSquaredError');
    expect(losses).toContain('meanAbsoluteError');
    expect(losses.length).toBe(5);
    // Default should be categoricalCrossentropy
    const selectedLoss = await page.$eval('.option-section:nth-child(2) select', select => select.value);
    console.log('Default loss:', selectedLoss);
    expect(selectedLoss).toBe('categoricalCrossentropy');

    expect(consoleErrors.length).toBe(0);
  });

  test('should allow changing loss function', async ({ page }) => {
    console.log('\n=== LOSS FUNCTION CHANGE TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Change loss to binaryCrossentropy
    await page.selectOption('.option-section:nth-child(2) select', 'binaryCrossentropy');
    await page.waitForTimeout(50);
    const newLoss = await page.$eval('.option-section:nth-child(2) select', select => select.value);
    console.log('Changed loss to:', newLoss);
    expect(newLoss).toBe('binaryCrossentropy');
    // Change to meanSquaredError
    await page.selectOption('.option-section:nth-child(2) select', 'meanSquaredError');
    await page.waitForTimeout(50);
    const finalLoss = await page.$eval('.option-section:nth-child(2) select', select => select.value);
    console.log('Changed loss to:', finalLoss);
    expect(finalLoss).toBe('meanSquaredError');
    expect(consoleErrors.length).toBe(0);
  });

  test('should show parameter hints with default values', async ({ page }) => {
    console.log('\n=== PARAMETER HINTS TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Check that placeholders show default values in inputs
    const placeholders = await page.$$eval('.optimizer-param input[type="number"]',
      inputs => inputs.map(i => i.placeholder)
    );
    console.log('Parameter placeholders:', placeholders);
    // Should have placeholders for all rmsprop parameters (default optimizer)
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders.some(p => p.includes('default:'))).toBe(true);
    // Check specific placeholder format
    const learningRatePlaceholder = await page.$eval(
      '.optimizer-param:has-text("Learning Rate") input[type="number"]',
      input => input.placeholder
    );
    console.log('Learning Rate placeholder:', learningRatePlaceholder);
    expect(learningRatePlaceholder).toContain('default:');
    expect(consoleErrors.length).toBe(0);
  });

  test('should allow modifying optimizer parameters', async ({ page }) => {
    console.log('\n=== PARAMETER MODIFICATION TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Find learning rate input (should exist for rmsprop)
    const learningRateInput = await page.$('.optimizer-param:has-text("Learning Rate") input[type="number"]');
    expect(learningRateInput).not.toBeNull();
    // Change learning rate value
    await learningRateInput.fill('0.01');
    await page.waitForTimeout(50);
    const newValue = await learningRateInput.inputValue();
    console.log('Learning rate changed to:', newValue);
    expect(newValue).toBe('0.01');
    // Switch to SGD and check Nesterov checkbox
    await page.selectOption('.option-section:first-child select', 'sgd');
    await page.waitForTimeout(50);
    const nesterovCheckbox = await page.$('.optimizer-param:has-text("Nesterov") input[type="checkbox"]');
    expect(nesterovCheckbox).not.toBeNull();
    // Check the checkbox
    await nesterovCheckbox.check();
    await page.waitForTimeout(50);
    const isChecked = await nesterovCheckbox.isChecked();
    console.log('Nesterov checkbox checked:', isChecked);
    expect(isChecked).toBe(true);
    expect(consoleErrors.length).toBe(0);
  });

  test('should expose actual training configuration that matches UI settings', async ({ page }) => {
    console.log('\n=== TRAINING CONFIGURATION VERIFICATION TEST ===');
    // Load a template to get a valid model
    console.log('Loading a valid model template...');
    // Wait for templates to be loaded
    await page.waitForTimeout(500);
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    await fileMenu.click();
    await page.waitForTimeout(200);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu.hover();
    await page.waitForTimeout(50);
    // Select template from submenu
    const template = await page.$('text=2D Dense for MNIST');
    await template.click();
    await page.waitForTimeout(100);
    // Open Training panel
    console.log('Opening Training panel...');
    const trainingMenu = await page.$('#GeneralMenu .menuTitle:has-text("Training")');
    await trainingMenu.click();
    await page.waitForTimeout(100);
    // Switch to Dataset tab and select a dataset
    console.log('Selecting dataset...');
    const datasetTab = await page.$('.TrainingZone.bar-button:has-text("Dataset")');
    await datasetTab.click();
    await page.waitForTimeout(100);
    const mnistOption = await page.$('.dataset-option:has-text("MNIST")');
    if (mnistOption) {
      await mnistOption.click();
      await page.waitForTimeout(500); // Wait for dataset to load
    }
    // Now switch to Options tab and set custom parameters
    console.log('Opening CompileOptions...');
    const optionsTab = await page.$('.TrainingZone.bar-button:has-text("Options")');
    await optionsTab.click();
    await page.waitForTimeout(100);
    // Set custom optimizer parameters
    console.log('Setting custom optimizer parameters for Adam...');
    await page.selectOption('.option-section:first-child select', 'adam');
    await page.waitForTimeout(100);
    // Set learning rate
    const learningRateInput = await page.$('.optimizer-param:has-text("Learning Rate") input[type="number"]');
    await learningRateInput.fill('0.002');
    await page.waitForTimeout(50);
    // Set beta1
    const beta1Input = await page.$('.optimizer-param:has-text("Beta 1") input[type="number"]');
    await beta1Input.fill('0.95');
    await page.waitForTimeout(50);
    // Set loss function
    console.log('Setting loss function to meanSquaredError...');
    await page.selectOption('.option-section:nth-child(2) select', 'meanSquaredError');
    await page.waitForTimeout(50);
    // Set epochs
    console.log('Setting epochs to 15...');
    const epochsInput = await page.$('.option-section:nth-child(3) input[type="number"]');
    await epochsInput.fill('15');
    await page.waitForTimeout(50);
    // Click Train button to trigger compilation
    console.log('Clicking Train button to trigger compilation...');
    const trainButton = await page.$('.TrainingZone.bar-button:has-text("Train")');
    await trainButton.click();
    await page.waitForTimeout(800); // Wait for model compilation
    // Check the exposed training configuration (using new namespace)
    const trainingConfig = await page.evaluate(() => window.nnvp?.debug?.trainingConfig);
    console.log('Exposed training config:', trainingConfig);
    // Verify optimizer
    expect(trainingConfig.optimizer).toBe('adam');
    console.log('✓ Optimizer matches: adam');
    // Verify optimizer parameters
    expect(trainingConfig.optimizerParams.learningRate).toBe(0.002);
    console.log('✓ Learning rate matches: 0.002');
    expect(trainingConfig.optimizerParams.beta1).toBe(0.95);
    console.log('✓ Beta1 matches: 0.95');
    // Verify loss function
    expect(trainingConfig.loss).toBe('meanSquaredError');
    console.log('✓ Loss function matches: meanSquaredError');
    // Verify epochs
    expect(trainingConfig.epochs).toBe(15);
    console.log('✓ Epochs match: 15');
    console.log('✅ All training configuration values match UI settings!');
    expect(consoleErrors.length).toBe(0);
  });
});
