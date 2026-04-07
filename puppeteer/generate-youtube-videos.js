const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const http = require('http');
const { execSync } = require('child_process');

const LISTINGS_FILE = path.join(__dirname, '../holly-sells-homes/listings.json');
const OUTPUT_DIR = path.join(__dirname, '../flyers/youtube');
const FRAMES_DIR = path.join(__dirname, '../flyers/youtube/frames');

const W = 1920;
const H = 1080;
const FPS = 30;
const FADE_DURATION = 0.6;

// Total target: 90 seconds
// Intro: 5s, Specs: 5s, Description: 7s, Features: 5s, Contact: 8s = 30s fixed
// Photo slideshow: 60s
const PHOTO_SLIDE_DURATION = 2.0; // seconds per photo
const MAX_PHOTOS = 30;

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

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

// ── Shared styles ──────────────────────────────────────────────────────────────
const FONT_LINK = `<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500;1,600&family=Jost:wght@300;400;500;600;700&display=swap" rel="stylesheet">`;

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    width: ${W}px; height: ${H}px;
    font-family: 'Jost', sans-serif;
    overflow: hidden; position: relative;
    background: #1a1410;
  }
  .photo-bg {
    position: absolute; inset: 0;
    width: 100%; height: 100%; object-fit: cover; display: block;
  }
  .overlay {
    position: absolute; inset: 0;
    background: linear-gradient(
      to right,
      rgba(20,14,10,0.88) 0%,
      rgba(20,14,10,0.5) 45%,
      rgba(20,14,10,0.15) 100%
    );
  }
  .overlay-bottom {
    position: absolute; inset: 0;
    background: linear-gradient(
      to bottom,
      rgba(20,14,10,0.0) 0%,
      rgba(20,14,10,0.7) 100%
    );
  }
  .content {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    justify-content: center;
    padding: 60px 90px;
  }
  .logo-bar {
    position: absolute; top: 48px; left: 90px; right: 90px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .logo {
    font-family: 'Cormorant Garamond', serif;
    font-size: 28px; font-weight: 500; font-style: italic;
    color: rgba(255,255,255,0.9); letter-spacing: 0.02em;
  }
  .logo-tag {
    font-size: 13px; font-weight: 500; letter-spacing: 0.2em;
    text-transform: uppercase; color: #d4b8a8;
  }
  .tag {
    font-size: 13px; font-weight: 600; letter-spacing: 0.22em;
    text-transform: uppercase; color: #d4b8a8; margin-bottom: 20px;
  }
  .divider {
    width: 50px; height: 2px; background: #b08d7a; margin-bottom: 28px;
  }
  .main-title {
    font-family: 'Cormorant Garamond', serif;
    font-size: 72px; font-weight: 600; font-style: italic;
    color: #fff; line-height: 1.05; margin-bottom: 20px;
  }
  .subtitle {
    font-size: 26px; font-weight: 300;
    color: rgba(255,255,255,0.72); letter-spacing: 0.04em; line-height: 1.4;
  }
  .price {
    font-family: 'Cormorant Garamond', serif;
    font-size: 60px; font-weight: 600;
    color: #fff; line-height: 1; margin-bottom: 18px;
  }
  .address {
    font-size: 24px; font-weight: 400;
    color: rgba(255,255,255,0.7); letter-spacing: 0.04em;
  }
  .specs-grid {
    display: grid; grid-template-columns: repeat(3, auto);
    gap: 40px 60px; margin-bottom: 0; width: fit-content;
  }
  .spec-val {
    font-family: 'Cormorant Garamond', serif;
    font-size: 72px; font-weight: 600; color: #fff;
    line-height: 1; display: block;
  }
  .spec-label {
    font-size: 14px; font-weight: 500; letter-spacing: 0.18em;
    text-transform: uppercase; color: #d4b8a8;
  }
  .body-text {
    font-size: 24px; font-weight: 300;
    color: rgba(255,255,255,0.85); line-height: 1.75; max-width: 820px;
  }
  .chip-row { display: flex; flex-wrap: wrap; gap: 14px; }
  .chip {
    font-size: 15px; font-weight: 500; letter-spacing: 0.1em;
    text-transform: uppercase; color: #d4b8a8;
    border: 1px solid rgba(212,184,168,0.4);
    padding: 10px 26px; border-radius: 3px;
  }
`;

function wrap(body) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${FONT_LINK}<style>${BASE_CSS}</style></head><body>${body}</body></html>`;
}

