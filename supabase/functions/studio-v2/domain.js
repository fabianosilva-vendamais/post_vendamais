export const ANGLES=['training','consulting','business'];
export const LAYOUTS=['type','photo','split','contrast'];
export const clone=o=>structuredClone(o);
export const now=()=>new Date().toISOString();
export function cleanText(s,max=10000){return String(s??'').replace(/\u0000/g,'').slice(0,max).trim()}
export function validUrl(value,{email=false}={}){const s=cleanText(value,2048);if(!s)return '';if(email&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s))return `mailto:${s}`;try{const u=new URL(s);if(['https:','http:'].includes(u.protocol)||(email&&u.protocol==='mailto:'))return u.href}catch{}throw new Error('Use um link completo começando com https://.');}
export function initialEdition(data={}){return {schema:2,number:0,date:'',article:'',headline:'',preheader:'',cta:{label:'Vamos conversar?',url:'mailto:fabiano.silva@vendamais.com.br'},podcast:{title:'',description:'',youtube_url:'',spotify_url:'',cover_url:''},event:{label:'LANÇAMENTO VENDAMAIS',title:'',text:'',url:'',cta:'Saiba mais',image_url:''},posts:[],settings:{blog_pt:'',blog_es:'',spanish:true,images:true,time:'09:00',timezone:'America/Sao_Paulo'},...clone(data)}}
export function normalizePosts(out,old=[],onlyAngle=''){
 const entries=Array.isArray(out.posts)?out.posts:[out];
 const result=ANGLES.filter(a=>!onlyAngle||a===onlyAngle).map((angle,i)=>{const o=entries.find(p=>p.angle===angle);if(!o||!cleanText(o.headline))throw new Error(`A IA não concluiu a abordagem ${angle}. Tente novamente apenas esta peça.`);
 const prev=old.find(p=>p.angle===angle);const format=o.format==='carousel'?'carousel':'single';
 const post={id:prev?.id||crypto.randomUUID(),angle,format,layout:LAYOUTS.includes(o.layout)?o.layout:LAYOUTS[i%LAYOUTS.length],headline:cleanText(o.headline,180),support:cleanText(o.support,300),caption:cleanText(o.caption,2200),image_prompt:cleanText(o.image_prompt,4000),image_path:prev?.image_path||'',slides:format==='carousel'?(o.slides||[]).slice(0,8).map(s=>({title:cleanText(s.title,160),body:cleanText(s.body,450)})):[],es:o.es?{headline:cleanText(o.es.headline,180),support:cleanText(o.es.support,300),caption:cleanText(o.es.caption,2200),slides:(o.es.slides||[]).slice(0,8).map(s=>({title:cleanText(s.title,160),body:cleanText(s.body,450)}))}:null,approved:false,approved_hash:'',date:prev?.date||'',time:prev?.time||'09:00',networks:prev?.networks||['linkedin','instagram'],error:'',updated_at:now()};
 if(format==='carousel'&&post.slides.length<3)throw new Error('O carrossel veio incompleto. Gere novamente esta abordagem.');
 if(post.es&&format==='carousel'&&post.es.slides.length!==post.slides.length)throw new Error('A versão em espanhol veio com slides incompletos.');
 return post;});
 return result;
}
export function approvalContent(p){const {approved,approved_hash,updated_at,error,...content}=p;return content}
export async function hash(value){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
export async function approved(p){return !!p.approved&&p.approved_hash===await hash(approvalContent(p))}
export function postIssues(p,{spanish=true}={}){const e=[];if(!p.headline?.trim()||!p.caption?.trim())e.push('Preencha título e legenda.');if(p.headline?.length>180)e.push('Encurte o título para a arte.');if(['photo','split'].includes(p.layout)&&!p.image_path)e.push('Gere ou envie uma imagem para esta composição.');if(p.format==='carousel'&&p.slides?.length<3)e.push('O carrossel precisa de pelo menos três slides.');if(spanish&&(!p.es?.headline||!p.es?.caption||(p.format==='carousel'&&p.es?.slides?.length!==p.slides?.length)))e.push('Complete a versão em espanhol.');return e}
export function nextDates(date,index){const d=new Date(`${date||new Date().toISOString().slice(0,10)}T12:00:00Z`);d.setUTCDate(d.getUTCDate()+[1,3,5][index%3]);return d.toISOString().slice(0,10)}
export function publicError(e){return cleanText(e?.message||e,500).replace(/(?:sk-|sb_secret_)[\w-]+/g,'[redigido]')}
