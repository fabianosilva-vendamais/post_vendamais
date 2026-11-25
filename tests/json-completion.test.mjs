import test from 'node:test';
import assert from 'node:assert/strict';
import { generateCompleteJSON, openAIJSONOptions } from '../engine/json-completion.js';
import { generateEditorial } from '../engine/editorial-server.js';
test('small GPT-5 plans reserve output and reduce reasoning latency', () => {
 assert.deepEqual(openAIJSONOptions('gpt-5', 2000), { max_completion_tokens: 4096, reasoning_effort: 'low' });
 assert.deepEqual(openAIJSONOptions('gpt-4.1', 2000), { max_completion_tokens: 2000 });
});
test('empty successful provider response automatically regenerates once', async () => {
 const calls=[];const result=await generateCompleteJSON({prompt:'Preserve o artigo',max_tokens:2000}, async b=>{calls.push(b);return calls.length===1?{text:'',finish_reason:'length'}:{text:'{"scene":"Reunião comercial"}',finish_reason:'stop'};});
 assert.equal(calls.length,2);assert.ok(calls[1].max_tokens>=8192);assert.match(calls[1].prompt,/Preserve o artigo/);assert.equal(JSON.parse(result.text).scene,'Reunião comercial');
});
test('truncated JSON is regenerated, never fabricated by closing braces', async()=>{
 let calls=0;const result=await generateCompleteJSON({prompt:'Fonte'},async()=>({text:++calls===1?'{"title":"Parcial':'{"title":"Completo"}'}));
 assert.equal(calls,2);assert.equal(JSON.parse(result.text).title,'Completo');
});
test('complete looking JSON with finish length is still rejected', async()=>{
 let calls=0;await generateCompleteJSON({prompt:'Fonte'},async()=>({text:'{}',finish_reason:++calls===1?'length':'stop'}));assert.equal(calls,2);
});
test('recurring truncation fails with preserved content and bounded calls',async()=>{
 const before={headline:'Salvo'};let calls=0;await assert.rejects(generateCompleteJSON({prompt:JSON.stringify(before)},async()=>{calls++;return{text:'',finish_reason:'length'}}),/conteúdo salvo foi preservado/);assert.equal(calls,2);assert.deepEqual(before,{headline:'Salvo'});
});
test('newsletter QA also receives valid JSON recovery without social rewriting',async()=>{
 let calls=0;const result=await generateEditorial({purpose:'newsletter.qa',prompt:'Audite a newsletter'},async()=>({text:++calls===1?'':'{"scores":{"clarity":90},"issues":[]}'}));assert.equal(calls,2);assert.deepEqual(JSON.parse(result.text).issues,[]);
});
test('upstream auth errors are never retried',async()=>{
 let calls=0;await assert.rejects(generateCompleteJSON({prompt:'Fonte'},async()=>{calls++;throw new Error('unauthorized')}),/unauthorized/);assert.equal(calls,1);
});
