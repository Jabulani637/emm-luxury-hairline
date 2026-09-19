/**
 * Regenerates every derived image asset from its source file.
 *
 *     npm run assets
 *
 * Needs sharp, which is a devDependency on purpose: the outputs are committed,
 * so a production install (Render runs `npm install` with NODE_ENV=production,
 * which omits devDependencies) never downloads it.
 *
 * What it produces, and why:
 *   logo-mark.png        the 2000x2000 brand lockup is a photograph of a design
 *                        wrapped in an SVG, 181KB, shown at 40x40. Only the
 *                        black square inside it reads at that size, so that is
 *                        what gets cropped out.
 *   apple-touch-icon.png same crop at the 180px iOS wants, and the JSON-LD
 *                        `logo` Google asks for.
 *   <name>-{480,800,1100}.{jpg,webp}
 *                        hero slides. The originals are 130-233KB each and were
 *                        painted as CSS backgrounds, so a phone downloaded the
 *                        full-size JPEG for a 390px-wide box.
 *   payment-icons.png    one strip of the eleven footer badges, flattened on the
 *                        white they are shown against, replacing an 85KB SVG
 *                        sprite that every page linked.
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..', '..');
const ASSETS = path.join(ROOT, 'public', 'assets');
const DESIGN = path.join(ROOT, 'design');
const AD_IMAGES = path.join(ASSETS, 'ad-images');

const LOGO_SOURCE = path.join(DESIGN, 'logo-source.jpg');
// Measured from the 2000x2000 lockup: the black brand square.
const MARK = { left: 893, top: 550, width: 182, height: 182 };

// Read from design/hero/, written as variants into public/assets/ad-images/.
const HERO_SOURCES = [
  'beautiful_hair_1.jpg', 'best_seller.jpg', 'new_arrivals.jpg',
  'chatgpt_image.jpg', 'team_photo.jpg',
];
const HERO_WIDTHS = [480, 800, 1100];

// Footer order. webmoney and bancontact exist in the source sprite but are
// unused, and so is discover: its symbol there is a generic blue shopping bag,
// not the Discover card mark, and a badge that is not the brand it names is
// worse on a checkout page than one fewer badge.
const PAYMENT_ICONS = [
  'visa', 'mastercard', 'amex', 'paypal', 'applepay', 'googlepay',
  'shop', 'unionpay', 'klarna', 'maestro', 'diners',
];
const SPRITE_SOURCE = path.join(DESIGN, 'payment-sprite.svg');
const CELL = { width: 84, height: 56 }; // the CSS tile is 42x28, built at 2x

function log(name, bytes) {
  console.log(`  ${name.padEnd(34)} ${(bytes / 1024).toFixed(1)} KB`);
}

async function buildLogoMark() {
  const jpeg = fs.readFileSync(LOGO_SOURCE);
  const mark = await sharp(jpeg).extract(MARK).resize(128, 128, { kernel: 'lanczos3' })
    .png({ palette: true, colors: 128, quality: 100 }).toBuffer();
  fs.writeFileSync(path.join(ASSETS, 'logo-mark.png'), mark);
  log('assets/logo-mark.png', mark.length);

  const touch = await sharp(jpeg).extract(MARK).resize(180, 180, { kernel: 'lanczos3' })
    .png({ palette: true, colors: 160, quality: 100 }).toBuffer();
  fs.writeFileSync(path.join(ASSETS, 'apple-touch-icon.png'), touch);
  log('assets/apple-touch-icon.png', touch.length);
}

async function buildHeroVariants() {
  for (const file of HERO_SOURCES) {
    const src = path.join(DESIGN, 'hero', file);
    const md = await sharp(src).metadata();
    const base = file.replace(/\.jpe?g$/i, '');
    let emitted = 0;
    for (const target of HERO_WIDTHS) {
      const w = Math.min(target, md.width);
      if (w === emitted) continue;
      emitted = w;
      const img = () => sharp(src).resize(w, null, { withoutEnlargement: true });
      const jpg = await img().jpeg({ quality: 74, progressive: true, mozjpeg: true }).toBuffer();
      fs.writeFileSync(path.join(AD_IMAGES, `${base}-${w}.jpg`), jpg);
      const webp = await img().webp({ quality: 70, effort: 6 }).toBuffer();
      fs.writeFileSync(path.join(AD_IMAGES, `${base}-${w}.webp`), webp);
      log(`ad-images/${base}-${w}`, jpg.length + webp.length);
    }
  }
}

async function buildPaymentSheet() {
  const svg = fs.readFileSync(SPRITE_SOURCE, 'utf8');
  const symbols = {};
  const re = /<symbol\s+id="([^"]+)"[^>]*viewBox="([^"]+)"[^>]*>([\s\S]*?)<\/symbol>/g;
  let m;
  while ((m = re.exec(svg))) symbols[m[1]] = { viewBox: m[2], body: m[3] };

  const composites = [];
  for (let i = 0; i < PAYMENT_ICONS.length; i++) {
    const id = PAYMENT_ICONS[i];
    const s = symbols[id];
    if (!s) throw new Error(`sprite-source.svg has no symbol id="${id}"`);
    const [, , w, h] = s.viewBox.split(/[\s,]+/).map(Number);
    const doc = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${s.viewBox}" width="${w}" height="${h}">${s.body}</svg>`;
    const cell = await sharp(Buffer.from(doc), { density: 500 })
      .resize(CELL.width - 6, CELL.height - 6, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .ensureAlpha().png().toBuffer();
    const meta = await sharp(cell).metadata();
    composites.push({
      input: cell,
      left: i * CELL.width + Math.round((CELL.width - meta.width) / 2),
      top: Math.round((CELL.height - meta.height) / 2),
    });
  }

  // Flattened onto the tile's own white: most of these marks are drawn white or
  // near-white for dark backgrounds, and against the burgundy footer they were
  // invisible — only Visa, Amex and a few coloured ones showed. The element's
  // border-radius still clips the image, so the corners stay round.
  const sheet = await sharp({
    create: {
      width: PAYMENT_ICONS.length * CELL.width,
      height: CELL.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  }).composite(composites).png({ palette: true, colors: 256, quality: 100, compressionLevel: 9 }).toBuffer();

  fs.writeFileSync(path.join(ASSETS, 'payment-icons.png'), sheet);
  log('assets/payment-icons.png', sheet.length);
  console.log('\n  CSS positions (42px apart, in footer order):');
  console.log(PAYMENT_ICONS.map((id, i) => `    .payment-icon--${id} { background-position: -${i * 42}px 0; }`).join('\n'));
}

async function main() {
  if (!fs.existsSync(LOGO_SOURCE)) {
    console.error(`Missing ${path.relative(ROOT, LOGO_SOURCE)} — the logo lockup it is cropped from.`);
    process.exit(1);
  }
  console.log('Building assets from sources in public/assets:\n');
  await buildLogoMark();
  await buildHeroVariants();
  await buildPaymentSheet();
  console.log('\nDone. Outputs are committed; re-run this only when a source changes.');
}

main().catch(err => { console.error(err); process.exit(1); });