// ── Static slides ──────────────────────────────────────────────────────────────

function slideIntro(photo, price, addressLine, cityState) {
  return wrap(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#3d3530"></div>'}
    <div class="overlay"></div>
    <div class="logo-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor® · New Day Realty</span>
    </div>
    <div class="content">
      <div class="tag">Featured Listing</div>
      <div class="divider"></div>
      <div class="main-title">${addressLine}</div>
      <div class="price">${price}</div>
      <div class="address">${cityState}</div>
    </div>
  `);
}

function slidePhoto(photo) {
  return wrap(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#2c2420"></div>'}
    <div class="overlay-bottom"></div>
    <div class="logo-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">hollysellshomes.com</span>
    </div>
  `);
}

function slideSpecs(photo, beds, baths, sqft, garage, yearBuilt) {
  const extras = [
    garage ? `${garage}-Car Garage` : null,
    yearBuilt ? `Built ${yearBuilt}` : null,
  ].filter(Boolean);

  return wrap(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#2c2420"></div>'}
    <div class="overlay"></div>
    <div class="logo-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">Property Details</div>
      <div class="divider"></div>
      <div class="specs-grid">
        <div><span class="spec-val">${beds}</span><span class="spec-label">Bedrooms</span></div>
        <div><span class="spec-val">${baths}</span><span class="spec-label">Bathrooms</span></div>
        <div><span class="spec-val">${sqft}</span><span class="spec-label">Sq Ft</span></div>
      </div>
      ${extras.length ? `<div class="chip-row" style="margin-top:36px">${extras.map(e => `<span class="chip">${e}</span>`).join('')}</div>` : ''}
    </div>
  `);
}

function slideDescription(photo, text) {
  return wrap(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#3d3530"></div>'}
    <div class="overlay"></div>
    <div class="logo-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">About This Home</div>
      <div class="divider"></div>
      <div class="body-text">${text}</div>
    </div>
  `);
}

function slideFeatures(photo, chips) {
  return wrap(`
    ${photo ? `<img class="photo-bg" src="${photo}" alt="">` : '<div class="photo-bg" style="background:#2c2420"></div>'}
    <div class="overlay"></div>
    <div class="logo-bar">
      <span class="logo">Holly Trapani LLC</span>
      <span class="logo-tag">Realtor®</span>
    </div>
    <div class="content">
      <div class="tag">Highlights</div>
      <div class="divider"></div>
      <div class="chip-row">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</div>
    </div>
  `);
}

function slideContact(price, addressLine) {
  return wrap(`
    <div class="photo-bg" style="background: linear-gradient(135deg, #3d3530 0%, #2c2420 50%, #1a1410 100%)"></div>
    <div class="content" style="align-items:center; text-align:center; justify-content:center;">
      <div class="logo" style="font-size:52px; margin-bottom:12px;">Holly Trapani LLC</div>
      <div class="logo-tag" style="margin-bottom:48px;">Realtor® · New Day Realty</div>
      <div class="divider" style="margin:0 auto 48px;"></div>
      <div class="main-title" style="font-size:44px; margin-bottom:16px;">${addressLine}</div>
      <div class="price" style="font-size:48px; margin-bottom:48px;">${price}</div>
      <div class="divider" style="margin:0 auto 40px;"></div>
      <div class="subtitle" style="font-size:22px; margin-bottom:10px;">holly@hollysellshomes.com</div>
      <div class="subtitle" style="font-size:28px; font-weight:500; color:#d4b8a8;">hollysellshomes.com</div>
    </div>
  `);
}

