const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const srcPath = path.join(root, 'assets', 'images', 'icon.png');
const outDir = path.join(root, 'assets', 'images', 'icons');

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const srcBuf = fs.readFileSync(srcPath);
const base = PNG.sync.read(srcBuf);
const width = base.width;
const height = base.height;

// Helper to determine if a pixel is background (#6CDCF9)
function isBgPixel(r, g, b) {
  // #6CDCF9 is ~ (108, 220, 249)
  const dr = r - 108;
  const dg = g - 220;
  const db = b - 249;
  const dist = Math.sqrt(dr * dr + dg * dg + db * db);
  return dist < 35; // Tolerance for antialiasing
}

// Generate variants
function createVariant(name, transform) {
  const outPng = new PNG({ width, height });

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      const r = base.data[idx];
      const g = base.data[idx + 1];
      const b = base.data[idx + 2];
      const a = base.data[idx + 3];

      const [nr, ng, nb, na] = transform(x, y, r, g, b, a);
      outPng.data[idx] = nr;
      outPng.data[idx + 1] = ng;
      outPng.data[idx + 2] = nb;
      outPng.data[idx + 3] = na;
    }
  }

  const outPath = path.join(outDir, `icon-${name}.png`);
  fs.writeFileSync(outPath, PNG.sync.write(outPng));
  console.log(`Generated: ${outPath}`);
}

// 1. Diwali Edition: Festive deep saffron/crimson to marigold radial background with golden bowls
createVariant('diwali', (x, y, r, g, b, a) => {
  const dx = (x - width / 2) / (width / 2);
  const dy = (y - height / 2) / (height / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (isBgPixel(r, g, b)) {
    // Radial gradient from warm festive gold/marigold center to deep royal crimson edge
    // Center: #FF8F00 (255, 143, 0), Edge: #7F0E04 (127, 14, 4)
    const factor = Math.min(1, Math.max(0, dist * 0.95));
    const bgR = Math.round(250 * (1 - factor) + 120 * factor);
    const bgG = Math.round(150 * (1 - factor) + 12 * factor);
    const bgB = Math.round(20 * (1 - factor) + 8 * factor);
    return [bgR, bgG, bgB, 255];
  }

  // Inside the logo
  return [r, g, b, a];
});

// 2. Midnight Edition: Deep obsidian night background with glowing electric bowls
createVariant('midnight', (x, y, r, g, b, a) => {
  const dx = (x - width / 2) / (width / 2);
  const dy = (y - height / 2) / (height / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (isBgPixel(r, g, b)) {
    // Dark space obsidian gradient: Center #131E2C (19, 30, 44), Edge #070B0E (7, 11, 14)
    const factor = Math.min(1, Math.max(0, dist));
    const bgR = Math.round(19 * (1 - factor) + 7 * factor);
    const bgG = Math.round(30 * (1 - factor) + 11 * factor);
    const bgB = Math.round(44 * (1 - factor) + 16 * factor);
    return [bgR, bgG, bgB, 255];
  }

  return [r, g, b, a];
});

// 3. VIP Gold Club Edition: Obsidian titanium background with luxury metallic gold bowls
createVariant('gold', (x, y, r, g, b, a) => {
  const dx = (x - width / 2) / (width / 2);
  const dy = (y - height / 2) / (height / 2);
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (isBgPixel(r, g, b)) {
    // Rich carbon-black background
    const factor = Math.min(1, Math.max(0, dist));
    const bgR = Math.round(26 * (1 - factor) + 12 * factor);
    const bgG = Math.round(24 * (1 - factor) + 10 * factor);
    const bgB = Math.round(20 * (1 - factor) + 8 * factor);
    return [bgR, bgG, bgB, 255];
  }

  // Transform logo bowls to metallic gold
  // Sun bowl (#FFD452: 255, 212, 82) -> Lustrous Bright Gold #FFE082 (255, 224, 130)
  // Lime bowl (#B4F55A: 180, 245, 90) -> Warm Amber Gold #FFB300 (255, 179, 0)
  if (g > 200 && r > 200) {
    // Bright yellow bowl
    return [255, 224, 130, a];
  }
  if (g > 200 && b < 120) {
    // Lime bowl -> Amber Gold
    return [255, 185, 24, a];
  }

  return [r, g, b, a];
});
