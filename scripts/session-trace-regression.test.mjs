import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, appendFile, mkdir, symlink, realpath } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createLoader } from './helpers/load-typescript.mjs';
import { DatabaseSync } from 'node:sqlite';
const load=createLoader();const {TraceIndex}=load('extensions/session-trace/runtime/traceIndex.ts');const {resolveSource}=load('extensions/session-trace/runtime/source.ts');
const stamp='2026-11-06T08:00:00Z';
const rows=[
 {type:'user',timestamp:stamp,message:{content:[{type:'text',text:'修复滚动位置'}]}},
 {type:'user',isMeta:true,timestamp:stamp,message:{content:'workspace guidance'}},
 {type:'assistant',uuid:'response-record',timestamp:stamp,message:{id:'req1',content:[{type:'text',text:'检查中'},{type:'tool_use',id:'call1',name:'Bash',input:{command:'npm test'}}],usage:{input_tokens:100,output_tokens:10}}},
 {type:'assistant',uuid:'response-record',timestamp:stamp,message:{id:'req1',content:[{type:'text',text:'检查完成'},{type:'tool_use',id:'call1',name:'Bash',input:{command:'npm test'}}],usage:{input_tokens:100,output_tokens:20}}},
 {type:'user',timestamp:'2026-11-06T08:00:02Z',message:{content:[{type:'tool_result',tool_use_id:'call1',is_error:true,content:'test failed'}]}},
 {type:'system',timestamp:stamp,subtype:'compact_boundary',content:'compact'},
 {type:'new_format',data:'preserve unknown'},
];
const jsonl=rows=>rows.map(row=>JSON.stringify(row)).join('\n')+'\n';
async function fixture(run){const root=await mkdtemp(path.join(os.tmpdir(),'navo-trace-'));try{await run(root);}finally{await rm(root,{recursive:true,force:true});}}

test('Claude: deduplicates final responses and cumulative usage, pairs errors without new turns',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl'),cache=path.join(root,'cache.sqlite');await writeFile(source,jsonl(rows));const index=new TraceIndex(source,cache,'claude');
 try {await index.refresh();const page=index.page({kind:'page'});assert.equal(page.stats.rounds,1);assert.equal(page.stats.requests,1);assert.equal(page.stats.tokens,120);assert.equal(page.stats.tools,1);assert.equal(page.stats.errors,1);
 const tool=index.page({kind:'page',filter:'tool'});assert.equal(tool.total,1);const detail=await index.detail(tool.events[0].id);assert.equal(detail.kind,'error');assert.equal(detail.durationMs,2000);assert.equal(detail.result,'test failed');assert.match(detail.raw,/tool_use/);assert.match(detail.raw,/tool_result/);
 assert.equal(index.page({kind:'page',search:'test failed'}).total,1);assert.equal(index.page({kind:'page',filter:'unknown'}).total,1);assert.equal(index.page({kind:'page',filter:'context'}).total,1);
 }finally{index.close();}
}));

test('incremental UTF-8 tail, checkpoint reuse and truncation rebuild',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl'),cache=path.join(root,'cache.sqlite');await writeFile(source,jsonl(rows));let index=new TraceIndex(source,cache,'claude');
 try {await index.refresh();const before=index.stats().events;const extra=Buffer.from(JSON.stringify({type:'user',message:{content:'新的中文消息'}})+'\n');await appendFile(source,extra.subarray(0,extra.length-4));assert.equal(await index.refresh(),false);assert.equal(index.stats().events,before);await appendFile(source,extra.subarray(extra.length-4));await index.refresh();assert.equal(index.stats().rounds,2);index.close();index=new TraceIndex(source,cache,'claude');await index.refresh();assert.equal(index.stats().rounds,2);assert.equal(index.stats().events,before+1);
 await writeFile(source,jsonl([rows[0]]));await index.refresh();assert.equal(index.stats().events,1);assert.equal(index.stats().rounds,1);
 }finally{index.close();}
}));

