const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const LISTINGS_FILE = path.join(__dirname, '../holly-sells-homes/all-listings.json');
const OUTPUT_FILE = path.join(__dirname, 'flyer.pdf');

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price);
}

function getStatusBadge(flags) {
  if (flags.is_pending) return { label: 'Pending', color: '#b08d7a' };
  if (flags.is_new_listing) return { label: 'New Listing', color: '#6a8f72' };
  if (flags.is_price_reduced) return { label: 'Price Reduced', color: '#a06060' };
  return null;
}

function buildHTML(listings) {
  const cards = listings.map(listing => {
    const photo = listing.primary_photo?.href || listing.photos?.[0]?.href || '';
    const addr = listing.location?.address;
    const desc = listing.description;
    const badge = getStatusBadge(listing.flags || {});

    const addressLine = addr?.line || '';
    const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;
    const price = formatPrice(listing.list_price);
    const beds = desc?.beds ?? '—';
    const baths = desc?.baths_consolidated ?? '—';
    const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';

    const badgeHTML = badge
      ? `<span class="badge" style="background:${badge.color}">${badge.label}</span>`
      : '';

    return `
      <div class="card">
        <div class="card-photo" style="background-image:url('${photo}')">
          ${badgeHTML}
        </div>
        <div class="card-body">
          <div class="card-price">${price}</div>
          <div class="card-address">${addressLine}</div>
          <div class="card-city">${cityState}</div>
          <div class="card-details">
            <span>${beds} bed</span>
            <span class="dot">·</span>
            <span>${baths} bath</span>
            <span class="dot">·</span>
            <span>${sqft} sqft</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Holly Trapani LLC — Active Listings</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --primary: #3d3530;
      --accent: #b08d7a;
      --accent-soft: #d4b8a8;
      --dark: #2c2420;
      --light: #f5f0eb;
      --cream: #faf7f4;
      --white: #ffffff;
      --gray: #a89d98;
      --border: #e8ddd7;
      --text-muted: #7a6e69;
    }

    body {
      background: var(--cream);
      font-family: 'Jost', sans-serif;
      color: var(--primary);
      width: 816px;
      min-height: 1056px;
      padding: 48px 52px 40px;
    }

    /* ── Header ───────────────────────────────────────── */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      border-bottom: 1.5px solid var(--accent-soft);
      padding-bottom: 20px;
      margin-bottom: 32px;
    }

    .header-left .tagline {
      font-family: 'Jost', sans-serif;
      font-size: 10px;
      font-weight: 500;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--accent);
      margin-bottom: 6px;
    }

    .header-left .name {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 34px;
      font-weight: 500;
      font-style: italic;
      color: var(--primary);
      line-height: 1;
    }

    .header-right {
      text-align: right;
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.7;
      font-weight: 400;
    }

    .header-right strong {
      display: block;
      font-weight: 600;
      color: var(--primary);
      font-size: 12px;
      letter-spacing: 0.04em;
    }

    /* ── Section title ────────────────────────────────── */
    .section-title {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 22px;
      font-weight: 400;
      font-style: italic;
      color: var(--primary);
      margin-bottom: 20px;
      letter-spacing: 0.01em;
    }

    /* ── Listing grid ─────────────────────────────────── */
    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 20px;
      margin-bottom: 36px;
    }

    .card {
      background: var(--white);
      border-radius: 4px;
      overflow: hidden;
      border: 1px solid var(--border);
    }

    .card-photo {
      height: 190px;
      background-size: cover;
      background-position: center;
      position: relative;
    }

    .badge {
      position: absolute;
      top: 10px;
      left: 10px;
      color: #fff;
      font-family: 'Jost', sans-serif;
      font-size: 9px;
      font-weight: 600;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 2px;
    }

    .card-body {
      padding: 16px 18px 18px;
    }

    .card-price {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 24px;
      font-weight: 600;
      color: var(--primary);
      margin-bottom: 4px;
      line-height: 1;
    }

    .card-address {
      font-size: 13px;
      font-weight: 500;
      color: var(--dark);
      margin-bottom: 2px;
    }

    .card-city {
      font-size: 11.5px;
      color: var(--text-muted);
      margin-bottom: 10px;
    }

    .card-details {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      color: var(--gray);
      font-weight: 500;
      letter-spacing: 0.04em;
      border-top: 1px solid var(--border);
      padding-top: 10px;
    }

    .dot {
      color: var(--accent-soft);
    }

    /* ── Footer ───────────────────────────────────────── */
    .footer {
      border-top: 1.5px solid var(--accent-soft);
      padding-top: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .footer-left {
      font-family: 'Cormorant Garamond', Georgia, serif;
      font-size: 18px;
      font-style: italic;
      color: var(--accent);
    }

    .footer-right {
      font-size: 10px;
      color: var(--text-muted);
      text-align: right;
      line-height: 1.8;
      letter-spacing: 0.04em;
    }

    .footer-right a {
      color: var(--accent);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <header class="header">
    <div class="header-left">
      <div class="tagline">Current Listings</div>
      <div class="name">Holly Trapani LLC</div>
    </div>
    <div class="header-right">
      <strong>Holly Trapani LLC, Realtor®</strong>
      New Day Realty<br>
      Naples &amp; Ave Maria, FL<br>
      holly@hollysellshomes.com
    </div>
  </header>

  <div class="section-title">Active Properties for Sale</div>

  <div class="grid">
    ${cards}
  </div>

  <footer class="footer">
    <div class="footer-left">hollysellshomes.com</div>
    <div class="footer-right">
      All listings are subject to change. Contact Holly for current availability.<br>
      <a href="https://hollysellshomes.com">hollysellshomes.com</a>
    </div>
  </footer>
</body>
</html>`;
}

async function generateFlyer() {
  console.log('Reading listings data...');
  const raw = fs.readFileSync(LISTINGS_FILE, 'utf8');
  const data = JSON.parse(raw);
  const listings = data?.data?.home_search?.results ?? [];

  if (!listings.length) {
    console.error('No listings found in all-listings.json');
    process.exit(1);
  }

  console.log(`Found ${listings.length} listing(s)`);

  const html = buildHTML(listings);

  // Optionally save the HTML for inspection
  const htmlFile = path.join(__dirname, 'flyer.html');
  fs.writeFileSync(htmlFile, html);
  console.log(`HTML written to ${htmlFile}`);

  console.log('Launching Puppeteer...');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();

  await page.setContent(html, { waitUntil: 'networkidle0' });

  await page.pdf({
    path: OUTPUT_FILE,
    width: '816px',
    height: '1056px',
    printBackground: true,
    margin: { top: 0, right: 0, bottom: 0, left: 0 }
  });

  await browser.close();
  console.log(`✓ Flyer saved to ${OUTPUT_FILE}`);
}

generateFlyer().catch(err => {
  console.error('Error generating flyer:', err);
  process.exit(1);
});
