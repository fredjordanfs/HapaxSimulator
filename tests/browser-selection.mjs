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
const legacy=process.argv.includes('--legacy'),ipadNative=process.argv.includes('--ipad-native');
const mock = `
localStorage.removeItem('hapax-simulator-v8');
window.device = {messages:[],clears:0,mode:'ok',requests:[]};
Object.defineProperty(navigator,'platform',{configurable:true,value:${legacy||ipadNative?'"MacIntel"':'"Linux"'}});
Object.defineProperty(navigator,'maxTouchPoints',{configurable:true,value:${legacy||ipadNative?5:0}});
const makePort = (id,name) => ({id,name,state:'connected',
  async open(){ device.access.onstatechange?.(); return this; },
  send(data,at=performance.now()){device.messages.push({port:id,data:[...data],at,calledAt:performance.now(),scheduled:arguments.length>1});},
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
 const pad=(r,c)=>'.pad[data-row="'+r+'"][data-col="'+c+'"]';
 const on=(r,c)=>evaluate(`document.querySelector(${JSON.stringify(pad(r,c))}).classList.contains('on')`);
 const selected=()=>evaluate(`document.querySelectorAll('.pad.note-selected').length`);
 const points=async selectors=>Promise.all(selectors.map(async(selector,i)=>({...await centre(selector),id:i+1})));
 const touches=async(type,contacts)=>{await call('Input.dispatchTouchEvent',{type,touchPoints:contacts});await evaluate('new Promise(requestAnimationFrame)')};
 for(const [width,height] of [[1180,820],[820,1180]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:true});
  await call('Page.reload',{ignoreCache:true});await wait(150);
  // Some embedded browsers report trusted touch clicks with detail=0.
  await evaluate(`document.addEventListener('click',e=>{if(e.isTrusted)Object.defineProperty(e,'detail',{value:0})},true)`);
  for(const [r,c] of [[7,0],[6,2],[5,4],[4,6]])await tap(pad(r,c));
  check(await on(7,0)&&await on(6,2)&&await on(5,4),'Touch taps create the source notes at '+width+'px');
  check(await evaluate(`getComputedStyle(document.querySelector('.pad')).touchAction==='none'`),'Pad gestures do not trigger browser pan or pinch');
  // Four simultaneous contacts: three notes plus COPY; COPY is released first.
  const held=await points([pad(7,0),pad(6,2),pad(5,4),copy]);
  await touches('touchStart',[held[0]]);await touches('touchStart',held.slice(0,2));await touches('touchStart',held.slice(0,3));
  await wait(600);await touches('touchStart',held);
  check(await evaluate(`document.querySelector('#notice').textContent.includes('3 note(s)')`),'Three held notes are copied after a real long hold');
  await touches('touchEnd',held.slice(0,3));await touches('touchEnd',held.slice(0,2));await touches('touchEnd',[held[0]]);await touches('touchEnd',[]);
  check(await on(7,0)&&await on(6,2)&&await on(5,4),'Releasing copied contacts never toggles source notes');
  await tap(paste);
  check(await evaluate(`document.querySelector('#leftcol button:nth-child(5)').classList.contains('paste-armed')`),'A single PASTE tap arms the destination');
  await tap(pad(0,8));
  check(await on(7,8)&&await on(6,10)&&await on(5,12),'All three held notes paste with their pitch and spacing preserved');
  check(!await on(4,14),'Unselected source notes are excluded');
  // Selection at one finger: no simultaneous contacts required.
  await tap('#note-select');await tap(pad(7,0));await tap(pad(5,4));
  check(await selected()===2,'Two separate taps visibly select two notes');
  await tap(pad(5,4));check(await selected()===1&&await on(5,4),'A second tap deselects without erasing');await tap(pad(5,4));
  await tap(copy);
  check(await evaluate(`document.querySelector('#note-select').getAttribute('aria-pressed')==='false'`),'COPY exits selection mode');
  await tap(paste);await tap(pad(0,1));
  check(await on(7,1)&&await on(5,5),'Sequential one-finger selection copies multiple notes');
  check(!await on(6,3)&&!await on(4,7),'One-finger selection excludes other pattern notes');
  await tap('#rightcol [data-label="UNDO"]');
  check(!await on(7,1)&&!await on(5,5)&&await on(7,0),'Undo removes the whole partial paste and preserves its source');
  await tap('#note-select');await tap(pad(7,0));await tap(copy);await tap(paste);await tap(pad(0,3));
  check(await on(7,3)&&!await on(6,5),'The same sequential flow works for exactly one note');
  await tap('#note-select');await tap(pad(3,7));
  check(await selected()===0&&!await on(3,7),'Empty pads are neither selected nor created');
  await tap(copy);check(await evaluate(`document.querySelector('#notice').textContent.includes('au moins une note')`),'Empty selection cannot overwrite clipboard');
  await tap('#note-select');await tap(paste);await tap(paste);
  check(await evaluate(`!document.querySelector('#leftcol button:nth-child(5)').classList.contains('paste-armed')`),'A second PASTE tap cancels destination mode');
  await tap('#note-select');await tap(pad(7,0));await tap('#rightcol [data-label="→"]');
  check(await selected()===0&&await evaluate(`document.querySelector('#note-select').getAttribute('aria-pressed')==='false'`),'Changing page clears the page-scoped selection');
  await tap('#rightcol [data-label="←"]');
  // Pointer capture preserves the original held note if the finger drifts off its button.
  const drift=await points([pad(7,0),copy]);
  await touches('touchStart',[drift[0]]);drift[0].y-=45;await touches('touchMove',[drift[0]]);
  await touches('touchStart',drift);await touches('touchEnd',[drift[0]]);await touches('touchEnd',[]);
  await tap(paste);await tap(pad(0,7));
  check(await on(7,0)&&await on(7,7),'Finger drift does not lose the held source or copy the pad beneath it');
  // Native gesture cancellation must not leave COPY active.
  const cancelled=await points([copy]);await touches('touchStart',cancelled);await touches('touchCancel',[]);
  await tap(pad(2,15));check(await on(2,15),'After cancellation the next tap edits a note normally');
 }
 assert.equal(errors.length,0,JSON.stringify(errors));
 console.log(JSON.stringify({status:'passed',checks,viewports:2,multitouchContacts:4,zeroDetailTouchClicks:true,runtimeErrors:errors.length}));
}finally{
 if(injected)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});ws.close();
}