test('Codex: response items are authoritative; usage is cumulative and requests remain unknown',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl');await writeFile(source,jsonl([
 {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'do work'}]}},
 {type:'event_msg',payload:{type:'user_message',message:'do work'}},
 {type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:'c1',arguments:'{"cmd":"pwd"}'}},
 {type:'response_item',payload:{type:'function_call_output',call_id:'c1',output:'workspace'}},
 {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:100}}}},
 {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:140}}}},
 ]));const index=new TraceIndex(source,path.join(root,'index.sqlite'),'codex');try{await index.refresh();assert.equal(index.stats().events,2);assert.equal(index.stats().tokens,140);assert.equal(index.stats().rounds,1);assert.equal(index.stats().requests,null);assert.equal(index.page({kind:'page',search:'workspace'}).total,1);}finally{index.close();}
}));

test('source resolution requires exact native identity and rejects escaping symlinks',()=>fixture(async root=>{
 const id='12345678-1234-1234-1234-123456789abc',cwd=path.join(root,'project'),native=path.join(root,'claude');const directory=path.join(native,'projects',cwd.replace(/[^a-zA-Z0-9]/g,'-'));await mkdir(directory,{recursive:true});
 const source=path.join(directory,id+'.jsonl'),session={id,root:native,cwd,provider:'claude',createdAt:stamp};await writeFile(source,jsonl([{sessionId:id,cwd,type:'user',message:{content:'sample'}}]));assert.equal(await resolveSource(session),await realpath(source));
 await writeFile(source,jsonl([{sessionId:'other',cwd,type:'user'}]));await assert.rejects(resolveSource(session),/SOURCE_INVALID/);
 await rm(source);const outside=path.join(root,'outside');await writeFile(outside,jsonl([{sessionId:id,cwd,type:'user'}]));await symlink(outside,source);await assert.rejects(resolveSource(session),/SOURCE_INVALID/);
}));

test('Claude: one request keeps independent UUID blocks and pairs parallel tool results',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl'),cache=path.join(root,'cache.sqlite');
 const assistant=(uuid,block)=>({type:'assistant',uuid,timestamp:stamp,message:{id:'same-request',content:[block],usage:{input_tokens:100,output_tokens:20}}});
 const text=assistant('text-record',{type:'text',text:'Inspecting both files'});
 const toolA=assistant('tool-a-record',{type:'tool_use',id:'call-a',name:'Read',input:{file_path:'a.ts'}});
 await writeFile(source,jsonl([
  rows[0],assistant('thinking-record',{type:'thinking',thinking:'Check both files independently'}),text,toolA,
  assistant('tool-b-record',{type:'tool_use',id:'call-b',name:'Read',input:{file_path:'b.ts'}}),text,
  {type:'user',timestamp:'2026-11-06T08:00:02Z',message:{content:[{type:'tool_result',tool_use_id:'call-b',is_error:true,content:'missing b'},{type:'tool_result',tool_use_id:'call-a',content:'contents a'}]}},
  toolA,assistant('replayed-tool-b',{type:'tool_use',id:'call-b',name:'Read',input:{file_path:'b.ts'}}),
 ]));
 let index=new TraceIndex(source,cache,'claude');
 try {
  await index.refresh();const stats=index.stats();assert.equal(stats.events,5);assert.equal(stats.requests,1);assert.equal(stats.tools,2);assert.equal(stats.errors,1);assert.equal(stats.tokens,120);
  assert.equal(index.page({kind:'page',filter:'reasoning'}).total,1);assert.equal(index.page({kind:'page',search:'Inspecting both files'}).total,1);
  const tools=index.page({kind:'page',filter:'tool'}).events;const a=await index.detail(tools.find(event=>event.callId==='call-a').id),b=await index.detail(tools.find(event=>event.callId==='call-b').id);
  assert.equal(a.result,'contents a');assert.equal(b.result,'missing b');assert.equal(b.kind,'error');assert.equal(a.durationMs,2000);assert.match(a.raw,/call-a/);assert.match(b.raw,/call-b/);
  // 旧版缓存已经丢失的记录必须重建，不能只更改新追加事件的 key。
  index.close();const db=new DatabaseSync(cache);db.prepare("UPDATE metadata SET key='checkpoint-v1' WHERE key='checkpoint-v3'").run();db.prepare("DELETE FROM events WHERE kind='assistant'").run();db.close();
  index=new TraceIndex(source,cache,'claude');await index.refresh();assert.equal(index.stats().events,5);assert.equal(index.page({kind:'page',search:'Inspecting both files'}).total,1);
 }finally{index.close();}
}));

