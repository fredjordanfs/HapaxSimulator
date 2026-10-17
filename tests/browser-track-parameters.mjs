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
 await menu(0);
 check(await evaluate(`document.querySelectorAll('[data-track-field]').length===8`),'All eight primary track parameters are visible');
 // Exercise every physical encoder with actual touch motion while inside settings.
 for(let i=0;i<9;i++){
  const before=await evaluate(`document.querySelector('[data-knob="${i}"]').style.getPropertyValue('--angle')`);
  const p=await centre('[data-knob="'+i+'"]');await touch('touchStart',p);await touch('touchMove',{x:p.x,y:p.y-3});await touch('touchEnd',p);
  check(await evaluate(`document.querySelector('[data-knob="${i}"]').style.getPropertyValue('--angle')`)!==before,'Physical encoder '+(i+1)+' rotates in track settings');
 }
 // Initial touches authorize MIDI. Select track 1 output explicitly.
 await wait(30);
 check(await evaluate('device.requests.length===1'),'Permission requested once through facade');
 // The first OUTPUT drag requested access; choose the first USB output now.
 if(!(await evaluate(`document.querySelector('#midi-output').value==='test'`))){await turn(4,1);await wait(30)}
 check(await evaluate(`document.querySelector('#midi-output').value==='test'`),'Track 1 routes to first USB device');
 // Restore known settings after the gesture sweep, using the real controls.
 await turn(0,-128);await turn(0,1); // PC OFF -> 0
 await tap('[data-knob="0"]');await turn(0,-128);await turn(0,2); // MSB 1
 await tap('[data-knob="0"]');await turn(0,-128);await turn(0,4); // LSB 3
 // LENGTH fine resolution, then exactly four steps.
 await tap('[data-knob="2"]');await turn(2,-512);await turn(2,3);
 await turn(3,-10);await turn(3,1); // REVERSE
 await turn(1,-2);await turn(1,1); // RESTART
 await turn(5,-16);await turn(5,2); // output channel 3
 await turn(6,-16);await turn(6,2);await wait(30); // specific USB keyboard
 await turn(7,-16);await turn(7,5); // input channel 5
 check((await field(0)).includes('LSB')&&(await field(0)).includes('3'),'PC popup field edits LSB');
 check((await field(1)).includes('RESTART'),'TRIG setting visible');
 check((await field(2)).includes('4 PAS'),'LENGTH setting visible');
 check((await field(3)).includes('REVERSE'),'RUN setting visible');
 check((await field(6)).includes('USB keyboard'),'INPUT setting names selected device');
 check((await field(7)).includes('05'),'Input channel visible');
 await tap('#save');
 let saved=(await cfg())[0];
 check(saved.patterns[0].pc===0&&saved.patterns[0].msb===1&&saved.patterns[0].lsb===3,'PC/MSB/LSB settings persist');
 check(saved.output==='test'&&saved.input==='keyboard'&&saved.inputChannel===5,'Input and output routing persist independently');
 await tap('#rightcol [data-label="STEP"]');
 for(const [row,col] of [[7,0],[6,1],[5,2],[4,3]])await click('.pad[data-row="'+row+'"][data-col="'+col+'"]');
 await change('#bpm','300');await clear();await click('#transport');await wait(230);await click('#transport');
 let sent=await evaluate('device.messages');
 check(JSON.stringify((await notes()).slice(0,4).map(m=>m.data[1]))===JSON.stringify([63,62,61,60]),'REVERSE really sends the four notes in reverse order');
 const program=sent.filter(m=>(m.data[0]===0xb2&&[0,32].includes(m.data[1]))||m.data[0]===0xc2).map(m=>m.data);
 check(JSON.stringify(program)===JSON.stringify([[0xb2,0,1],[0xb2,32,3],[0xc2,0]]),'Bank MSB/LSB precede exactly one Program Change');
 check(sent.findIndex(m=>m.data[0]===0xc2)<sent.findIndex(m=>m.data[0]===0x92),'Program Change precedes the first note');
 await menu(0);await turn(3,1);await tap('#rightcol [data-label="STEP"]');
 await clear();await click('#transport');await wait(240);await click('#transport');
 check(JSON.stringify((await notes()).slice(0,5).map(m=>m.data[1]))===JSON.stringify([60,61,62,63,62]),'PING-PONG really changes the emitted note order');
 // A 32-step pattern must actually play the second page.
 await menu(0);await turn(3,-2);await turn(2,28);await tap('#rightcol [data-label="STEP"]');
 await tap('#rightcol [data-label="→"]');await click('.pad[data-row="7"][data-col="0"]');
 await clear();await click('#transport');await wait(900);await click('#transport');
 let sequence=await notes();
 check(sequence.length>=5,'Long pattern plays notes beyond first page');
 check(sequence[4].data[1]===60&&Math.abs(sequence[4].at-sequence[0].at-800)<(legacy?40:0.01),'Length 32 sends page 2 note at the 17th step');
 await tap('#rightcol [data-label="←"]');
 // Two patterns with distinct notes demonstrate FREE vs RESTART on actual playback.
 await menu(0);await turn(2,-28);await tap('#rightcol [data-label="STEP"]');
 const selectPattern=async row=>{await click('#rightcol [data-label="PATTERN"]');await click('.pad[data-row="'+row+'"][data-col="0"]');await click('#rightcol [data-label="STEP"]')};
 await selectPattern(1);await menu(0);await turn(2,-12);await tap('#rightcol [data-label="STEP"]');
 for(const [row,col] of [[0,0],[1,1],[2,2],[3,3]])await click('.pad[data-row="'+row+'"][data-col="'+col+'"]');
 await change('#bpm','120');
 for(const [mode,pitch] of [['FREE',65],['RESTART',67]]){
  await selectPattern(1);await menu(0);await turn(1,mode==='FREE'?-1:1);await tap('#rightcol [data-label="STEP"]');
  await selectPattern(0);await click('#transport');await wait(170);await clear();
  await selectPattern(1);await wait(170);await click('#transport');
  check((await notes())[0]?.data[1]===pitch,mode+' controls position of the newly selected pattern');
 }
 // Physical incoming messages: port and channel filtering plus channel remap.
 await selectPattern(0);await clear();
 await evaluate(`device.emit('keyboard2',[0x94,67,99]);device.emit('keyboard',[0x93,67,99])`);
 check((await notes()).length===0,'Wrong input port and wrong channel are rejected');
 await evaluate(`device.emit('keyboard',[0x94,67,99])`);
 check(JSON.stringify((await notes()).map(m=>m.data))===JSON.stringify([[0x92,67,99]]),'Selected input is forwarded to output channel 3');
 await wait(150);
 check(!await evaluate(`device.messages.some(m=>m.data[0]===0x82&&m.data[1]===67)`),'Incoming held note is not cut by a fixed gate');
 await evaluate(`device.emit('keyboard',[0x94,67,0])`);
 check(await evaluate(`device.messages.some(m=>m.data[0]===0x82&&m.data[1]===67)`),'Zero-velocity Note On releases original held note');
 await clear();await evaluate(`device.emit('keyboard',[0xb4,74,81]);device.emit('keyboard',[0xe4,0,64]);device.emit('keyboard',[0xc4,12])`);
 check(await evaluate(`device.messages.some(m=>m.data.join(',')==='178,74,81')&&device.messages.some(m=>m.data.join(',')==='226,0,64')&&device.messages.some(m=>m.data.join(',')==='194,12')`),'CC, pitch bend and Program Change input are remapped');

 // ALL channels on a specific port is distinct from ALL ACTIVE.
 await menu(0);await turn(7,-5);await tap('#rightcol [data-label="STEP"]');await clear();
 await evaluate(`device.emit('keyboard',[0x9f,70,90]);device.emit('keyboard',[0x8f,70,0])`);
 check(await evaluate(`device.messages.some(m=>m.data.join(',')==='146,70,90')`),'ALL input channels accepts channel 16 on the selected port');
 await menu(0);await turn(7,5);await tap('#rightcol [data-label="STEP"]');
 // ALL ACTIVE must follow the selected track, including Note Off after selection changes.
 await menu(0);await turn(6,-1);await tap('#rightcol [data-label="STEP"]');
 await clear();await evaluate(`device.emit('keyboard2',[0x9e,68,90])`);
 check((await notes()).length===1,'ALL ACTIVE accepts any port/channel on selected track');
 await tap('[data-track="1"]');await evaluate(`device.emit('keyboard2',[0x8e,68,0]);device.emit('keyboard',[0x94,69,90])`);
 check(await evaluate(`device.messages.some(m=>m.data[0]===0x82&&m.data[1]===68)`),'Note Off still reaches original route after track selection changes');
 check((await notes()).length===1,'ALL ACTIVE stops receiving new notes when track is not selected');

 // External MIDI input actually records a visible note when REC is armed.
 await tap('[data-track="0"]');await click('#leftcol button:nth-child(7)');
 await click('#transport');await wait(40);
 await evaluate(`device.emit('keyboard',[0x94,63,88]);device.emit('keyboard',[0x84,63,0])`);
 await wait(20);await click('#transport');await click('#save');
 check(await evaluate(`JSON.parse(localStorage.getItem('hapax-simulator-v8')).patterns[0][0][0][4][0]===88`),'REC stores incoming MIDI note and velocity on the current step');
 // Independent second output, and Clock/Panic on both used ports.
 await menu(1);await turn(4,2);await wait(30);await tap('#rightcol [data-label="STEP"]');
 check(await evaluate(`document.querySelector('#midi-output').value==='other'`),'Second track selects a different physical output');
 await click('.pad[data-row="7"][data-col="0"]');
 await evaluate(`document.querySelector('#midi-clock').checked=true;document.querySelector('#midi-clock').dispatchEvent(new Event('change'))`);
 await clear();await click('#transport');await wait(100);await click('#midi-panic');
 sent=await evaluate('device.messages');
 check(sent.some(m=>m.port==='test'&&m.data[0]===0x92)&&sent.some(m=>m.port==='other'&&m.data[0]===0x91),'Tracks play on independent output devices and channels');
 for(const port of ['test','other']){
  check(sent.some(m=>m.port===port&&m.data[0]===0xfa)&&sent.some(m=>m.port===port&&m.data[0]===0xf8)&&sent.some(m=>m.port===port&&m.data[0]===0xfc),'Clock/Start/Stop reach '+port);
  check(sent.some(m=>m.port===port&&(m.data[0]&0xf0)===0xb0&&m.data[1]===120),'Panic silences '+port);
 }
 await tap('#save');saved=await cfg();
 check(saved[0].output==='test'&&saved[1].output==='other','Independent output ports are saved');
 check(saved[0].patterns[0].length===4&&saved[0].patterns[1].length===4&&saved[0].patterns[1].trig==='RESTART','Settings remain independent per pattern');

 // Save a maximum-length pattern on page 32, then restore an older-format project plus new fields.
 await tap('[data-track="0"]');await selectPattern(2);await menu(0);await turn(2,600);await tap('#rightcol [data-label="STEP"]');
 await tap('#rightcol [data-label="←"]');await click('#save');
 check((await cfg())[0].patterns[2].length===512,'Length can reach 512 steps and persist');
 await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});
 injected=(await call('Page.addScriptToEvaluateOnNewDocument',{source:mock.replace("localStorage.removeItem('hapax-simulator-v8');",'')})).identifier;
 await call('Page.reload',{ignoreCache:true});
 let restored=false;
 for(let i=0;i<100;i++){
  if(await evaluate(`window.device?.requests.length===0&&document.querySelector('#displayleft')?.textContent.includes('PAGE 32/32')`)){restored=true;break}
  await wait(100);
 }
 check(restored,'Saved page 32 and project restore without re-requesting MIDI');
 await click('#midi-connect');await wait(60);
 check(await evaluate(`document.querySelector('#midi-output').value==='test'`),'Saved track output reopens after explicit MIDI authorization');
 await tap('[data-track="1"]');
 check(await evaluate(`document.querySelector('#midi-output').value==='other'`),'Second saved output reopens independently');
 await tap('[data-track="0"]');await selectPattern(0);await tap('#rightcol [data-label="→"]');await menu(0);
 check((await field(0)).includes('PC')&&(await field(0)).includes('0')&&(await field(2)).includes('4 PAS'),'Saved pattern parameters restore on screen');
 await tap('#rightcol [data-label="STEP"]');
 // A persistently failing physical port must halt without recursive cleanup errors.
 await evaluate(`device.port.send=()=>{throw Error('USB send failed')}`);
 await click('#transport');await wait(100);
 check(await evaluate(`document.querySelector('#transport').textContent.includes('PLAY')`),'Persistent USB send failure halts transport safely');
 assert.equal(errors.length,0,JSON.stringify(errors));
 if(process.argv.includes('--capture')){
  await menu(0);
  const {writeFile}=await import('node:fs/promises');
  await writeFile('/tmp/hapax-all-track-parameters.png',Buffer.from((await call('Page.captureScreenshot',{format:'png'})).data,'base64'));
 }
 console.log(JSON.stringify({status:'passed',legacy,checks,runtimeErrors:errors.length}));
}finally{
 if(injected)await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});
 ws.close();
}
