const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');

const LISTINGS_FILE = path.join(__dirname, '../holly-sells-homes/listings.json');
const OUTPUT_DIR = path.join(__dirname, '../flyers/output');

function fetchImageAsBase64(url) {
  return new Promise((resolve) => {
    if (!url) return resolve('');
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 10000 }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchImageAsBase64(res.headers.location).then(resolve);
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const mime = res.headers['content-type'] || 'image/jpeg';
        resolve(buf.length > 0 ? `data:${mime};base64,${buf.toString('base64')}` : '');
      });
      res.on('error', () => resolve(''));
    }).on('error', () => resolve(''));
  });
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: 0
  }).format(price);
}

function largePhotoUrl(href) {
  if (!href) return '';
  return href.replace(/s\.jpg$/, 'rd-w960_h720.jpg');
}

function extractHighlights(text) {
  if (!text) return '';
  const firstChunk = text.split(/\n/)[0].trim();
  return firstChunk.length > 220 ? firstChunk.substring(0, 220) + '...' : firstChunk;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Template 1: Landscape, hero + 3 thumbs + peach details panel ──────────────
function buildTemplate1(home, photoData) {
  const addr = home.location?.address;
  const desc = home.description;
  const [hero, t1, t2, t3] = photoData;
  const price = formatPrice(home.list_price);
  const beds = desc?.beds ?? '—';
  const baths = desc?.baths_consolidated ?? '—';
  const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
  const garage = desc?.garage ? `${desc.garage}-Car Garage` : null;
  const yearBuilt = desc?.year_built ? `Built ${desc.year_built}` : null;
  const hoaFee = home.hoa?.fee ? `HOA: $${home.hoa.fee}/mo` : null;
  const chips = [garage, yearBuilt, hoaFee].filter(Boolean);
  const highlights = extractHighlights(desc?.text);
  const addressLine = addr?.line || '';
  const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${addressLine} — Holly Trapani LLC</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600;700&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 1056px; height: 816px; background: #fff; font-family: 'Jost', sans-serif; overflow: hidden; position: relative; }
  .page-border { position: absolute; inset: 14px; border: 1.5px solid #c9a87c; pointer-events: none; z-index: 10; }
  .layout { display: flex; flex-direction: column; height: 100%; padding: 28px 32px 24px; }
  .headline { font-family: 'Cormorant Garamond', serif; font-size: 62px; font-weight: 700; color: #2c2420; line-height: 1; margin-bottom: 16px; }
  .body-row { display: flex; flex: 1; gap: 20px; min-height: 0; }
  .photo-col { flex: 0 0 620px; display: flex; flex-direction: column; gap: 8px; }
  .hero-photo { flex: 1; border-radius: 2px; overflow: hidden; min-height: 0; }
  .hero-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .thumb-row { display: flex; gap: 8px; height: 152px; flex-shrink: 0; }
  .thumb { flex: 1; border-radius: 2px; overflow: hidden; }
  .thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .details-panel { flex: 1; background: #f5e4d4; border-radius: 2px; padding: 24px 22px 20px; display: flex; flex-direction: column; }
  .panel-heading { font-size: 17px; font-weight: 700; color: #2c2420; margin-bottom: 10px; letter-spacing: 0.02em; }
  .address-line { font-size: 11px; color: #7a6e69; margin-bottom: 10px; }
  .panel-price { font-family: 'Cormorant Garamond', serif; font-size: 34px; font-weight: 600; color: #2c2420; margin-bottom: 12px; line-height: 1; }
  .panel-row { font-size: 12px; font-weight: 700; color: #2c2420; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 7px; }
  .panel-sqft { font-size: 13px; color: #2c2420; margin-bottom: 10px; }
  .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 10px; }
  .chip { font-size: 10px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: #7a5c46; background: rgba(180,130,100,0.18); padding: 3px 8px; border-radius: 2px; }
  .panel-features-label { font-size: 11px; font-weight: 700; color: #2c2420; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 5px; }
  .panel-features-text { font-size: 11px; color: #4a3f3a; line-height: 1.55; flex: 1; }
  .divider { height: 1px; background: #c9a87c; margin: 10px 0 8px; opacity: 0.5; }
  .agent-contact { text-align: center; }
  .agent-name { font-size: 13px; font-weight: 700; color: #2c2420; margin-bottom: 3px; }
  .agent-info { font-size: 10px; color: #7a6e69; line-height: 1.7; }
</style></head>
<body>
<div class="page-border"></div>
<div class="layout">
  <div class="headline">Discover Your Dream Home</div>
  <div class="body-row">
    <div class="photo-col">
      <div class="hero-photo">${hero ? `<img src="${hero}" alt="">` : ''}</div>
      <div class="thumb-row">
        <div class="thumb">${t1 ? `<img src="${t1}" alt="">` : ''}</div>
        <div class="thumb">${t2 ? `<img src="${t2}" alt="">` : ''}</div>
        <div class="thumb">${t3 ? `<img src="${t3}" alt="">` : ''}</div>
      </div>
    </div>
    <div class="details-panel">
      <div class="panel-heading">Property Details</div>
      <div class="address-line">${addressLine} · ${cityState}</div>
      <div class="panel-price">${price}</div>
      <div class="panel-row">Bedrooms: ${beds}</div>
      <div class="panel-row">Bathrooms: ${baths}</div>
      <div class="panel-sqft">Square Footage: ${sqft} sq ft</div>
      ${chips.length ? `<div class="chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>` : ''}
      <div class="panel-features-label">Special Features</div>
      <div class="panel-features-text">${highlights}</div>
      <div class="divider"></div>
      <div class="agent-contact">
        <div class="agent-name">Holly Trapani LLC, Realtor®</div>
        <div class="agent-info">New Day Realty<br>hollyfloridarealtor@gmail.com · hollytrapani.com</div>
      </div>
    </div>
  </div>
</div>
</body></html>`;
}

// ── Template 2: Portrait, diagonal angled photo, gold badge, bold headline ────
function buildTemplate2(home, photoData) {
  const addr = home.location?.address;
  const desc = home.description;
  const [hero] = photoData;
  const price = formatPrice(home.list_price);
  const beds = desc?.beds ?? '—';
  const baths = desc?.baths_consolidated ?? '—';
  const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
  const highlights = extractHighlights(desc?.text);
  const addressLine = addr?.line || '';
  const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;
  const homeType = desc?.type === 'condo' ? 'Condo' : desc?.type === 'townhome' ? 'Townhome' : 'Home';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${addressLine} — Holly Trapani LLC</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600;700&family=Jost:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 612px; height: 816px; background: #f5f0e8; font-family: 'Jost', sans-serif; overflow: hidden; position: relative; }

  /* Angled photo section */
  .photo-wrap {
    position: relative;
    height: 370px;
    overflow: hidden;
  }
  .photo-wrap img {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  /* Gold diagonal overlay at bottom */
  .photo-wrap::after {
    content: '';
    position: absolute;
    bottom: -1px; left: -1px; right: -1px;
    height: 90px;
    background: #f5f0e8;
    clip-path: polygon(0 60%, 100% 0%, 100% 100%, 0% 100%);
  }

  /* Price badge */
  .price-badge {
    position: absolute;
    top: 24px; left: 24px;
    background: #b5973a;
    color: #fff;
    padding: 12px 16px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    line-height: 1.4;
    clip-path: polygon(0 0, 100% 0, 100% 80%, 90% 100%, 0 100%);
    z-index: 2;
  }
  .price-badge .amount { font-size: 20px; display: block; margin-top: 2px; letter-spacing: 0; }

  /* Content */
  .content { padding: 12px 36px 24px; }
  .sub-label { font-size: 10px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #b5973a; margin-bottom: 6px; }
  .main-title { font-family: 'Jost', sans-serif; font-size: 48px; font-weight: 900; color: #1a1410; line-height: 1; text-transform: uppercase; margin-bottom: 4px; }
  .sub-title { font-size: 16px; font-weight: 400; letter-spacing: 0.15em; text-transform: uppercase; color: #5a4f4a; margin-bottom: 16px; }
  .address { font-size: 12px; color: #7a6e69; margin-bottom: 14px; }
  .description { font-size: 11px; color: #5a4f4a; line-height: 1.6; margin-bottom: 16px; border-left: 2px solid #b5973a; padding-left: 12px; }
  .specs { display: flex; gap: 0; margin-bottom: 20px; border: 1px solid #ddd0c0; }
  .spec { flex: 1; padding: 10px 8px; text-align: center; border-right: 1px solid #ddd0c0; }
  .spec:last-child { border-right: none; }
  .spec-val { font-size: 18px; font-weight: 700; color: #1a1410; display: block; }
  .spec-label { font-size: 9px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: #9a8e89; }
  .divider { height: 1px; background: #ddd0c0; margin-bottom: 16px; }
  .agent { display: flex; align-items: center; justify-content: space-between; }
  .agent-name { font-size: 13px; font-weight: 700; color: #1a1410; }
  .agent-info { font-size: 10px; color: #7a6e69; line-height: 1.7; }
  .agent-contact { text-align: right; font-size: 10px; color: #7a6e69; line-height: 1.7; }
</style></head>
<body>
  <div class="photo-wrap">
    ${hero ? `<img src="${hero}" alt="">` : '<div style="background:#c9a87c;width:100%;height:100%"></div>'}
    <div class="price-badge">Price<span class="amount">${price}</span></div>
  </div>
  <div class="content">
    <div class="sub-label">New &amp; Modern</div>
    <div class="main-title">Elegant ${homeType}</div>
    <div class="sub-title">For Sale</div>
    <div class="address">${addressLine} · ${cityState}</div>
    <div class="description">${highlights}</div>
    <div class="specs">
      <div class="spec"><span class="spec-val">${beds}</span><span class="spec-label">Beds</span></div>
      <div class="spec"><span class="spec-val">${baths}</span><span class="spec-label">Baths</span></div>
      <div class="spec"><span class="spec-val">${sqft}</span><span class="spec-label">Sq Ft</span></div>
    </div>
    <div class="divider"></div>
    <div class="agent">
      <div>
        <div class="agent-name">Holly Trapani LLC, Realtor®</div>
        <div class="agent-info">New Day Realty</div>
      </div>
      <div class="agent-contact">hollyfloridarealtor@gmail.com<br>hollytrapani.com</div>
    </div>
  </div>
</body></html>`;
}

// ── Template 3: Portrait, bold orange background, diamond photo, modern ───────
function buildTemplate3(home, photoData) {
  const addr = home.location?.address;
  const desc = home.description;
  const [hero] = photoData;
  const price = formatPrice(home.list_price);
  const beds = desc?.beds ?? '—';
  const baths = desc?.baths_consolidated ?? '—';
  const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
  const addressLine = addr?.line || '';
  const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${addressLine} — Holly Trapani LLC</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600;700;900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 612px; height: 816px; background: #e8e5e2; font-family: 'Jost', sans-serif; overflow: hidden; display: flex; flex-direction: column; }

  .top-section { flex: 0 0 auto; padding: 36px 36px 20px; }
  .top-label { font-size: 11px; font-weight: 600; letter-spacing: 0.2em; text-transform: uppercase; color: #9a8e89; margin-bottom: 8px; }
  .top-title { font-size: 44px; font-weight: 900; color: #2c2420; text-transform: uppercase; line-height: 1; margin-bottom: 6px; }
  .top-sub { font-size: 18px; font-weight: 400; letter-spacing: 0.12em; text-transform: uppercase; color: #5a4f4a; margin-bottom: 0; }

  /* Diamond/chevron photo */
  .photo-section {
    flex: 0 0 260px;
    position: relative;
    overflow: hidden;
  }
  .photo-section img {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  /* Top chevron cut */
  .photo-section::before {
    content: '';
    position: absolute;
    top: -1px; left: -1px; right: -1px;
    height: 60px;
    background: #e8e5e2;
    clip-path: polygon(0 0, 50% 100%, 100% 0);
    z-index: 2;
  }
  /* Bottom chevron cut */
  .photo-section::after {
    content: '';
    position: absolute;
    bottom: -1px; left: -1px; right: -1px;
    height: 60px;
    background: #e8e5e2;
    clip-path: polygon(0 100%, 50% 0, 100% 100%);
    z-index: 2;
  }

  /* Price overlay on photo */
  .price-overlay {
    position: absolute;
    bottom: 20px; left: 50%; transform: translateX(-50%);
    z-index: 3;
    text-align: center;
    background: rgba(60,45,40,0.82);
    padding: 6px 20px;
    border-radius: 2px;
  }
  .price-label { font-size: 9px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.75); }
  .price-amount { font-size: 22px; font-weight: 700; color: #fff; display: block; line-height: 1.1; }

  .bottom-section { flex: 1; padding: 30px 36px 28px; display: flex; flex-direction: column; justify-content: space-between; }

  .specs { display: flex; gap: 12px; justify-content: center; margin-bottom: 16px; }
  .spec { text-align: center; background: rgba(255,255,255,0.6); padding: 10px 20px; border-radius: 2px; border: 1px solid #d4cfc9; }
  .spec-val { font-size: 22px; font-weight: 700; color: #2c2420; display: block; line-height: 1; }
  .spec-label { font-size: 9px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #9a8e89; }

  .address { text-align: center; font-size: 12px; color: #7a6e69; margin-bottom: 16px; }

  .agent-row { display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .agent-name { font-size: 13px; font-weight: 700; color: #2c2420; letter-spacing: 0.05em; }
  .agent-info { font-size: 10px; color: #7a6e69; letter-spacing: 0.04em; }
  .website { font-size: 11px; font-weight: 600; letter-spacing: 0.15em; text-transform: uppercase; color: #b08d7a; margin-top: 4px; }
</style></head>
<body>
  <div class="top-section">
    <div class="top-label">Modern House</div>
    <div class="top-title">For Sale</div>
    <div class="top-sub">${addressLine}</div>
  </div>

  <div class="photo-section">
    ${hero ? `<img src="${hero}" alt="">` : '<div style="background:#c0bbb6;width:100%;height:100%"></div>'}
    <div class="price-overlay">
      <span class="price-label">Price Start From</span>
      <span class="price-amount">${price}</span>
    </div>
  </div>

  <div class="bottom-section">
    <div>
      <div class="specs">
        <div class="spec"><span class="spec-val">${beds}</span><span class="spec-label">Beds</span></div>
        <div class="spec"><span class="spec-val">${baths}</span><span class="spec-label">Baths</span></div>
        <div class="spec"><span class="spec-val">${sqft}</span><span class="spec-label">Sq Ft</span></div>
      </div>
      <div class="address">${cityState}</div>
    </div>
    <div class="agent-row">
      <div class="agent-name">Holly Trapani LLC, Realtor®</div>
      <div class="agent-info">New Day Realty · hollyfloridarealtor@gmail.com</div>
      <div class="website">hollytrapani.com</div>
    </div>
  </div>
</body></html>`;
}

// ── Template 4: Portrait, olive headline, diagonal hero, hexagon photos, icon features ──
function buildTemplate4(home, photoData) {
  const addr = home.location?.address;
  const desc = home.description;
  const [hero, hex1, hex2, hex3] = photoData;
  const price = formatPrice(home.list_price);
  const beds = desc?.beds ?? '—';
  const baths = desc?.baths_consolidated ?? '—';
  const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
  const highlights = extractHighlights(desc?.text);
  const addressLine = addr?.line || '';
  const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<title>${addressLine} — Holly Trapani LLC</title>
<link href="https://fonts.googleapis.com/css2?family=Jost:ital,wght@0,400;0,600;0,700;0,900;1,900&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { width: 612px; height: 816px; background: #fff; font-family: 'Jost', sans-serif; overflow: hidden; }

  /* ── Top section: headline left, hex photos right ── */
  .top { display: flex; height: 300px; }

  .top-left {
    flex: 0 0 340px;
    padding: 28px 20px 20px 28px;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
  }
  .headline {
    font-size: 36px;
    font-weight: 900;
    font-style: italic;
    color: #6b5e1e;
    text-transform: uppercase;
    line-height: 1.05;
    margin-bottom: 10px;
  }
  .price {
    font-size: 20px;
    font-weight: 700;
    color: #2c2420;
  }

  .top-right {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 10px 10px 0;
    align-items: flex-end;
  }

  /* Hexagon-style clips */
  .hex-photo {
    width: 180px;
    height: 134px;
    overflow: hidden;
    clip-path: polygon(8% 0%, 92% 0%, 100% 50%, 92% 100%, 8% 100%, 0% 50%);
  }
  .hex-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }

  /* ── Middle: large hero with diagonal clip ── */
  .hero-section {
    position: relative;
    height: 260px;
    overflow: hidden;
  }
  .hero-section img {
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  /* Diagonal cut on right side — matches the template */
  .hero-section::after {
    content: '';
    position: absolute;
    top: 0; right: -1px; bottom: -1px;
    width: 140px;
    background: #fff;
    clip-path: polygon(40% 0, 100% 0, 100% 100%, 0% 100%);
  }

  /* ── Bottom: features left, dark panel right ── */
  .bottom { display: flex; height: 256px; }

  .features {
    flex: 0 0 340px;
    padding: 20px 16px 16px 28px;
  }
  .features-title {
    font-size: 18px;
    font-weight: 900;
    font-style: italic;
    color: #2c2420;
    margin-bottom: 14px;
  }
  .icon-row {
    display: flex;
    gap: 12px;
    margin-bottom: 16px;
    align-items: flex-start;
  }
  .icon-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    flex: 1;
  }
  .icon-circle {
    width: 44px; height: 44px;
    border: 2px solid #2c2420;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .icon-circle svg { width: 22px; height: 22px; stroke: #2c2420; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .icon-label { font-size: 10px; font-weight: 600; color: #2c2420; text-align: center; line-height: 1.3; }

  .contact-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 4px;
  }
  .contact-icon { width: 28px; height: 28px; stroke: #6b5e1e; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .contact-text { font-size: 16px; font-weight: 700; color: #2c2420; }

  .dark-panel {
    flex: 1;
    background: #2c2420;
    padding: 20px 18px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    clip-path: polygon(12% 0%, 100% 0%, 100% 100%, 0% 100%);
  }
  .dark-panel .desc {
    font-size: 11px;
    color: rgba(255,255,255,0.85);
    line-height: 1.65;
    margin-bottom: 14px;
    padding-left: 14px;
  }
  .dark-panel .agent {
    font-size: 10px;
    color: rgba(255,255,255,0.6);
    line-height: 1.7;
    padding-left: 14px;
  }
  .dark-panel .agent strong {
    color: #fff;
    font-size: 11px;
    display: block;
    margin-bottom: 2px;
  }
</style></head>
<body>

  <!-- TOP -->
  <div class="top">
    <div class="top-left">
      <div class="headline">Find Comfort in Every Corner</div>
      <div class="price">Starts at ${price}</div>
    </div>
    <div class="top-right">
      <div class="hex-photo">${hex1 ? `<img src="${hex1}" alt="">` : ''}</div>
      <div class="hex-photo">${hex2 ? `<img src="${hex2}" alt="">` : ''}</div>
    </div>
  </div>

  <!-- HERO -->
  <div class="hero-section">
    ${hero ? `<img src="${hero}" alt="">` : ''}
  </div>

  <!-- BOTTOM -->
  <div class="bottom">
    <div class="features">
      <div class="features-title">Features:</div>
      <div class="icon-row">
        <div class="icon-box">
          <div class="icon-circle">
            <svg viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
          </div>
          <span class="icon-label">${addressLine}<br>${cityState}</span>
        </div>
        <div class="icon-box">
          <div class="icon-circle">
            <svg viewBox="0 0 24 24"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
          </div>
          <span class="icon-label">${sqft} sqft</span>
        </div>
        <div class="icon-box">
          <div class="icon-circle">
            <svg viewBox="0 0 24 24"><path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/></svg>
          </div>
          <span class="icon-label">${beds} Bedrooms</span>
        </div>
        <div class="icon-box">
          <div class="icon-circle">
            <svg viewBox="0 0 24 24"><path d="M9 6 6.5 3.5a1.5 1.5 0 0 0-1-.5C4.683 3 4 3.683 4 4.5V17a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/><line x1="10" y1="5" x2="8" y2="7"/><line x1="2" y1="12" x2="22" y2="12"/></svg>
          </div>
          <span class="icon-label">${baths} Bathrooms</span>
        </div>
      </div>
      <div class="contact-row">
        <svg class="contact-icon" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.39 2 2 0 0 1 3.6 1.21h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.79a16 16 0 0 0 6.29 6.29l.95-.95a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
        <span class="contact-text">hollytrapani.com</span>
      </div>
    </div>

    <div class="dark-panel">
      <div class="desc">${highlights}</div>
      <div class="agent">
        <strong>Holly Trapani LLC, Realtor®</strong>
        New Day Realty<br>
        hollyfloridarealtor@gmail.com
      </div>
    </div>
  </div>

</body></html>`;
}

function buildIndexHTML(listings) {
  const rows = listings.map(home => {
    const addr = home.location?.address;
    const addressLine = addr?.line || '';
    const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;
    const slug = slugify(addressLine || `property-${home.property_id}`);

    const templates = [
      { label: 'Style 1 — Classic', file: `flyer-${slug}-1.pdf` },
      { label: 'Style 2 — Elegant', file: `flyer-${slug}-2.pdf` },
      { label: 'Style 3 — Modern',  file: `flyer-${slug}-3.pdf` },
      { label: 'Style 4 — Comfort', file: `flyer-${slug}-4.pdf` },
    ];

    const pdfLinks = templates.map(t => `
      <a class="flyer-link" href="output/${t.file}" target="_blank">
        <span class="flyer-style">${t.label}</span>
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </a>`).join('');

    const videoFile = `video-${slug}.mp4`;

    return `
      <div class="flyer-item">
        <div class="flyer-info">
          <span class="flyer-address">${addressLine}</span>
          <span class="flyer-city">${cityState}</span>
        </div>
        <div class="flyer-links">
          ${pdfLinks}
          <a class="flyer-link video-link" href="videos/${videoFile}" target="_blank">
            <span class="flyer-style">Facebook Video</span>
            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </a>
          <a class="flyer-link youtube-link" href="youtube/youtube-${slug}.mp4" target="_blank">
            <span class="flyer-style">YouTube Video</span>
            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
          </a>
        </div>
      </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Property Flyers — Holly Trapani LLC</title>
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;1,400&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    :root { --primary:#3d3530;--accent:#b08d7a;--accent-soft:#d4b8a8;--light:#f5f0eb;--cream:#faf7f4;--white:#fff;--border:#e8ddd7;--muted:#7a6e69; }
    body { background:var(--cream); font-family:'Jost',sans-serif; color:var(--primary); min-height:100vh; }
    header { border-bottom:1.5px solid var(--accent-soft); padding:32px 48px 24px; display:flex; justify-content:space-between; align-items:flex-end; }
    .tagline { font-size:10px; font-weight:500; letter-spacing:0.18em; text-transform:uppercase; color:var(--accent); margin-bottom:6px; }
    .name { font-family:'Cormorant Garamond',serif; font-size:32px; font-weight:500; font-style:italic; }
    .header-right { text-align:right; font-size:11px; color:var(--muted); line-height:1.8; }
    main { max-width:960px; margin:0 auto; padding:48px 24px 72px; }
    .section-title { font-family:'Cormorant Garamond',serif; font-size:26px; font-weight:400; font-style:italic; margin-bottom:28px; }
    .flyer-item { background:var(--white); border:1px solid var(--border); padding:20px 24px; margin-bottom:2px; }
    .flyer-item:first-child { border-radius:4px 4px 0 0; }
    .flyer-item:last-child { border-radius:0 0 4px 4px; margin-bottom:0; }
    .flyer-info { margin-bottom:12px; }
    .flyer-address { font-size:14px; font-weight:500; display:block; margin-bottom:2px; }
    .flyer-city { font-size:11px; color:var(--muted); }
    .flyer-links { display:flex; gap:8px; flex-wrap:wrap; }
    .flyer-link { display:flex; align-items:center; gap:6px; padding:7px 14px; border:1px solid var(--border); border-radius:3px; text-decoration:none; color:var(--accent); font-size:11px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; transition:background 0.2s, border-color 0.2s; }
    .flyer-link:hover { background:var(--light); border-color:var(--accent-soft); }
    .flyer-link svg { width:13px; height:13px; fill:none; stroke:var(--accent); stroke-width:2; stroke-linecap:round; stroke-linejoin:round; }
    .video-link { background:var(--primary); color:#fff; border-color:var(--primary); }
    .video-link svg { stroke:#fff; fill:#fff; }
    .video-link .flyer-style { color:#fff; }
    .video-link:hover { background:#2c2420; border-color:#2c2420; }
    .youtube-link { background:#cc0000; color:#fff; border-color:#cc0000; }
    .youtube-link svg { stroke:#fff; fill:#fff; }
    .youtube-link .flyer-style { color:#fff; }
    .youtube-link:hover { background:#aa0000; border-color:#aa0000; }
    footer { border-top:1.5px solid var(--accent-soft); padding:20px 48px; text-align:center; font-size:11px; color:var(--muted); }
    footer a { color:var(--accent); text-decoration:none; }
  </style>
</head>
<body>
  <header>
    <div>
      <div class="tagline">Property Flyers</div>
      <div class="name">Holly Trapani LLC</div>
    </div>
    <div class="header-right">Holly Trapani LLC, Realtor®<br>New Day Realty<br>hollyfloridarealtor@gmail.com</div>
  </header>
  <main>
    <div class="section-title">Active Listing Flyers</div>
    ${rows}
  </main>
  <footer><a href="https://www.hollytrapani.com/">hollytrapani.com</a></footer>
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

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const templates = [
    { name: '1', build: buildTemplate1, width: '1056px', height: '816px' },
    { name: '2', build: buildTemplate2, width: '612px',  height: '816px' },
    { name: '3', build: buildTemplate3, width: '612px',  height: '816px' },
    { name: '4', build: buildTemplate4, width: '612px',  height: '816px' },
  ];

  for (const result of results) {
    const home = result?.data?.home;
    if (!home) continue;

    const addr = home.location?.address?.line || `property-${home.property_id}`;
    const slug = slugify(addr);
    console.log(`  Listing: ${addr}`);

    // Fetch photos once per listing (4 for template 1, 1 for 2 & 3)
    const photoUrls = (home.photos || []).slice(0, 4).map(p => largePhotoUrl(p.href));
    console.log(`    Fetching ${photoUrls.length} photos...`);
    const photoData = await Promise.all(photoUrls.map(fetchImageAsBase64));

    for (const tpl of templates) {
      const outFile = path.join(OUTPUT_DIR, `flyer-${slug}-${tpl.name}.pdf`);
      const html = tpl.build(home, photoData);

      const page = await browser.newPage();
      await page.setViewport({ width: parseInt(tpl.width), height: parseInt(tpl.height) });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.pdf({
        path: outFile,
        width: tpl.width,
        height: tpl.height,
        printBackground: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 }
      });
      await page.close();
      console.log(`    ✓ Style ${tpl.name}: ${path.basename(outFile)}`);
    }
  }

  await browser.close();
  console.log(`\n✓ All flyers generated in ${OUTPUT_DIR}`);

  // Regenerate index
  const homes = results.map(r => r?.data?.home).filter(Boolean);
  const indexHTML = buildIndexHTML(homes);
  const indexFile = path.join(__dirname, '../flyers/index.html');
  fs.writeFileSync(indexFile, indexHTML);
  console.log(`✓ Index updated: ${indexFile}`);
}

generateFlyers().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
