import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage={getItem:()=>null,setItem(){}};
const { db } = await import('../engine/store.js?vm202611011656');
const { run } = await import('../engine/pipeline.js');
const { PROMPTS } = await import('../engine/prompts.js');
const { db: same } = await import('../engine/store.js?vm202611011656');
const originalFetch=globalThis.fetch;
function fixture() {
 db.editions=[];db.newsletter_versions=[];db.posts=[];db.publications=[];
 db.prompt_templates=structuredClone(PROMPTS);db.settings.supabase_url='https://example.invalid';db.settings.supabase_anon_key='test';db.settings.text_provider='openai';
 const edition={id:'resume-edition',status:'newsletter_approved',brief:{ready_text:'texto '.repeat(100),mode:'ready',number:29}};db.editions.push(edition);
 const version={id:'existing-news',edition_id:edition.id,n:1,is_approved:true,origin:'human',meta:{mode:'ready'},content_json:{headline:'Revise as negociações paradas',intro:'texto '.repeat(600),sections:[],action:{steps:['Combine o próximo passo.']},practical_block:{title:'Como agir',steps:['Revise as negociações paradas com a equipe.']},cta:{label:'Converse com a equipe'}}};db.newsletter_versions.push(version);
 for(const angle of ['training','consulting','business'])db.posts.push({id:angle,edition_id:edition.id,angle,status:'approved',format:'single',content_json:{headline:'Conteúdo já concluído '+angle}});
 return {edition,version,app:{edition:()=>edition,evidence:()=>[],setState(){},save(){},M:{supabase:{signedIn:()=>false}},setStatus(e,status){e.status=status;}}};
}
test('failed review stops before approval and preserves the existing edition',async()=>{
 const {edition,version,app}=fixture();const content=JSON.stringify(version.content_json);const posts=JSON.stringify(db.posts);let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response('falha',{status:502});};
 try{const report=await run(app,{resumeEditionId:edition.id,withImages:false});assert.ok(report.some(r=>r.id==='qa'&&r.status==='error'));assert.ok(report.some(r=>r.id==='approve'&&r.status==='error'));assert.ok(!report.some(r=>r.id.startsWith('post_')));assert.equal(db.editions.length,1);assert.equal(db.newsletter_versions.length,1);assert.equal(JSON.stringify(version.content_json),content);assert.equal(JSON.stringify(db.posts),posts);assert.equal(calls,1);}finally{globalThis.fetch=originalFetch;}
});
test('resume reuses completed posts and newsletter without regeneration or duplication',async()=>{
 const {edition,version,app}=fixture();const posts=JSON.stringify(db.posts);const content=JSON.stringify(version.content_json);let calls=0;
 globalThis.fetch=async()=>{calls++;return Response.json({text:JSON.stringify({scores:{clarity:95,depth:95},issues:[]})});};
 try{const report=await run(app,{resumeEditionId:edition.id,withImages:false});assert.ok(report.some(r=>r.id==='approve'&&r.status==='done'));assert.equal(report.filter(r=>r.id.startsWith('post_')&&r.status==='done').length,3);assert.equal(calls,1);assert.equal(db.editions.length,1);assert.equal(db.newsletter_versions.length,1);assert.equal(JSON.stringify(version.content_json),content);assert.equal(JSON.stringify(db.posts),posts);}finally{globalThis.fetch=originalFetch;}
});
