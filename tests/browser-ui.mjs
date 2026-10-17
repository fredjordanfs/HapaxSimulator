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

let checks=0;
const check=(condition,label)=>{assert(condition,label);checks++;};
async function evaluate(expression) {
 const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
 assert(!r.exceptionDetails,JSON.stringify(r.exceptionDetails));return r.result.value;
}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const label=i=>evaluate(`document.querySelectorAll('.knob')[${i}].getAttribute('aria-label')`);
const number=i=>evaluate(`Number(document.querySelectorAll('.knob')[${i}].dataset.value)`);
async function mouse(type,x,y){await call('Input.dispatchMouseEvent',{type,x,y,button:'left',buttons:type==='mouseReleased'?0:1,clickCount:1})}
async function touch(type,x,y){await call('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'||type==='touchCancel'?[]:[{x,y,id:1,radiusX:3,radiusY:3}]});await evaluate('new Promise(requestAnimationFrame)')}
try {
 await call('Runtime.enable');await call('Page.enable');await call('Network.enable');await call('Network.setCacheDisabled',{cacheDisabled:true});
 await call('Page.navigate',{url:'http://127.0.0.1:8000/'});
 for(let i=0;i<100;i++){
  if(await evaluate(`!!document.querySelector('#displayleft')?.textContent`))break;
  await wait(100);
 }
 await evaluate(`localStorage.removeItem('hapax-simulator-v8')`);
 await call('Page.reload',{ignoreCache:true});
 for(let i=0;i<100;i++){
  if(await evaluate(`document.querySelectorAll('.knob').length===9&&document.querySelector('.knob').dataset.value==='100'`))break;
  await wait(100);
 }
 for(const [name,width,height,touchMode] of [['desktop',1440,1000,false],['ipad-landscape',1180,820,true],['ipad-portrait',820,1180,true]]){
  await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:touchMode});
  await call('Emulation.setTouchEmulationEnabled',{enabled:touchMode,maxTouchPoints:5});
  await evaluate('window.scrollTo(0,0)');await wait(50);
  const geometry=await evaluate(`Array.from(document.querySelectorAll('.knob'),k=>{
   const r=k.getBoundingClientRect(),s=getComputedStyle(k),p=getComputedStyle(k,'::after');
   const origin=p.transformOrigin.split(' ').map(parseFloat);
   const px=r.x+parseFloat(s.borderLeftWidth)+parseFloat(p.left)+origin[0];
   const py=r.y+parseFloat(s.borderTopWidth)+parseFloat(p.top)+origin[1];
   return {x:r.x+r.width/2,y:r.y+r.height/2,px,py,width:r.width,height:r.height};
  })`);
  for(let i=0;i<9;i++){
   const {x,y,px,py}=geometry[i];
   check(Math.abs(px-x)<0.1&&Math.abs(py-y)<0.1,`${name} encoder ${i+1} pivots at its physical centre`);
   const before=await number(i);
   const upper=before<120;
   const endY=y+(upper?-18:18),delta=upper?6:-6;
   if(touchMode){await touch('touchStart',x,y);await touch('touchMove',x,endY)}
   else {await mouse('mousePressed',x,y);await mouse('mouseMoved',x,endY)}
   check(await number(i)===before+delta,`${name} encoder ${i+1} drag value`);
   // Returning exactly to the starting point used to leave a stale value.
   if(touchMode)await touch('touchMove',x,y);else await mouse('mouseMoved',x,y);
   check(await number(i)===before,`${name} encoder ${i+1} return-to-origin`);
   if(touchMode)await touch('touchEnd',x,y);else await mouse('mouseReleased',x,y);
   check(await number(i)===before,`${name} encoder ${i+1} release must not add a click`);
   if(touchMode){await touch('touchStart',x,y);await touch('touchEnd',x,y)}
   else {await mouse('mousePressed',x,y);await mouse('mouseReleased',x,y)}
   check(await number(i)===before+1,`${name} encoder ${i+1} tap increments once`);
  }
  check(await evaluate('window.scrollY')===0,`${name} encoder gestures do not scroll page`);
 }
 // A cancelled touch must not become a phantom tap, and the next touch must work.
 const point=await evaluate(`(()=>{const r=document.querySelector('.knob').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const beforeCancel=await number(0);
 await touch('touchStart',point.x,point.y);await touch('touchCancel',point.x,point.y);
 check(await number(0)===beforeCancel,'Cancelled gesture does not increment');
 await touch('touchStart',point.x,point.y);await touch('touchEnd',point.x,point.y);
 check(await number(0)===beforeCancel+1,'Encoder works after pointercancel');

 // Rotary encoders keep turning at limits; reversing must respond immediately.
 await evaluate(`(()=>{const k=document.querySelector('.knob');for(let i=0;i<128;i++)k.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))})()`);
 check(await number(0)===127,'Velocity upper bound');
 const limitPoint=await evaluate(`(()=>{const r=document.querySelector('.knob').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const angleBefore=await evaluate(`document.querySelector('.knob').style.getPropertyValue('--angle')`);
 await touch('touchStart',limitPoint.x,limitPoint.y);await touch('touchMove',limitPoint.x,limitPoint.y-12);
 check(await evaluate(`document.querySelector('.knob').style.getPropertyValue('--angle')`)!==angleBefore,'Physical encoder turns beyond value limit');
 check(await number(0)===127,'Turning at maximum does not overflow MIDI value');
 await touch('touchMove',limitPoint.x,limitPoint.y-9);
 check(await number(0)===126,'Reverse direction responds immediately after reaching limit');
 await touch('touchEnd',limitPoint.x,limitPoint.y-9);
 // Exercise actual native keyboard activation, not synthetic button.click().
 await call('Emulation.setTouchEmulationEnabled',{enabled:false});
 await evaluate(`document.querySelectorAll('.knob')[8].focus()`);
 const beforeKeyboard=await number(8);
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,text:'\r',unmodifiedText:'\r'});
 await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
 check(await number(8)===beforeKeyboard+1,'Enter activates encoder once');
 // Real touch on pads, track selection and Play/Stop.
 await call('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
 const centre=selector=>evaluate(`(()=>{const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
 const tap=async selector=>{const p=await centre(selector);await touch('touchStart',p.x,p.y);await touch('touchEnd',p.x,p.y)};
 await tap('.pad');check(await evaluate(`document.querySelector('.pad').classList.contains('on')`),'Touch enables pad');
 await tap('[data-track="1"]');check(await evaluate(`!document.querySelector('.pad').classList.contains('on')`),'Touch selects independent track');
 await tap('[data-track="0"]');check(await evaluate(`document.querySelector('.pad').classList.contains('on')`),'Touch restores track notes');
 await tap('#transport');await wait(180);
 check(await evaluate(`document.querySelector('#transport').textContent.includes('STOP')`),'Touch starts transport');
 check(await evaluate(`document.querySelectorAll('.pad.head').length===8`),'Playhead is rendered on all rows');
 await tap('#transport');check(await evaluate(`document.querySelector('#transport').textContent.includes('PLAY')`),'Touch stops transport');

 // Hardware transport behavior from manual §1.5, distinct from the extra toggle.
 await tap('#leftcol button:nth-child(10)');await wait(180);
 await tap('#leftcol button:nth-child(10)');
 check(await evaluate(`document.querySelector('#transport').textContent.includes('STOP')`),'Hardware Play restarts without stopping');
 check(await evaluate(`document.querySelector('#displayright').textContent.includes('STEP 01/16')`),'Hardware Play restarts from first step');
 await tap('#leftcol button:nth-child(7)');
 check(await evaluate(`document.querySelector('#leftcol button:nth-child(7)').classList.contains('active')`),'REC armed');
 await tap('#leftcol button:nth-child(9)');
 check(await evaluate(`!document.querySelector('#leftcol button:nth-child(7)').classList.contains('active')`),'Stop disarms recording');
 // §1.20: 2ND + UNDO must redo, rather than undo again.
 await tap('#reset');await tap('#rightcol button[data-label="UNDO"]');
 check(await evaluate(`document.querySelector('.pad').classList.contains('on')`),'Undo restores cleared notes');
 await tap('#leftcol button:nth-child(1)');await tap('#rightcol button[data-label="UNDO"]');
 check(await evaluate(`!document.querySelector('.pad').classList.contains('on')`),'2ND + UNDO redoes clear');
 await tap('#leftcol button:nth-child(1)');
 // §1.23: BPM + main encoder changes tempo and updates its screen.
 await tap('#rightcol button[data-label="BPM"]');
 const tempoBefore=await evaluate(`Number(document.querySelector('#bpm').value)`);
 await evaluate(`document.querySelectorAll('.knob')[8].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}))`);
 check(await evaluate(`Number(document.querySelector('#bpm').value)`)===tempoBefore+1,'Main encoder edits BPM in tempo window');
 check(await evaluate(`document.querySelector('#displayright').textContent.includes('TEMPO')`),'Tempo window visible on right screen');
 await tap('#rightcol button[data-label="BPM"]');
 const pageBefore=await evaluate("document.querySelector('#displayleft').textContent");
 await tap('#rightcol button[data-label="+"]');
 check(await evaluate("document.querySelector('#displayleft').textContent")===pageBefore,'Unimplemented zoom does not navigate pages');

 const trackBefore=await evaluate("document.querySelector('[data-track].selected').dataset.track");
 const octaveBefore=await evaluate("document.querySelector('#displayleft').textContent");
 await tap('#rightcol button[data-label="↑"]');
 check(await evaluate("document.querySelector('[data-track].selected').dataset.track")===trackBefore,'Up changes octave without selecting another track');
 check(await evaluate("document.querySelector('#displayleft').textContent")!==octaveBefore,'Up updates octave screen');
 await tap('#rightcol button[data-label="↓"]');
 check(await evaluate("document.querySelector('#displayleft').textContent")===octaveBefore,'Down restores octave');
 // Idle screens should not be rebuilt 60 times a second. Let the last notice expire.
 await wait(2500);
 const idle=await evaluate(`(async()=>{
  let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);
  observer.observe(document.querySelector('#displayleft'),{childList:true,subtree:true});
  observer.observe(document.querySelector('#displayright'),{childList:true,subtree:true});
  await new Promise(r=>setTimeout(r,250));observer.disconnect();return mutations;
 })()`);
 check(idle===0,'No repeated screen DOM rebuilds while idle');
 check(errors.length===0,'No runtime exceptions');
 console.log(JSON.stringify({status:'passed',checks,viewports:3,runtimeErrors:errors.length,idleScreenMutations:idle}));
} finally {ws.close();}
