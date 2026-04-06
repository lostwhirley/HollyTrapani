const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const LISTINGS_FILE = path.join(__dirname, '../holly-sells-homes/listings.json');
const OUTPUT_DIR = path.join(__dirname, '../flyers/videos');
const FRAMES_DIR = path.join(__dirname, '../flyers/videos/frames');

// Video config
const W = 1080;
const H = 1920;
const FPS = 30;
const SLIDE_DURATION = 4;     // seconds per slide
const FADE_DURATION = 0.8;    // crossfade between slides

function fetchImageAsBase64(url) {
  return new Promise((resolve) => {
    if (!url) return resolve('');
    const client = url.startsWith('https') ? https : http;
    client.get(url, { timeout: 15000 }, (res) => {
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
  const first = text.split(/\n/)[0].trim();
  return first.length > 180 ? first.substring(0, 180) + '...' : first;
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Slide templates ────────────────────────────────────────────────────────────

const BASE_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${W}px; height: ${H}px;
    font-family: 'Jost', sans-serif;
    overflow: hidden; position: relative;
    background: #1a1410;
  }
  .photo-bg {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    object-fit: cover;
    display: block;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(20,14,10,0.15) 0%,
      rgba(20,14,10,0.0) 30%,
      rgba(20,14,10,0.55) 65%,
      rgba(20,14,10,0.92) 100%
    );
  }
  .content {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 80px 64px 100px;
  }
  .tag {
    font-size: 26px;
    font-weight: 500;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: #d4b8a8;
    margin-bottom: 24px;
  }
  .main-title {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 88px;
    font-weight: 600;
    font-style: italic;
    color: #fff;
    line-height: 1;
    margin-bottom: 32px;
  }
  .subtitle {
    font-size: 34px;
    font-weight: 300;
    color: rgba(255,255,255,0.75);
    letter-spacing: 0.04em;
    margin-bottom: 48px;
    line-height: 1.3;
  }
  .divider {
    width: 60px;
    height: 2px;
    background: #b08d7a;
    margin-bottom: 40px;
  }
  .price {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 72px;
    font-weight: 600;
    color: #fff;
    margin-bottom: 16px;
    line-height: 1;
  }
  .address {
    font-size: 28px;
    font-weight: 400;
    color: rgba(255,255,255,0.7);
    letter-spacing: 0.05em;
    line-height: 1.4;
  }
  .specs-row {
    display: flex;
    gap: 0;
    margin-bottom: 48px;
  }
  .spec {
    flex: 1;
    border-right: 1px solid rgba(255,255,255,0.2);
    padding: 0 32px 0 0;
    margin-right: 32px;
  }
  .spec:last-child { border-right: none; padding-right: 0; margin-right: 0; }
  .spec-val {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 80px;
    font-weight: 600;
    color: #fff;
    line-height: 1;
    display: block;
  }
  .spec-label {
    font-size: 22px;
    font-weight: 400;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: #d4b8a8;
  }
  .body-text {
    font-size: 30px;
    font-weight: 300;
    color: rgba(255,255,255,0.82);
    line-height: 1.65;
    margin-bottom: 0;
  }
  .chip-row {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 40px;
  }
  .chip {
    font-size: 22px;
    font-weight: 500;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: #d4b8a8;
    border: 1px solid rgba(212,184,168,0.4);
    padding: 10px 28px;
    border-radius: 3px;
  }
  /* Top logo bar */
  .top-bar {
    position: absolute;
    top: 0; left: 0; right: 0;
    padding: 60px 64px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .logo {
    font-family: 'Cormorant Garamond', Georgia, serif;
    font-size: 36px;
    font-weight: 500;
    font-style: italic;
    color: rgba(255,255,255,0.9);
    letter-spacing: 0.02em;
  }
  .logo-tag {
    font-size: 18px;
    font-weight: 400;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: #d4b8a8;
  }
`;

const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">`;

function slideWrapper(bodyContent) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONT_LINK}<style>${BASE_STYLES}</style></head><body>${bodyContent}</body></html>`;
}

// Slide 1: Hero — Price + Address
function slide1(photo, price, addressLine, cityState) {
  return slideWrapper(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#3d3530"></div>'}
    <div class="overlay"></div>
    <div class="top-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">For Sale</div>
      <div class="price">${price}</div>
      <div class="address">${addressLine}<br>${cityState}</div>
    </div>
  `);
}

// Slide 2: Beds / Baths / Sqft specs
function slide2(photo, beds, baths, sqft) {
  return slideWrapper(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#2c2420"></div>'}
    <div class="overlay"></div>
    <div class="top-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">Property Details</div>
      <div class="divider"></div>
      <div class="specs-row">
        <div class="spec">
          <span class="spec-val">${beds}</span>
          <span class="spec-label">Beds</span>
        </div>
        <div class="spec">
          <span class="spec-val">${baths}</span>
          <span class="spec-label">Baths</span>
        </div>
        <div class="spec">
          <span class="spec-val">${sqft}</span>
          <span class="spec-label">Sq Ft</span>
        </div>
      </div>
    </div>
  `);
}

// Slide 3: Description / highlights
function slide3(photo, highlights) {
  return slideWrapper(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#3d3530"></div>'}
    <div class="overlay"></div>
    <div class="top-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">About This Home</div>
      <div class="divider"></div>
      <div class="body-text">${highlights}</div>
    </div>
  `);
}

// Slide 4: Features chips
function slide4(photo, chips) {
  const chipHTML = chips.map(c => `<span class="chip">${c}</span>`).join('');
  return slideWrapper(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#2c2420"></div>'}
    <div class="overlay"></div>
    <div class="top-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">Highlights</div>
      <div class="divider"></div>
      <div class="chip-row">${chipHTML}</div>
    </div>
  `);
}

// Slide 5: Contact / CTA
function slide5(price, addressLine) {
  return slideWrapper(`
    <div class="photo-bg" style="background: linear-gradient(160deg, #3d3530 0%, #2c2420 50%, #1a1410 100%)"></div>
    <div class="content" style="justify-content: center; text-align: center; align-items: center; padding: 80px 64px;">
      <div class="logo" style="font-size: 60px; margin-bottom: 16px;">Holly Trapani LLC</div>
      <div class="logo-tag" style="margin-bottom: 60px;">Realtor® · William Raveis Real Estate</div>
      <div class="divider" style="margin: 0 auto 60px;"></div>
      <div class="main-title" style="font-size: 56px; margin-bottom: 24px;">${addressLine}</div>
      <div class="price" style="font-size: 56px; margin-bottom: 60px;">${price}</div>
      <div class="divider" style="margin: 0 auto 48px;"></div>
      <div class="subtitle" style="font-size: 28px; margin-bottom: 12px;">holly@hollysellshomes.com</div>
      <div class="subtitle" style="font-size: 32px; font-weight: 500; color: #d4b8a8; margin-bottom: 0;">hollysellshomes.com</div>
    </div>
  `);
}

// ── Build video for one listing ────────────────────────────────────────────────
async function buildVideo(browser, home, listingFramesDir) {
  const addr = home.location?.address;
  const desc = home.description;
  const addressLine = addr?.line || '';
  const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;
  const price = formatPrice(home.list_price);
  const beds = String(desc?.beds ?? '—');
  const baths = String(desc?.baths_consolidated ?? '—');
  const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
  const highlights = extractHighlights(desc?.text);

  const chips = [
    desc?.garage ? `${desc.garage}-Car Garage` : null,
    desc?.year_built ? `Built ${desc.year_built}` : null,
    home.hoa?.fee ? `HOA $${home.hoa.fee}/mo` : null,
    desc?.type ? desc.type.replace(/_/g, ' ') : null,
    desc?.lot_sqft ? `${(desc.lot_sqft).toLocaleString()} sqft lot` : null,
  ].filter(Boolean);

  // Fetch up to 4 photos
  const photoUrls = (home.photos || []).slice(0, 4).map(p => largePhotoUrl(p.href));
  console.log(`    Fetching ${photoUrls.length} photos...`);
  const photos = await Promise.all(photoUrls.map(fetchImageAsBase64));

  // Add FADE_DURATION to each slide except the last so xfade overlaps
  // cancel out and the final video is exactly 20 seconds.
  const slides = [
    { html: slide1(photos[0], price, addressLine, cityState), duration: 5 + FADE_DURATION },
    { html: slide2(photos[1] || photos[0], beds, baths, sqft),  duration: 4 + FADE_DURATION },
    { html: slide3(photos[2] || photos[0], highlights),          duration: 4 + FADE_DURATION },
    { html: slide4(photos[3] || photos[0], chips),               duration: 4 + FADE_DURATION },
    { html: slide5(price, addressLine),                           duration: 3 },
  ];

  fs.mkdirSync(listingFramesDir, { recursive: true });

  // Screenshot each slide
  const slidePaths = [];
  for (let i = 0; i < slides.length; i++) {
    const slidePath = path.join(listingFramesDir, `slide-${i}.png`);
    const page = await browser.newPage();
    await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
    await page.setContent(slides[i].html, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: slidePath, type: 'png' });
    await page.close();
    slidePaths.push({ path: slidePath, duration: slides[i].duration });
    console.log(`    ✓ Slide ${i + 1}`);
  }

  return slidePaths;
}

// ── ffmpeg: stitch slides with Ken Burns zoom + crossfade ─────────────────────
function renderVideo(slidePaths, outputFile, tmpDir) {
  const n = slidePaths.length;
  const clipFiles = [];

  // Step 1: render each slide PNG into a precise-duration clip with subtle zoom
  for (let i = 0; i < n; i++) {
    const { path: imgPath, duration } = slidePaths[i];
    const clipFile = path.join(tmpDir, `clip-${i}.mp4`);
    const frames = duration * FPS;
    // Very subtle zoom — tiny increment over many frames keeps motion silky smooth.
    // Zoom range 1.0–1.02 (barely visible but cinematic). Alternate in/out per slide.
    const zoomExpr = i % 2 === 0
      ? `zoom='min(zoom+0.00007,1.02)'`
      : `zoom='if(eq(on,1),1.02,max(zoom-0.00007,1.0))'`;

    execSync([
      'ffmpeg -y',
      `-loop 1 -framerate ${FPS} -t ${duration} -i "${imgPath}"`,
      `-vf "scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
        `zoompan=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},` +
        `fps=${FPS},setpts=PTS-STARTPTS"`,
      `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow`,
      `-t ${duration} -r ${FPS}`,
      `"${clipFile}"`
    ].join(' '), { stdio: 'pipe' });

    clipFiles.push(clipFile);
  }

  // Step 2: xfade chain across all clips
  const inputs = clipFiles.map(f => `-i "${f}"`).join(' ');
  const filterParts = [];
  let lastLabel = '0:v';

  for (let i = 1; i < n; i++) {
    const offset = slidePaths.slice(0, i).reduce((sum, s) => sum + s.duration, 0)
      - FADE_DURATION * i;
    const outLabel = i === n - 1 ? 'vout' : `xf${i}`;
    filterParts.push(
      `[${lastLabel}][${i}:v]xfade=transition=fade:duration=${FADE_DURATION}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    lastLabel = outLabel;
  }

  const totalDuration = slidePaths.reduce((s, c) => s + c.duration, 0) - FADE_DURATION * (n - 1);

  execSync([
    'ffmpeg -y',
    inputs,
    `-filter_complex "${filterParts.join('; ')}"`,
    `-map "[vout]"`,
    `-t ${totalDuration.toFixed(3)}`,
    `-c:v libx264 -pix_fmt yuv420p -crf 18 -preset slow`,
    `-movflags +faststart`,
    `"${outputFile}"`
  ].join(' '), { stdio: 'pipe' });

  // Cleanup clip files
  clipFiles.forEach(f => { try { fs.unlinkSync(f); } catch(_) {} });
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading listings data...');
  const raw = fs.readFileSync(LISTINGS_FILE, 'utf8');
  const data = JSON.parse(raw);
  const results = data?.data?.home_search?.results ?? [];

  if (!results.length) {
    console.error('No listings found.');
    process.exit(1);
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const result of results) {
    const home = result?.data?.home;
    if (!home) continue;

    const addrLine = home.location?.address?.line || `property-${home.property_id}`;
    const slug = slugify(addrLine);
    const outputFile = path.join(OUTPUT_DIR, `video-${slug}.mp4`);
    const listingFramesDir = path.join(FRAMES_DIR, slug);

    console.log(`\n  Listing: ${addrLine}`);

    const slidePaths = await buildVideo(browser, home, listingFramesDir);

    console.log(`    Rendering video...`);
    renderVideo(slidePaths, outputFile, listingFramesDir);
    console.log(`    ✓ Saved: video-${slug}.mp4`);
  }

  await browser.close();
  console.log(`\n✓ All videos saved to ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
