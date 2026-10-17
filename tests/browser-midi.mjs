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
device.access={outputs:new Map([['test',device.port],['other',device.other]])};
if(${legacy}){
  delete device.port.clear;delete device.other.clear;delete device.port.open;delete device.other.open;
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
try {
  await call('Runtime.enable');
  await call('Page.enable');
  injected = (await call('Page.addScriptToEvaluateOnNewDocument', {source:mock})).identifier;
  await call('Emulation.setDeviceMetricsOverride', {width:1440,height:1000,deviceScaleFactor:1,mobile:false});
  await call('Page.navigate', {url:'http://127.0.0.1:8000/'});
  let ready = false;
  for(let i=0;i<100;i++) {
    const r = await call('Runtime.evaluate', {expression:"!!document.querySelector('#displayleft')?.textContent",returnByValue:true});
    if(r.result.value) { ready = true; break; }
    await new Promise(r=>setTimeout(r,100));
  }
  assert(ready, 'Application initialization');
  const result = await call('Runtime.evaluate', {awaitPromise:true,returnByValue:true,expression:`(async()=>{
    let checks=0;
    const check=(ok,label)=>{if(!ok)throw Error(label);checks++;};
    const $=s=>document.querySelector(s), wait=ms=>new Promise(r=>setTimeout(r,ms));
    const change=(s,value)=>{const el=$(s);el.value=value;el.dispatchEvent(new Event('change'));};
    const button=(panel,text)=>[...document.querySelectorAll(panel+' button')].find(b=>b.textContent===text);
    const messages=()=>device.messages;
    check(device.requests.length===0,'Permission only after user gesture');
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:undefined});
    $('#midi-connect').click();
    check($('#midi-status').textContent.includes('indisponible'),'Unsupported browser message');
    Object.defineProperty(navigator,'requestMIDIAccess',{configurable:true,value:device.request});
    device.mode='denied'; $('#midi-connect').click(); await wait(20);
    check($('#midi-status').textContent.includes('refusé'),'Permission denial message');
    device.mode='ok'; $('#midi-connect').click(); await wait(20);
    check(device.requests.every(r=>r.sysex===false),'No SysEx requested');
    check($('#midi-output').options.length===3,'Device enumeration');
    check($('#midi-output').value==='','No automatic device selection');
    change('#midi-output','test'); await wait(20);
    check($('#midi-output').value==='test','Port remains selected after open statechange');
    check($('#midi-status').textContent.includes('Test synth'),'Device status');
    for(let track=0;track<16;track++){
      $('[data-track="'+track+'"]').click();
      check($('#midi-channel').value===String(track+1),'Default MIDI channel '+track);
    }
    $('[data-track="0"]').click(); change('#midi-channel','5');
    check($('#midi-channel').value==='5','Channel assignment');
    $('[data-track="1"]').click(); $('.pad[data-row="7"][data-col="0"]').click();
    $('[data-track="0"]').click();
    check($('#midi-channel').value==='5','Channel retained per track');
    $('.pad[data-row="7"][data-col="0"]').click();
    device.messages.length=0;
    for(let i=0;i<9;i++){
      const k=document.querySelectorAll('.knob')[i];
      k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
      check(messages().some(m=>m.data[0]===0xb4&&m.data[1]===20+i),'Encoder CC '+i);
    }
    change('#midi-encoder','4'); change('#midi-cc','74');
    document.querySelectorAll('.knob')[4].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    check(messages().at(-1).data[1]===74,'Custom CC assignment');
    change('#midi-cc','130'); check($('#midi-cc').value==='119','Channel-mode CCs excluded');
    // Reset pitch-related controls through the real encoder handlers.
    const octave=document.querySelectorAll('.knob')[1];
    for(let i=0;i<50;i++)octave.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    const gate=document.querySelectorAll('.knob')[2];
    for(let i=0;i<12;i++)gate.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    const swing=document.querySelectorAll('.knob')[3];
    for(let i=0;i<32;i++)swing.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));
    device.messages.length=0;
    $('#midi-clock').checked=true;$('#midi-clock').dispatchEvent(new Event('change'));
    device.messages.length=0;
    $('#transport').click(); await wait(360);
    check(messages().some(m=>m.data[0]===0xfa),'Start byte');
    check(messages().filter(m=>m.data[0]===0xf8).length>10,'Clock pulses');
    const on=messages().find(m=>m.data[0]===0x94);
    const off=messages().find(m=>m.data[0]===0x84);
    check(on&&off&&off.data[1]===on.data[1]&&off.at>on.at,'Sequenced note and scheduled Note Off');
    check(on.data[2]===100,'Stored note velocity preserved');
    const settings=$('#displayleft').textContent;
    const gatePercent=Number(settings.match(/GATE (\\d+)%/)[1]);
    const swingPercent=Number(settings.match(/SWING (\\d+)%/)[1]);
    check(Math.abs(off.at-on.at-125*(1+swingPercent/100)*gatePercent/100)<${legacy?35:0.001},'Gate and swing affect real note duration');
    check(messages().some(m=>m.data[0]===0x91),'All tracks play together');
    check(on.data[1]>=60&&on.data[1]<=127,'Octave maps to valid MIDI pitch');
    $('#transport').click();
    check(messages().at(-1).data[0]===0xfc,'Stop byte');
    check($('#transport').textContent.includes('PLAY'),'Transport stopped');
    button('#rightcol','LIVE').click();
    device.messages.length=0;
    $('.pad[data-row="6"][data-col="3"]').click();
    check(messages().some(m=>m.data[0]===0x94),'Live Note On');
    button('#leftcol','REC').click();
    $('.pad[data-row="5"][data-col="4"]').click();
    button('#rightcol','STEP').click();
    check($('.pad[data-row="5"][data-col="4"]').classList.contains('on'),'Live recording writes notes');
    button('#leftcol','MUTE').click(); device.messages.length=0;
    $('#transport').click(); await wait(80); $('#transport').click();
    check(!messages().some(m=>m.data[0]===0x94),'Muted track emits no notes');
    check(messages().some(m=>m.data[0]===0x91),'Other tracks remain audible');
    button('#leftcol','MUTE').click();
    button('#rightcol','LIVE').click(); button('#leftcol','REC').click(); $('#transport').click(); await wait(180);
    $('.pad[data-row="4"][data-col="0"]').click(); $('#transport').click();
    button('#rightcol','STEP').click();
    check(!!document.querySelector('.pad.on[data-row="4"]'),'REC captures live input while transport runs');
    $('#midi-clock').checked=false;$('#midi-clock').dispatchEvent(new Event('change'));
    device.messages.length=0; $('#transport').click(); await wait(100); $('#transport').click();
    check(!messages().some(m=>[0xfa,0xf8,0xfc].includes(m.data[0])),'Clock-disabled transport emits no sync bytes');
    $('#midi-clock').checked=true;$('#midi-clock').dispatchEvent(new Event('change'));
    $('#transport').click(); $('#midi-panic').click();
    check((${legacy}||device.clears>0)&&$('#transport').textContent.includes('PLAY'),'Panic clears queue and stops');
    for(let channel=0;channel<16;channel++)check(messages().some(m=>m.data[0]===(0xb0|channel)&&m.data[1]===120),'Panic channel '+channel);
    $('#transport').click(); change('#midi-output','other');await wait(20);
    check($('#transport').textContent.includes('PLAY'),'Output switch stops playback');
    check($('#midi-output').value==='other','New output selected');
    $('#transport').click();device.other.state='disconnected';device.access.onstatechange();
    check($('#transport').textContent.includes('PLAY'),'Disconnect stops playback');
    check($('#midi-status').textContent.includes('déconnectée'),'Disconnect status');
    device.access.outputs.clear(); device.access.onstatechange();
    $('#midi-connect').click();await wait(20);
    check($('#midi-status').textContent.includes('Aucune sortie MIDI'),'No devices message');
    device.port.state='connected';device.access.outputs.set('test',device.port);device.access.onstatechange();
    check($('#midi-output').options.length===2,'Hotplug refresh');
    $('#save').click();
    const saved=JSON.parse(localStorage.getItem('hapax-simulator-v8'));
    check(saved.channels[0]===5&&saved.ccNumbers[4]===119&&saved.clockEnabled===true,'MIDI settings saved');
    return {checks,messages:messages().length};
  })()`});
  assert(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
  assert.equal(errors.length,0,JSON.stringify(errors));

  // Real touch hold: settings must open on the screens, never select the track number.
  let trackChecks=0;
  const evaluate=async expression=>{
    const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
    assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
  };
  const trackCheck=(ok,label)=>{assert(ok,label);trackChecks++;};
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  await call('Emulation.setDeviceMetricsOverride',{width:1180,height:820,deviceScaleFactor:1,mobile:true});
  await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await evaluate('window.scrollTo(0,0)');
  const centre=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
  const touch=async(type,p)=>{
    await call('Input.dispatchTouchEvent',{type,touchPoints:['touchEnd','touchCancel'].includes(type)?[]:[{...p,id:1}]});
    await evaluate('new Promise(requestAnimationFrame)');
  };
  const tap=async selector=>{const p=await centre(selector);await touch('touchStart',p);await touch('touchEnd',p)};
  const hold=async selector=>{const p=await centre(selector);await touch('touchStart',p);await wait(600);return p;};
  const track=await hold('[data-track="5"]');
  trackCheck(await evaluate(`document.querySelector('#displayleft').textContent.includes('TRACK SETTINGS · PISTE 6')`),'Hold opens settings on left screen');
  trackCheck(await evaluate(`document.querySelector('#displayright').textContent.includes('RÉGLAGES PISTE 6')`),'Right screen explains settings');
  await touch('touchEnd',track);
  trackCheck(await evaluate(`document.querySelector('[data-track="5"]').getAttribute('aria-expanded')==='true'`),'Menu stays after releasing finger');
  trackCheck(await evaluate(`getComputedStyle(document.querySelector('[data-track="5"]')).userSelect==='none'&&getSelection().toString()===''`),'Track label is not selected as text');
  await tap('[data-knob="4"]');await wait(30);
  trackCheck(await evaluate(`document.querySelector('#midi-output').value==='test'`),'Encoder 5 selects USB output from facade');

  await evaluate(`device.messages.length=0`);
  for(const i of [0,1,2,3,6,7]){
    const p=await centre('[data-knob="'+i+'"]');
    const before=await evaluate(`document.querySelector('[data-knob="${i}"]').style.getPropertyValue('--angle')`);
    await touch('touchStart',p);await touch('touchMove',{x:p.x,y:p.y-12});await touch('touchEnd',p);
    trackCheck(await evaluate(`document.querySelector('[data-knob="${i}"]').getAttribute('aria-disabled')==='true'`),'Unassigned encoder '+i+' is explicitly inactive');
    trackCheck(await evaluate(`document.querySelector('[data-knob="${i}"]').style.getPropertyValue('--angle')`)===before,'Unassigned encoder '+i+' does not pretend to edit a parameter');
    trackCheck(await evaluate(`document.querySelector('#displayright').textContent.includes('INACTIF')`),'Inactive encoder explanation appears on device screen');
  }
  trackCheck(await evaluate(`device.messages.length===0`),'Inactive encoders emit no MIDI');
  await tap('[data-knob="5"]');
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='7'`),'Encoder 6 sets track 6 channel to 7');
  trackCheck(await evaluate(`document.querySelector('#displayleft').textContent.includes('07')`),'Channel is visible on left screen');
  const channelKnob=await centre('[data-knob="5"]');
  await touch('touchStart',channelKnob);
  await touch('touchMove',{x:channelKnob.x,y:channelKnob.y-9});
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='10'`),'Channel drag moves three units');
  await touch('touchMove',{x:channelKnob.x,y:channelKnob.y-9});
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='10'`),'Repeated pointer coordinate does not accumulate channel changes');
  await touch('touchMove',channelKnob);await touch('touchEnd',channelKnob);
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='7'`),'Returning channel drag restores initial channel without phantom tap');

  await evaluate(`(()=>{const k=document.querySelector('[data-knob="5"]');for(let i=0;i<20;i++)k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))})()`);
  const maximumAngle=await evaluate(`document.querySelector('[data-knob="5"]').style.getPropertyValue('--angle')`);
  await touch('touchStart',channelKnob);await touch('touchMove',{x:channelKnob.x,y:channelKnob.y-9});
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='16'`),'MIDI channel cannot exceed 16');
  trackCheck(await evaluate(`document.querySelector('[data-knob="5"]').style.getPropertyValue('--angle')`)!==maximumAngle,'Channel encoder keeps rotating at limit');
  await touch('touchMove',{x:channelKnob.x,y:channelKnob.y-6});await touch('touchEnd',channelKnob);
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='15'`),'Channel responds immediately to reverse gesture at maximum');
  await evaluate(`(()=>{const k=document.querySelector('[data-knob="5"]');for(let i=0;i<8;i++)k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))})()`);
  await evaluate(`device.messages.length=0`);
  await tap('[data-knob="8"]');
  trackCheck(await evaluate(`!document.querySelector('#displayleft').textContent.includes('TRACK SETTINGS')`),'Menu encoder closes settings');
  await tap('#rightcol [data-label="LIVE"]');
  await tap('.pad[data-row="7"][data-col="0"]');
  trackCheck(await evaluate(`device.messages.some(m=>m.data[0]===0x96)`),'Live notes use channel configured from facade');
  await tap('#rightcol [data-label="STEP"]');
  const cancelled=await centre('[data-track="2"]');
  await touch('touchStart',cancelled);await touch('touchCancel',cancelled);await wait(600);
  trackCheck(await evaluate(`!document.querySelector('#displayleft').textContent.includes('TRACK SETTINGS')`),'Cancelled hold does not open settings later');
  await touch('touchStart',cancelled);await touch('touchMove',{x:cancelled.x+25,y:cancelled.y});await wait(600);await touch('touchEnd',cancelled);
  trackCheck(await evaluate(`!document.querySelector('#displayleft').textContent.includes('TRACK SETTINGS')`),'Moved touch does not open a stale hold menu');
  await tap('[data-track="1"]');
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='2'`),'Other track retains its channel');
  const again=await hold('[data-track="5"]');await touch('touchEnd',again);
  trackCheck(await evaluate(`document.querySelector('#midi-channel').value==='7'`),'Edited track retains its channel after reselection');
  await tap('#rightcol [data-label="STEP"]');
  trackCheck(await evaluate(`document.querySelector('[data-track="5"]').getAttribute('aria-expanded')==='false'`),'STEP exits settings');
  await tap('[data-track="0"]');await tap('#save');
  trackCheck(await evaluate(`JSON.parse(localStorage.getItem('hapax-simulator-v8')).channels[5]===7`),'Facade channel setting is saved');

  // Fresh session: authorize and choose a port using only the facade.
  const savedProject=await evaluate(`localStorage.getItem('hapax-simulator-v8')`);
  await call('Page.reload');
  let fresh=false;
  for(let i=0;i<100;i++){
    if(await evaluate(`window.device?.requests.length===0&&document.querySelector('.knob')?.getAttribute('aria-label')==='Encodeur 1 : 100'`)){fresh=true;break}
    await wait(100);
  }
  assert(fresh,'Fresh facade-only session');
  const firstTrack=await hold('[data-track="0"]');await touch('touchEnd',firstTrack);
  await tap('[data-knob="4"]');await wait(30);
  trackCheck(await evaluate(`device.requests.length===1&&device.requests[0].sysex===false`),'Encoder 5 requests MIDI permission from facade');
  trackCheck(await evaluate(`document.querySelector('#midi-output').value===''`),'Authorization alone does not choose a port');
  await tap('[data-knob="4"]');await wait(30);
  trackCheck(await evaluate(`document.querySelector('#midi-output').value==='test'`),'Second encoder tap chooses first MIDI device');
  trackCheck(await evaluate(`document.querySelector('#displayleft').textContent.includes('Test synth')`),'Selected USB device appears on simulator screen');
  if(process.argv.includes('--capture-track-settings')){
    const shot=await call('Page.captureScreenshot',{format:'png'});
    const {writeFile}=await import('node:fs/promises');
    await writeFile('/tmp/hapax-track-settings-ui.png',Buffer.from(shot.data,'base64'));
  }
  await evaluate(`localStorage.setItem('hapax-simulator-v8',${JSON.stringify(savedProject)})`);
  await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});
  injected=null;
  await call('Page.reload');
  let restored=false;
  for(let i=0;i<100;i++){
    const r=await call('Runtime.evaluate',{returnByValue:true,expression:`(() => {
      const channel=document.querySelector('#midi-channel');
      if(!channel||channel.value!=='5')return false;
      const encoder=document.querySelector('#midi-encoder');encoder.value='4';encoder.dispatchEvent(new Event('change'));
      return document.querySelector('#midi-cc').value==='119'&&document.querySelector('#midi-clock').checked&&document.querySelector('#midi-output').value==='';
    })()`});
    if(r.result.value){restored=true;break}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(restored,'Project and MIDI settings restored without reconnecting hardware');
  assert.equal(errors.length,0,JSON.stringify(errors));
  console.log(JSON.stringify({status:'passed',legacy,...result.result.value,trackChecks,restored,runtimeErrors:errors.length}));
} finally {
  if(injected) await call('Page.removeScriptToEvaluateOnNewDocument',{identifier:injected});
  ws.close();
}
