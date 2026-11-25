// Extração de texto das fontes no navegador: texto colado, PDF (pdf.js), DOCX (unzip + document.xml), TXT/MD. URL passa pela Edge Function.
export async function extractFile(file) {
  const name = file.name.toLowerCase();
  if (name.endsWith('.pdf')) return extractPdf(file);
  if (name.endsWith('.docx')) return extractDocx(file);
  return file.text();
}
async function extractPdf(file) {
  if (!window.pdfjsLib) { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'); window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; }
  const pdf = await window.pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  const out = [];
  for (let i = 1; i <= pdf.numPages; i++) { const page = await pdf.getPage(i); const tc = await page.getTextContent(); out.push(tc.items.map(it => it.str).join(' ')); }
  return out.join('\n\n');
}
function loadScript(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); }); }
async function extractDocx(file) {
  const buf = new Uint8Array(await file.arrayBuffer());
  const u16 = (o) => buf[o] | (buf[o + 1] << 8), u32 = (o) => (buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16) | (buf[o + 3] << 24)) >>> 0;
  let eocd = -1; for (let i = buf.length - 22; i >= 0; i--) if (u32(i) === 0x06054b50) { eocd = i; break; }
  const count = u16(eocd + 10); let p = u32(eocd + 16);
  for (let i = 0; i < count; i++) {
    const method = u16(p + 10), csize = u32(p + 20), nlen = u16(p + 28), elen = u16(p + 30), clen = u16(p + 32), lho = u32(p + 42);
    const nm = new TextDecoder().decode(buf.slice(p + 46, p + 46 + nlen)); p += 46 + nlen + elen + clen;
    if (nm !== 'word/document.xml') continue;
    const start = lho + 30 + u16(lho + 26) + u16(lho + 28); const data = buf.slice(start, start + csize);
    let xml; if (method === 0) xml = new TextDecoder().decode(data); else xml = await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
    return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/\n{3,}/g, '\n\n').trim();
  }
  throw new Error('document.xml não encontrado no DOCX');
}
