// Copia a aplicação (DC + engine + assets) para /public/app antes do build, e injeta a base das API Routes.
import { cpSync, mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
const out = 'public/app';
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
for (const d of ['engine', 'assets']) if (existsSync(d)) cpSync(d, out + '/' + d, { recursive: true });
for (const f of ['support.js', 'simulacao.js', 'Simulacao - Radar Ed01.html']) if (existsSync(f)) cpSync(f, out + '/' + f);
let html = readFileSync('Content Engine.dc.html', 'utf8');
const inject = '<script>window.__VM_API_BASE__=location.origin+"/api";window.__VM_SUPABASE_URL__=' + JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL || '') + ';window.__VM_SUPABASE_ANON__=' + JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '') + ';window.__VM_REQUIRE_LOGIN__=' + JSON.stringify(process.env.NEXT_PUBLIC_REQUIRE_LOGIN === 'true') + ';</script>';
html = html.includes('<head>') ? html.replace('<head>', '<head>' + inject) : inject + html;
writeFileSync(out + '/index.html', html);
writeFileSync(out + '/Content Engine.dc.html', html);
console.log('app sincronizada em', out);
