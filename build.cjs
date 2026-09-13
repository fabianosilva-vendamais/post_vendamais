const fs = require('fs');
const https = require('https');
const o = 'public/app';
fs.rmSync(o, { recursive: true, force: true });
fs.mkdirSync(o + '/vendor', { recursive: true });
for (const d of ['engine', 'assets']) if (fs.existsSync(d)) { fs.cpSync(d, o + '/' + d, { recursive: true }); fs.cpSync(d, 'public/' + d, { recursive: true }); }
for (const f of ['support.js', 'simulacao.js', 'Simulacao - Radar Ed01.html']) if (fs.existsSync(f)) { fs.cpSync(f, o + '/' + f); fs.cpSync(f, 'public/' + f); }
const get = (url, dest) => new Promise((res, rej) => https.get(url, r => { if (r.statusCode !== 200) return rej(new Error(url + ' ' + r.statusCode)); const w = fs.createWriteStream(dest); r.pipe(w); w.on('finish', res); }).on('error', rej));
(async () => {
  await get('https://unpkg.com/react@18.3.1/umd/react.production.min.js', o + '/vendor/react.js');
  await get('https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', o + '/vendor/react-dom.js');
  let h = fs.readFileSync('Content Engine.dc.html', 'utf8');
  const cfg = { url: process.env.NEXT_PUBLIC_SUPABASE_URL || '', anon: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '', login: process.env.NEXT_PUBLIC_REQUIRE_LOGIN === 'true' };
  const S = '<' + 'script'; const E = '<' + '/script>';
  const inject = '<base href="/app/">' + S + '>window.__VM_CFG__=' + JSON.stringify(cfg) + ';window.__VM_API_BASE__=location.origin+"/api";window.__VM_SUPABASE_URL__=window.__VM_CFG__.url;window.__VM_SUPABASE_ANON__=window.__VM_CFG__.anon;window.__VM_REQUIRE_LOGIN__=window.__VM_CFG__.login;' + E + S + ' src="/app/vendor/react.js">' + E + S + ' src="/app/vendor/react-dom.js">' + E;
  h = h.replace('<head>', '<head>' + inject).replace('src="./support.js"', 'src="/app/support.js"');
  fs.writeFileSync(o + '/index.html', h);
  console.log('app pronta em', o);
})().catch(e => { console.error(e); process.exit(1); });
