/**
 * Migrated from tests/core-features.spec.js (part 3 of 3 — dataset loading
 * and the full TensorFlow.js training workflow). These load real datasets,
 * inspect rendered <canvas> pixels and run real tfjs training in the page,
 * so all are e2eOnly mechanical wraps.
 *
 * Long tests carry { timeoutMs } (dataset CDN loads 150s, the full training
 * workflow 180s) — both runners honor it.
 */
import type { Page } from '@playwright/test';
import { e2eOnly, appTest } from '../harness/define';
import type { CanvasDriver } from '../harness/canvas';

interface ConsoleRecord {
  type: string;
  text: string;
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

e2eOnly(
  'training: should interact with dataset selector in TrainingZone',
  'Loads a real dataset in the page and asserts the rendered 28x28 sample <canvas> elements plus [DatasetSelector]/[TrainingZone] console logs — network loading, canvas rasterization and console capture are browser-only.',
  async ({ page, canvas, expect }) => {
    const { consoleMessages, consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== DATASET SELECTOR TEST ===');
    // Enable dataset debug logging
    await page.evaluate(() => {
      const w = window as Window & { nnvp?: { debug?: { enableDatasets?: boolean } } };
      w.nnvp = w.nnvp || {}; w.nnvp.debug = w.nnvp.debug || {}; w.nnvp.debug.enableDatasets = true;
    });
    console.log('Dataset debug logging enabled');
    // Open TrainingZone by clicking "Training" in GeneralMenu
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    await page.waitForTimeout(50);
    console.log('Clicked Training menu to open TrainingZone');
    // Verify TrainingZone is now visible
    const bottomTrainer = await page.$('#trainingZone');
    expect(bottomTrainer).not.toBeNull();
    console.log('TrainingZone panel found');
    // Click Dataset tab
    const datasetTab = await page.$('.TrainingZone.bar-button:has-text("Dataset")');
    await datasetTab!.click();
    await page.waitForTimeout(50);
    console.log('Dataset tab clicked');
    // Verify dataset selector exists
    const datasetSelector = await page.$('#dataset-selector-selector');
    expect(datasetSelector).not.toBeNull();
    console.log('Dataset selector found');
    // Check default dataset
    const initialDataset = await datasetSelector!.evaluate(el => (el as HTMLSelectElement).value);
    console.log('Initial dataset:', initialDataset);
    expect(initialDataset).toBe('MNIST');
    // Verify dataset options are available
    const datasetOptions = await datasetSelector!.$$eval('option', options =>
      options.map(opt => (opt as HTMLOptionElement).value)
    );
    console.log('Available datasets:', datasetOptions);
    expect(datasetOptions).toContain('MNIST');
    expect(datasetOptions).toContain('FashionMNIST');
    expect(datasetOptions).toContain('CIFAR10');
    // Check initial description
    const initialDescription = await page.textContent('#dataset-description');
    console.log('MNIST description:', initialDescription!.substring(0, 100));
    expect(initialDescription).toContain('MNIST');
    expect(initialDescription!.length).toBeGreaterThan(20);
    // Wait for MNIST auto-load to start (3 second setTimeout in mounted())
    console.log('Waiting for MNIST auto-load to start (3s timeout in mounted())...');
    await page.waitForTimeout(50);
    // Check debug logs immediately to see if loading started
    let datasetLogs = consoleMessages.filter(msg =>
      msg.text.includes('[DatasetSelector]') || msg.text.includes('[TrainingZone]')
    );
    console.log(`\n📊 Dataset logs after 4s: ${datasetLogs.length} messages`);
    if (datasetLogs.length > 0) {
      console.log('Last 15 messages (to see completion):');
      datasetLogs.slice(-15).forEach(log => console.log(`  - ${log.text.substring(0, 150)}`));
    } else {
      console.log('⚠️  NO DATASET LOGS YET! Dataset loading might not have started.');
    }
    // Wait for loading to complete (loading bar should disappear)
    console.log('\nWaiting for dataset loading to complete (checking loading bar visibility)...');
    await page.waitForFunction(
      () => {
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const samplesDiv = document.querySelector('#samples');
        // Loading complete when: loading bar hidden AND samples div is visible (not display:none)
        const loadingBarHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        const samplesVisible = samplesDiv && window.getComputedStyle(samplesDiv).display !== 'none';
        return loadingBarHidden && samplesVisible;
      },
      { timeout: 120000 } // 2 minutes for CDN download
    );
    console.log('Loading bar hidden! Checking samples div...');
    // Debug: Check what's in the samples div
    const samplesDebug = await page.evaluate(() => {
      const samplesDiv = document.querySelector('#samples');
      return {
        exists: !!samplesDiv,
        display: samplesDiv ? window.getComputedStyle(samplesDiv).display : null,
        innerHTML: samplesDiv ? samplesDiv.innerHTML.substring(0, 200) : null,
        childCount: samplesDiv ? samplesDiv.children.length : 0,
        canvasCount: samplesDiv ? samplesDiv.querySelectorAll('canvas').length : 0,
      };
    });
    console.log('Samples div debug:', JSON.stringify(samplesDebug, null, 2));
    // If no canvases, wait a bit more
    if (samplesDebug.canvasCount === 0) {
      console.log('No canvases yet, waiting 5 more seconds...');
      await page.waitForTimeout(50);

      const samplesDebug2 = await page.evaluate(() => {
        const samplesDiv = document.querySelector('#samples');
        return {
          canvasCount: samplesDiv ? samplesDiv.querySelectorAll('canvas').length : 0,
          innerHTML: samplesDiv ? samplesDiv.innerHTML.substring(0, 300) : null,
        };
      });
      console.log('After 5s wait:', JSON.stringify(samplesDebug2, null, 2));
    }
    console.log('Checking for canvases...');
    // Verify actual canvas samples are rendered
    const samplesDiv = await page.$('#samples');
    const canvases = await samplesDiv!.$$('canvas');
    console.log('Number of MNIST sample canvases rendered:', canvases.length);
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.length).toBeLessThanOrEqual(40); // Should render 40 samples
    // Verify canvas has actual content (not empty)
    const firstCanvas = canvases[0]!;
    const canvasSize = await firstCanvas.evaluate(canvasEl => ({
      width: (canvasEl as HTMLCanvasElement).width,
      height: (canvasEl as HTMLCanvasElement).height
    }));
    console.log('Sample canvas size:', canvasSize);
    expect(canvasSize.width).toBe(28); // MNIST is 28x28
    expect(canvasSize.height).toBe(28);
    // Verify loading debug logs
    const allDatasetLogs = consoleMessages.filter(msg =>
      msg.text.includes('[DatasetSelector]') || msg.text.includes('[TrainingZone]')
    );
    console.log('\nDataset loading logs (' + allDatasetLogs.length + ' messages):');
    allDatasetLogs.slice(0, 10).forEach(log => console.log(`  ${log.type}: ${log.text.substring(0, 100)}`));
    // Should have logs showing complete loading process
    const hasLoadStartLog = allDatasetLogs.some(log =>
      log.text.includes('datasetSet called') || log.text.includes('Starting load')
    );
    const hasLoadCompleteLog = allDatasetLogs.some(log =>
      log.text.includes('Samples filled')
    );
    expect(hasLoadStartLog).toBe(true);
    expect(hasLoadCompleteLog).toBe(true);
    console.log('✅ MNIST dataset loading completed successfully with real samples!');
    expect(consoleErrors.length).toBe(0);
  },
  { timeoutMs: 150000 },
);

e2eOnly(
  'training: should load FashionMNIST after MNIST',
  'Distinguishes the two datasets by reading pixel data (canvas getImageData brightness averages) from the rendered sample canvases after real network loads — canvas rasterization is browser-only.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== FASHION MNIST LOADING TEST ===');
    // Enable debug logging
    await page.evaluate(() => {
      const w = window as Window & { nnvp?: { debug?: { enableDatasets?: boolean } } };
      w.nnvp = w.nnvp || {}; w.nnvp.debug = w.nnvp.debug || {}; w.nnvp.debug.enableDatasets = true;
    });
    // Open TrainingZone by clicking "Training" in GeneralMenu
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    await page.waitForTimeout(50);
    console.log('Opened TrainingZone');
    // Go to Dataset tab
    const datasetTab = await page.$('.TrainingZone.bar-button:has-text("Dataset")');
    await datasetTab!.click();
    await page.waitForTimeout(50);
    const datasetSelector = await page.$('#dataset-selector-selector');
    // Wait for MNIST auto-load to complete
    console.log('Waiting for MNIST auto-load...');
    await page.waitForTimeout(50);
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        return samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    console.log('MNIST loaded');
    // Get average pixel data from ALL MNIST samples (should be consistent across runs)
    const mnistPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll<HTMLCanvasElement>('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;

      canvases.forEach(canvasEl => {
        const ctx = canvasEl.getContext('2d');
        const imageData = ctx!.getImageData(0, 0, canvasEl.width, canvasEl.height);
        // Sum all pixels
        for (let i = 0; i < imageData.data.length; i += 4) {
          totalSum += imageData.data[i]!; // Red channel (grayscale, so R=G=B)
          totalPixels++;
        }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('MNIST average pixel value across all samples:', mnistPixelData);
    // Verify MNIST has expected brightness range (20-55)
    expect(mnistPixelData).toBeGreaterThan(20);
    expect(mnistPixelData).toBeLessThan(55);
    // Now change to FashionMNIST using the dropdown selector (like a real user would)
    console.log('Changing to FashionMNIST...');
    await page.selectOption('#dataset-selector-selector', 'FashionMNIST');
    // Wait for FashionMNIST to load
    await page.waitForTimeout(50);
    // Verify selector changed
    const newDataset = await datasetSelector!.evaluate(el => (el as HTMLSelectElement).value);
    console.log('Selector value:', newDataset);
    expect(newDataset).toBe('FashionMNIST');
    // Wait for samples to render
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const loadingHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        return loadingHidden && samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    // Verify FashionMNIST samples rendered
    const samplesDiv = await page.$('#samples');
    const canvases = await samplesDiv!.$$('canvas');
    console.log('FashionMNIST canvases:', canvases.length);
    expect(canvases.length).toBeGreaterThan(0);
    expect(canvases.length).toBeLessThanOrEqual(40);
    // Get average pixel data from ALL FashionMNIST samples
    const fashionPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll<HTMLCanvasElement>('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;
      canvases.forEach(canvasEl => {
        const ctx = canvasEl.getContext('2d');
        const imageData = ctx!.getImageData(0, 0, canvasEl.width, canvasEl.height);
        for (let i = 0; i < imageData.data.length; i += 4) {
          totalSum += imageData.data[i]!;
          totalPixels++;
        }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('FashionMNIST average pixel value across all samples:', fashionPixelData);
    // Verify FashionMNIST has expected brightness range (55-90)
    expect(fashionPixelData).toBeGreaterThan(55);
    expect(fashionPixelData).toBeLessThan(90);
    // Verify images are actually different
    expect(fashionPixelData).not.toBe(mnistPixelData);
    console.log(
      '✅ Verified datasets are different and in expected ranges (MNIST:',
      mnistPixelData,
      ', FashionMNIST:',
      fashionPixelData,
      ')',
    );
    // Verify description updated
    const description = await page.textContent('#dataset-description');
    console.log('Description:', description!.substring(0, 100));
    expect(description).toContain('clothes'); // FashionMNIST description says "Dataset of clothes images"
    expect(description).not.toContain('handwritten'); // Should not have MNIST description
    console.log('✅ FashionMNIST loaded successfully after MNIST!');
    expect(consoleErrors.length).toBe(0);
  },
  { timeoutMs: 150000 },
);

e2eOnly(
  'training: should reload MNIST after FashionMNIST',
  'Same canvas-pixel inspection (getImageData brightness) across dataset switches plus cache-load timing observed in the live page — rendering and caching behavior only exist in a browser.',
  async ({ page, canvas, expect }) => {
    const { consoleErrors } = await startErrorTracking(page, canvas);
    console.log('\n=== RELOAD MNIST TEST ===');
    // Enable debug logging
    await page.evaluate(() => {
      const w = window as Window & { nnvp?: { debug?: { enableDatasets?: boolean } } };
      w.nnvp = w.nnvp || {}; w.nnvp.debug = w.nnvp.debug || {}; w.nnvp.debug.enableDatasets = true;
    });
    // Open TrainingZone by clicking "Training" in GeneralMenu
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    await page.waitForTimeout(50);
    console.log('Opened TrainingZone');
    // Go to Dataset tab
    const datasetTab = await page.$('.TrainingZone.bar-button:has-text("Dataset")');
    await datasetTab!.click();
    await page.waitForTimeout(50);
    const datasetSelector = await page.$('#dataset-selector-selector');
    // Wait for MNIST auto-load
    console.log('Waiting for initial MNIST...');
    await page.waitForTimeout(50);
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        return samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    console.log('MNIST loaded');
    // Change to FashionMNIST using the dropdown selector
    console.log('Loading FashionMNIST...');
    await page.selectOption('#dataset-selector-selector', 'FashionMNIST');
    await page.waitForTimeout(100);
    // Wait for FashionMNIST to load
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const loadingHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        return loadingHidden && samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 120000 }
    );
    console.log('FashionMNIST loaded');
    // Get average pixel data from ALL FashionMNIST samples
    const fashionPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll<HTMLCanvasElement>('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;
      canvases.forEach(canvasEl => {
        const ctx = canvasEl.getContext('2d');
        const imageData = ctx!.getImageData(0, 0, canvasEl.width, canvasEl.height);
        for (let i = 0; i < imageData.data.length; i += 4) { totalSum += imageData.data[i]!; totalPixels++; }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('FashionMNIST average pixel value:', fashionPixelData);
    // Verify FashionMNIST has expected brightness range (55-90)
    expect(fashionPixelData).toBeGreaterThan(55);
    expect(fashionPixelData).toBeLessThan(90);
    // Now reload MNIST using the dropdown selector
    console.log('Reloading MNIST...');
    await page.selectOption('#dataset-selector-selector', 'MNIST');
    await page.waitForTimeout(100);
    // Verify selector changed back
    const finalDataset = await datasetSelector!.evaluate(el => (el as HTMLSelectElement).value);
    console.log('Final selector value:', finalDataset);
    expect(finalDataset).toBe('MNIST');
    // MNIST should load from cache (faster)
    const loadStartTime = Date.now();
    await page.waitForFunction(
      () => {
        const samplesDiv = document.querySelector('#samples');
        const loadingBar = document.querySelector('#data-selector-loading-bar-container');
        const loadingHidden = !loadingBar || window.getComputedStyle(loadingBar).display === 'none';
        return loadingHidden && samplesDiv && samplesDiv.querySelectorAll('canvas').length > 0;
      },
      { timeout: 10000 } // Should be fast from cache
    );
    const loadTime = Date.now() - loadStartTime;
    console.log(`MNIST reloaded from cache in ${loadTime}ms`);
    // Verify MNIST samples rendered
    const samplesDiv = await page.$('#samples');
    const canvases = await samplesDiv!.$$('canvas');
    console.log('MNIST canvases:', canvases.length);
    expect(canvases.length).toBeGreaterThan(0);
    // Get average pixel data from reloaded MNIST
    const mnistPixelData = await page.evaluate(() => {
      const canvases = document.querySelectorAll<HTMLCanvasElement>('#samples canvas');
      let totalSum = 0;
      let totalPixels = 0;
      canvases.forEach(canvasEl => {
        const ctx = canvasEl.getContext('2d');
        const imageData = ctx!.getImageData(0, 0, canvasEl.width, canvasEl.height);
        for (let i = 0; i < imageData.data.length; i += 4) { totalSum += imageData.data[i]!; totalPixels++; }
      });
      return Math.round(totalSum / totalPixels);
    });
    console.log('MNIST average pixel value after reload:', mnistPixelData);
    // Verify MNIST has expected brightness range (20-55)
    expect(mnistPixelData).toBeGreaterThan(20);
    expect(mnistPixelData).toBeLessThan(55);
    // Verify images switched back (MNIST != FashionMNIST)
    expect(mnistPixelData).not.toBe(fashionPixelData);
    console.log(
      '✅ Verified datasets switched back and in expected ranges (MNIST:',
      mnistPixelData,
      ', FashionMNIST:',
      fashionPixelData,
      ')',
    );
    const description = await page.textContent('#dataset-description');
    expect(description).toContain('MNIST');
    expect(description).not.toContain('Fashion');
    console.log('✅ MNIST reloaded successfully from cache!');
    expect(consoleErrors.length).toBe(0);
  },
  { timeoutMs: 150000 },
);

// big e2e test to ensure the whole typical workflow works
// this may be against the "easy to debug" practices
// but there are other tests to help you debug specific features anyway
e2eOnly(
  'training: should complete full MNIST training workflow',
  'Runs full TensorFlow.js MNIST training in the page (CPU backend via ?backend=cpu since WebGL is unavailable under xvfb), then asserts SVG chart rendering, hover tooltips and console-logged epoch metrics — live tfjs execution, hover pointer-events and console capture are browser-only.',
  async ({ page, expect }) => {
    // The original declared test.slow() + test.setTimeout(120000) and ran in
    // its own browser context; the dual runner provides the page and owns the
    // timeout budget (see the note at the top of this file).
    console.log('\n=== MNIST TRAINING WORKFLOW TEST ===');
    // Capture alerts and console messages
    const alerts: string[] = [];
    const consoleMessages: string[] = [];
    // The runner installed a generic accept-all dialog handler; replace it
    // with the original's recording variant (two handlers would both try to
    // accept and throw).
    page.removeAllListeners('dialog');
    page.on('dialog', async (dialog) => {
      console.log('ALERT:', dialog.message());
      alerts.push(dialog.message());
      await dialog.accept();
    });
    page.on('console', (msg) => {
      const text = msg.text();
      consoleMessages.push(text);
      // Log important console messages
      if (text.includes('CPU-only mode') || text.includes('CPU backend') ||
          text.includes('Epoch') || text.includes('training') ||
          text.includes('[Charts]') || text.includes('mounted') ||
          text.includes('[TrainingZone]') || text.includes('optimizer')) {
        console.log('[BROWSER]', text);
      }
      if (text.includes('error') || text.includes('Error') || text.includes('ERROR') ||
          text.includes('warn') || text.includes('Warning')) {
        console.log('[BROWSER ERROR]', text);
      }
    });
    // Navigate to the app with CPU backend parameter
    // This forces TensorFlow.js to use CPU instead of WebGL (which doesn't work in xvfb)
    // (baseURL-relative so it works under both node and bun playwright configs)
    await page.goto('/?backend=cpu');
    await page.waitForTimeout(100); // Wait for CPU backend to initialize
    // Load a template for training
    await page.click('text=File');
    await page.waitForTimeout(50);
    const templatesOption = await page.$('text=Templates');
    await templatesOption!.hover();
    await page.waitForTimeout(50);
    const template = await page.$('text=2D Dense for MNIST');
    await template!.click();
    await page.waitForTimeout(100);
    console.log('Loaded template: 2D Dense for MNIST');
    // Open Training panel via top menu
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    await page.waitForTimeout(100);
    // Verify TrainingZone is visible
    const bottomTrainer = await page.$('#trainingZone');
    expect(bottomTrainer).not.toBeNull();
    console.log('TrainingZone panel opened');
    // Enable debug logging
    await page.evaluate(() => {
      const w = window as Window & { nnvp?: { debug?: { enableDatasets?: boolean; enableTraining?: boolean } } };
      w.nnvp = w.nnvp || {}; w.nnvp.debug = w.nnvp.debug || {}; w.nnvp.debug.enableDatasets = true;
      w.nnvp.debug.enableTraining = true;
    });
    console.log('Enabled debug logging');
    // Click Dataset tab to show the dataset selector
    await page.click('text=Dataset');
    await page.waitForTimeout(100);
    console.log('Dataset tab clicked');
    // Select MNIST from the dropdown
    const datasetSelector = await page.$('#dataset-selector-selector');
    expect(datasetSelector).not.toBeNull();
    await datasetSelector!.selectOption('MNIST');
    console.log('Selected MNIST from dropdown');
    // Wait for dataset loading to complete
    // The loading bar should appear and then disappear
    await page.waitForTimeout(100); // Give it time to start loading
    // Wait for loading to complete (loading bar to disappear)
    try {
      await page.waitForSelector('#data-selector-loading-bar-container', { state: 'hidden', timeout: 30000 });
      console.log('Dataset loading completed (loading bar disappeared)');
    } catch {
      console.log('Warning: Loading bar did not disappear within timeout, continuing anyway...');
    }
    // Now click Options tab to set epochs
    await page.click('#trainingZone >> text=Options');
    await page.waitForTimeout(50);
    // Set epochs to 10 for meaningful training progress verification
    const epochsInput = await page.$('#CompileOptions input[type="number"]');
    await epochsInput!.fill('10');
    await epochsInput!.dispatchEvent('input');
    await page.waitForTimeout(30);
    const epochsValue = await epochsInput!.inputValue();
    console.log('Set epochs to:', epochsValue);
    expect(epochsValue).toBe('10');
    // Set optimizer to 'adam' for consistent results
    const optimizerSelector = await page.$('.optimizer-section select');
    expect(optimizerSelector).not.toBeNull();
    await optimizerSelector!.selectOption('adam');
    await page.waitForTimeout(30);
    const optimizerValue = await optimizerSelector!.inputValue();
    console.log('Set optimizer to:', optimizerValue);
    expect(optimizerValue).toBe('adam');
    // Click Train button (now inside CompileOptions panel)
    console.log('Attempting to click Train button...');
    const trainButton = await page.$('.train-button');
    expect(trainButton).not.toBeNull();
    const trainButtonText = await trainButton!.textContent();
    console.log('Train button text:', trainButtonText!.trim());
    expect(trainButtonText!.trim()).toContain('Start Training');
    // Click it with force to ensure it registers
    await trainButton!.click({ force: true });
    console.log('Clicked Train button');
    // Wait for training indicator to appear
    console.log('Waiting for training to start...');
    await page.waitForSelector('[data-testid="training-indicator"]', { timeout: 10000 });
    console.log('Training started (indicator visible)');
    // Check if we got any alerts
    if (alerts.length > 0) {
      console.log('Alerts received:', alerts);
    }
    // Verify Charts tab is active (automatically switches during training)
    const chartsPanel = await page.$('#Charts');
    expect(chartsPanel).not.toBeNull();
    console.log('Charts panel is active');
    // Wait for training to complete (indicator disappears)
    // With 2 epochs and 500 training samples, this should take ~30-60 seconds
    console.log('Waiting for training to complete...');
    await page.waitForSelector('[data-testid="training-indicator"]', { state: 'detached', timeout: 120000 }); // 2 minute timeout
    console.log('Training completed (indicator gone)');
    // Verify that charts are visible (using SVG-based LineChart components)
    const svgElements = await page.$$('svg.line-chart-svg');
    expect(svgElements.length).toBe(2); // Batch and Epoch charts
    console.log('Charts are visible (SVG elements found)');
    // WARNING: BEGIN TOOLTIP TEST ZONE, SHOULD PUT IN ANOTHER SPECIFIC TEST - BUT ACTUALLY ENABLES TO VERIFY COHERENCE
    // Test tooltip functionality by hovering over a chart point
    console.log('Testing tooltip functionality...');
    // Additional time after training completion (longer wait for parallel execution)
    await page.waitForTimeout(3000);
    // Find all hover points in the epoch chart (second chart)
    const hoverPoints = await page.$$('svg.line-chart-svg circle.hover-point');
    expect(hoverPoints.length).toBeGreaterThan(0);
    console.log(`Found ${hoverPoints.length} hover points in charts`);
    // Hover over a point in the middle of the data
    const midPoint = hoverPoints[Math.floor(hoverPoints.length / 2)]!;
    await midPoint.hover();
    // Wait a bit for the tooltip to appear
    await page.waitForTimeout(100);
    // Verify tooltip is visible
    const tooltip = await page.$('.tooltip');
    expect(tooltip).not.toBeNull();
    const isTooltipVisible = await tooltip!.isVisible();
    expect(isTooltipVisible).toBe(true);
    console.log('Tooltip appeared on hover');
    // Verify tooltip contains expected content
    const tooltipText = await tooltip!.textContent();
    expect(tooltipText).toContain('Epoch/Batch:'); // Label
    expect(tooltipText!.length).toBeGreaterThan(10); // Has some content
    console.log('Tooltip content verified:', tooltipText!.substring(0, 50) + '...');
    // Move mouse away and verify tooltip disappears
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    const tooltipAfter = await page.$('.tooltip');
    const isTooltipVisibleAfter = tooltipAfter ? await tooltipAfter.isVisible() : false;
    expect(isTooltipVisibleAfter).toBe(false);
    console.log('Tooltip correctly disappears when mouse leaves');
    // WARNING: END TOOLTIP TEST ZONE, SHOULD PUT IN ANOTHER SPECIFIC TEST
    // Verify training actually ran by checking console messages
    // Look for batch chart updates and epoch chart updates
    const batchUpdates = consoleMessages.filter(msg => msg.includes('[Charts] Batch chart update'));
    const epochUpdates = consoleMessages.filter(msg => msg.includes('[Charts] Epoch chart update'));
    console.log(`Found ${batchUpdates.length} batch updates and ${epochUpdates.length} epoch updates`);
    // We should have batch updates (one per batch) and epoch updates (>=10 epochs)
    expect(batchUpdates.length).toBeGreaterThan(0);
    expect(epochUpdates.length).toBeGreaterThanOrEqual(10); // At least 10 epochs
    // Skip initial empty update if present, use first real epoch
    let firstEpochIndex = 0;
    // Check if first update has empty data
    if (epochUpdates[0]!.includes('"data":[]')) {
      firstEpochIndex = 1; // Skip empty initial update
    }
    const firstEpochMsg = epochUpdates[firstEpochIndex]!;
    const lastEpochMsg = epochUpdates[epochUpdates.length - 1]!;
    console.log('First epoch message:', firstEpochMsg);
    console.log('Last epoch message:', lastEpochMsg);
    // Verify chart data coherence: tooltip values should match console message data
    console.log('Verifying chart data matches console logs...');
    // Parse the last epoch data from console
    const jsonStart = lastEpochMsg.indexOf('{"labels"');
    const jsonStr = lastEpochMsg.substring(jsonStart);
    // The chart payload's shape is asserted piecewise below — parsed at the
    // untypeable console-log seam.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const lastEpochData = JSON.parse(jsonStr) as any;
    // Get the last accuracy and loss values from console data
    const lastAccFromConsole = lastEpochData.series[0].data[lastEpochData.series[0].data.length - 1];
    const lastLossFromConsole = lastEpochData.series[2].data[lastEpochData.series[2].data.length - 1];
    console.log('Console data - last acc:', lastAccFromConsole, 'last loss:', lastLossFromConsole);
    // Now hover over the LAST point and verify the tooltip shows the last epoch's values
    const lastFewPoints = hoverPoints.slice(-10);
    await lastFewPoints[lastFewPoints.length - 1]!.hover(); // Hover over the LAST point
    await page.waitForTimeout(100);
    const dataTooltip = await page.$('.tooltip');
    const dataTooltipText = await dataTooltip!.textContent();
    console.log('Chart tooltip text:', dataTooltipText);
    // Extract the numeric value from tooltip
    const valueMatch = dataTooltipText!.match(/(\d+\.\d+)/);
    expect(valueMatch).not.toBeNull();
    const chartValue = parseFloat(valueMatch![1]!);
    console.log('Chart displayed value:', chartValue);
    // Verify it's in a reasonable range (between 0 and 2.5 for loss/accuracy)
    expect(chartValue).toBeGreaterThanOrEqual(0);
    expect(chartValue).toBeLessThanOrEqual(2.5);
    // Verify it's close to one of the console values (within reasonable range)
    // The value should be close to either last acc or last loss from console
    const diffFromAcc = Math.abs(chartValue - lastAccFromConsole);
    const diffFromLoss = Math.abs(chartValue - lastLossFromConsole);
    const isCloseToConsole = diffFromAcc < 0.5 || diffFromLoss < 0.5; // Within 0.5
    expect(isCloseToConsole).toBe(true);
    console.log('Chart data coherence verified - tooltip value matches console data (diff from acc:', diffFromAcc.toFixed(3), 'diff from loss:', diffFromLoss.toFixed(3), ')');
    await page.mouse.move(0, 0);
    await page.waitForTimeout(100);
    // Extract JSON from the messages
    interface EpochMetrics {
      acc: number;
      val_acc: number;
      loss: number;
      val_loss: number;
    }
    const extractMetrics = (msg: string): EpochMetrics | null => {
      const start = msg.indexOf('{"labels"');
      if (start === -1) return null;
      const str = msg.substring(start);
      try {
        // Same untypeable console-log seam as above.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = JSON.parse(str) as any;
        return {
          acc: data.series[0].data[data.series[0].data.length - 1],
          val_acc: data.series[1].data[data.series[1].data.length - 1],
          loss: data.series[2].data[data.series[2].data.length - 1],
          val_loss: data.series[3].data[data.series[3].data.length - 1],
        };
      } catch (e) {
        console.error('Failed to parse metrics:', e);
        return null;
      }
    };
    const firstMetrics = extractMetrics(firstEpochMsg);
    const lastMetrics = extractMetrics(lastEpochMsg);
    expect(firstMetrics).not.toBeNull();
    expect(lastMetrics).not.toBeNull();
    console.log('First epoch metrics:', firstMetrics);
    console.log('Last epoch metrics:', lastMetrics);
    // Verify training progress: both accuracies should increase by at least 0.2
    const accGain = lastMetrics!.acc - firstMetrics!.acc;
    const valAccGain = lastMetrics!.val_acc - firstMetrics!.val_acc;
    console.log(`Accuracy gain: ${accGain.toFixed(3)} (training), ${valAccGain.toFixed(3)} (validation)`);
    expect(accGain).toBeGreaterThanOrEqual(0.2);
    expect(valAccGain).toBeGreaterThanOrEqual(0.2);
    // Verify both losses should decrease by at least 0.2
    const lossDecrease = firstMetrics!.loss - lastMetrics!.loss;
    const valLossDecrease = firstMetrics!.val_loss - lastMetrics!.val_loss;
    console.log(`Loss decrease: ${lossDecrease.toFixed(3)} (training), ${valLossDecrease.toFixed(3)} (validation)`);
    expect(lossDecrease).toBeGreaterThanOrEqual(0.2);
    expect(valLossDecrease).toBeGreaterThanOrEqual(0.2);
    console.log('✅ MNIST training workflow completed successfully with verified progress!');
  },
  { timeoutMs: 180000 },
);

// --- Chart helpers ------------------------------------------------------------

appTest('charts: the Batch Results helper explains per-batch training metrics', async ({ charts, expect }) => {
  await charts.open();
  const text = await charts.helpText('batch');
  expect(text).toContain('after every batch');
  expect(text).toContain('acc');
  expect(text).toContain('loss');
  expect(text).toContain('validation runs once per epoch');
});

appTest('charts: the Epoch Results helper explains validation and overfitting', async ({ charts, expect }) => {
  await charts.open();
  const text = await charts.helpText('epoch');
  expect(text).toContain('after every epoch');
  expect(text).toContain('val-acc / val-loss');
  expect(text).toContain('overfitting');
});

e2eOnly(
  'bench: the Bench tab exists only for ?bench=1 browsers (sticky)',
  'Navigates with real URL params and asserts the rendered tab bar — the localStorage-backed gate and Vue re-render only exist in a live page.',
  async ({ page, expect }) => {
    // Plain load: no Bench tab.
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    expect(await page.locator('.TrainingZone.bar-button:has-text("Bench")').count()).toBe(0);
    // Opt in via the URL: the tab appears...
    await page.goto('/?bench=1');
    await page.waitForSelector('.vue-flow__pane');
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    expect(await page.locator('.TrainingZone.bar-button:has-text("Bench")').count()).toBe(1);
    // ...and STICKS on a plain reload (localStorage), until ?bench=0.
    await page.goto('/');
    await page.waitForSelector('.vue-flow__pane');
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    expect(await page.locator('.TrainingZone.bar-button:has-text("Bench")').count()).toBe(1);
    await page.goto('/?bench=0');
    await page.waitForSelector('.vue-flow__pane');
    await page.click('#GeneralMenu .menuTitle:has-text("Panels")');
    await page.click('#GeneralMenu .menuItem:has-text("Training")');
    expect(await page.locator('.TrainingZone.bar-button:has-text("Bench")').count()).toBe(0);
  },
  { timeoutMs: 30000 },
);
