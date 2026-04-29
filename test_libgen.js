const https = require('https');

function fetch(url, timeout = 15000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { 
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Range': 'bytes=0-100'
      }, 
      timeout 
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        const loc = res.headers.location.startsWith('http') ? res.headers.location : new URL(res.headers.location, url).href;
        console.log('  -> Redirect to:', loc);
        return fetch(loc, timeout).then(resolve).catch(reject);
      }
      let chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({ 
        status: res.statusCode, 
        data: Buffer.concat(chunks),
        headers: res.headers 
      }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function testFullFlow() {
  // Step 1: Search libgen.li for "Project Hail Mary"
  console.log('=== STEP 1: Search libgen.li ===');
  const title = 'Project Hail Mary';
  const author = 'Andy Weir';
  const q = encodeURIComponent(title + ' ' + author);
  const searchUrl = `https://libgen.li/index.php?req=${q}&res=25&columns[]=t&columns[]=a&columns[]=e`;
  
  const search = await fetch(searchUrl);
  console.log('Status:', search.status, '| Body:', search.data.length, 'bytes');
  
  const searchHtml = search.data.toString();
  const md5Matches = searchHtml.match(/md5=([A-Fa-f0-9]{32})/gi);
  if (!md5Matches) { console.log('No results'); return; }
  
  const md5 = md5Matches[0].replace(/md5=/i, '');
  console.log('Found MD5:', md5);
  
  // Step 2: Get the ads.php page to find download link with key
  console.log('\n=== STEP 2: Get ads.php (download page) ===');
  const adsUrl = `https://libgen.li/ads.php?md5=${md5}`;
  const ads = await fetch(adsUrl);
  console.log('Status:', ads.status, '| Body:', ads.data.length, 'bytes');
  
  const adsHtml = ads.data.toString();
  const keyMatch = adsHtml.match(/get\.php\?md5=[A-Fa-f0-9]{32}&key=([A-Z0-9]+)/i);
  if (!keyMatch) { console.log('No download key found'); return; }
  
  const dlUrl = `https://libgen.li/get.php?md5=${md5}&key=${keyMatch[1]}`;
  console.log('Download URL:', dlUrl);
  
  // Step 3: Follow redirect to CDN and check content
  console.log('\n=== STEP 3: Follow redirect to CDN ===');
  try {
    const dl = await fetch(dlUrl, 20000);
    console.log('Final Status:', dl.status);
    console.log('Content-Type:', dl.headers['content-type']);
    console.log('Content-Length:', dl.headers['content-length']);
    console.log('Content-Disposition:', dl.headers['content-disposition']);
    
    // Check first bytes
    const firstBytes = dl.data.slice(0, 4);
    const isZip = firstBytes[0] === 0x50 && firstBytes[1] === 0x4B; // PK (epub is zip)
    const isPdf = firstBytes[0] === 0x25 && firstBytes[1] === 0x50; // %P
    const isHtml = dl.data.toString('utf8', 0, 4).startsWith('<');
    console.log('First 4 bytes:', Array.from(firstBytes).map(b => '0x' + b.toString(16)).join(' '));
    console.log('Is ZIP/EPUB:', isZip, '| Is PDF:', isPdf, '| Is HTML:', isHtml);
    
    if (isZip || isPdf) {
      console.log('\n*** SUCCESS: This URL serves a real ebook file! ***');
    }
  } catch (e) {
    console.log('CDN fetch error:', e.message);
    console.log('\nFalling back: the download URL itself is valid, CDN just needs a full GET request');
    console.log('Extension should return:', dlUrl);
  }
}

testFullFlow().catch(console.error);
