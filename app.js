(function(){
'use strict';
const pads=[...document.querySelectorAll('.pad')], knobs=[...document.querySelectorAll('.knob')], tracks=[...document.querySelectorAll('[data-track]')];
const left=document.getElementById('displayleft'),right=document.getElementById('displayright'),transport=document.getElementById('transport'),bpm=document.getElementById('bpm'),notice=document.getElementById('notice');
const leftBtns=[...document.querySelectorAll('#leftcol button')],rightBtns=[...document.querySelectorAll('#rightcol button')];
const fresh=()=>Array.from({length:16},()=>Array.from({length:8},()=>Array(16).fill(0)));
const state={playing:false,recording:false,tempo:120,step:0,track:0,mode:'STEP',page:0,bank:'A',pattern:0,values:[100,54,95,0,64,64,64,64,1],patterns:Array.from({length:16},()=>Array.from({length:8},fresh)),clipboard:null,second:false,muted:new Set(),undo:[],redo:[],lastTick:performance.now(),gate:75,swing:0,scale:0,velocity:100,octave:3,metronome:false,fill:false,screenMessage:'',screenUntil:0,bpmEdit:false,trackSettings:false};
const knobAngles=state.values.map(value=>-135+270*value/127);
const midiChannel=document.getElementById('midi-channel'),midiOutput=document.getElementById('midi-output'),midiClock=document.getElementById('midi-clock'),midiEncoder=document.getElementById('midi-encoder'),midiCC=document.getElementById('midi-cc'),midiStatus=document.getElementById('midi-status');
state.channels=Array.from({length:16},(_,i)=>i+1);state.ccNumbers=Array.from({length:9},(_,i)=>20+i);state.clockEnabled=false;
for(let i=1;i<=16;i++)midiChannel.add(new Option(String(i),String(i)));
for(let i=0;i<9;i++)midiEncoder.add(new Option(String(i+1),String(i)));
const midi=new HapaxMidi({onStep:playMidiStep,onHalt:()=>{state.playing=false;state.recording=false;state.step=0;render()},onStatus:message=>{midiStatus.textContent=message;render()}});
let midiAccess=null,connectionVersion=0;
const ipadMidi=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function outputPorts(){return HapaxMidiCompat.ports(midiAccess?.outputs)}
const storageKey='hapax-simulator-v8';
function load(){try{const data=JSON.parse(localStorage.getItem(storageKey));if(!data)return;for(const k of ['tempo','track','mode','page','bank','pattern','patterns','values','gate','swing','scale','velocity','octave'])if(data[k]!==undefined)state[k]=data[k];state.page=Math.max(0,Math.min(3,state.page));state.pattern=Math.max(0,Math.min(7,state.pattern));state.muted=new Set(data.muted||[]);if(Array.isArray(data.channels)&&data.channels.length===16&&data.channels.every(n=>Number.isInteger(n)&&n>=1&&n<=16))state.channels=data.channels;if(Array.isArray(data.ccNumbers)&&data.ccNumbers.length===9&&data.ccNumbers.every(n=>Number.isInteger(n)&&n>=0&&n<=119))state.ccNumbers=data.ccNumbers;state.clockEnabled=data.clockEnabled===true}catch(e){console.warn('Load:',e)}}
function save(){try{const keys=['tempo','track','mode','page','bank','pattern','patterns','values','gate','swing','scale','velocity','octave'];let data=Object.fromEntries(keys.map(k=>[k,state[k]]));data.muted=[...state.muted];data.channels=state.channels;data.ccNumbers=state.ccNumbers;data.clockEnabled=state.clockEnabled;localStorage.setItem(storageKey,JSON.stringify(data));flash('Projet sauvegardé dans ce navigateur')}catch(e){flash('Sauvegarde indisponible')}}
function current(){return state.patterns[state.track][state.pattern][state.page]}
function clone(){return current().map(row=>row.slice())}
function checkpoint(){state.undo.push({track:state.track,pattern:state.pattern,page:state.page,data:clone()});if(state.undo.length>60)state.undo.shift();state.redo=[]}
function flash(s){notice.textContent=s;state.screenMessage=s;state.screenUntil=performance.now()+2400}
function applyHistory(from,to){let x=from.pop();if(!x){flash('Historique vide');return}to.push({track:x.track,pattern:x.pattern,page:x.page,data:state.patterns[x.track][x.pattern][x.page].map(r=>r.slice())});state.patterns[x.track][x.pattern][x.page]=x.data;state.track=x.track;state.pattern=x.pattern;state.page=x.page}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function render(){const s=state;midiChannel.value=String(s.channels[s.track]);document.getElementById('midi-track').textContent=s.track+1;midiClock.checked=s.clockEnabled;const encoder=Number(midiEncoder.value);if(document.activeElement!==midiCC)midiCC.value=s.ccNumbers[encoder];document.getElementById('midi-value').textContent='Valeur : '+s.values[encoder];const hits=current().flat().filter(Boolean).length;
let extra=s.mode==='STEP'?`VEL ${s.velocity}   GATE ${s.gate}%<br>OCT ${s.octave}   SWING ${s.swing}%`:
s.mode==='PATTERN'?`PATTERN ${s.pattern+1}/8<br>Tap a pad to select pattern`:
s.mode==='LIVE'?`LIVE INPUT · TRK ${s.track+1}<br>Tap pads to trigger notes`:
s.mode==='AUTOM'?`AUTOMATION LANE<br>Encoder 1–8: edit values`:`MODE ${esc(s.mode)}`;
left.innerHTML=`<div class="micro">SQUARP INSTRUMENTS</div><div class="brand">HAPAX</div><div class="screen-title">${esc(s.mode)}  ·  TRACK ${String(s.track+1).padStart(2,'0')}</div><div class="screen-data"><span class="accent">${s.bank} · PAT ${s.pattern+1} · PAGE ${s.page+1}/4</span><br>${extra}<br><span class="muted">${s.recording?'● REC  ':''}${s.muted.has(s.track)?'MUTED':''}</span></div>`;
right.innerHTML=`<div class="micro">POLYCHRONIC SEQUENCER</div><div class="screen-title">${s.bpmEdit?'TEMPO':s.playing?'▶ PLAYING':'■ STOPPED'} · ${s.tempo} BPM</div><div class="screen-data">STEP ${String(s.step+1).padStart(2,'0')}/16　 ${hits} NOTES<br><span class="bar" style="--progress:${(s.step+1)*6.25}%"></span>${s.screenUntil>performance.now()?esc(s.screenMessage):`ENC 1 ${s.values[0]}　ENC 9 ${s.values[8]}<br>TRK ${s.track+1}/16 · BANK ${s.bank}`}</div>`;
if(s.trackSettings){
 const port=midi.output?.name||'Aucune sortie';
 left.innerHTML=`<div class="micro">TRACK SETTINGS · PISTE ${s.track+1}</div><div class="screen-title">SORTIE MIDI</div><div class="screen-data track-midi-grid"><div><span class="micro">OUTPUT · ENC 5</span><br><strong>${esc(port)}</strong><br><span class="micro">Sortie commune</span></div><div><span class="micro">CHANNEL · ENC 6</span><br><strong>${String(s.channels[s.track]).padStart(2,'0')}</strong></div></div>`;
 right.innerHTML=`<div class="micro">RÉGLAGES PISTE ${s.track+1}</div><div class="screen-title">MIDI · ENC 5 / 6 ACTIFS</div><div class="screen-data">${midiAccess?'ENC 5 : choisir sortie':'Toucher ENC 5 : activer MIDI'}<br>ENC 6 : canal 1–16<br>ENC 9 (appui) ou STEP : retour<span class="settings-feedback">${esc((s.screenUntil>performance.now()?s.screenMessage:midiStatus.textContent).slice(0,70))}</span></div>`;
}
transport.textContent=s.playing?'■ STOP':'▶ PLAY';transport.classList.toggle('transport-on',s.playing);if(document.activeElement!==bpm)bpm.value=s.tempo;
tracks.forEach((t,i)=>{t.classList.toggle('selected',i===s.track);t.setAttribute('aria-expanded',String(s.trackSettings&&i===s.track))});
pads.forEach(p=>{let r=+p.dataset.row,c=+p.dataset.col;let on=s.mode==='PATTERN'?(r===s.pattern&&c===0):!!current()[r][c];p.classList.toggle('on',on);p.classList.toggle('head',s.playing&&c===s.step);p.classList.toggle('pattern',s.mode==='PATTERN'&&on);p.classList.toggle('live',s.mode==='LIVE'&&on);p.classList.toggle('automation',s.mode==='AUTOM'&&on)});
knobs.forEach((k,i)=>{
 let angle=knobAngles[i],label='Encodeur '+(i+1)+' : '+s.values[i];
 if(s.trackSettings){
  if(i===4){label='Sortie MIDI commune : '+(midi.output?.name||'aucune')}
  else if(i===5){label='Canal MIDI piste '+(s.track+1)+' : '+s.channels[s.track]}
  else if(i===8)label='Fermer les réglages de piste';
  else label='Encodeur '+(i+1)+' : réglage de piste non simulé';
 }
 k.style.setProperty('--angle',angle+'deg');k.setAttribute('aria-label',label);k.title=label;
 k.classList.toggle('settings-unused',s.trackSettings&&![4,5,8].includes(i));
 k.classList.toggle('settings-push',s.trackSettings&&i===8);
 k.setAttribute('aria-disabled',String(s.trackSettings&&![4,5,8].includes(i)));
});
leftBtns.forEach(b=>b.classList.toggle('active',(b.textContent.trim()==='REC'&&s.recording)||(b.textContent.trim()==='MUTE'&&s.muted.has(s.track))||(b.textContent.trim()==='2ND'&&s.second)));
rightBtns.forEach(b=>b.classList.toggle('mode-active',b.textContent.trim()===s.mode||b.textContent.trim()===s.bank));
}
function play(){if(state.playing){stop();return}midi.tempo=state.tempo;midi.swing=state.swing;midi.clockEnabled=state.clockEnabled;state.playing=true;midi.start();render()}
function restart(){const recording=state.recording;if(state.playing)midi.stop();state.recording=recording;play()}
function stop(){midi.stop();render()}
function clear(){checkpoint();current().forEach(row=>row.fill(0));flash('Page effacée · UNDO pour annuler');render()}
function page(delta){state.page=(state.page+delta+4)%4;flash('Page '+(state.page+1)+'/4');render()}
function changeKnob(i,delta){
 if(state.trackSettings&&![4,5].includes(i)){
  flash(i===8?'ENC 9 : appuyer pour fermer':'ENC '+(i+1)+' INACTIF · STEP pour sortir');render();return;
 }
 // The physical encoder is endless; its MIDI value remains bounded.
 knobAngles[i]+=delta*270/127;
 if(state.trackSettings){
  if(i===5){setTrackChannel(Math.max(1,Math.min(16,state.channels[state.track]+delta)));return}
  if(i===4){
   if(!midiAccess){document.getElementById('midi-connect').click();return}
   const choices=[null,...outputPorts().filter(port=>port.state!=='disconnected')];
   const current=choices.findIndex(port=>(port?.id||'')===(midi.output?.id||''));
   const next=Math.max(0,Math.min(choices.length-1,current+delta));
   if(next!==current){midiOutput.value=choices[next]?.id||'';midiOutput.dispatchEvent(new Event('change'))}
   else if(choices.length===1)flash('Aucune sortie MIDI détectée · branchez votre appareil');
   render();return;
  }
  render();return;
 }

 if(i===8&&state.bpmEdit){state.values[i]=Math.max(0,Math.min(127,state.values[i]+delta));state.tempo=Math.max(30,Math.min(300,state.tempo+delta));bpm.value=state.tempo;render();return}
 const previous=state.values[i];
 state.values[i]=Math.max(0,Math.min(127,state.values[i]+delta));
 if(i===0)state.velocity=state.values[i];
 if(i===1)state.octave=Math.round(state.values[i]/18);
 if(i===2)state.gate=Math.round(state.values[i]*100/127);
 if(i===3)state.swing=Math.round(state.values[i]*50/127);
 if(i===8&&state.second){state.tempo=Math.max(30,Math.min(300,state.tempo+delta));bpm.value=state.tempo}
 if(previous!==state.values[i])midi.cc(state.channels[state.track]-1,state.ccNumbers[i],state.values[i]);
 else flash('Encodeur '+(i+1)+' : '+(delta>0?'maximum 127':'minimum 0'));
 render();
}
transport.addEventListener('click',play);document.getElementById('reset').addEventListener('click',clear);document.getElementById('save').addEventListener('click',()=>{save();render()});document.getElementById('help').addEventListener('click',()=>{flash('STEP: notes · PATTERN: choix 1–8 · A/B: banques · flèches: pages · COPY/PASTE · UNDO · SAVE');render()});
bpm.addEventListener('change',()=>{state.tempo=Math.max(30,Math.min(300,Math.round(Number(bpm.value)||120)));bpm.value=state.tempo;render()});
function selectTrack(i){state.track=i;state.trackSettings=false;flash('Piste '+(i+1));render()}
function openTrackSettings(i){state.track=i;state.trackSettings=true;state.bpmEdit=false;knobAngles[5]=-135+270*(state.channels[i]-1)/15;flash('Réglages piste '+(i+1)+' · écran gauche : sortie et canal MIDI');render()}
function setTrackChannel(channel){
 if(state.channels[state.track]!==channel){stop();state.channels[state.track]=channel}
 render();
}
tracks.forEach((t,i)=>{
 let pointer=null,timer=null,startX=0,startY=0,moved=false,opened=false,lastPointer=-Infinity;
 const cancel=()=>{clearTimeout(timer);timer=null;const id=pointer;pointer=null;if(id!==null&&t.hasPointerCapture(id))t.releasePointerCapture(id)};
 t.title='Piste '+(i+1)+' · maintenir pour les réglages MIDI';
 t.setAttribute('aria-controls','displayleft displayright');
 t.addEventListener('contextmenu',e=>e.preventDefault());
 t.addEventListener('pointerdown',e=>{
  if(pointer!==null||(e.pointerType==='mouse'&&e.button!==0))return;
  pointer=e.pointerId;startX=e.clientX;startY=e.clientY;moved=false;opened=false;
  t.setPointerCapture(pointer);
  timer=setTimeout(()=>{timer=null;if(pointer!==null&&!moved){opened=true;openTrackSettings(i)}},500);
 });
 t.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer)return;
  if(Math.hypot(e.clientX-startX,e.clientY-startY)>12){moved=true;clearTimeout(timer);timer=null}
 });
 t.addEventListener('pointerup',e=>{
  if(e.pointerId!==pointer)return;
  const select=!moved&&!opened;lastPointer=performance.now();cancel();if(select)selectTrack(i);
 });
 t.addEventListener('pointercancel',e=>{if(e.pointerId===pointer){lastPointer=performance.now();cancel()}});
 t.addEventListener('lostpointercapture',cancel);
 t.addEventListener('click',e=>{if(e.detail===0&&performance.now()-lastPointer>100)selectTrack(i)});
 t.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.shiftKey){e.preventDefault();openTrackSettings(i)}});
});
pads.forEach(p=>p.addEventListener('click',()=>{const r=+p.dataset.row,c=+p.dataset.col;if(state.mode==='PATTERN'){if(state.pattern!==r){state.undo=[];state.redo=[]}state.pattern=r;flash('Pattern '+(r+1)+'/8');render();return}if(state.mode==='LIVE'){const pitch=notePitch(r);if(!state.muted.has(state.track))midi.note(state.channels[state.track]-1,pitch,state.velocity,Math.max(1,60000/(state.tempo*4)*state.gate/100));if(state.recording){checkpoint();current()[r][state.playing?midi.step:c]=state.velocity}flash('Note '+pitch+(midi.output?' · MIDI':' · choisissez une sortie MIDI'));render();return}checkpoint();current()[r][c]=current()[r][c]?0:state.velocity;render()}));
leftBtns.forEach(b=>b.addEventListener('click',()=>{const t=b.textContent.trim();switch(t){case '▶':restart();return;case '■':stop();return;case '●':case 'REC':state.recording=!state.recording;flash(state.recording?'REC activé':'REC désactivé');break;case '2ND':state.second=!state.second;flash(state.second?'2ND activé':'2ND désactivé');break;case 'MUTE':state.muted.has(state.track)?state.muted.delete(state.track):state.muted.add(state.track);break;case 'COPY':state.clipboard=clone();flash('Page copiée');break;case 'PASTE':if(state.clipboard){checkpoint();state.patterns[state.track][state.pattern][state.page]=state.clipboard.map(row=>row.slice());flash('Page collée')}else flash('Presse COPY d’abord');break;case 'DELETE':clear();return;case 'ALGO':checkpoint();current().forEach((row,r)=>row.forEach((_,c)=>row[c]=(r===7&&c%4===0)||(r===3&&c%4===2)||(r===5&&c%2===0)?state.velocity:0));flash('Rythme de démonstration');break;default:flash('Commande '+(t||'libre')+' non simulée')}render()}));
rightBtns.forEach(b=>b.addEventListener('click',()=>{const t=b.textContent.trim();if(['STEP','LIVE','AUTOM','PATTERN'].includes(t)){state.trackSettings=false;state.mode=t;}else if(t==='A'||t==='B'){state.bank=t;flash('Banque '+t+' (indicateur)')}else if(t==='→')return page(1);else if(t==='←')return page(-1);else if(t==='+'||t==='-')flash('Zoom non simulé · navigation : ← / →');else if(t==='UNDO')applyHistory(state.second?state.redo:state.undo,state.second?state.undo:state.redo);else if(t==='BPM'){state.trackSettings=false;state.bpmEdit=!state.bpmEdit;if(state.bpmEdit){bpm.focus();bpm.select()}flash(state.bpmEdit?'BPM · encodeur principal : tempo':'Fenêtre BPM fermée')}else if(t==='↑'||t==='↓'){state.octave=Math.max(0,Math.min(7,state.octave+(t==='↑'?1:-1)));state.values[1]=state.octave*18;knobAngles[1]=-135+270*state.values[1]/127;}else if(t==='SET'){state.second=!state.second;flash('Paramètres secondaires '+(state.second?'ON':'OFF'))}else if(t==='FILL'){state.fill=!state.fill;flash('FILL '+(state.fill?'ON':'OFF'))}else if(t==='SNAP'){flash('Snapshot non simulé · SAVE sauvegarde le projet')}else flash(t+' : non simulé');render()}));
function clickKnob(i){if(state.trackSettings&&i===8){state.trackSettings=false;render()}else changeKnob(i,1)}
knobs.forEach((k,i)=>{
 let pointer=null,startY=0,lastDiff=0,dragged=false;
 const release=()=>{if(pointer!==null&&k.hasPointerCapture(pointer))k.releasePointerCapture(pointer);pointer=null};
 k.addEventListener('pointerdown',e=>{
  if(pointer!==null||(e.pointerType==='mouse'&&e.button!==0))return;
  pointer=e.pointerId;startY=e.clientY;lastDiff=0;dragged=false;
  k.setPointerCapture(pointer);
 });
 k.addEventListener('pointermove',e=>{
  if(e.pointerId!==pointer||!k.hasPointerCapture(pointer))return;
  const diff=Math.round((startY-e.clientY)/3);
  if(Math.abs(e.clientY-startY)>=3)dragged=true;
  const delta=diff-lastDiff;lastDiff=diff;
  if(delta)changeKnob(i,delta);
 });
 k.addEventListener('pointerup',e=>{
  if(e.pointerId!==pointer)return;
  const clicked=!dragged;release();if(clicked)clickKnob(i);
 });
 k.addEventListener('pointercancel',e=>{if(e.pointerId===pointer)release()});
 k.addEventListener('lostpointercapture',()=>{pointer=null});
 k.addEventListener('click',e=>{if(e.detail===0)clickKnob(i)});
 k.addEventListener('keydown',e=>{
  if(['ArrowUp','ArrowRight','ArrowDown','ArrowLeft'].includes(e.key)){
   e.preventDefault();changeKnob(i,['ArrowUp','ArrowRight'].includes(e.key)?1:-1);
  }
 });
});
document.addEventListener('keydown',e=>{if(e.target.closest('input,select,textarea,button'))return;if(e.code==='Space'){e.preventDefault();play()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();applyHistory(state.undo,state.redo);render()}else if(e.key==='ArrowRight')page(1);else if(e.key==='ArrowLeft')page(-1)});
function notePitch(row){return Math.max(0,Math.min(127,60+(7-row)+12*(state.octave-3)))}
function playMidiStep(step,at,duration){
 for(let track=0;track<16;track++){
  if(state.muted.has(track))continue;
  const rows=state.patterns[track][state.pattern][state.page];
  for(let row=0;row<8;row++){const velocity=rows[row][step];if(velocity)midi.note(state.channels[track]-1,notePitch(row),velocity,Math.max(1,duration*state.gate/100),at)}
 }
}
function updateOutputs(){
 const selected=midi.output?.id||'';
 midiOutput.replaceChildren(new Option('Aucune sortie', ''));
 if(midiAccess)for(const port of outputPorts())if(port.state!=='disconnected')midiOutput.add(new Option(port.name||'Sortie MIDI',port.id));
 if((selected&&!outputPorts().some(port=>port.id===selected))||midi.output?.state==='disconnected'){
  connectionVersion++;midi.setOutput(null);midiStatus.textContent='Sortie déconnectée · choisissez une sortie MIDI.';
 }else midiOutput.value=selected;
 midiOutput.disabled=!midiAccess;render();
}
document.getElementById('midi-connect').addEventListener('click',async()=>{
 const button=document.getElementById('midi-connect');
 if(!window.isSecureContext||!navigator.requestMIDIAccess){midiStatus.textContent='Web MIDI indisponible dans ce navigateur. Safari sur iPad ne donne pas accès au MIDI. Consultez les instructions iPad ci-dessous ; Chrome/Edge conviennent sur ordinateur.';render();return}
 button.disabled=true;
 try{
  if(!midiAccess){midiAccess=await navigator.requestMIDIAccess({sysex:false});midiAccess.onstatechange=updateOutputs}
  updateOutputs();button.textContent='Actualiser MIDI';
  midiStatus.textContent=midi.output?'Sortie : '+(midi.output.name||'MIDI'):midiOutput.options.length>1?'MIDI autorisé · choisissez une sortie.':'Aucune sortie MIDI détectée. Branchez un appareil ou créez un port virtuel, puis actualisez.';
 }catch(error){midiStatus.textContent='Accès MIDI refusé ou indisponible. Autorisez MIDI dans les paramètres du navigateur.'}
 finally{button.disabled=false;render()}
});
midiOutput.addEventListener('change',async()=>{
 const version=++connectionVersion,port=outputPorts().find(port=>port.id===midiOutput.value);
 midi.setOutput(null);
 if(!port){midiStatus.textContent='Aucune sortie MIDI sélectionnée.';render();return}
 try{
  await HapaxMidiCompat.open(port);if(version!==connectionVersion)return;
  if(port.state==='disconnected')throw Error('Disconnected');
  midi.setOutput(HapaxMidiCompat.output(port,{softwareTiming:ipadMidi,onError:()=>{midi.setOutput(null);midiOutput.value='';midiStatus.textContent='Connexion MIDI interrompue · reconnectez la sortie.'}}));midiOutput.value=port.id;midiStatus.textContent='Sortie : '+(port.name||'MIDI')+(ipadMidi?' · pont MIDI iPad':'');
 }catch(error){if(version===connectionVersion){midi.setOutput(null);midiOutput.value='';midiStatus.textContent='Impossible d’ouvrir cette sortie (ou délai dépassé). Vérifiez la connexion MIDI puis actualisez.'}}
 finally{if(version===connectionVersion)render()}
});
midiChannel.addEventListener('change',()=>setTrackChannel(Number(midiChannel.value)));
midiClock.addEventListener('change',()=>{const enabled=midiClock.checked;stop();state.clockEnabled=enabled;midi.clockEnabled=enabled;render()});
midiEncoder.addEventListener('change',render);
midiCC.addEventListener('change',()=>{state.ccNumbers[Number(midiEncoder.value)]=Math.max(0,Math.min(119,Math.round(Number(midiCC.value)||0)));midiCC.value=state.ccNumbers[Number(midiEncoder.value)];render()});
document.getElementById('midi-panic').addEventListener('click',()=>{stop();flash('PANIC · notes et lecture arrêtées');render()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state.playing||midi.active.size))stop()});
window.addEventListener('pagehide',stop);
setInterval(()=>{midi.tempo=state.tempo;midi.swing=state.swing;midi.pump()},10);
function tick(){
 const expired=state.screenUntil>0&&performance.now()>=state.screenUntil;
 if(state.step!==midi.step||expired){state.step=midi.step;if(expired)state.screenUntil=0;render()}
 requestAnimationFrame(tick);
}
load();
// Match encoder positions to saved musical parameters, including older V8 projects.
state.values[0]=state.velocity;
state.values[1]=Math.max(0,Math.min(127,state.octave*18));
state.values[2]=Math.round(state.gate*127/100);
state.values[3]=Math.round(state.swing*127/50);
state.values.forEach((value,i)=>knobAngles[i]=-135+270*value/127);
render();requestAnimationFrame(tick);
})();
