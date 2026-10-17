// Start the app on port 8000 and a disposable Chromium debug session on 9222.
// This exercises real DOM handlers with a simulated Web MIDI device, not hardware.
import assert from 'node:assert/strict';
const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const target = pages.find(p => p.type === 'page');
assert(target, 'Chromium page target required');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
let id = 0;
const pending = new Map(), errors = [];
ws.onmessage = ({data}) => {
  const message = JSON.parse(data);
  if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
  if (message.id) {
    const {resolve, reject, timer} = pending.get(message.id);
    clearTimeout(timer); pending.delete(message.id);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  }
};
function call(method, params = {}) {
  return new Promise((resolve, reject) => {
    const key = ++id;
    const timer = setTimeout(() => { pending.delete(key); reject(new Error(method + ' timed out')); }, 15000);
    pending.set(key, {resolve, reject, timer});
    ws.send(JSON.stringify({id:key, method, params}));
  });
}
const legacy=process.argv.includes('--legacy');
const mock = `
localStorage.removeItem('hapax-simulator-v8');
window.device = {messages:[],clears:0,mode:'ok',requests:[]};
Object.defineProperty(navigator,'platform',{configurable:true,value:${legacy?'"MacIntel"':'"Linux"'}});
Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:${legacy?5:0}});
const makePort = (id,name) => ({id,name,state:'connected',
  async open(){ device.access.onstatechange?.(); return this; },
  send(data,at=performance.now()){device.messages.push({port:id,data:[...data],at});},
  clear(){ device.clears++; }
});
device.port=makePort('test','Test synth'); device.other=makePort('other','Other synth');
device.input={id:'keyboard',name:'USB keyboard',state:'connected',onmidimessage:null,async open(){device.access.onstatechange?.()}};
device.input2={id:'keyboard2',name:'Second keyboard',state:'connected',onmidimessage:null,async open(){device.access.onstatechange?.()}};
device.emit=(id,data)=>device.access.inputs.get(id)?.onmidimessage?.({data:new Uint8Array(data),receivedTime:performance.now()});
device.access={outputs:new Map([['test',device.port],['other',device.other]]),inputs:new Map([['keyboard',device.input],['keyboard2',device.input2]])};
if(${legacy}){
  delete device.port.clear;delete device.other.clear;delete device.port.open;delete device.other.open;delete device.input.open;delete device.input2.open;
  const original=device.access.outputs.values.bind(device.access.outputs);
  device.access.outputs.values=()=>{const iterator=original();return {next:()=>iterator.next()}};
}

device.request=async options=>{
  device.requests.push(options); if(device.mode==='denied')throw new DOMException('Denied','NotAllowedError');
  return device.access;
};
Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:device.request});
`;
let injected;
try{
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 injected=(await call('Page.addScriptToEvaluateOnNewDocument',{source:mock})).identifier;
 await call('Emulation.setDeviceMetricsOverride',{width:1180,height:820,deviceScaleFactor:1,mobile:true});
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 await call('Page.navigate',{url:'http://127.0.0.1:8000/'});
 const evaluate=async expression=>{
  const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
 };
 const wait=ms=>new Promise(r=>setTimeout(r,ms));let checks=0;
 const check=(value,label)=>{assert(value,label);checks++;};
 for(let i=0;i<100;i++){
  if(await evaluate(`!!document.querySelector('#displayleft')?.textContent`))break;
  await wait(100);
 }
 const centre=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const touch=async(type,p)=>{
  await call('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{...p,id:1}]});
  await evaluate('new Promise(requestAnimationFrame)');
 };
 const tap=async selector=>{const p=await centre(selector);await touch('touchStart',p);await touch('touchEnd',p)};
 const menu=async track=>{const p=await centre('[data-track="'+track+'"]');await touch('touchStart',p);await wait(550);await touch('touchEnd',p)};
 const turn=async(i,delta)=>evaluate(`(()=>{const k=document.querySelector('[data-knob="${i}"]');for(let n=0;n<${Math.abs(delta)};n++)k.dispatchEvent(new KeyboardEvent('keydown',{key:'${delta>0?'ArrowUp':'ArrowDown'}',bubbles:true}))})()`);
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const field=i=>evaluate(`document.querySelector('[data-track-field="${i}"]').textContent`);
 const clear=()=>evaluate('device.messages.length=0');
 const notes=()=>evaluate('device.messages.filter(m=>(m.data[0]&0xf0)===0x90)');
 const change=(selector,value)=>evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change'))})()`);
 const cfg=()=>evaluate(`JSON.parse(localStorage.getItem('hapax-simulator-v8')).trackData`);

 const copy='#leftcol button:nth-child(4)',paste='#leftcol button:nth-child(5)';
 const step='#rightcol [data-label="STEP"]',pattern='#rightcol [data-label="PATTERN"]';
 const pad=(r,c)=>'.pad[data-row="'+r+'"][data-col="'+c+'"]';
 const combo=async(modifier,target)=>{
  const a={...await centre(modifier),id:1},b={...await centre(target),id:2};
  for(const [type,points] of [['touchStart',[a]],['touchStart',[a,b]],['touchEnd',[a]],['touchEnd',[]]]){
   await call('Input.dispatchTouchEvent',{type,touchPoints:points});await evaluate('new Promise(requestAnimationFrame)');
  }
 };
 const on=(r,c)=>evaluate(`document.querySelector(${JSON.stringify(pad(r,c))}).classList.contains('on')`);
 const project=()=>evaluate(`JSON.parse(localStorage.getItem('hapax-simulator-v8'))`);
 await click('#midi-connect');await wait(40);await change('#midi-output','test');await wait(40);
 await click(pad(7,0));await click(pad(6,2));
 // Existing page shortcut, with playback length and undo included.
 await tap(copy);await tap('#rightcol [data-label="→"]');await tap(paste);
 check(await on(7,0)&&await on(6,2),'Simple COPY/PASTE copies the whole page');
 await click('#save');check((await project()).trackData[0].patterns[0].length===32,'Pasting page 2 extends playback length');
 await tap('#rightcol [data-label="UNDO"]');
 check(!await on(7,0)&&!await on(6,2),'UNDO removes the pasted page');
 await click('#save');check((await project()).trackData[0].patterns[0].length===16,'UNDO also restores the original length');
 await tap('#rightcol [data-label="←"]');
 // Hardware-style modifier gestures with two simultaneous touch contacts.
 await combo(copy,pad(7,0));await combo(paste,pad(2,4));
 check(await on(7,0)&&await on(7,4)&&!await on(2,4),'COPY + pad and PASTE + pad preserve pitch and move the note');
 await tap('#leftcol button:nth-child(1)');await combo(paste,pad(5,6));await tap('#leftcol button:nth-child(1)');
 check(await on(5,6),'2ND + PASTE transposes to the target row');
 await combo(pad(6,2),copy);await combo(paste,pad(0,8));
 check(await on(6,2)&&await on(6,8),'Holding a note then COPY does not erase the source');
 await combo('#leftcol button:nth-child(6)',pad(6,8));
 check(!await on(6,8),'DELETE + pad deletes only that note');
 await tap('#rightcol [data-label="UNDO"]');check(await on(6,8),'Note deletion is undoable');
 // Independent page clipboard snapshots, no shared references.
 await tap(copy);await click(pad(7,0));await tap('#rightcol [data-label="→"]');await tap(paste);
 check(await on(7,0),'Clipboard remains a snapshot after source editing');
 await tap('#rightcol [data-label="←"]');
 await change('#midi-channel','7');
 await combo(copy,'[data-track="0"]');await combo(paste,'[data-track="1"]');
 await tap('[data-track="1"]');
 check(await on(6,2)&&await on(7,4),'Track paste includes the source notes');
 check(await evaluate(`document.querySelector('#midi-channel').value==='7'`),'Track paste includes MIDI channel');
 await tap('#rightcol [data-label="→"]');check(await on(7,0),'Track paste includes all pages');
 await tap('#rightcol [data-label="UNDO"]');
 check(!await on(7,0),'UNDO restores the destination track');
 check(await evaluate(`document.querySelector('#midi-channel').value==='2'`),'UNDO restores destination MIDI channel');
 await tap('[data-track="0"]');await tap(pattern);
 await combo(copy,pad(0,0));await combo(paste,pad(2,2));await tap(pad(2,2));await tap(step);
 await click('#save');let data=await project();
 check(data.track===2&&data.pattern===2,'PATTERN pad selects the column track and row pattern');
 check(data.patterns[2][2][0][6][2]===100&&data.patterns[2][2][1][7][0]===100,'Pattern copy spans every page across tracks');
 check(data.trackData[2].patterns[2].length===32,'Pattern copy includes its playback length');
 await tap(pattern);await combo('#leftcol button:nth-child(6)',pad(2,2));await tap(step);
 check(!await on(6,2),'DELETE + pattern erases the destination pattern');
 await tap('#rightcol [data-label="UNDO"]');check(await on(6,2),'UNDO restores the deleted pattern');
 // Fresh profile for a controlled straight rhythm.
 await call('Page.reload',{ignoreCache:true});await wait(250);
 await click('#midi-connect');await wait(30);await change('#midi-output','test');await wait(40);
 for(let c=0;c<16;c++)await click(pad(7,c));
 await change('#bpm','300');await clear();
 await evaluate(`window.leftNode=document.querySelector('#displayleft').firstChild;window.knobMutations=0;window.knobObserver=new MutationObserver(records=>knobMutations+=records.length);knobObserver.observe(document.querySelector('#knobleft'),{attributes:true,subtree:true});`);
 // Correspondence between physical locations, displayed values, and MIDI side effects.
 for(let i=0;i<8;i++)check(await evaluate(`document.querySelector('[data-encoder-field="${i}"]').textContent.includes(${JSON.stringify(['VÉLOCITÉ','OCTAVE','GATE','SWING','CC 24','CC 25','CC 26','CC 27'][i])})`),'Encoder '+(i+1)+' field names its actual function');
 await turn(1,1);
 check(await evaluate(`document.querySelector('[data-encoder-field="1"] strong').textContent==='4'`),'Octave advances by one at the first detent');await turn(1,-1);
 await turn(3,1);
 check(await evaluate(`document.querySelector('[data-encoder-field="3"] strong').textContent==='1%'`),'Swing advances by one percent at the first detent');await turn(3,-1);
 await turn(2,-1);
 check(await evaluate(`document.querySelector('[data-knob="2"]').getAttribute('aria-label').includes(document.querySelector('[data-encoder-field="2"] strong').textContent)`),'Encoder accessibility label matches displayed musical value');
 check(!(await evaluate('device.messages')).some(m=>(m.data[0]&0xf0)===0xb0),'Musical encoder does not send a CC to the synthesizer');
 await click('#transport');await evaluate('window.leftNode=document.querySelector("#displayleft").firstChild;window.knobMutations=0');await wait(1450);
 check(await evaluate(`document.querySelector('#displayleft').firstChild===leftNode`),'Playback preserves the screen DOM instead of rebuilding it every step');
 check(await evaluate('knobMutations===0'),'Playback never rewrites encoder attributes');
 check(await evaluate(`Number(document.querySelector('#playhead-position').textContent.split('/')[0])>1`),'Lightweight playback counter still advances');
 let sequence=await notes();await click('#transport');
 check(sequence.length>=25,'Continuous straight rhythm produces the expected notes');
 const intervals=sequence.slice(1).map((m,i)=>m.at-sequence[i].at);
 if(!legacy)check(intervals.every(dt=>Math.abs(dt-50)<0.001),'Every native MIDI timestamp is precisely on the 50ms grid');
 else check(intervals.every(dt=>dt>0),'Bridge emits notes in chronological order');
 const deviations=intervals.map(dt=>Math.abs(dt-50)).sort((a,b)=>a-b);
 const timing={notes:sequence.length,p95IntervalDeviationMs:deviations[Math.floor(deviations.length*.95)],maxIntervalDeviationMs:Math.max(...deviations)};
 await wait(1050);
 check(await evaluate(`document.querySelector('#midi-timing').textContent.includes(${JSON.stringify(legacy?'retard maximal':'horodatage natif')})`),'Timing diagnostic describes the active MIDI path');
 await tap('#rightcol [data-label="AUTOM"]');let before=await on(7,1);await click(pad(7,1));
 check(await on(7,1)===before,'Unimplemented automation does not silently edit notes');
 check(await evaluate(`document.querySelector('#notice').textContent.includes('non simulée')`),'Unimplemented functionality is explicitly announced');
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log(JSON.stringify({status:'passed',legacy,checks,timing,runtimeErrors:errors.length}));
}finally{
 if(injected)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});
 ws.close();
}
