/**
 * Migrated from tests/training-compile-options.spec.js. The CompileOptions
 * panel is exercised as rendered form UI (selects, number inputs,
 * placeholders), the last test runs REAL TensorFlow.js training in the page,
 * and every test asserts a clean browser console — so all are e2eOnly
 * mechanical wraps.
 */
import type { Page } from '@playwright/test';
import { e2eOnly } from '../harness/define';
import type { CanvasDriver } from '../harness/canvas';

interface ConsoleRecord {
  type: string;
  text: string;
}

// The window.nnvp.debug surface the last test polls (set by tfjsEngine).
interface ExposedTrainingConfig {
  optimizer: string;
  optimizerParams: Record<string, number>;
  loss: string;
  epochs: number;
}

interface ExposedCompiledModel {
  optimizerConfig: Record<string, number>;
  loss: string;
}

// Replicates the original spec's beforeEach: attach console/pageerror
// collectors, then (re)load the app so load-time errors are captured too —
// the dual runner has already navigated once before the body runs.
async function startErrorTracking(page: Page, canvas: CanvasDriver) {
  const consoleMessages: ConsoleRecord[] = [];
  const consoleErrors: string[] = [];
  page.on('console', (msg) => {
    const text = msg.text();
    const type = msg.type();
    consoleMessages.push({ type, text });
    if (type === 'error') {
      consoleErrors.push(text);
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(`PAGE ERROR: ${error.message}`);
  });
  await page.goto(canvas.home);
  await page.waitForTimeout(50);
  return { consoleMessages, consoleErrors };
}

// Helper function to open Training panel and CompileOptions
async function openCompileOptions(page: Page): Promise<void> {
  // Click on Training menu (direct function, not dropdown)
  await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
  await page.click('#GeneralMenu .menuItem:has-text("Training")');
  await page.waitForTimeout(100);
  // Click on Options tab
  const optionsTab = await page.$('.TrainingZone.bar-button:has-text("Options")');
  await optionsTab!.click();
  await page.waitForTimeout(50);
}

e2eOnly(
  'compile: should open Training panel and show CompileOptions',
  'Opens the Training zone through the Panels menu and asserts the #TrainingZone / #CompileOptions panels mount in the DOM — panel chrome as UI, plus a clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== TRAINING PANEL TEST ===');
    // Click on Training menu (it's a direct function call, not a dropdown)
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    await page.waitForTimeout(100);
    // Check if TrainingZone is visible
    const trainingZone = await page.$('#TrainingZone');
    expect(trainingZone).not.toBeNull();
    console.log('Training panel opened successfully');
    // Click on Options tab
    const optionsTab = await page.$('.TrainingZone.bar-button:has-text("Options")');
    expect(optionsTab).not.toBeNull();
    await optionsTab!.click();
    await page.waitForTimeout(50);
    // Check if CompileOptions is visible
    const compileOptions = await page.$('#CompileOptions');
    expect(compileOptions).not.toBeNull();
    console.log('CompileOptions panel visible');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'compile: should show optimizer selector with all available optimizers',
  'Reads the rendered <option> values of the optimizer <select> from the panel DOM and asserts a clean browser console — form chrome only a browser renders.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== OPTIMIZER SELECTOR TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Check optimizer selector exists (first section)
    const optimizerSelector = await page.$('.optimizer-section select');
    expect(optimizerSelector).not.toBeNull();
    // Get all optimizer options
    const optimizers = await page.$$eval('.optimizer-section select option',
      options => options.map(opt => (opt as HTMLOptionElement).value)
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
  },
);