// ── Render one clip with subtle Ken Burns ──────────────────────────────────────
function renderClip(imgPath, duration, clipFile, idx) {
  const frames = Math.ceil(duration * FPS);
  const IS_CI = process.env.CI === 'true';

  let vf;
  if (IS_CI) {
    vf = `scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=${FPS},setpts=PTS-STARTPTS`;
  } else {
    const zoomExpr = idx % 2 === 0
      ? `zoom='min(zoom+0.00007,1.02)'`
      : `zoom='if(eq(on,1),1.02,max(zoom-0.00007,1.0))'`;
    vf = `scale=${W * 2}:${H * 2}:force_original_aspect_ratio=increase,crop=${W * 2}:${H * 2},` +
      `zoompan=${zoomExpr}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${W}x${H}:fps=${FPS},` +
      `fps=${FPS},setpts=PTS-STARTPTS`;
  }

  execSync([
    'ffmpeg -y',
    `-loop 1 -framerate ${FPS} -t ${duration} -i "${imgPath}"`,
    `-vf "${vf}"`,
    `-c:v libx264 -pix_fmt yuv420p -crf ${IS_CI ? 26 : 18} -preset ${IS_CI ? 'ultrafast' : 'slow'}`,
    `-t ${duration} -r ${FPS}`,
    `"${clipFile}"`
  ].join(' '), { stdio: 'pipe' });
}

