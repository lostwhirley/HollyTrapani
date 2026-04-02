const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const LISTINGS_FILE = path.join(__dirname, '../holly-sells-homes/listings.json');
const OUTPUT_DIR = path.join(__dirname, '../flyers/output');

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(price);
}

// Convert small thumbnail URL to large version
function largePhotoUrl(href) {
  if (!href) return '';
  return href.replace(/s\.jpg$/, 'rd-w960_h720.jpg');
}

// Pull a short highlight snippet from the full description text
function extractHighlights(text) {
  if (!text) return '';
  // First sentence / header line tends to have the key features
  const firstChunk = text.split(/\n/)[0].trim();
  return firstChunk.length > 200 ? firstChunk.substring(0, 200) + '...' : firstChunk;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildFlyerHTML(home) {
  const addr = home.location?.address;
  const desc = home.description;
  const photos = (home.photos || []).map(p => largePhotoUrl(p.href));
  const heroPhoto = photos[0] || '';
  const thumb1 = photos[1] || photos[0] || '';
  const thumb2 = photos[2] || photos[0] || '';
  const thumb3 = photos[3] || photos[0] || '';

  const price = formatPrice(home.list_price);
  const beds = desc?.beds ?? '—';
  const baths = desc?.baths_consolidated ?? '—';
  const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
  const garage = desc?.garage ? `${desc.garage}-Car Garage` : null;
  const yearBuilt = desc?.year_built ? `Built ${desc.year_built}` : null;
  const highlights = extractHighlights(desc?.text);
  const hoaFee = home.hoa?.fee ? `HOA: $${home.hoa.fee}/mo` : null;

  const featureChips = [garage, yearBuilt, hoaFee].filter(Boolean);

  const addressLine = addr?.line || '';
  const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${addressLine} — Holly Trapani</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      width: 1056px;
      height: 816px;
      background: #ffffff;
      font-family: 'Jost', sans-serif;
      overflow: hidden;
      position: relative;
    }

    /* Thin gold border around entire page */
    .page-border {
      position: absolute;
      inset: 14px;
      border: 1.5px solid #c9a87c;
      pointer-events: none;
      z-index: 10;
    }

    .layout {
      display: flex;
      flex-direction: column;
      height: 100%;
      padding: 28px 32px 24px;
      gap: 0;
    }

    /* ── Headline ─────────────────────────────── */
    .headline {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 62px;
      font-weight: 700;
      color: #2c2420;
      line-height: 1;
      margin-bottom: 16px;
      letter-spacing: -0.01em;
    }

    /* ── Two-column body ──────────────────────── */
    .body-row {
      display: flex;
      flex: 1;
      gap: 20px;
      min-height: 0;
    }

    /* ── Left: photos ─────────────────────────── */
    .photo-col {
      flex: 0 0 620px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .hero-photo {
      flex: 1;
      background-size: cover;
      background-position: center;
      border-radius: 2px;
    }

    .thumb-row {
      display: flex;
      gap: 8px;
      height: 152px;
      flex-shrink: 0;
    }

    .thumb {
      flex: 1;
      background-size: cover;
      background-position: center;
      border-radius: 2px;
    }

    /* ── Right: details panel ─────────────────── */
    .details-panel {
      flex: 1;
      background: #f5e4d4;
      border-radius: 2px;
      padding: 24px 22px 20px;
      display: flex;
      flex-direction: column;
    }

    .panel-heading {
      font-family: 'Jost', sans-serif;
      font-size: 17px;
      font-weight: 700;
      color: #2c2420;
      margin-bottom: 14px;
      letter-spacing: 0.02em;
    }

    .panel-price {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 36px;
      font-weight: 600;
      color: #2c2420;
      margin-bottom: 14px;
      line-height: 1;
    }

    .panel-row {
      font-size: 12px;
      font-weight: 700;
      color: #2c2420;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }

    .panel-sqft {
      font-size: 13px;
      font-weight: 400;
      color: #2c2420;
      margin-bottom: 12px;
      letter-spacing: 0.01em;
    }

    .panel-features-label {
      font-size: 11px;
      font-weight: 700;
      color: #2c2420;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      margin-bottom: 5px;
    }

    .panel-features-text {
      font-size: 11px;
      color: #4a3f3a;
      line-height: 1.55;
      flex: 1;
    }

    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: 5px;
      margin-bottom: 10px;
    }

    .chip {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #7a5c46;
      background: rgba(180,130,100,0.18);
      padding: 3px 8px;
      border-radius: 2px;
    }

    .divider {
      height: 1px;
      background: #c9a87c;
      margin: 12px 0 10px;
      opacity: 0.5;
    }

    .agent-contact {
      text-align: center;
    }

    .agent-contact .agent-name {
      font-size: 13px;
      font-weight: 700;
      color: #2c2420;
      letter-spacing: 0.04em;
      margin-bottom: 3px;
    }

    .agent-contact .agent-info {
      font-size: 10.5px;
      color: #7a6e69;
      line-height: 1.7;
    }

    .address-line {
      font-size: 11.5px;
      color: #7a6e69;
      margin-bottom: 4px;
      font-weight: 400;
    }
  </style>
</head>
<body>
  <div class="page-border"></div>

  <div class="layout">
    <div class="headline">Discover Your Dream Home</div>

    <div class="body-row">
      <!-- Photos -->
      <div class="photo-col">
        <div class="hero-photo" style="background-image:url('${heroPhoto}')"></div>
        <div class="thumb-row">
          <div class="thumb" style="background-image:url('${thumb1}')"></div>
          <div class="thumb" style="background-image:url('${thumb2}')"></div>
          <div class="thumb" style="background-image:url('${thumb3}')"></div>
        </div>
      </div>

      <!-- Details panel -->
      <div class="details-panel">
        <div class="panel-heading">Property Details</div>
        <div class="address-line">${addressLine} · ${cityState}</div>
        <div class="panel-price">${price}</div>
        <div class="panel-row">Bedrooms: ${beds}</div>
        <div class="panel-row">Bathrooms: ${baths}</div>
        <div class="panel-sqft">Square Footage: ${sqft} sq ft</div>
        ${featureChips.length ? `<div class="chips">${featureChips.map(c => `<span class="chip">${c}</span>`).join('')}</div>` : ''}
        <div class="panel-features-label">Special Features</div>
        <div class="panel-features-text">${highlights}</div>
        <div class="divider"></div>
        <div class="agent-contact">
          <div class="agent-name">Holly Trapani, Realtor®</div>
          <div class="agent-info">
            William Raveis Real Estate<br>
            holly@hollysellshomes.com · hollysellshomes.com
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function generateFlyers() {
  console.log('Reading listings data...');
  const raw = fs.readFileSync(LISTINGS_FILE, 'utf8');
  const data = JSON.parse(raw);
  const results = data?.data?.home_search?.results ?? [];

  if (!results.length) {
    console.error('No listings found in listings.json');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`Generating flyers for ${results.length} listing(s) → ${OUTPUT_DIR}\n`);

  const browser = await puppeteer.launch({ headless: true });

  for (const result of results) {
    const home = result?.data?.home;
    if (!home) continue;

    const addr = home.location?.address?.line || `property-${home.property_id}`;
    const slug = slugify(addr);
    const outFile = path.join(OUTPUT_DIR, `flyer-${slug}.pdf`);

    console.log(`  Generating: ${addr}...`);
    const html = buildFlyerHTML(home);

    const page = await browser.newPage();
    await page.setViewport({ width: 1056, height: 816 });
    await page.setContent(html, { waitUntil: 'networkidle0' });

    await page.pdf({
      path: outFile,
      width: '1056px',
      height: '816px',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 }
    });

    await page.close();
    console.log(`  ✓ Saved: ${path.basename(outFile)}`);
  }

  await browser.close();
  console.log(`\n✓ All flyers generated in ${OUTPUT_DIR}`);
}

generateFlyers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