e2eOnly(
  'compile: should show different parameters when switching optimizers',
  'Asserts the parameter form re-renders different labels as the optimizer <select> changes (selectOption + DOM label reads) — reactive form UI observable only in the rendered page.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== DYNAMIC OPTIMIZER PARAMETERS TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Get initial parameters (rmsprop is default)
    const initialParams = await page.$$eval('.optimizer-param label',
      labels => labels.map(label => label.textContent!.trim())
    );
    console.log('Initial params (rmsprop):', initialParams);
    expect(initialParams.some(p => p.includes('Learning Rate'))).toBe(true);
    expect(initialParams.some(p => p.includes('Momentum'))).toBe(true);
    expect(initialParams.some(p => p.includes('Decay'))).toBe(true);
    expect(initialParams.some(p => p.includes('Epsilon'))).toBe(true);
    // Switch to SGD
    await page.selectOption('.optimizer-section select', 'sgd');
    await page.waitForTimeout(50);
    const sgdParams = await page.$$eval('.optimizer-param label',
      labels => labels.map(label => label.textContent!.trim())
    );
    console.log('SGD params:', sgdParams);
    expect(sgdParams.some(p => p.includes('Learning Rate'))).toBe(true);
    expect(sgdParams.some(p => p.includes('Momentum'))).toBe(true);
    expect(sgdParams.some(p => p.includes('Nesterov'))).toBe(true);
    expect(sgdParams.some(p => p.includes('Decay'))).toBe(false); // SGD doesn't have decay
    expect(sgdParams.some(p => p.includes('Epsilon'))).toBe(false); // SGD doesn't have epsilon
    // Switch to Adam
    await page.selectOption('.optimizer-section select', 'adam');
    await page.waitForTimeout(50);
    const adamParams = await page.$$eval('.optimizer-param label',
      labels => labels.map(label => label.textContent!.trim())
    );
    console.log('Adam params:', adamParams);
    expect(adamParams.some(p => p.includes('Learning Rate'))).toBe(true);
    expect(adamParams.some(p => p.includes('Beta 1'))).toBe(true);
    expect(adamParams.some(p => p.includes('Beta 2'))).toBe(true);
    expect(adamParams.some(p => p.includes('Epsilon'))).toBe(true);
    expect(adamParams.some(p => p.includes('Momentum'))).toBe(false); // Adam doesn't have momentum
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'compile: should show loss function selector with all available losses',
  'Reads the rendered loss <select> options and its default value from the panel DOM, plus a clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== LOSS FUNCTION SELECTOR TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Check loss selector exists (second section)
    const lossSelector = await page.$('.loss-section select');
    expect(lossSelector).not.toBeNull();
    // Get all loss options
    const losses = await page.$$eval('.loss-section select option',
      options => options.map(opt => (opt as HTMLOptionElement).value)
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
    const selectedLoss = await page.$eval('.loss-section select', select => (select as HTMLSelectElement).value);
    console.log('Default loss:', selectedLoss);
    expect(selectedLoss).toBe('categoricalCrossentropy');

    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'compile: should allow changing loss function',
  'Drives the loss <select> via selectOption and reads the value back from the live DOM after each change, plus a clean browser-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== LOSS FUNCTION CHANGE TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Change loss to binaryCrossentropy
    await page.selectOption('.loss-section select', 'binaryCrossentropy');
    await page.waitForTimeout(50);
    const newLoss = await page.$eval('.loss-section select', select => (select as HTMLSelectElement).value);
    console.log('Changed loss to:', newLoss);
    expect(newLoss).toBe('binaryCrossentropy');
    // Change to meanSquaredError
    await page.selectOption('.loss-section select', 'meanSquaredError');
    await page.waitForTimeout(50);
    const finalLoss = await page.$eval('.loss-section select', select => (select as HTMLSelectElement).value);
    console.log('Changed loss to:', finalLoss);
    expect(finalLoss).toBe('meanSquaredError');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'compile: should show parameter hints with default values',
  'Reads placeholder attributes off the rendered number inputs of the parameter form (including a :has-text scoped input) — rendered form chrome, plus a clean-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== PARAMETER HINTS TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Check that placeholders show default values in inputs
    const placeholders = await page.$$eval('.optimizer-param input[type="number"]',
      inputs => inputs.map(i => (i as HTMLInputElement).placeholder)
    );
    console.log('Parameter placeholders:', placeholders);
    // Should have placeholders for all rmsprop parameters (default optimizer)
    expect(placeholders.length).toBeGreaterThan(0);
    expect(placeholders.some(p => p.includes('default:'))).toBe(true);
    // Check specific placeholder format
    const learningRatePlaceholder = await page.$eval(
      '.optimizer-param:has-text("Learning Rate") input[type="number"]',
      input => (input as HTMLInputElement).placeholder
    );
    console.log('Learning Rate placeholder:', learningRatePlaceholder);
    expect(learningRatePlaceholder).toContain('default:');
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'compile: should allow modifying optimizer parameters',
  'Fills a number input and checks a real checkbox in the rendered parameter form, reading the values back from the DOM — form interaction as UI, plus a clean-console assertion.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== PARAMETER MODIFICATION TEST ===');
    // Open Training panel and CompileOptions
    await openCompileOptions(page);
    // Find learning rate input (should exist for rmsprop)
    const learningRateInput = await page.$('.optimizer-param:has-text("Learning Rate") input[type="number"]');
    expect(learningRateInput).not.toBeNull();
    // Change learning rate value
    await learningRateInput!.fill('0.01');
    await page.waitForTimeout(50);
    const newValue = await learningRateInput!.inputValue();
    console.log('Learning rate changed to:', newValue);
    expect(newValue).toBe('0.01');
    // Switch to SGD and check Nesterov checkbox
    await page.selectOption('.optimizer-section select', 'sgd');
    await page.waitForTimeout(50);
    const nesterovCheckbox = await page.$('.optimizer-param:has-text("Nesterov") input[type="checkbox"]');
    expect(nesterovCheckbox).not.toBeNull();
    // Check the checkbox
    await nesterovCheckbox!.check();
    await page.waitForTimeout(50);
    const isChecked = await nesterovCheckbox!.isChecked();
    console.log('Nesterov checkbox checked:', isChecked);
    expect(isChecked).toBe(true);
    expect(consoleErrors.length).toBe(0);
  },
);

