// Inspect mode: draw the normalized pixel data from activationToPixels onto a
// canvas. Everything is fillRect-based (no ImageData) so it degrades to a
// no-op wherever a real 2D context is unavailable (happy-dom under bun).

import { colorSchemeOrDefault, rampCss } from '../Settings/colorSchemes';
import { settings } from '../Settings/settings';

// Cold (inactive) to warm (active) heat color for a 0..1 intensity, on the
// user's chosen ramp (Settings > Colors) — the same ramp the 3D view renders.
export function heatColor(value, schemeId = settings.get('colorScheme')) {
  return rampCss(colorSchemeOrDefault(schemeId), value);
}

const PADDING_COLOR = 'rgba(0, 0, 0, 0)';
const TILE_GAP = 1;
const TILES_PER_ROW = 4;

function drawGrid(ctx, pixels, width, height, cell, offsetX, offsetY) {
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = pixels[y * width + x];
      if (value < 0) continue; // eslint-disable-line no-continue
      ctx.fillStyle = heatColor(value);
      ctx.fillRect(offsetX + x * cell, offsetY + y * cell, cell, cell);
    }
  }
}

/**
 * Render one layer's pixels object ({kind:'grid'|'tiles'|'tint'}) onto the
 * canvas, sizing the canvas' bitmap to fit `targetWidth` CSS pixels.
 */
export function drawInspection(canvas, pixels, targetWidth = 84) {
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  if (pixels.kind === 'grid') {
    const cell = Math.max(2, Math.floor(targetWidth / pixels.width));
    canvas.width = pixels.width * cell;
    canvas.height = pixels.height * cell;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, pixels.pixels, pixels.width, pixels.height, cell, 0, 0);
    return;
  }
  if (pixels.kind === 'tiles') {
    const perRow = Math.min(pixels.tiles.length, TILES_PER_ROW);
    const rows = Math.ceil(pixels.tiles.length / perRow);
    const cell = Math.max(
      1, Math.floor((targetWidth - (perRow - 1) * TILE_GAP) / (perRow * pixels.mapWidth)),
    );
    const tileW = pixels.mapWidth * cell;
    const tileH = pixels.mapHeight * cell;
    canvas.width = perRow * tileW + (perRow - 1) * TILE_GAP;
    canvas.height = rows * tileH + (rows - 1) * TILE_GAP;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    pixels.tiles.forEach((tile, i) => {
      const offsetX = (i % perRow) * (tileW + TILE_GAP);
      const offsetY = Math.floor(i / perRow) * (tileH + TILE_GAP);
      drawGrid(ctx, tile, pixels.mapWidth, pixels.mapHeight, cell, offsetX, offsetY);
    });
    return;
  }
  // 'tint': one bar whose color tracks the mean activation.
  canvas.width = targetWidth;
  canvas.height = 8;
  ctx.fillStyle = PADDING_COLOR;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = heatColor(pixels.intensity);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

/**
 * Draw a raw dataset sample (0..1 floats, [height, width, channels] shape,
 * channels-last, 1 or 3 channels) as an image preview.
 */
export function drawSample(canvas, data, shape, scale = 3) {
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return;
  const [height, width] = shape;
  const channels = shape[2] || 1;
  canvas.width = width * scale;
  canvas.height = height * scale;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const base = (y * width + x) * channels;
      const r = Math.round(data[base] * 255);
      const g = Math.round(data[channels === 3 ? base + 1 : base] * 255);
      const b = Math.round(data[channels === 3 ? base + 2 : base] * 255);
      ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  }
}