// ── Xfade chain a list of clip files into a final output ──────────────────────
function chainClips(clipFiles, durations, outputFile) {
  const n = clipFiles.length;
  const inputs = clipFiles.map(f => `-i "${f}"`).join(' ');
  const filterParts = [];
  let lastLabel = '0:v';

  for (let i = 1; i < n; i++) {
    const offset = durations.slice(0, i).reduce((s, d) => s + d, 0) - FADE_DURATION * i;
    const outLabel = i === n - 1 ? 'vout' : `xf${i}`;
    filterParts.push(
      `[${lastLabel}][${i}:v]xfade=transition=fade:duration=${FADE_DURATION}:offset=${offset.toFixed(3)}[${outLabel}]`
    );
    lastLabel = outLabel;
  }

  const totalDuration = durations.reduce((s, d) => s + d, 0) - FADE_DURATION * (n - 1);

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
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Reading listings data...');
  const raw = fs.readFileSync(LISTINGS_FILE, 'utf8');
  const data = JSON.parse(raw);
  const results = data?.data?.home_search?.results ?? [];

  if (!results.length) { console.error('No listings found.'); process.exit(1); }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  for (const result of results) {
    const home = result?.data?.home;
    if (!home) continue;

    const addr = home.location?.address;
    const desc = home.description;
    const addressLine = addr?.line || '';
    const cityState = `${addr?.city || ''}, ${addr?.state_code || ''} ${addr?.postal_code || ''}`;
    const price = formatPrice(home.list_price);
    const beds = String(desc?.beds ?? '—');
    const baths = String(desc?.baths_consolidated ?? '—');
    const sqft = desc?.sqft ? desc.sqft.toLocaleString() : '—';
    const garage = desc?.garage || null;
    const yearBuilt = desc?.year_built || null;

    // Full description — use more text for YouTube
    const fullText = desc?.text || '';
    const descText = fullText.split(/\n/)[0].trim().substring(0, 280) + (fullText.length > 280 ? '...' : '');

    const chips = [
      desc?.type ? desc.type.replace(/_/g, ' ') : null,
      desc?.lot_sqft ? `${desc.lot_sqft.toLocaleString()} sqft lot` : null,
      home.hoa?.fee ? `HOA $${home.hoa.fee}/mo` : null,
      desc?.stories ? `${desc.stories} ${desc.stories === 1 ? 'Story' : 'Stories'}` : null,
      home.flags?.is_senior_community ? '55+ Community' : null,
      home.flags?.is_new_listing ? 'New Listing' : null,
    ].filter(Boolean);

    const slug = slugify(addressLine || `property-${home.property_id}`);
    const listingDir = path.join(FRAMES_DIR, slug);
    fs.mkdirSync(listingDir, { recursive: true });

    console.log(`\n  Listing: ${addressLine}`);

    // Fetch all photos (up to MAX_PHOTOS)
    const allPhotoUrls = (home.photos || []).slice(0, MAX_PHOTOS).map(p => largePhotoUrl(p.href));
    console.log(`    Fetching ${allPhotoUrls.length} photos...`);
    const allPhotos = await Promise.all(allPhotoUrls.map(fetchImageAsBase64));

    // Static slides definition
    const staticSlides = [
      { name: 'intro',   html: slideIntro(allPhotos[0], price, addressLine, cityState),                      duration: 5 + FADE_DURATION },
      { name: 'specs',   html: slideSpecs(allPhotos[1] || allPhotos[0], beds, baths, sqft, garage, yearBuilt), duration: 5 + FADE_DURATION },
      { name: 'desc',    html: slideDescription(allPhotos[2] || allPhotos[0], descText),                      duration: 7 + FADE_DURATION },
      { name: 'feat',    html: slideFeatures(allPhotos[3] || allPhotos[0], chips),                            duration: 5 + FADE_DURATION },
      { name: 'contact', html: slideContact(price, addressLine),                                               duration: 8 },
    ];

    // Screenshot static slides
    const staticPngPaths = {};
    for (const s of staticSlides) {
      const pngPath = path.join(listingDir, `${s.name}.png`);
      const page = await browser.newPage();
      await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      await page.setContent(s.html, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: pngPath, type: 'png' });
      await page.close();
      staticPngPaths[s.name] = pngPath;
    }

    // Screenshot photo slides (skip first 4 already used in static slides)
    const photoSlidePhotos = allPhotos.slice(4);
    const photoPngPaths = [];
    for (let i = 0; i < photoSlidePhotos.length; i++) {
      const pngPath = path.join(listingDir, `photo-${i}.png`);
      const html = slidePhoto(photoSlidePhotos[i]);
      const page = await browser.newPage();
      await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
      await page.setContent(html, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: pngPath, type: 'png' });
      await page.close();
      photoPngPaths.push(pngPath);
    }
    console.log(`    ✓ ${staticSlides.length} info slides + ${photoPngPaths.length} photo slides`);

    // Build ordered clip list:
    // intro → photo slideshow → specs → desc → features → contact
    const clips = [
      { png: staticPngPaths.intro, duration: staticSlides[0].duration },
      ...photoPngPaths.map(p => ({ png: p, duration: PHOTO_SLIDE_DURATION + FADE_DURATION })),
      { png: staticPngPaths.specs,   duration: staticSlides[1].duration },
      { png: staticPngPaths.desc,    duration: staticSlides[2].duration },
      { png: staticPngPaths.feat,    duration: staticSlides[3].duration },
      { png: staticPngPaths.contact, duration: staticSlides[4].duration },
    ];

    // Render each clip
    console.log(`    Rendering ${clips.length} clips...`);
    const clipFiles = [];
    for (let i = 0; i < clips.length; i++) {
      const clipFile = path.join(listingDir, `clip-${i}.mp4`);
      renderClip(clips[i].png, clips[i].duration, clipFile, i);
      clipFiles.push(clipFile);
      if ((i + 1) % 5 === 0) console.log(`      ${i + 1}/${clips.length} clips done...`);
    }

    // Chain all clips
    const outputFile = path.join(OUTPUT_DIR, `youtube-${slug}.mp4`);
    console.log(`    Chaining clips...`);
    chainClips(clipFiles, clips.map(c => c.duration), outputFile);

    // Cleanup clip files
    clipFiles.forEach(f => { try { fs.unlinkSync(f); } catch(_) {} });

    // Verify duration
    const dur = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${outputFile}"`
    ).toString().trim();
    console.log(`    ✓ Saved: youtube-${slug}.mp4 (${parseFloat(dur).toFixed(1)}s)`);
  }

  await browser.close();
  console.log(`\n✓ All YouTube videos saved to ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