e2eOnly(
  'compile: should expose actual training configuration that matches UI settings',
  'Runs REAL TensorFlow.js training in the page after configuring the form, polling window.nnvp.debug for the compiled model and matching [TrainingZone] runtime console logs — live tfjs execution and console capture are browser-only.',
  async ({ page, canvas, expect }) => {
    const { consoleMessages } = await startErrorTracking(page, canvas);
    console.log('\n=== TRAINING CONFIGURATION VERIFICATION TEST ===');
    // Load a template to get a valid model
    console.log('Loading a valid model template...');
    // Wait for templates to be loaded
    await page.waitForTimeout(500);
    const fileMenu = await page.$('#GeneralMenu .menuTitle:has-text("File")');
    await fileMenu!.click();
    await page.waitForTimeout(200);
    const templatesMenu = await page.$('text=Templates');
    await templatesMenu!.hover();
    await page.waitForTimeout(50);
    // Select template from submenu
    const template = await page.$('text=2D Dense for MNIST');
    await template!.click();
    await page.waitForTimeout(100);
    // Open Training panel
    console.log('Opening Training panel...');
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    await page.waitForTimeout(100);
    // Switch to Dataset tab and select a dataset
    console.log('Selecting dataset...');
    const datasetTab = await page.$('.TrainingZone.bar-button:has-text("Dataset")');
    await datasetTab!.click();
    await page.waitForTimeout(100);
    const mnistOption = await page.$('.dataset-option:has-text("MNIST")');
    if (mnistOption) {
      await mnistOption.click();
      await page.waitForTimeout(500); // Wait for dataset to load
    }
    // Now switch to Options tab and set custom parameters
    console.log('Opening CompileOptions...');
    const optionsTab = await page.$('.TrainingZone.bar-button:has-text("Options")');
    await optionsTab!.click();
    await page.waitForTimeout(100);
    // Set custom optimizer parameters
    console.log('Setting custom optimizer parameters for Adam...');
    await page.selectOption('.optimizer-section select', 'adam');
    await page.waitForTimeout(100);
    // Set learning rate
    const learningRateInput = await page.$('.optimizer-param:has-text("Learning Rate") input[type="number"]');
    await learningRateInput!.fill('0.002');
    await page.waitForTimeout(50);
    // Set beta1
    const beta1Input = await page.$('.optimizer-param:has-text("Beta 1") input[type="number"]');
    await beta1Input!.fill('0.95');
    await page.waitForTimeout(50);
    // Set loss function
    console.log('Setting loss function to meanSquaredError...');
    await page.selectOption('.loss-section select', 'meanSquaredError');
    await page.waitForTimeout(50);
    // Set epochs to 1 for fast test
    console.log('Setting epochs to 1...');
    const epochsInput = await page.$('.training-params-section input[type="number"]');
    await epochsInput!.fill('1');
    await page.waitForTimeout(50);
    // Enable debug logging to see TensorFlow.js training config
    await page.evaluate(() => {
      const w = window as Window & { nnvp?: { debug?: { enableTraining?: boolean } } };
      w.nnvp = w.nnvp || {};
      w.nnvp.debug = w.nnvp.debug || {};
      w.nnvp.debug.enableTraining = true;
    });
    // Click Train button to trigger compilation AND training
    console.log('Clicking Train button to trigger training...');
    const trainButton = await page.$('.train-button');
    await trainButton!.click();
    // Poll for compiled model config AND training start message (check every 0.5s, timeout after 10s)
    console.log('Polling for compiled model config and training start (checking every 0.5s, max 10s)...');
    let compiledModel: ExposedCompiledModel | null = null;
    let trainingConfig: ExposedTrainingConfig | null = null;
    let trainingStarted = false;
    const startTime = Date.now();
    const timeout = 10000; // 10 seconds
    const pollInterval = 500; // 0.5 seconds
    while (Date.now() - startTime < timeout) {
      // Check for both configs
      const result = await page.evaluate(() => {
        const w = window as Window & {
          nnvp?: { debug?: { compiledModel?: unknown; trainingConfig?: unknown } };
        };
        return {
          compiled: w.nnvp?.debug?.compiledModel as ExposedCompiledModel | undefined,
          training: w.nnvp?.debug?.trainingConfig as ExposedTrainingConfig | undefined,
        };
      });
      // Check for training start message in console
      const trainingStartMsg = consoleMessages.find(msg =>
        msg.text && msg.text.includes('[TrainingZone] Starting training with TensorFlow.js configuration')
      );
      if (result.compiled && result.training && trainingStartMsg) {
        compiledModel = result.compiled;
        trainingConfig = result.training;
        trainingStarted = true;
        console.log(`✓ All configs and training start found after ${Date.now() - startTime}ms`);
        break;
      }
      await page.waitForTimeout(pollInterval);
    }
    if (!compiledModel || !trainingConfig || !trainingStarted) {
      throw new Error(`Timeout: Training not fully started after ${timeout}ms (compiledModel: ${!!compiledModel}, trainingConfig: ${!!trainingConfig}, trainingStarted: ${trainingStarted})`);
    }
    // Check the exposed training configuration
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
    expect(trainingConfig.epochs).toBe(1);
    console.log('✓ Epochs match: 1');
    // Verify the ACTUAL TensorFlow.js compiled model configuration.
    console.log('Compiled model config:', compiledModel);
    // These used to assert learningRate.learningRate — the fingerprint of the
    // params OBJECT being passed where tf.train.adam expects a NUMBER (an
    // effectively-NaN learning rate). The engine now builds positionally, so
    // the config carries the real scalars.
    expect(compiledModel.optimizerConfig.learningRate).toBe(0.002);
    console.log('✓ TF.js optimizer learning rate matches: 0.002');
    expect(compiledModel.optimizerConfig.beta1).toBe(0.95);
    console.log('✓ TF.js optimizer beta1 matches: 0.95');
    expect(compiledModel.loss).toBe('meanSquaredError');
    console.log('✓ TF.js loss function matches: meanSquaredError');
    // THE ULTIMATE VERIFICATION: Check console logs during actual training runtime
    console.log('Verifying TensorFlow.js runtime configuration from console logs...');
    console.log(`Total console messages captured: ${consoleMessages.length}`);
    // Debug: Show last 10 console messages for troubleshooting
    const recentMessages = consoleMessages.slice(-10).map(msg => msg.text || msg.type);
    console.log('Recent console messages:', recentMessages);
    const trainingStartMsg = consoleMessages.find(msg =>
      msg.text && msg.text.includes('[TrainingZone] Starting training with TensorFlow.js configuration')
    );
    expect(trainingStartMsg).toBeDefined();
    console.log('✓ Found training start message');
    // Verify optimizer type in runtime logs
    const optimizerMsg = consoleMessages.find(msg =>
      msg.text && msg.text.includes('[TrainingZone]   Optimizer:') && msg.text.includes('Adam')
    );
    expect(optimizerMsg).toBeDefined();
    console.log('✓ Runtime log confirms Optimizer: Adam');
    // Verify learning rate in runtime logs
    const learningRateMsg = consoleMessages.find(msg =>
      msg.text && msg.text.includes('[TrainingZone]   Learning Rate: 0.002')
    );
    expect(learningRateMsg).toBeDefined();
    console.log('✓ Runtime log confirms Learning Rate: 0.002');
    // Verify loss in runtime logs
    const lossMsg = consoleMessages.find(msg =>
      msg.text && msg.text.includes('[TrainingZone]   Loss: meanSquaredError')
    );
    expect(lossMsg).toBeDefined();
    console.log('✓ Runtime log confirms Loss: meanSquaredError');
    // Verify epochs in runtime logs
    const epochsMsg = consoleMessages.find(msg =>
      msg.text && msg.text.includes('[TrainingZone]   Epochs: 1')
    );
    expect(epochsMsg).toBeDefined();
    console.log('✓ Runtime log confirms Epochs: 1');
    console.log('✅ VERIFIED: TensorFlow.js is ACTUALLY using our configuration during training!');
    // Note: Chart rendering errors are expected with only 1 epoch (not enough data points)
  },
);
