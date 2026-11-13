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

test('Claude: deduplicates final responses, pairs errors without new turns',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl'),cache=path.join(root,'cache.sqlite');await writeFile(source,jsonl(rows));const index=new TraceIndex(source,cache,'claude');
 try {await index.refresh();const page=index.page({kind:'page'});assert.equal(page.stats.rounds,1);assert.equal(page.stats.requests,1);assert.equal(page.stats.tools,1);assert.equal(page.stats.errors,1);
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

test('Codex: response items are authoritative and requests remain unknown',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl');await writeFile(source,jsonl([
 {type:'response_item',payload:{type:'message',role:'user',content:[{type:'input_text',text:'do work'}]}},
 {type:'event_msg',payload:{type:'user_message',message:'do work'}},
 {type:'response_item',payload:{type:'function_call',name:'exec_command',call_id:'c1',arguments:'{"cmd":"pwd"}'}},
 {type:'response_item',payload:{type:'function_call_output',call_id:'c1',output:'workspace'}},
 {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:100}}}},
 {type:'event_msg',payload:{type:'token_count',info:{total_token_usage:{total_tokens:140}}}},
 ]));const index=new TraceIndex(source,path.join(root,'index.sqlite'),'codex');try{await index.refresh();assert.equal(index.stats().events,2);assert.equal(index.stats().rounds,1);assert.equal(index.stats().requests,null);assert.equal(index.page({kind:'page',search:'workspace'}).total,1);}finally{index.close();}
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
  await index.refresh();const stats=index.stats();assert.equal(stats.events,5);assert.equal(stats.requests,1);assert.equal(stats.tools,2);assert.equal(stats.errors,1);
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

