(function(){
'use strict';
const pads=[...document.querySelectorAll('.pad')], knobs=[...document.querySelectorAll('.knob')], tracks=[...document.querySelectorAll('[data-track]')];
const left=document.getElementById('displayleft'),right=document.getElementById('displayright'),transport=document.getElementById('transport'),bpm=document.getElementById('bpm'),notice=document.getElementById('notice');
const leftBtns=[...document.querySelectorAll('#leftcol button')],rightBtns=[...document.querySelectorAll('#rightcol button')];
const fresh=()=>Array.from({length:32},()=>Array.from({length:8},()=>Array(16).fill(0)));
const state={playing:false,recording:false,tempo:120,step:0,track:0,mode:'STEP',page:0,bank:'A',pattern:0,values:[100,54,95,0,64,64,64,64,1],patterns:Array.from({length:16},()=>Array.from({length:8},fresh)),clipboard:null,second:false,muted:new Set(),undo:[],redo:[],lastTick:performance.now(),gate:75,swing:0,scale:0,velocity:100,octave:3,metronome:false,fill:false,screenMessage:'',screenUntil:0,bpmEdit:false,trackSettings:false};
state.trackData=Array.from({length:16},()=>HapaxTrack.settings());
state.timingMode='auto';state.trackFocus=5;state.pcField=0;state.lengthFine=false;state.playPage=0;
const routeEngines=new Map(),outputRequests=new Map(),heldInput=new Map(),boundInputs=new Map(),programCache=new Map();
const origins=Array(16).fill(0),randomOffsets=Array(16).fill(0);let scheduledTick=-1,randomSeed=1,inputBudget=0,inputBudgetTime=0,inputRouting=false,inputDirty=false;
const selectedPads=new Set();state.selectingNotes=false;state.pasteArmed=false;
const heldPads=new Set(),consumedPads=new Set(),consumedButtons=new WeakMap();let heldAction=null;
const padColumns=Array.from({length:16},(_,col)=>pads.filter(p=>Number(p.dataset.col)===col));
const silentMidi={note:()=>false,hold:()=>false,release(){},cc(){},send(){}};
const knobAngles=state.values.map(value=>-135+270*value/127);
const midiChannel=document.getElementById('midi-channel'),midiOutput=document.getElementById('midi-output'),midiClock=document.getElementById('midi-clock'),midiEncoder=document.getElementById('midi-encoder'),midiCC=document.getElementById('midi-cc'),midiStatus=document.getElementById('midi-status'),midiTimingMode=document.getElementById('midi-timing-mode');
state.channels=Array.from({length:16},(_,i)=>i+1);state.ccNumbers=Array.from({length:9},(_,i)=>20+i);state.clockEnabled=false;
for(let i=1;i<=16;i++)midiChannel.add(new Option(String(i),String(i)));
for(let i=0;i<9;i++)midiEncoder.add(new Option(String(i+1),String(i)));
const midi=new HapaxMidi({onStep:playMidiStep,onHalt:()=>{state.playing=false;state.recording=false;state.step=0;render()},onStatus:message=>{midiStatus.textContent=message;render()},onSync:broadcastSync,beforeStop:()=>{for(const engine of routeEngines.values())engine.silence();heldInput.clear()}});
let midiAccess=null,connectionVersion=0;
const ipadMidi=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
function outputPorts(){return HapaxMidiCompat.ports(midiAccess?.outputs)}
function inputPorts(){return HapaxMidiCompat.ports(midiAccess?.inputs)}
function patternConfig(track=state.track){return state.trackData[track].patterns[state.pattern]}
function trackMidi(track){
 const output=state.trackData[track].output;
 const id=output==='@default'?midi.output?.id:output;
 return routeEngines.get(id)||silentMidi;
}
function usedEngines(){
 const engines=new Map();
 for(let track=0;track<16;track++){const engine=trackMidi(track);if(engine.output)engines.set(engine.output.id,engine)}
 return engines.values();
}
function broadcastSync(data,at){for(const engine of usedEngines())engine.send(data,at)}
function wrapOutput(port,engine){
 return HapaxMidiCompat.output(port,{softwareTiming:state.timingMode==='software',onError:()=>{
  engine.output=null;engine.active.clear();stop();midiStatus.textContent='Connexion MIDI interrompue';render();
 }});
}
function changeTimingMode(mode){
 const common=midi.output?.id;stop();state.timingMode=mode==='software'?'software':'auto';
 for(const [id,engine] of routeEngines){
  const port=outputPorts().find(p=>p.id===id&&p.state!=='disconnected');
  engine.setOutput(port?wrapOutput(port,engine):null);
 }
 midi.setOutput(routeEngines.get(common)?.output||null);
 midiStatus.textContent='Programmation MIDI modifiée · relancez PLAY pour comparer.';render();
}
async function ensureOutput(port){
 const existing=routeEngines.get(port.id);
 if(existing?.output&&(existing.output===port||existing.output.raw===port))return existing;
 await HapaxMidiCompat.open(port);
 if(port.state==='disconnected')throw Error('MIDI disconnected');
 const engine=new HapaxMidi({onStatus:message=>{engine.output=null;stop();midiStatus.textContent=message;render()}});
 const wrapped=wrapOutput(port,engine);
 engine.setOutput(wrapped);routeEngines.set(port.id,engine);return engine;
}
async function assignTrackOutput(track,id){
 const request={id};outputRequests.set(track,request);stop();
 try{
  if(!['@default','@off'].includes(id)){
   const port=outputPorts().find(p=>p.id===id&&p.state!=='disconnected');
   if(!port)throw Error('MIDI port unavailable');
   await ensureOutput(port);
  }
  if(outputRequests.get(track)!==request)return;
  state.trackData[track].output=id;programCache.clear();
  midiStatus.textContent='Sortie piste '+(track+1)+' : '+trackOutputName(track);
 }catch(error){midiStatus.textContent='Sortie indisponible · branchez votre appareil et actualisez'}
 finally{if(outputRequests.get(track)===request)outputRequests.delete(track);render()}
}
async function restoreTrackOutputs(){
 const ids=new Set(state.trackData.map(c=>c.output).filter(id=>!['@off','@default'].includes(id)));
 for(const id of ids){const port=outputPorts().find(p=>p.id===id&&p.state!=='disconnected');if(port)await ensureOutput(port)}
}
function trackOutputName(track){
 const cfg=state.trackData[track];
 if(cfg.output==='@default')return midi.output?.name||'COMMUNE (aucune)';
 if(cfg.output==='@off')return 'OFF';
 return outputPorts().find(p=>p.id===cfg.output)?.name||'Déconnectée';
}
function trackPosition(track,absolute){
 const tick=Math.max(0,absolute-origins[track]);
 const config=patternConfig(track);
 const position=HapaxTrack.position(config,tick,group=>{
  let x=(randomSeed^Math.imul(track+1,0x9e3779b9)^Math.imul(state.pattern+1,0x85ebca6b)^Math.imul(group+1,0xc2b2ae35))>>>0;
  x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;
 });
 return config.run.startsWith('RANDOM')?(position+randomOffsets[track])%config.length:position;
}
function selectPattern(index){
 const changed=index!==state.pattern,next=state.playing?scheduledTick+1:0;
 const positions=Array.from({length:16},(_,track)=>trackPosition(track,next));
 state.pattern=index;programCache.clear();
 for(let track=0;track<16;track++){
  const config=patternConfig(track);
  if(!state.playing||config.trig==='RESTART'){origins[track]=next;randomOffsets[track]=0}
  else if(changed){
   const target=positions[track]%config.length;
   origins[track]=next-HapaxTrack.phase(config,target);randomOffsets[track]=0;
   if(config.run.startsWith('RANDOM'))randomOffsets[track]=(target-trackPosition(track,next)+config.length)%config.length;
  }
 }
}
function sendProgram(track,at=performance.now()){
 const engine=trackMidi(track),config=patternConfig(track),channel=state.channels[track]-1;
 if(!engine.output||config.pc<0)return;
 const key=engine.output.id+':'+channel,signature=[config.pc,config.msb,config.lsb].join(':');
 if(programCache.get(key)===signature)return;
 for(const message of HapaxTrack.program(config,channel))engine.send(message,at);
 programCache.set(key,signature);
}
function inputName(config){
 if(!config.input)return 'OFF';
 if(config.input==='@active')return 'ALL ACTIVE';
 return inputPorts().find(p=>p.id===config.input)?.name||'Déconnectée';
}
function trackFields(){
 const cfg=state.trackData[state.track],p=patternConfig(),field=['pc','msb','lsb'][state.pcField];
 const value=p[field]<0?'OFF':String(p[field]);
 return [
  {name:field.toUpperCase(),value,help:'Tourner : 0–127/OFF. Appui : PC / MSB / LSB. Envoyé au lancement.'},
  {name:'TRIG',value:p.trig,help:'FREE garde la position. RESTART repart au début au changement de pattern.'},
  {name:'LENGTH',value:p.length+' PAS',help:'Tourner : '+(state.lengthFine?'1 pas':'1 barre (16 pas)')+'. Appui : pas/barre. Maximum 512 pas.'},
  {name:'RUN',value:p.run,help:'Avant, arrière, ping-pong ou aléatoire par barre, temps ou pas.'},
  {name:'OUTPUT',value:trackOutputName(state.track),help:midiAccess?'Sortie indépendante de cette piste. COMMUNE utilise le sélecteur général.':'Toucher pour autoriser MIDI, puis tourner pour choisir le port.'},
  {name:'CHANNEL',value:String(state.channels[state.track]).padStart(2,'0'),help:'Canal de sortie de la piste : 1–16.'},
  {name:'INPUT',value:inputName(cfg),help:midiAccess?'OFF, ALL ACTIVE (piste sélectionnée), ou entrée MIDI détectée.':'Toucher pour autoriser MIDI et détecter les entrées.'},
  {name:'IN CHANNEL',value:cfg.inputChannel===0?'ALL':String(cfg.inputChannel).padStart(2,'0'),help:'Filtre du port choisi : ALL ou canal 1–16. ALL ACTIVE ignore ce filtre.'}
 ];
}
function changeTrackSetting(i,delta){
 if(i===8){state.trackFocus=(state.trackFocus+delta%8+8)%8;render();return}
 state.trackFocus=i;
 const cfg=state.trackData[state.track],p=patternConfig();
 if(i===0){const field=['pc','msb','lsb'][state.pcField];p[field]=Math.max(-1,Math.min(127,p[field]+delta))}
 if(i===1)p.trig=['FREE','RESTART'][Math.max(0,Math.min(1,['FREE','RESTART'].indexOf(p.trig)+delta))];
 if(i===2){stop();p.length=Math.max(1,Math.min(512,p.length+delta*(state.lengthFine?1:16)))}
 if(i===3){stop();p.run=HapaxTrack.runs[Math.max(0,Math.min(HapaxTrack.runs.length-1,HapaxTrack.runs.indexOf(p.run)+delta))]}
 if(i===4){
  if(!midiAccess){document.getElementById('midi-connect').click();return}
  const choices=['@default',...outputPorts().filter(port=>port.state!=='disconnected').map(p=>p.id),'@off'];
  const current=choices.indexOf(outputRequests.get(state.track)?.id||cfg.output);
  const id=choices[Math.max(0,Math.min(choices.length-1,Math.max(0,current)+delta))];
  assignTrackOutput(state.track,id);
 }
 if(i===5)setTrackChannel(Math.max(1,Math.min(16,state.channels[state.track]+delta)));
 if(i===6){
  if(!midiAccess){document.getElementById('midi-connect').click();return}
  stop();const choices=['','@active',...inputPorts().filter(p=>p.state!=='disconnected').map(p=>p.id)];
  cfg.input=choices[Math.max(0,Math.min(choices.length-1,Math.max(0,choices.indexOf(cfg.input))+delta))];refreshInputBindings();
 }
 if(i===7){stop();cfg.inputChannel=Math.max(0,Math.min(16,cfg.inputChannel+delta));refreshInputBindings()}
 render();
}
function refreshInputBindings(){
 const available=inputPorts().filter(p=>p.state!=='disconnected');
 for(const [port,entry] of boundInputs)if(!available.includes(port)){
  if(port.onmidimessage===entry.handler)port.onmidimessage=entry.previous;boundInputs.delete(port);stop();
 }
 for(const port of available){
  const needed=state.trackData.some((cfg,track)=>cfg.input===port.id||(cfg.input==='@active'&&track===state.track))||[...heldInput.keys()].some(key=>key.startsWith(port.id+':'));
  const bound=boundInputs.get(port);
  if(!needed){if(bound){if(port.onmidimessage===bound.handler)port.onmidimessage=bound.previous;boundInputs.delete(port)}continue}
  if(bound)continue;
  const handler=event=>receiveMIDI(port,event.data);
  boundInputs.set(port,{handler,previous:port.onmidimessage});port.onmidimessage=handler;
  HapaxMidiCompat.open(port).catch(()=>{midiStatus.textContent='Entrée MIDI inaccessible : '+(port.name||'MIDI');render()});
 }
}
function receiveMIDI(port,bytes){
 if(document.hidden)return;
 const data=Array.from(bytes||[]),type=data[0]&0xf0,channel=data[0]&15;
 const size=[0xc0,0xd0].includes(type)?2:3;
 if(type<0x80||type>0xe0||data.length<size||!data.slice(1,size).every(n=>Number.isInteger(n)&&n>=0&&n<128))return;
 const now=performance.now();if(now-inputBudgetTime>100){inputBudgetTime=now;inputBudget=0}
 if(inputRouting)return;
 if(++inputBudget>2048){stop();for(const [p,entry] of boundInputs)p.onmidimessage=entry.previous;boundInputs.clear();midiStatus.textContent='Entrée arrêtée : boucle MIDI suspectée. Vérifiez le routage et actualisez.';render();return}
 inputRouting=true;
 try{
  const key=port.id+':'+channel+':'+data[1];
  if(type===0x80||(type===0x90&&data[2]===0)){
   for(const voice of heldInput.get(key)||[])voice.engine.release(voice.channel,data[1]);heldInput.delete(key);refreshInputBindings();return;
  }
  if(type===0x90){for(const voice of heldInput.get(key)||[])voice.engine.release(voice.channel,data[1]);heldInput.delete(key)}
  const voices=[];
  for(let track=0;track<16;track++){
   if(state.muted.has(track)||!HapaxTrack.accepts(state.trackData[track],port.id,channel,track===state.track))continue;
   const engine=trackMidi(track),outChannel=state.channels[track]-1;
   if(type===0x90){
    if(engine.hold(outChannel,data[1],data[2]))voices.push({engine,channel:outChannel});
    if(state.recording&&state.playing)recordInput(track,data[1],data[2]);
   }else engine.send([type|outChannel,...data.slice(1,size)]);
  }
  if(type===0x90)heldInput.set(key,voices);
 }finally{inputRouting=false}
}
function recordInput(track,pitch,velocity){
 const row=7-(pitch-notePitch(7));if(row<0||row>7)return;
 const position=trackPosition(track,midi.absoluteStep),page=Math.floor(position/16),rows=state.patterns[track][state.pattern][page];
 state.undo.push({track,pattern:state.pattern,page,data:rows.map(r=>r.slice())});if(state.undo.length>60)state.undo.shift();state.redo=[];
 rows[row][position%16]=velocity;inputDirty=true;
}

const storageKey='hapax-simulator-v8';
function load(){try{const data=JSON.parse(localStorage.getItem(storageKey));if(!data)return;for(const k of ['tempo','track','mode','page','bank','pattern','patterns','values','gate','swing','scale','velocity','octave'])if(data[k]!==undefined)state[k]=data[k];state.page=Math.max(0,Math.min(31,state.page));state.pattern=Math.max(0,Math.min(7,state.pattern));state.muted=new Set(data.muted||[]);if(Array.isArray(data.channels)&&data.channels.length===16&&data.channels.every(n=>Number.isInteger(n)&&n>=1&&n<=16))state.channels=data.channels;if(Array.isArray(data.ccNumbers)&&data.ccNumbers.length===9&&data.ccNumbers.every(n=>Number.isInteger(n)&&n>=0&&n<=119))state.ccNumbers=data.ccNumbers;state.clockEnabled=data.clockEnabled===true;state.timingMode=data.timingMode==='software'?'software':'auto';if(Array.isArray(data.trackData))state.trackData=Array.from({length:16},(_,i)=>HapaxTrack.settings(data.trackData[i]));for(const track of state.patterns)for(const pattern of track)while(pattern.length<32)pattern.push(Array.from({length:8},()=>Array(16).fill(0)))}catch(e){console.warn('Load:',e)}}
function save(){try{const keys=['tempo','track','mode','page','bank','pattern','patterns','values','gate','swing','scale','velocity','octave'];let data=Object.fromEntries(keys.map(k=>[k,state[k]]));data.muted=[...state.muted];data.channels=state.channels;data.ccNumbers=state.ccNumbers;data.clockEnabled=state.clockEnabled;data.timingMode=state.timingMode;data.trackData=state.trackData;localStorage.setItem(storageKey,JSON.stringify(data));flash('Projet sauvegardé dans ce navigateur')}catch(e){flash('Sauvegarde indisponible')}}
function current(){return state.patterns[state.track][state.pattern][state.page]}
function clone(){return current().map(row=>row.slice())}
const deep=value=>JSON.parse(JSON.stringify(value));
function snapshot(scope,track=state.track,pattern=state.pattern,page=state.page){
 const item={scope,track,pattern,page};
 if(scope==='track')Object.assign(item,{data:deep(state.patterns[track]),config:deep(state.trackData[track]),channel:state.channels[track],muted:state.muted.has(track)});
 else if(scope==='pattern')Object.assign(item,{data:deep(state.patterns[track][pattern]),config:deep(state.trackData[track].patterns[pattern])});
 else item.data=deep(state.patterns[track][pattern][page]);
 return item;
}
function checkpoint(scope='page',track=state.track,pattern=state.pattern,page=state.page){state.undo.push(snapshot(scope,track,pattern,page));if(state.undo.length>60)state.undo.shift();state.redo=[]}
function flash(s){notice.textContent=s;state.screenMessage=s;state.screenUntil=performance.now()+2400}
function applyHistory(from,to){
 cancelNoteActions();
 const x=from.pop();if(!x){flash('Historique vide');return}
 const scope=x.scope||'page';to.push(snapshot(scope,x.track,x.pattern,x.page));
 if(scope==='track'){
  stop();state.patterns[x.track]=x.data;state.trackData[x.track]=x.config;state.channels[x.track]=x.channel;
  x.muted?state.muted.add(x.track):state.muted.delete(x.track);refreshInputBindings();
 }else if(scope==='pattern'){stop();state.patterns[x.track][x.pattern]=x.data;state.trackData[x.track].patterns[x.pattern]=x.config}
 else state.patterns[x.track][x.pattern][x.page]=x.data;
 state.track=x.track;state.pattern=x.pattern;state.page=x.page;
}
function copyTrack(track){state.pasteArmed=false;state.clipboard={kind:'track',value:snapshot('track',track)};flash('Piste '+(track+1)+' copiée · PASTE + piste destination')}
function copyPattern(track,pattern){state.pasteArmed=false;state.clipboard={kind:'pattern',value:snapshot('pattern',track,pattern)};flash('Pattern '+(pattern+1)+' · piste '+(track+1)+' copié')}
function copyPage(){state.pasteArmed=false;state.clipboard={kind:'page',data:clone()};flash('Page copiée · PASTE : page / PASTE + pad : position')}
function copySelection(source=heldPads){
 const notes=[...source].map(p=>({row:Number(p.dataset.row),col:Number(p.dataset.col)})).filter(n=>current()[n.row][n.col]);
 if(!notes.length){flash('Sélection vide');return}
 const start=Math.min(...notes.map(n=>n.col));
 state.clipboard={kind:'notes',anchorRow:Math.max(...notes.map(n=>n.row)),notes:notes.map(n=>({...n,col:n.col-start,velocity:current()[n.row][n.col]}))};
 for(const p of heldPads)consumedPads.add(p);
 state.pasteArmed=false;cancelNoteSelection();
 flash(notes.length+' note(s) copiée(s) · PASTE + pad destination');
}
function cancelNoteSelection(){state.selectingNotes=false;selectedPads.clear()}
function cancelNoteActions(){cancelNoteSelection();state.pasteArmed=false}
function armNotePaste(){
 state.pasteArmed=!state.pasteArmed;cancelNoteSelection();
 flash(state.pasteArmed?'COLLER · touchez la colonne de destination · PASTE pour annuler':'Collage annulé');
}
function copySelectedNotes(){
 if(!selectedPads.size){flash('Touchez au moins une note, puis COPY');return}
 copySelection(selectedPads);cancelNoteSelection();
 flash('Sélection copiée · touchez PASTE, puis la colonne de destination');
}
const selectButton=document.getElementById('note-select');
selectButton.addEventListener('click',()=>{
 const enabled=!state.selectingNotes;cancelNoteActions();closeTrackSettings();state.mode='STEP';state.bpmEdit=false;state.selectingNotes=enabled;
 flash(enabled?'SÉLECTION · touchez les notes à copier une par une, puis COPY':'Sélection annulée');render();
});
function handleNoteSelection(p){
 if(state.pasteArmed){state.pasteArmed=false;pasteNotes(Number(p.dataset.row),Number(p.dataset.col));render();return true}
 if(!state.selectingNotes)return false;
 const row=Number(p.dataset.row),col=Number(p.dataset.col);
 if(!current()[row][col])flash('Pad vide · choisissez une note existante');
 else{selectedPads.has(p)?selectedPads.delete(p):selectedPads.add(p);flash(selectedPads.size+' note(s) sélectionnée(s) · COPY pour copier')}
 render();return true;
}
function pasteNotes(row,col){
 const clip=state.clipboard;
 if(!clip||!['page','notes'].includes(clip.kind)){flash('Copiez des notes ou une page avant PASTE + pad');return}
 let notes=clip.notes;
 if(clip.kind==='page'){
  notes=[];clip.data.forEach((r,y)=>r.forEach((velocity,x)=>{if(velocity)notes.push({row:y,col:x,velocity})}));
  const start=Math.min(...notes.map(n=>n.col));notes=notes.map(n=>({...n,col:n.col-start}));
 }
 const offset=state.second?row-(clip.anchorRow??Math.max(...notes.map(n=>n.row))):0;
 const groups=new Map();let end=0;
 for(const n of notes){
  const position=state.page*16+col+n.col,y=n.row+offset;
  if(position>=512||y<0||y>7)continue;
  const page=Math.floor(position/16);if(!groups.has(page))groups.set(page,[]);
  groups.get(page).push({row:y,col:position%16,velocity:n.velocity});end=Math.max(end,position+1);
 }
 if(groups.size)checkpoint('pattern');
 for(const [page,events] of groups){for(const n of events)state.patterns[state.track][state.pattern][page][n.row][n.col]=n.velocity}
 if(end>patternConfig().length)patternConfig().length=end;
 flash(groups.size?'Notes collées au pas '+(state.page*16+col+1):'Aucune note à coller');
}
function pastePattern(track,pattern){
 if(state.clipboard?.kind!=='pattern'){flash('Copiez un pattern avec COPY + pad en mode PATTERN');return}
 checkpoint('pattern',track,pattern);stop();
 state.patterns[track][pattern]=deep(state.clipboard.value.data);state.trackData[track].patterns[pattern]=deep(state.clipboard.value.config);
 flash('Pattern collé · piste '+(track+1)+' · pattern '+(pattern+1));
}
function pasteTrack(track){
 if(state.clipboard?.kind!=='track'){flash('Copiez une piste avec COPY + piste');return}
 checkpoint('track',track);stop();const x=state.clipboard.value;
 state.patterns[track]=deep(x.data);state.trackData[track]=deep(x.config);state.channels[track]=x.channel;
 x.muted?state.muted.add(track):state.muted.delete(track);refreshInputBindings();
 flash('Piste collée sur '+(track+1)+' · routage MIDI inclus');
}
function pasteCurrent(){
 const clip=state.clipboard;if(!clip){flash('Presse COPY d’abord');return}
 if(clip.kind==='track')pasteTrack(state.track);
 else if(clip.kind==='pattern')pastePattern(state.track,state.pattern);
 else if(clip.kind==='notes')armNotePaste();
 else{checkpoint('pattern');state.patterns[state.track][state.pattern][state.page]=deep(clip.data);if(clip.data.some(row=>row.some(Boolean)))patternConfig().length=Math.max(patternConfig().length,(state.page+1)*16);flash('Page collée · piste '+(state.track+1)+' · page '+(state.page+1))}
}
function applyTrackAction(track){
 if(!heldAction)return false;heldAction.used=true;
 if(heldAction.kind==='COPY')copyTrack(track);
 else if(heldAction.kind==='PASTE')pasteTrack(track);
 else{checkpoint('track',track);stop();state.patterns[track]=Array.from({length:8},fresh);flash('Notes de la piste '+(track+1)+' effacées')}
 render();return true;
}
function applyPadAction(p){
 if(!heldAction)return false;heldAction.used=true;
 const row=Number(p.dataset.row),col=Number(p.dataset.col);
 if(state.mode==='PATTERN'){
  if(heldAction.kind==='COPY')copyPattern(col,row);
  else if(heldAction.kind==='PASTE')pastePattern(col,row);
  else{checkpoint('pattern',col,row);state.patterns[col][row]=fresh();flash('Pattern effacé')}
 }else if(heldAction.kind==='PASTE')pasteNotes(row,col);
 else if(heldAction.kind==='COPY'){
  const velocity=current()[row][col];state.clipboard={kind:'notes',anchorRow:row,notes:velocity?[{row,col:0,velocity}]:[]};flash(velocity?'Note copiée · PASTE + pad destination':'Pad vide copié');
 }else{checkpoint();current()[row][col]=0;flash('Note effacée')}
 render();return true;
}
function encoderFields(){return [
 {name:'VÉLOCITÉ',value:state.velocity}, {name:'OCTAVE',value:state.octave},
 {name:'GATE',value:state.gate+'%'}, {name:'SWING',value:state.swing+'%'},
 ...[4,5,6,7].map(i=>({name:'CC '+state.ccNumbers[i],value:state.values[i]}))
]}
function encoderDetail(){
 if(state.pasteArmed)return 'COLLER · touchez la colonne de destination';
 if(state.selectingNotes)return 'SÉLECTION · '+selectedPads.size+' note(s) · COPY pour copier';
 if(state.bpmEdit)return 'ENC 9 · TEMPO · '+state.tempo+' BPM';
 const index=state.lastEncoder??8,field=index<8?encoderFields()[index]:{name:'CC '+state.ccNumbers[8],value:state.values[8]};
 return 'ENC '+(index+1)+' · '+field.name+' · '+field.value;
}
function setScreen(element,html){if(element._html!==html){element.innerHTML=html;element._html=html}}
function esc(s){return String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]))}
function render(){const s=state;midiTimingMode.value=s.timingMode;const route=trackMidi(s.track);midiOutput.value=route.output?.id||'';midiChannel.value=String(s.channels[s.track]);document.getElementById('midi-track').textContent=s.track+1;midiClock.checked=s.clockEnabled;const encoder=Number(midiEncoder.value);midiCC.disabled=encoder<4;if(document.activeElement!==midiCC)midiCC.value=s.ccNumbers[encoder];document.getElementById('midi-value').textContent=encoder<4?'Commande musicale · aucun CC':'Valeur CC : '+s.values[encoder];const hits=current().flat().filter(Boolean).length;
if(!s.trackSettings){
const fields=encoderFields(),cells=[0,1,4,5,2,3,6,7].map(i=>`<div data-encoder-field="${i}" class="track-field ${i===s.lastEncoder?'track-field-selected':''}"><span class="micro">${i+1} · ${esc(fields[i].name)}</span><strong>${esc(fields[i].value)}</strong></div>`).join('');
setScreen(left,`<div class="micro">${esc(s.mode)} · PISTE ${s.track+1} · PAT ${s.pattern+1} · PAGE ${s.page+1}/32</div><div class="screen-title">COMMANDES SIMPLIFIÉES</div><div class="screen-data track-midi-grid">${cells}</div><span class="micro" id="musical-settings">VEL ${s.velocity} GATE ${s.gate}% OCT ${s.octave} SWING ${s.swing}%</span>`);
setScreen(right,`<div class="micro">POLYCHRONIC SEQUENCER</div><div class="screen-title">${s.bpmEdit?'TEMPO':s.playing?'▶ PLAYING':'■ STOPPED'} · ${s.tempo} BPM</div><div class="screen-data">STEP <span id="playhead-position">${String(trackPosition(s.track,midi.absoluteStep)+1).padStart(2,'0')}/${patternConfig(s.track).length}</span>　 ${hits} NOTES<br><span class="bar" style="--progress:${(s.step+1)*6.25}%"></span>${s.screenUntil>performance.now()?esc(s.screenMessage):`${esc(encoderDetail())}<br>TRK ${s.track+1}/16 · BANK ${s.bank}`}</div>`);
}else{
 const fields=trackFields(),selected=fields[s.trackFocus];
 const cells=[0,1,4,5,2,3,6,7].map(i=>`<div data-track-field="${i}" class="track-field ${i===s.trackFocus?'track-field-selected':''}"><span class="micro">${i+1} · ${esc(fields[i].name)}</span><strong>${esc(fields[i].value)}</strong></div>`).join('');
 setScreen(left,`<div class="micro">TRACK SETTINGS · PISTE ${s.track+1}</div><div class="screen-title">RÉGLAGES DE PISTE</div><div class="screen-data track-midi-grid">${cells}</div>`);
 setScreen(right,`<div class="micro">RÉGLAGES PISTE ${s.track+1}</div><div class="screen-title">ENC ${s.trackFocus+1} · ${esc(selected.name)}</div><div class="screen-data">${esc(selected.value)}<br><span class="micro">${esc(selected.help)}</span><br><span class="micro">ENC 9 : naviguer · appui : fermer</span></div>`);
}
transport.textContent=s.playing?'■ STOP':'▶ PLAY';transport.classList.toggle('transport-on',s.playing);if(document.activeElement!==bpm)bpm.value=s.tempo;
tracks.forEach((t,i)=>{t.classList.toggle('selected',i===s.track);t.setAttribute('aria-expanded',String(s.trackSettings&&i===s.track))});
pads.forEach(p=>{let r=+p.dataset.row,c=+p.dataset.col;let on=s.mode==='PATTERN'?(state.patterns[c][r].some(page=>page.some(row=>row.some(Boolean)))||(r===s.pattern&&c===s.track)):!!current()[r][c];if(selectedPads.has(p)&&!current()[r][c])selectedPads.delete(p);p.classList.toggle('note-selected',s.selectingNotes&&selectedPads.has(p));p.classList.toggle('on',on);p.classList.toggle('head',s.playing&&s.page===s.playPage&&c===s.step);p.classList.toggle('pattern',s.mode==='PATTERN'&&on);p.classList.toggle('selected-pattern',s.mode==='PATTERN'&&r===s.pattern&&c===s.track);p.classList.toggle('live',s.mode==='LIVE'&&on);p.classList.toggle('automation',s.mode==='AUTOM'&&on)});
knobs.forEach((k,i)=>{
 let angle=knobAngles[i],label='Encodeur '+(i+1)+' : '+(i<8?encoderFields()[i].name+' '+encoderFields()[i].value:'CC '+s.ccNumbers[8]+' '+s.values[8]);
 if(k.dataset.value!==String(s.values[i]))k.dataset.value=s.values[i];
 if(i===8&&s.bpmEdit)label='Tempo : '+s.tempo+' BPM';
 if(s.trackSettings){label=i===8?'Naviguer entre les réglages de piste':trackFields()[i].name+' : '+trackFields()[i].value}
 if(k.style.getPropertyValue('--angle')!==angle+'deg')k.style.setProperty('--angle',angle+'deg');
 if(k.getAttribute('aria-label')!==label){k.setAttribute('aria-label',label);k.title=label}
 if(k.getAttribute('aria-disabled')!=='false')k.setAttribute('aria-disabled','false');
});
selectButton.setAttribute('aria-pressed',String(s.selectingNotes));
leftBtns.find(b=>b.textContent.trim()==='PASTE').classList.toggle('paste-armed',s.pasteArmed);
leftBtns.forEach(b=>b.classList.toggle('active',(b.textContent.trim()==='REC'&&s.recording)||(b.textContent.trim()==='MUTE'&&s.muted.has(s.track))||(b.textContent.trim()==='2ND'&&s.second)));
rightBtns.forEach(b=>b.classList.toggle('mode-active',b.textContent.trim()===s.mode||b.textContent.trim()===s.bank));
}
function play(){if(state.playing){stop();return}for(const engine of usedEngines()){const t=engine.output?.timing;if(t){t.notes=0;t.totalLate=0;t.maxLate=0}}origins.fill(0);randomOffsets.fill(0);scheduledTick=-1;randomSeed=(Math.random()*0xffffffff)>>>0;programCache.clear();midi.tempo=state.tempo;midi.swing=state.swing;midi.clockEnabled=state.clockEnabled;state.playing=true;midi.start();render()}
function restart(){const recording=state.recording;if(state.playing)midi.stop();state.recording=recording;play()}
function stop(){midi.stop();render()}
function clear(){cancelNoteActions();checkpoint();current().forEach(row=>row.fill(0));flash('Page effacée · UNDO pour annuler');render()}
function page(delta){cancelNoteSelection();state.page=(state.page+delta+32)%32;flash('Page '+(state.page+1)+'/32');render()}
function changeKnob(i,delta){
 state.lastEncoder=i;knobAngles[i]+=delta*270/127;
 if(state.trackSettings){changeTrackSetting(i,delta);return}

 if(i===8&&state.bpmEdit){state.values[i]=Math.max(0,Math.min(127,state.values[i]+delta));state.tempo=Math.max(30,Math.min(300,state.tempo+delta));bpm.value=state.tempo;render();return}
 const previous=state.values[i];
 state.values[i]=Math.max(0,Math.min(127,state.values[i]+delta));
 if(i===0)state.velocity=state.values[i];
 if(i===1)state.octave=Math.max(0,Math.min(7,state.octave+delta));
 if(i===2)state.gate=Math.max(0,Math.min(100,state.gate+delta));
 if(i===3)state.swing=Math.max(0,Math.min(50,state.swing+delta));
 if(i>=4&&previous!==state.values[i])trackMidi(state.track).cc(state.channels[state.track]-1,state.ccNumbers[i],state.values[i]);
 else if(previous===state.values[i])flash('Encodeur '+(i+1)+' : limite '+(i<8?encoderFields()[i].value:state.values[i]));
 render();
}
transport.addEventListener('click',()=>{closeTrackSettings();play()});document.getElementById('reset').addEventListener('click',()=>{closeTrackSettings();clear()});document.getElementById('save').addEventListener('click',()=>{save();render()});document.getElementById('help').addEventListener('click',()=>{flash('Copie partielle : SÉLECTION → notes → COPY → PASTE → destination · UNDO annule');render()});
bpm.addEventListener('change',()=>{state.tempo=Math.max(30,Math.min(300,Math.round(Number(bpm.value)||120)));bpm.value=state.tempo;render()});
function closeTrackSettings(){if(state.trackSettings){state.trackSettings=false;state.screenMessage='';state.screenUntil=0}}
function selectTrack(i){if(applyTrackAction(i))return;cancelNoteSelection();state.track=i;closeTrackSettings();refreshInputBindings();flash('Piste '+(i+1));render()}
function openTrackSettings(i){cancelNoteActions();state.track=i;state.trackSettings=true;state.trackFocus=5;state.bpmEdit=false;refreshInputBindings();flash('Réglages piste '+(i+1)+' · écran gauche : sortie et canal MIDI');render()}
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
  if(applyTrackAction(i))return;
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
pads.forEach(p=>{
 let pointer=null;
 const release=e=>{
  if(e.pointerId!==pointer)return;
  const id=pointer;pointer=null;heldPads.delete(p);
  if(p.hasPointerCapture(id))p.releasePointerCapture(id);
 };
 p.addEventListener('pointerdown',e=>{
  if(pointer!==null||(e.pointerType==='mouse'&&e.button!==0))return;
  pointer=e.pointerId;p.setPointerCapture(pointer);consumedPads.delete(p);
  if(applyPadAction(p)){consumedPads.add(p);return}
  heldPads.add(p);
 });
 p.addEventListener('pointerup',release);
 p.addEventListener('lostpointercapture',release);
 p.addEventListener('pointercancel',e=>{release(e);consumedPads.add(p)});
 p.addEventListener('keydown',()=>consumedPads.delete(p));
});
leftBtns.filter(b=>['COPY','PASTE','DELETE'].includes(b.textContent.trim())).forEach(b=>{
 b.style.touchAction='none';
 b.addEventListener('pointerdown',e=>{
  if(heldAction||(e.pointerType==='mouse'&&e.button!==0))return;
  closeTrackSettings();render();consumedButtons.delete(b);b.classList.add('held');heldAction={kind:b.textContent.trim(),used:false,pointer:e.pointerId};b.setPointerCapture(e.pointerId);
  if(heldAction.kind==='COPY'&&heldPads.size){copySelection();heldAction.used=true;render()}
 });
 const release=e=>{if(heldAction?.pointer!==e.pointerId)return;b.classList.remove('held');if(heldAction.used||e.type==='pointercancel')consumedButtons.set(b,performance.now()+500);heldAction=null};
 b.addEventListener('pointerup',release);b.addEventListener('pointercancel',release);b.addEventListener('lostpointercapture',release);
});
window.addEventListener('blur',()=>{leftBtns.forEach(b=>b.classList.remove('held'));heldAction=null;heldPads.clear();consumedPads.clear()});
pads.forEach(p=>p.addEventListener('click',e=>{if(e.isTrusted&&consumedPads.delete(p))return;if(applyPadAction(p))return;if(state.trackSettings){closeTrackSettings();render();return}if(handleNoteSelection(p))return;const r=+p.dataset.row,c=+p.dataset.col;if(state.mode==='PATTERN'){state.track=c;refreshInputBindings();if(state.pattern!==r){state.undo=[];state.redo=[]}selectPattern(r);flash('Pattern '+(r+1)+'/8');render();return}if(state.mode==='AUTOM'){flash('Automation non simulée · choisissez STEP ou LIVE');render();return}if(state.mode==='LIVE'){const pitch=notePitch(r);if(!state.muted.has(state.track))trackMidi(state.track).note(state.channels[state.track]-1,pitch,state.velocity,Math.max(1,60000/(state.tempo*4)*state.gate/100));if(state.recording){checkpoint();state.patterns[state.track][state.pattern][state.playing?Math.floor(trackPosition(state.track,midi.absoluteStep)/16):state.page][r][state.playing?trackPosition(state.track,midi.absoluteStep)%16:c]=state.velocity}flash('Note '+pitch+(trackMidi(state.track).output?' · MIDI':' · choisissez une sortie MIDI'));render();return}checkpoint();current()[r][c]=current()[r][c]?0:state.velocity;render()}));
leftBtns.forEach(b=>b.addEventListener('click',e=>{if(e.isTrusted&&performance.now()<(consumedButtons.get(b)||0))return;closeTrackSettings();const t=b.textContent.trim();switch(t){case '▶':restart();return;case '■':stop();return;case '●':case 'REC':state.recording=!state.recording;flash(state.recording?'REC activé':'REC désactivé');break;case '2ND':state.second=!state.second;flash(state.second?'2ND activé':'2ND désactivé');break;case 'MUTE':state.muted.has(state.track)?state.muted.delete(state.track):state.muted.add(state.track);break;case 'COPY':if(state.selectingNotes)copySelectedNotes();else state.mode==='PATTERN'?copyPattern(state.track,state.pattern):copyPage();break;case 'PASTE':pasteCurrent();break;case 'DELETE':clear();return;case 'ALGO':checkpoint();current().forEach((row,r)=>row.forEach((_,c)=>row[c]=(r===7&&c%4===0)||(r===3&&c%4===2)||(r===5&&c%2===0)?state.velocity:0));flash('Rythme de démonstration');break;default:flash('Commande '+(t||'libre')+' non simulée')}render()}));
rightBtns.forEach(b=>b.addEventListener('click',()=>{closeTrackSettings();const t=b.textContent.trim();if(['STEP','LIVE','AUTOM','PATTERN'].includes(t)){cancelNoteActions();state.trackSettings=false;state.mode=t;if(t==='AUTOM')flash('Automation non simulée · édition de notes désactivée dans ce mode');}else if(t==='A'||t==='B'){state.bank=t;flash('Banque '+t+' (indicateur)')}else if(t==='→')return page(1);else if(t==='←')return page(-1);else if(t==='+'||t==='-')flash('Zoom non simulé · navigation : ← / →');else if(t==='UNDO')applyHistory(state.second?state.redo:state.undo,state.second?state.undo:state.redo);else if(t==='BPM'){state.trackSettings=false;state.bpmEdit=!state.bpmEdit;if(state.bpmEdit){bpm.focus();bpm.select()}flash(state.bpmEdit?'BPM · encodeur principal : tempo':'Fenêtre BPM fermée')}else if(t==='↑'||t==='↓'){state.octave=Math.max(0,Math.min(7,state.octave+(t==='↑'?1:-1)));state.values[1]=state.octave*18;knobAngles[1]=-135+270*state.values[1]/127;}else if(t==='SET'){flash('Réglages secondaires non simulés · maintenir une piste pour ses réglages primaires')}else if(t==='FILL'){flash('Conditions FILL non simulées')}else if(t==='SNAP'){flash('Snapshot non simulé · SAVE sauvegarde le projet')}else flash(t+' : non simulé');render()}));
function clickKnob(i){
 if(state.trackSettings){
  if(i===8){closeTrackSettings();render();return}
  state.trackFocus=i;
  if(i===0){state.pcField=(state.pcField+1)%3;render();return}
  if(i===2){state.lengthFine=!state.lengthFine;render();return}
 }
 changeKnob(i,1);
}
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
document.addEventListener('keydown',e=>{if(e.key==='Escape'){cancelNoteActions();flash('Sélection et collage annulés');render();return}if(e.target.closest('input,select,textarea,button'))return;if(e.code==='Space'){e.preventDefault();play()}else if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();applyHistory(state.undo,state.redo);render()}else if(e.key==='ArrowRight')page(1);else if(e.key==='ArrowLeft')page(-1)});
function notePitch(row){return Math.max(0,Math.min(127,60+(7-row)+12*(state.octave-3)))}
function playMidiStep(step,at,duration,absolute){
 scheduledTick=absolute;
 for(let track=0;track<16;track++){
  if(state.muted.has(track))continue;
  const position=trackPosition(track,absolute),rows=state.patterns[track][state.pattern][Math.floor(position/16)];
  sendProgram(track,at);
  for(let row=0;row<8;row++){const velocity=rows[row][position%16];if(velocity)trackMidi(track).note(state.channels[track]-1,notePitch(row),velocity,Math.max(1,duration*state.gate/100),at)}
 }
}
function updateOutputs(){
 const selected=midi.output?.id||'';
 midiOutput.replaceChildren(new Option('Aucune sortie', ''));
 if(midiAccess)for(const port of outputPorts())if(port.state!=='disconnected')midiOutput.add(new Option(port.name||'Sortie MIDI',port.id));
 if((selected&&!outputPorts().some(port=>port.id===selected))||midi.output?.state==='disconnected'){
  connectionVersion++;midi.setOutput(null);midiStatus.textContent='Sortie déconnectée · choisissez une sortie MIDI.';
 }else midiOutput.value=selected;
 midiOutput.disabled=!midiAccess;refreshInputBindings();for(const [id,engine] of routeEngines)if(!outputPorts().some(p=>p.id===id&&p.state!=='disconnected')){stop();engine.setOutput(null);routeEngines.delete(id)}render();
}
document.getElementById('midi-connect').addEventListener('click',async()=>{
 const button=document.getElementById('midi-connect');
 if(!window.isSecureContext||!navigator.requestMIDIAccess){midiStatus.textContent='Web MIDI indisponible dans ce navigateur. Safari sur iPad ne donne pas accès au MIDI. Consultez les instructions iPad ci-dessous ; Chrome/Edge conviennent sur ordinateur.';render();return}
 button.disabled=true;
 try{
  if(!midiAccess){midiAccess=await navigator.requestMIDIAccess({sysex:false});midiAccess.onstatechange=updateOutputs}
  updateOutputs();await restoreTrackOutputs();button.textContent='Actualiser MIDI';
  midiStatus.textContent=trackMidi(state.track).output?'Sortie : '+trackOutputName(state.track):midiOutput.options.length>1?'MIDI autorisé · choisissez une sortie.':'Aucune sortie MIDI détectée. Branchez un appareil ou créez un port virtuel, puis actualisez.';
 }catch(error){midiStatus.textContent='Accès MIDI refusé ou indisponible. Autorisez MIDI dans les paramètres du navigateur.'}
 finally{button.disabled=false;render()}
});
midiOutput.addEventListener('change',async()=>{
 const id=midiOutput.value;if(state.trackData[state.track].output!=='@default'){await assignTrackOutput(state.track,id||'@off');return}
 const version=++connectionVersion,port=outputPorts().find(port=>port.id===id);
 midi.setOutput(null);
 if(!port){midiStatus.textContent='Aucune sortie MIDI sélectionnée.';render();return}
 try{
  await HapaxMidiCompat.open(port);if(version!==connectionVersion)return;
  if(port.state==='disconnected')throw Error('Disconnected');
  const engine=await ensureOutput(port);midi.setOutput(engine.output);midiOutput.value=port.id;midiStatus.textContent='Sortie : '+(port.name||'MIDI')+(ipadMidi?' · pont MIDI iPad':'');
 }catch(error){if(version===connectionVersion){midi.setOutput(null);midiOutput.value='';midiStatus.textContent='Impossible d’ouvrir cette sortie (ou délai dépassé). Vérifiez la connexion MIDI puis actualisez.'}}
 finally{if(version===connectionVersion)render()}
});
midiTimingMode.addEventListener('change',()=>changeTimingMode(midiTimingMode.value));
midiChannel.addEventListener('change',()=>setTrackChannel(Number(midiChannel.value)));
midiClock.addEventListener('change',()=>{const enabled=midiClock.checked;stop();state.clockEnabled=enabled;midi.clockEnabled=enabled;render()});
midiEncoder.addEventListener('change',render);
midiCC.addEventListener('change',()=>{state.ccNumbers[Number(midiEncoder.value)]=Math.max(0,Math.min(119,Math.round(Number(midiCC.value)||0)));midiCC.value=state.ccNumbers[Number(midiEncoder.value)];render()});
document.getElementById('midi-panic').addEventListener('click',()=>{stop();flash('PANIC · notes et lecture arrêtées');render()});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&(state.playing||[...routeEngines.values()].some(engine=>engine.active.size)))stop()});
window.addEventListener('pagehide',stop);
setInterval(()=>{midi.tempo=state.tempo;midi.swing=state.swing;midi.pump();for(const engine of routeEngines.values())engine.pump()},10);
function renderPlayhead(previous){
 for(const pad of padColumns[previous]||[])pad.classList.remove('head');
 if(state.playing&&state.page===state.playPage)for(const pad of padColumns[state.step])pad.classList.add('head');
 const counter=document.getElementById('playhead-position');
 if(counter)counter.textContent=String(trackPosition(state.track,midi.absoluteStep)+1).padStart(2,'0')+'/'+patternConfig().length;
 right.querySelector('.bar')?.style.setProperty('--progress',(state.step+1)*6.25+'%');
}
function tick(){
 const expired=state.screenUntil>0&&performance.now()>=state.screenUntil;
 const position=trackPosition(state.track,midi.absoluteStep),previous=state.step;
 const moved=state.step!==position%16||state.playPage!==Math.floor(position/16);
 state.step=position%16;state.playPage=Math.floor(position/16);
 if(expired||inputDirty){inputDirty=false;if(expired)state.screenUntil=0;render()}
 else if(moved)renderPlayhead(previous);
 requestAnimationFrame(tick);
}