test('Claude: missing UUID keeps separate records and replay metadata matches SQL filters',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl');
 const record=(uuid,request,block)=>({type:'assistant',uuid,timestamp:stamp,message:{id:request,content:[block]}});
 await writeFile(source,jsonl([
  record(undefined,'same-request',{type:'text',text:'first independent block'}),
  record(undefined,'same-request',{type:'text',text:'second independent block'}),
  record('updated-record','draft-request',{type:'thinking',thinking:'draft'}),
  record('updated-record','final-request',{type:'text',text:'final content'}),
 ]));
 const index=new TraceIndex(source,path.join(root,'cache.sqlite'),'claude');
 try {
  await index.refresh();assert.equal(index.stats().events,3);assert.equal(index.stats().requests,2);
  assert.equal(index.page({kind:'page',filter:'reasoning'}).total,0);assert.equal(index.page({kind:'page',filter:'assistant'}).total,3);
  assert.equal(index.page({kind:'page',search:'independent block'}).total,2);
  assert.equal(index.page({kind:'page',search:'final content'}).events[0].request,'final-request');
 }finally{index.close();}
}));

test('PRD 2.5: attachments split, bookkeeping stays hidden, tokens do not double-count',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl'),cache=path.join(root,'cache.sqlite');
 await writeFile(source,jsonl([
  {type:'user',timestamp:stamp,message:{content:[{type:'text',text:'start'}]}},
  {type:'attachment',timestamp:stamp,attachment:{type:'environment',snapshot:{shell:'zsh'}},rendered:[{content:'shell: zsh'}]},
  {type:'attachment',timestamp:stamp,attachment:{type:'session_context',context:{gitStatus:'clean'}}},
  {type:'attachment',timestamp:stamp,attachment:{type:'prompt_snapshot',systemPrompt:['keep']}},
  {type:'attachment',timestamp:stamp,attachment:{type:'edited_text_file',filename:'a.ts',snippet:'export const n=1;'}},
  {type:'attachment',timestamp:stamp,attachment:{type:'file',filename:'b.ts'}},
  {type:'attachment',timestamp:stamp,attachment:{type:'total_tokens_reminder',text:'<total_tokens>15000000 tokens left</total_tokens>'}},
  {type:'attachment',timestamp:stamp,attachment:{type:'hook_success',hookName:'SessionStart',stdout:'{}'}},
  {type:'mode',mode:'normal'},
  {type:'mode',mode:'normal'},
  {type:'mode',mode:'plan'},
  {type:'permission-mode',permissionMode:'auto'},
  {type:'permission-mode',permissionMode:'auto'},
  {type:'last-prompt',lastPrompt:'start',sessionId:'s'},
  {type:'atis-latch',atis:'',sessionId:'s'},
  {type:'file-history-snapshot',messageId:'m1',snapshot:{trackedFileBackups:{}},isSnapshotUpdate:false},
  {type:'queue-operation',operation:'enqueue',timestamp:stamp,content:'queued work'},
  {type:'custom-title',customTitle:'Renamed session'},
  {type:'new_format',data:'preserve unknown'},
 ]));
 const index=new TraceIndex(source,cache,'claude');
 try {
  await index.refresh();
  const visible=index.page({kind:'page'});
  assert.equal(visible.stats.tokens,null);
  assert.equal(visible.stats.events,12);
  assert.equal(visible.total,12);
  const contexts=index.page({kind:'page',filter:'context'});
  assert.equal(contexts.total,5);
  assert.deepEqual(contexts.events.map(event=>event.kind),['context','context','context','context','context']);
  assert.match(contexts.events[0].preview,/shell: zsh/);
  const systems=index.page({kind:'page',filter:'system'});
  assert.equal(systems.total,4);
  assert.equal(systems.events[0].preview,'mode: normal');
  assert.equal(systems.events[1].preview,'mode: plan');
  assert.equal(systems.events[2].preview,'permission-mode: auto');
  assert.equal(systems.events[3].preview,'enqueue: queued work');
  assert.equal(index.page({kind:'page',filter:'unknown'}).total,2);
  const all=index.page({kind:'page',showBookkeeping:true});
  assert.equal(all.total,19);
  assert.equal(all.stats.events,12);
  assert.equal(all.events.filter(event=>event.bookkeeping).length,7);
  assert.equal(index.page({kind:'page',filter:'system',showBookkeeping:true,search:'Renamed session'}).total,1);
  assert.equal(index.page({kind:'page',search:'15000000'}).total,0);
  assert.equal(index.page({kind:'page',showBookkeeping:true,search:'15000000'}).total,1);
  assert.equal(index.timeline().events.filter(event=>event.bookkeeping).length,0);
  assert.ok(index.timeline({kind:'timeline',showBookkeeping:true}).events.some(event=>event.bookkeeping));
 } finally {index.close();}
}));