test('PRD 2.5: attachments split and bookkeeping stays hidden',()=>fixture(async root=>{
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

test('PRD 2.5: Codex token records are hidden bookkeeping rows, visible with show all',()=>fixture(async root=>{
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
  assert.equal(visible.stats.rounds,1);
  assert.equal(visible.events.filter(event=>event.kind==='system').length,2);
  const hidden=index.page({kind:'page',showBookkeeping:true});
  assert.equal(hidden.total,9);
  assert.equal(hidden.events.filter(event=>event.bookkeeping).length,6);
  assert.equal(hidden.events.filter(event=>event.bookkeeping&&/token_count|token_usage_record/.test(event.preview)).length,4);
  assert.deepEqual(Object.keys(hidden.stats).sort(),['errors','events','requests','rounds','tools']);
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

test('PRD 2.5: brush paging uses the first hit still visible in the current filter',()=>fixture(async root=>{
 const source=path.join(root,'log.jsonl');
 const users=Array.from({length:81},(_,index)=>({type:'user',timestamp:stamp,message:{content:`user ${index+1}`}}));
 await writeFile(source,jsonl([
  ...users,
  {type:'assistant',timestamp:stamp,message:{id:'req-brush',content:[{type:'text',text:'assistant note'}]}},
  {type:'user',timestamp:stamp,message:{content:'user after assistant'}},
 ]));
 const index=new TraceIndex(source,path.join(root,'cache.sqlite'),'claude');
 try {
  await index.refresh();
  const all=index.page({kind:'page',limit:200});
  const assistant=all.events.find(event=>event.kind==='assistant');
  const firstUser=all.events.find(event=>event.preview==='user 1');
  const lastUser=all.events.find(event=>event.preview==='user after assistant');
  assert.ok(assistant&&firstUser&&lastUser);
  const hits=[firstUser.id,assistant.id,lastUser.id];
  const userPage=index.page({kind:'page',filter:'user',hitIds:hits,limit:80});
  assert.equal(userPage.offset,0);
  assert.equal(userPage.events[0].id,firstUser.id);
  // 第一条命中是助手，当前筛选是用户时，滚到后面仍可见的那条用户，而不是跳到助手所在页。
  const later=index.page({kind:'page',filter:'user',hitIds:[assistant.id,lastUser.id],limit:80});
  assert.equal(later.offset,80);
  assert.ok(later.events.some(event=>event.id===lastUser.id));
  assert.ok(later.events.every(event=>event.id!==assistant.id));
  const assistantPage=index.page({kind:'page',filter:'assistant',hitIds:hits,limit:80});
  assert.equal(assistantPage.events[0].id,assistant.id);
  // 命中全被筛选排除时停在当前页起点，不按被排除的序号换页。宿主看到这一页没有命中就不会替换窗口。
  const excluded=index.page({kind:'page',filter:'user',hitIds:[assistant.id],limit:80});
  assert.equal(excluded.offset,0);
  assert.ok(excluded.events.every(event=>event.id!==assistant.id));
  const tools=index.page({kind:'page',filter:'tool',hitIds:hits,limit:80});
  assert.equal(tools.total,0);
  assert.equal(tools.events.length,0);
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
  const { timelineHoverText } = load('src/components/tasks/workspace/trace/formatTraceDuration.ts');
  const start = new Date(2026, 10, 13, 10, 4, 22, 938);
  const total = (ms) => `总计 ${ms} 毫秒`;
  assert.equal(timelineHoverText({ timestamp: start.toISOString(), durationMs: 88 }, '工具', '未记录', total), '工具\n10:04:22.938 → 10:04:23.026\n总计 88 毫秒');
  assert.equal(timelineHoverText({ timestamp: start.toISOString() }, '工具', '未记录', total), '工具\n10:04:22.938\n未记录');
});

test('timeline round lines use each round earliest timed event and merge within 4px',()=>{
  const {roundStarts,mergeRoundMarks}=load('src/components/tasks/workspace/trace/timelineRounds.ts');
  const at=seconds=>new Date(Date.parse('2026-11-06T08:00:00.000Z')+seconds*1000).toISOString();
  const events=[
    {id:1,kind:'system',round:0,timestamp:at(0),preview:''},
    {id:2,kind:'user',round:1,preview:''},
    {id:3,kind:'assistant',round:1,timestamp:at(2),preview:''},
    {id:4,kind:'tool',round:1,timestamp:at(1),preview:''},
    {id:5,kind:'user',round:3,timestamp:at(10),preview:''},
    {id:6,kind:'user',round:4,timestamp:at(10.2),preview:''},
    {id:7,kind:'user',round:5,timestamp:at(50),preview:''},
  ];
  const starts=roundStarts(events);
  // 第 0 轮不画线；第 1 轮用户输入没有时间，工具在 1s，早于记录顺序上排在前面的助手 2s，取该轮最早时间；第 2 轮没有带时间事件，不估算。
  assert.deepEqual(starts.map(item=>item.round),[1,3,4,5]);
  assert.equal(starts[0].at,Date.parse(at(1)));
  const start=Date.parse(at(0)),total=50000;
  assert.deepEqual(mergeRoundMarks(starts,start,total,1000).map(mark=>[mark.from,mark.to]),[[1,1],[3,3],[4,4],[5,5]]);
  assert.deepEqual(mergeRoundMarks(starts,start,total,500).map(mark=>[mark.from,mark.to]),[[1,1],[3,4],[5,5]]);
  assert.deepEqual(mergeRoundMarks(starts,start,total,0),[]);
  // 窗口外的轮次不参与合并，否则会把窗口内第一条并进看不见的线。
  const outside=[{round:1,at:99},{round:2,at:120}];
  assert.equal(mergeRoundMarks(outside,100,1000,100).length,1);
  assert.deepEqual(mergeRoundMarks(outside.filter(item=>item.at>=100&&item.at<=1100),100,1000,100).map(mark=>mark.from),[2]);
});

test('timeline projection packs records by default and can use actual duration',()=>{
  const {projectTimeline,spansOverlapping}=load('src/components/tasks/workspace/trace/timelineProjection.ts');
  const at=seconds=>new Date(Date.parse('2026-11-06T08:00:00.000Z')+seconds*1000).toISOString();
  const events=[
    {id:1,kind:'user',round:1,timestamp:at(0),durationMs:1000,preview:''},
    {id:2,kind:'tool',round:1,timestamp:at(10),durationMs:1000,preview:''},
    {id:3,kind:'assistant',round:2,timestamp:at(1),durationMs:500,preview:''},
  ];
  const sequence=projectTimeline(events,'sequence');
  assert.equal(sequence.end,3);
  assert.deepEqual(sequence.spans.map(span=>[span.id,span.start,span.end]),[[1,0,1],[2,1,2],[3,2,3]]);
  // 第 1 轮的工具在墙上更晚，等宽记录仍把竖线放在该轮第一条记录。
  // 槽位是半开区间，选区从 1 开始不含第 0 格 [0, 1)，只含 [1, 2) 和 [2, 3)。
  assert.deepEqual(sequence.rounds.map(item=>[item.round,item.at]),[[1,0],[2,2]]);
  assert.deepEqual(spansOverlapping(sequence.spans,1,2.2),[2,3]);
  assert.deepEqual(spansOverlapping(sequence.spans,1.1,1.2),[2]);
  assert.deepEqual(spansOverlapping([{id:9,start:1,end:1}],1,1),[9]);
  assert.deepEqual(spansOverlapping([{id:9,start:1,end:1}],0,0.5),[]);
  const duration=projectTimeline(events,'duration');
  const spanOf=id=>duration.spans.find(item=>item.id===id);
  // 按开始时间排序后，第 3 条紧挨第 1 条，第 2 条前面有 8500ms 空等被抽掉。
  assert.equal(spanOf(2).start-duration.start,1500);
  assert.equal(spanOf(2).end-duration.start,2500);
  assert.equal(duration.end-duration.start,2500);
  assert.equal(spanOf(3).start-duration.start,1000);
  assert.deepEqual(spansOverlapping(duration.spans,duration.start,duration.end),[1,2,3]);
  // 后记录的工具时间被倒推到更早：等宽竖线仍在第一条，时长模式跟最早时刻。
  const grok=[
    {id:1,kind:'assistant',round:1,timestamp:at(2),durationMs:0,preview:''},
    {id:2,kind:'tool',round:1,timestamp:at(1),durationMs:500,preview:''},
  ];
  assert.equal(projectTimeline(grok,'sequence').rounds[0].at,0);
  assert.equal(projectTimeline(grok,'duration').rounds[0].at,Date.parse(at(1)));
  assert.equal(projectTimeline([{id:1,kind:'user',round:1,preview:''}],'sequence'),null);
  assert.equal(projectTimeline([{id:1,kind:'user',round:1,timestamp:'nope',preview:''}],'duration'),null);
});

test('timeline viewport zooms around the pointer, pans, and keeps a short brush on the visible window',()=>{
  const {
    applyTimelineWheel,clampTimelineViewport,edgePanTimelineViewport,panTimelineViewport,revealTimelineViewport,
    timelineWheelPixels,zoomTimelineViewport,
  }=load('src/components/tasks/workspace/trace/timelineViewport.ts');
  const {expandTimelineRange}=load('src/components/tasks/workspace/trace/traceRange.ts');
  const anchorOf=(viewport,fraction,fullStart,fullDuration)=>{
    const start=viewport?viewport.start:fullStart;
    const duration=viewport?viewport.end-viewport.start:fullDuration;
    return start+fraction*duration;
  };
  for (const fraction of [0,0.5,1]) {
    const before=anchorOf(null,fraction,0,100000);
    const next=zoomTimelineViewport(0,100000,null,fraction,-200);
    assert.ok(next);
    assert.ok(Math.abs(anchorOf(next,fraction,0,100000)-before)<1e-6);
  }
  assert.equal(zoomTimelineViewport(0,100000,{start:0,end:50000},0.5,10000),null);
  assert.equal(zoomTimelineViewport(0,10,null,0.5,-500),null);
  let view=null;
  for (let step=0;step<80&&(!view||view.end-view.start>20);step++) view=zoomTimelineViewport(0,1_000_000,view,0.2,-400);
  assert.ok(view);
  assert.ok(Math.abs(view.end-view.start-20)<1e-6);
  const slots=zoomTimelineViewport(0,220,null,0.5,-5000,4);
  assert.ok(slots);
  assert.ok(Math.abs(slots.end-slots.start-4)<1e-6);
  const zoomed={start:0,end:50000};
  const wider=zoomTimelineViewport(0,100000,zoomed,0,10);
  assert.ok(wider&&wider.end-wider.start>50000&&wider.end-wider.start<100000);
  // 放大之后正向 deltaY 必须把窗口放宽；水平滑动只平移，不改变时长。双指张开即使水平分量更大也仍然缩放。
  const zoomedWindow={start:1000,end:2000};
  const zoomedOut=applyTimelineWheel(0,100000,zoomedWindow,{deltaX:0,deltaY:40,deltaMode:0,ctrlKey:false,anchorFraction:0.5,widthPx:200});
  assert.ok(zoomedOut&&zoomedOut.end-zoomedOut.start>1000);
  const slid=applyTimelineWheel(0,100000,zoomedWindow,{deltaX:50,deltaY:4,deltaMode:0,ctrlKey:false,anchorFraction:0.5,widthPx:100});
  assert.ok(slid);
  assert.equal(slid.end-slid.start,1000);
  assert.ok(slid.start>zoomedWindow.start);
  const pinch=applyTimelineWheel(0,100000,zoomedWindow,{deltaX:80,deltaY:-40,deltaMode:0,ctrlKey:true,anchorFraction:0.5,widthPx:100});
  assert.ok(pinch&&pinch.end-pinch.start<1000);
  assert.equal(applyTimelineWheel(0,100000,null,{deltaX:80,deltaY:0,deltaMode:0,ctrlKey:false,anchorFraction:0.2,widthPx:100}),null);
  assert.equal(timelineWheelPixels(1,1),16);
  assert.equal(timelineWheelPixels(3,0),3);
  assert.equal(panTimelineViewport(0,1000,0,100,-10000,100).start,900);
  assert.equal(panTimelineViewport(0,1000,100,100,10000,100).start,0);
  const kept={start:100,end:200};
  assert.equal(revealTimelineViewport(0,1000,kept,150,160),kept);
  const revealedLeft=revealTimelineViewport(0,1000,kept,10,20);
  assert.equal(revealedLeft.start,10);
  assert.equal(revealedLeft.end-revealedLeft.start,100);
  const revealedRight=revealTimelineViewport(0,1000,kept,900,950);
  assert.equal(revealedRight.start,850);
  assert.equal(revealedRight.end-revealedRight.start,100);
  assert.equal(clampTimelineViewport(0,100,{start:-50,end:-1}),null);
  assert.equal(clampTimelineViewport(0,100,{start:200,end:300}),null);
  assert.equal(clampTimelineViewport(0,100,{start:0,end:99.95}),null);
  const inside={start:10,end:40};
  assert.equal(clampTimelineViewport(0,100,inside),inside);
  const pulled=clampTimelineViewport(0,100,{start:90,end:140});
  assert.equal(pulled.start,50);
  assert.equal(pulled.end,100);
  const edge=edgePanTimelineViewport(0,1000,{start:100,end:200},0,100);
  assert.equal(edge.start,97.5);
  assert.equal(edgePanTimelineViewport(0,1000,{start:100,end:200},50,100).start,100);
  const fullStart=0,fullEnd=100000,visible=1000,width=200;
  const expanded=expandTimelineRange(500,501,fullStart,fullEnd,width,visible);
  const minMs=Math.max(3/width,0.005)*visible;
  assert.ok(Math.abs(Date.parse(expanded.to)-Date.parse(expanded.from)-minMs)<1);
  assert.ok(Date.parse(expanded.from)>=fullStart&&Date.parse(expanded.to)<=fullEnd);
  const unscaled=expandTimelineRange(fullStart+1000,fullStart+1001,fullStart,fullEnd,width);
  assert.ok(Date.parse(unscaled.to)-Date.parse(unscaled.from)>=Math.max(3/width,0.005)*(fullEnd-fullStart)-1);
});

test('right drag under 3px does not pan the timeline',()=>{
  const {beginAxisPointer,brushDraftFromPointer,panFromPointer,DRAG_THRESHOLD_PX}=load('src/components/tasks/workspace/trace/timelineAxisPointer.ts');
  const gesture={fullStart:0,fullEnd:1000,viewport:{start:100,end:200},minDuration:20};
  const rect={left:0,width:200};
  const started=beginAxisPointer(2,7,40,rect,gesture);
  assert.equal(started.kind,'pan');
  assert.equal(panFromPointer(started.session,40+DRAG_THRESHOLD_PX-0.01,200,0,1000),undefined);
  assert.equal(started.session.moved,false);
  const next=panFromPointer(started.session,40+DRAG_THRESHOLD_PX,200,0,1000);
  assert.ok(next);
  assert.ok(next.start<100);
  assert.equal(started.session.moved,true);
  const idle=beginAxisPointer(2,8,40,rect,{...gesture,viewport:null});
  assert.equal(idle.kind,'pan');
  assert.equal(panFromPointer(idle.session,80,200,0,1000),undefined);
  assert.equal(idle.session.moved,true);
  const drag=beginAxisPointer(0,1,10,rect,gesture);
  assert.equal(drag.kind,'drag');
  assert.equal(brushDraftFromPointer(drag.session,10+DRAG_THRESHOLD_PX,rect,0,1000,gesture),null);
  assert.equal(drag.session.moved,false);
  assert.ok(brushDraftFromPointer(drag.session,10+DRAG_THRESHOLD_PX+1,rect,0,1000,gesture));
  assert.equal(drag.session.moved,true);
});

test('range queries keep every row and return the first in-range index of the filtered list',()=>fixture(async root=>{
  const t0='2026-11-06T08:00:00.000Z',t5='2026-11-06T08:00:05.000Z',t10='2026-11-06T08:00:10.000Z',t15='2026-11-06T08:00:15.000Z';
  const source=path.join(root,'log.jsonl'),cache=path.join(root,'cache.sqlite');
  await writeFile(source,jsonl([
    {type:'user',timestamp:t0,message:{content:'alpha at start'}},
    {type:'assistant',uuid:'tool-record',timestamp:t0,message:{id:'req1',content:[{type:'tool_use',id:'call1',name:'Bash',input:{command:'npm test'}}]}},
    {type:'user',timestamp:t5,message:{content:[{type:'tool_result',tool_use_id:'call1',content:'ok'}]}},
    {type:'user',timestamp:t10,message:{content:'bravo mid'}},
    {type:'user',timestamp:t15,message:{content:'charlie later'}},
    {type:'user',message:{content:'untimed note'}},
    {type:'last-prompt',timestamp:t10,lastPrompt:'hidden bookkeeping'},
  ]));
  const index=new TraceIndex(source,cache,'claude');
  try {
    await index.refresh();
    const all=index.page({kind:'page'});
    assert.equal(all.rangeFirstIndex,undefined);
    const tool=index.page({kind:'page',filter:'tool'}).events[0];
    assert.equal(tool.durationMs,5000);
    // 工具从 08:00:00 持续到 08:00:05，起点在选区之前也算命中；框选不再收窄列表。
    const inside=index.page({kind:'page',from:'2026-11-06T08:00:03.000Z',to:'2026-11-06T08:00:08.000Z'});
    assert.equal(inside.total,all.total);
    assert.deepEqual(inside.events.map(event=>event.id),all.events.map(event=>event.id));
    assert.equal(inside.events[inside.rangeFirstIndex].callId,'call1');
    const points=index.page({kind:'page',from:t10,to:t15});
    assert.equal(points.events[points.rangeFirstIndex].preview,'bravo mid');
    // 叠加筛选和搜索后，下标指向过滤结果中的位置。
    const stacked=index.page({kind:'page',from:t0,to:t15,filter:'user',search:'charlie'});
    assert.equal(stacked.total,1);
    assert.equal(stacked.rangeFirstIndex,0);
    assert.equal(index.page({kind:'page',from:t10,to:t15,showBookkeeping:true}).rangeFirstIndex,points.rangeFirstIndex);
    const empty=index.page({kind:'page',from:'2026-11-06T08:00:30.000Z',to:'2026-11-06T08:00:40.000Z'});
    assert.equal(empty.rangeFirstIndex,null);
    assert.equal(empty.total,all.total);
    assert.equal(index.page({kind:'page',search:'untimed',from:t0,to:t15}).rangeFirstIndex,null);
    // 未指定 offset 时返回第一条命中所在的窗口；显式 offset 保持不变。
    const windowed=index.page({kind:'page',limit:2,from:t10,to:t15});
    assert.equal(windowed.offset,Math.floor(windowed.rangeFirstIndex/2)*2);
    assert.ok(windowed.events.some(event=>event.preview==='bravo mid'));
    assert.equal(index.page({kind:'page',limit:2,offset:0,from:t10,to:t15}).offset,0);
    assert.ok(index.timeline({kind:'timeline',from:t10,to:t15}).events.some(event=>event.preview.includes('alpha at start')));
  } finally {index.close();}
}));

test('range first index follows list order even when in-range rows are not contiguous',()=>fixture(async root=>{
  const at=second=>`2026-11-06T08:00:${String(second).padStart(2,'0')}.000Z`;
  const source=path.join(root,'log.jsonl');
  const many=Array.from({length:200},(_,index)=>({type:'user',timestamp:at(index<100?1:30),message:{content:`row ${index}`}}));
  // 长工具调用在第 150 条之后开始、跨进选区；更早的点事件不在选区内。
  await writeFile(source,jsonl([
    ...many.slice(0,150),
    {type:'assistant',uuid:'long-record',timestamp:at(2),message:{id:'long',content:[{type:'tool_use',id:'long-call',name:'Bash',input:{command:'sleep'}}]}},
    {type:'user',timestamp:at(20),message:{content:[{type:'tool_result',tool_use_id:'long-call',content:'done'}]}},
    ...many.slice(150),
  ]));
  const index=new TraceIndex(source,path.join(root,'cache.sqlite'),'claude');
  try {
    await index.refresh();
    const page=index.page({kind:'page',limit:80,from:at(10),to:at(15)});
    assert.equal(page.rangeFirstIndex,150);
    assert.equal(page.offset,80);
    assert.equal(page.events[page.rangeFirstIndex-page.offset].callId,'long-call');
  } finally {index.close();}
}));

test('trace range helpers expand a short drag, merge windows and distinguish overlap rules',()=>{
  const {eventInBrush,eventOverlapsRange,expandTimelineRange,mergeTraceWindows}=load('src/components/tasks/workspace/trace/traceRange.ts');
  const start='2026-11-06T08:00:00.000Z', mid='2026-11-06T08:00:05.000Z', end='2026-11-06T08:00:10.000Z';
  assert.equal(eventOverlapsRange({timestamp:start},start,end),true);
  assert.equal(eventOverlapsRange({timestamp:end},start,end),true);
  assert.equal(eventOverlapsRange({timestamp:'2026-11-06T07:59:59.000Z'},start,end),false);
  assert.equal(eventOverlapsRange({timestamp:start,durationMs:5000},mid,end),true);
  assert.equal(eventOverlapsRange({timestamp:start,durationMs:10000},end,'2026-11-06T08:00:20.000Z'),true);
  assert.equal(eventOverlapsRange({timestamp:start,durationMs:4000},end,'2026-11-06T08:00:20.000Z'),false);
  assert.equal(eventOverlapsRange({},start,end),false);
  // 有 ids 时忽略墙上重叠。空数组表示一格都没框中，全部算在选区外。
  assert.equal(eventInBrush({id:2,timestamp:start,durationMs:10000},{from:start,to:end,ids:[1]}),false);
  assert.equal(eventInBrush({id:1,timestamp:'2026-11-06T07:00:00.000Z'},{from:start,to:end,ids:[1]}),true);
  assert.equal(eventInBrush({id:9,timestamp:start},{from:start,to:end,ids:[]}),false);
  assert.equal(eventInBrush({id:1,timestamp:start},{from:start,to:end}),true);
  const axisStart=Date.parse('2026-11-06T08:00:00.000Z'), axisEnd=Date.parse('2026-11-06T08:01:40.000Z');
  const expanded=expandTimelineRange(axisStart+1000,axisStart+1001,axisStart,axisEnd,200);
  assert.ok(Date.parse(expanded.to)-Date.parse(expanded.from)>=Math.max(3/200,0.005)*(axisEnd-axisStart)-1);
  assert.ok(Date.parse(expanded.from)>=axisStart);
  assert.ok(Date.parse(expanded.to)<=axisEnd);
  const nearStart=expandTimelineRange(axisStart,axisStart+1,axisStart,axisEnd,200);
  assert.equal(Date.parse(nearStart.from),axisStart);
  const stats={events:3,rounds:1,requests:null,tools:0,errors:0};
  const first=mergeTraceWindows(null,{events:[{id:1},{id:2}],total:4,stats,offset:0},0);
  const merged=mergeTraceWindows(first,{events:[{id:3},{id:4}],total:4,stats,offset:2},2);
  assert.deepEqual(merged.events.map(event=>event.id),[1,2,3,4]);
  assert.equal(merged.offset,0);
  const jumped=mergeTraceWindows(first,{events:[{id:9}],total:4,stats,offset:3},3);
  assert.deepEqual(jumped.events.map(event=>event.id),[9]);
  assert.equal(jumped.offset,3);
});

test('window helpers pick visible neighbours and the newest windows',()=>{
  const {visibleWindowOffsets,tailWindowOffsets}=load('src/components/tasks/workspace/trace/traceRange.ts');
  assert.deepEqual(visibleWindowOffsets(800,200,215,80),[80,160,240]);
  assert.deepEqual(visibleWindowOffsets(800,0,10,80),[0,80]);
  assert.deepEqual(visibleWindowOffsets(250,240,249,80),[160,240]);
  assert.deepEqual(visibleWindowOffsets(250,240,249,80,0),[240]);
  assert.deepEqual(visibleWindowOffsets(0,0,0,80),[0]);
  assert.deepEqual(tailWindowOffsets(250,80),[160,240]);
  assert.deepEqual(tailWindowOffsets(80,80),[0]);
  assert.deepEqual(tailWindowOffsets(81,80),[0,80]);
  assert.deepEqual(tailWindowOffsets(0,80),[0]);
});