setInterval(()=>{
 const outputs=[...usedEngines()].map(engine=>engine.output),stats=outputs.map(port=>port?.timing).filter(Boolean);
 const node=document.getElementById('midi-timing');if(!node)return;
 const notes=stats.reduce((sum,t)=>sum+t.notes,0),worst=Math.max(0,...stats.map(t=>t.maxLate));
 let text;
 if(!outputs.length)text='Timing MIDI : choisissez une sortie pour connaître le mode disponible.';
 else if(!stats.length)text='Timing MIDI : horodatage natif demandé. Les notes sont envoyées en avance avec leur échéance. La réception physique reste à vérifier.';
 else text='Timing pont MIDI · retard maximal d’appel logiciel : '+worst.toFixed(1)+' ms ('+notes+' notes). '+(state.timingMode==='software'?'Mode compatibilité choisi.':'Mode natif indisponible pour ce port : repli logiciel.')+' Ce chiffre ne mesure pas le délai du pont ni du câble.'+(outputs.length>stats.length?' Autres sorties : horodatage natif.':'');
 if(node.textContent!==text)node.textContent=text;
},1000);
load();
// Match encoder positions to saved musical parameters, including older V8 projects.
state.values[0]=state.velocity;
state.values[1]=Math.max(0,Math.min(127,state.octave*18));
state.values[2]=Math.round(state.gate*127/100);
state.values[3]=Math.round(state.swing*127/50);
state.values.forEach((value,i)=>knobAngles[i]=-135+270*value/127);
render();requestAnimationFrame(tick);
})();
