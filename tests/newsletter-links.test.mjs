import test from 'node:test';
import assert from 'node:assert/strict';
import { renderEmail, renderPlainText } from '../engine/newsletter-render.js';
import { mdToPlain } from '../engine/markdown-newsletter.js';
const edition = md => ({ headline:'A semana ainda pode render',free_blocks:[{label:'',title:'',md}],cta:{label:'Vamos conversar?',url:'https://example.com/default'}});
test('exact screenshot CTA becomes a clickable link without changing stored content',()=>{
 const n=edition('**Ainda podemos fazer muita coisa acontecer.**\n\n[Converse com a VendaMais](https://vendamais.com.br/contato/)\n\n**Vendas levadas a sério.**');const before=JSON.stringify(n);const html=renderEmail(n);
 assert.match(html,/<a href="https:\/\/vendamais.com.br\/contato\/"[^>]*>Converse com a VendaMais<\/a>/);assert.ok(!html.includes('[Converse com a VendaMais]'));assert.equal(JSON.stringify(n),before);
});
test('multiple inline links preserve separate destinations, queries and nested parentheses',()=>{
 const html=renderEmail(edition('Veja [YouTube](https://youtube.com/watch?v=abc&t=30) e [o material](https://example.com/tema_(vendas)).'));
 assert.match(html,/href="https:\/\/youtube.com\/watch\?v=abc&amp;t=30"/);assert.match(html,/href="https:\/\/example.com\/tema_\(vendas\)"/);
});
test('links inside headings, lists and table cells render normally',()=>{
 const html=renderEmail(edition('### [Leia mais](https://example.com/heading)\n\n- [Podcast](https://example.com/podcast)\n\n| Recurso | Link |\n| --- | --- |\n| Site | [Visite](https://example.com/site) |'));
 for(const part of ['heading','podcast','site'])assert.ok(html.includes(`href="https://example.com/${part}"`));
});
test('email destinations and bold link labels remain valid',()=>{
 const html=renderEmail(edition('[**Fale conosco**](mailto:fabiano.silva@vendamais.com.br?subject=Radar)'));
 assert.match(html,/href="mailto:fabiano.silva@vendamais.com.br\?subject=Radar"/);assert.ok(html.includes('<strong>Fale conosco</strong>'));
});
test('unsafe destinations and HTML labels are not executable',()=>{
 const html=renderEmail(edition('[Clique](javascript:alert(1)) [<img src=x onerror=alert(1)>](https://example.com/"onclick="x)'));
 assert.ok(!html.includes('href="javascript:'));assert.ok(!html.includes('<img src=x'));assert.ok(!html.includes('"onclick="'));
});
test('old label-only buttons keep their configured CTA destination',()=>{
 const html=renderEmail(edition('[Vamos conversar?]'));assert.match(html,/href="https:\/\/example.com\/default"/);assert.ok(html.includes('Vamos conversar?'));
});
test('plain text retains readable labels and the full destination',()=>{
 assert.equal(mdToPlain('[Contato](https://vendamais.com.br/contato/)'),'Contato (https://vendamais.com.br/contato/)');assert.ok(renderPlainText(edition('[Contato](https://example.com/contato)')).includes('Contato (https://example.com/contato)'));
});
test('structured newsletter paragraphs also support explicit Markdown links',()=>{
 const html=renderEmail({headline:'Teste',sections:[{title:'Contato',body:'[Converse](https://vendamais.com.br/contato/)'}]});assert.match(html,/<a href="https:\/\/vendamais.com.br\/contato\/"/);
});

test('standalone explicit CTAs restore the original button style and own URL',()=>{
 const html=renderEmail(edition('[Converse com a VendaMais](https://vendamais.com.br/contato/)\n\n[Conhecer o SalesTrain](https://vendamais.com.br/salestrain/)'));
 for(const url of ['contato','salestrain'])assert.match(html,new RegExp('href="https://vendamais.com.br/'+url+'/" style="display:inline-block;padding:14px 26px;'));
 assert.equal((html.match(/background:#E2742B;border-radius:4px/g)||[]).length,2);
});
test('podcast infers missing fields, restores episode cover and renders each platform once',()=>{
 const n=edition('Texto');n.podcast={enabled:true,title:'',youtube_url:'',spotify_url:'',cover_url:''};n.free_blocks=[{label:'PODCAST VENDAMAIS',title:'O custo de liderar pela pressão',md:'**Podcast VendaMais #193**\n\nDescrição do episódio.\n\n[Assistir no YouTube](https://www.youtube.com/watch?v=Mu7_jtQsYQ8)\n\n[Ouvir no Spotify](https://open.spotify.com/show/753E2W9Unc8RUedtCPnqmO)'}];
 const before=JSON.stringify(n),html=renderEmail(n);
 assert.ok(html.includes('src="https://img.youtube.com/vi/Mu7_jtQsYQ8/hqdefault.jpg"'));
 assert.equal((html.match(/>Assistir no YouTube<\/a>/g)||[]).length,1);assert.equal((html.match(/>Ouvir no Spotify<\/a>/g)||[]).length,1);
 assert.ok(html.includes('background:#FF0000'));assert.ok(html.includes('background:#1DB954'));assert.equal(JSON.stringify(n),before);
});
test('explicit episode fields and cover retain precedence over links in the article',()=>{
 const n=edition('');n.podcast={enabled:true,youtube_url:'https://youtu.be/abcdefghijk',cover_url:'https://example.com/episode.jpg'};n.free_blocks=[{label:'PODCAST',title:'Episódio',md:'[YouTube](https://www.youtube.com/watch?v=Mu7_jtQsYQ8)'}];
 const html=renderEmail(n);assert.ok(html.includes('src="https://example.com/episode.jpg"'));assert.ok(html.includes('href="https://youtu.be/abcdefghijk"'));
});
test('links within prose remain inline links rather than buttons',()=>{
 const html=renderEmail(edition('Para conhecer os detalhes, [converse com a VendaMais](https://vendamais.com.br/contato/) hoje.'));
 assert.match(html,/href="https:\/\/vendamais.com.br\/contato\/" style="color:#16263A;text-decoration:underline;"/);
});