test('PRD 2.5: Codex token records share one cumulative total and stay off the default timeline',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl');
 await writeFile(source,jsonl([
  {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'do work'}]}},
  {type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{model:'gpt-test',approval_policy:'never'}}},
  {type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{model:'gpt-test',approval_policy:'never'}}},
  {type:'event_msg',payload:{type:'thread_settings_applied',thread_settings:{model:'gpt-test',approval_policy:'on-request'}}},
  {type:'world_state',payload:{full:true,state:{model:{model:'gpt-test'}}}},
  {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:100}}}},
  {type:'token_usage_record',payload:{response_id:'r1',usage:{total_tokens:80},thread_token_usage:{total_tokens:140}}},
  {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:140}}}},
  {type:'token_usage_record',payload:{response_id:'r2',usage:{total_tokens:90},thread_token_usage:{total_tokens:200}}},
 ]));
 const index=new TraceIndex(source,path.join(root,'index.sqlite'),'codex');
 try {
  await index.refresh();
  const visible=index.page({kind:'page'});
  assert.equal(visible.total,3);
  assert.equal(visible.stats.events,3);
  assert.equal(visible.stats.tokens,200);
  assert.equal(visible.stats.rounds,1);
  assert.equal(visible.events.filter(event=>event.kind==='system').length,2);
  const hidden=index.page({kind:'page',showBookkeeping:true});
  assert.equal(hidden.total,9);
  assert.equal(hidden.stats.tokens,200);
  assert.equal(hidden.events.filter(event=>event.bookkeeping).length,6);
  assert.ok(hidden.events.some(event=>event.preview.includes('world_state')||event.preview.includes('gpt-test')));
 } finally {index.close();}
}));

test('PRD 2.5: locating an event ignores hidden bookkeeping ids when paging',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl');
 const hidden=Array.from({length:80},()=>({type:'last-prompt',lastPrompt:'prior'}));
 await writeFile(source,jsonl([...hidden,{type:'user',timestamp:stamp,message:{content:[{type:'text',text:'visible after bookkeeping'}]}}]));
 const index=new TraceIndex(source,path.join(root,'cache.sqlite'),'claude');
 try {
  await index.refresh();
  const page=index.page({kind:'page',eventId:81,limit:80});
  assert.equal(page.total,1);
  assert.equal(page.offset,0);
  assert.equal(page.events[0].preview,'visible after bookkeeping');
  const revealed=index.page({kind:'page',eventId:81,limit:80,showBookkeeping:true});
  assert.equal(revealed.total,81);
  assert.equal(revealed.offset,80);
  assert.equal(revealed.events[0].preview,'visible after bookkeeping');
 } finally {index.close();}
}));

test('timeline duration uses d h m s and caps at days', () => {
  const { formatTraceDuration } = load('src/components/tasks/workspace/trace/formatTraceDuration.ts');
  assert.equal(formatTraceDuration(0), '0s');
  assert.equal(formatTraceDuration(1500), '1.5s');
  assert.equal(formatTraceDuration(1000), '1s');
  assert.equal(formatTraceDuration(65000), '1m 5s');
  assert.equal(formatTraceDuration(3661000), '1h 1m 1s');
  assert.equal(formatTraceDuration(3600000), '1h');
  assert.equal(formatTraceDuration(90000000), '1d 1h');
  assert.equal(formatTraceDuration(172800000), '2d');
});
