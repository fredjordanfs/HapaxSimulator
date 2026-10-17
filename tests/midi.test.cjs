const test = require('node:test');
const assert = require('node:assert/strict');
require('../midi.js');

function fixture() {
  let time = 0;
  const messages = [], steps = [], statuses = [];
  const port = {id:'test', state:'connected', clears:0,
    send(data, at = time) { messages.push({data:[...data], at}); },
    clear() { this.clears++; }};
  const midi = new HapaxMidi({now:() => time,
    onStep:(...args) => steps.push(args), onStatus:s => statuses.push(s)});
  midi.setOutput(port);
  messages.length = 0;
  return {midi, port, messages, steps, statuses, advance(t) { time = t; midi.pump(); }};
}

test('Note On/Off carries channel, pitch, velocity and exact gate duration', () => {
  const {midi, messages} = fixture();
  assert.equal(midi.note(15, 60, 96, 93.75, 20), true);
  assert.deepEqual(messages, [{data:[0x9f,60,96], at:20}, {data:[0x8f,60,0], at:113.75}]);
});
test('incoming held notes are released by Note Off rather than a fixed gate timer',()=>{
 const {midi,messages,advance}=fixture();
 assert(midi.hold(2,61,99));advance(2000);
 assert.equal(messages.length,1);
 midi.release(2,61);assert.deepEqual(messages.at(-1).data,[0x82,61,0]);
 assert.equal(midi.active.size,0);
});
test('transport exposes absolute steps beyond 16 for long patterns',()=>{
 const {midi,steps,advance}=fixture();midi.tempo=300;midi.start();
 for(let t=10;t<1000;t+=10)advance(t);
 assert(steps.some(s=>s[3]===17));assert(midi.absoluteStep>=18);
});
test('multiport sync callback receives Start, Clock and Stop after queue cancellation',()=>{
 let time=0;const sent=[];
 const midi=new HapaxMidi({now:()=>time,onSync:data=>sent.push(data[0]),beforeStop:()=>sent.push('clear')});
 midi.clockEnabled=true;midi.start();time=50;midi.pump();midi.stop();
 assert.equal(sent[0],0xfa);assert(sent.includes(0xf8));
 assert.deepEqual(sent.slice(-2),['clear',0xfc]);
});
test('notes are bounded to MIDI bytes and zero velocity never creates an active note', () => {
  const {midi, messages} = fixture();
  midi.note(0, 999, 999, 20);
  assert.deepEqual(messages[0].data, [0x90,127,127]);
  assert.equal(midi.note(1,60,0,20), false);
  assert.equal(midi.note(1,60,100,0), false);
  assert.equal(midi.active.size, 1);
});
test('overlapping live notes cannot be cut by an earlier scheduled Note Off', () => {
  const {midi, messages, advance} = fixture();
  midi.note(0,60,100,100);
  assert.equal(midi.note(0,60,100,100,50), false);
  assert.equal(messages.length, 2);
  advance(101);
  assert.equal(midi.note(0,60,100,100), true);
});
test('CC mapping uses the requested channel, controller and value', () => {
  const {midi,messages} = fixture();
  midi.cc(4,74,82);
  assert.deepEqual(messages[0].data, [0xb4,74,82]);
});
test('full-gate adjacent notes survive clock rounding and retain Off-before-On order', () => {
  const {midi,messages} = fixture();
  midi.note(0,60,100,125,10);
  assert.equal(midi.note(0,60,100,125,134.99999999999997),true);
  assert.equal(messages[1].at,messages[2].at);
  assert.equal(messages[1].data[0],0x80);
  assert.equal(messages[2].data[0],0x90);
});
test('clock emits Start then exactly 24 pulses per quarter note, plus 4 steps', () => {
  const {midi,messages,steps,advance} = fixture();
  midi.clockEnabled = true;
  midi.start();
  for(let t=10;t<=460;t+=10) advance(t);
  assert.equal(messages[0].data[0], 0xfa);
  const clocks = messages.filter(m => m.data[0] === 0xf8);
  assert.equal(clocks.length, 24);
  assert.equal(steps.length, 4);
  assert.ok(Math.abs(clocks[1].at-clocks[0].at-500/24)<1e-9);
  assert.deepEqual(steps.map(s => s[0]), [0,1,2,3]);
});
test('clock is optional; visual sequencing and step callbacks still run', () => {
  const {midi,messages,steps} = fixture();
  midi.start();
  assert.equal(messages.length, 0);
  assert.equal(steps.length, 1);
});
test('swing offsets odd steps while preserving each pair duration', () => {
  const {midi,steps,advance} = fixture();
  midi.swing = 50;
  midi.start();
  for(let t=10;t<=240;t+=10) advance(t);
  assert.equal(steps.length, 3);
  assert.ok(Math.abs(steps[1][1]-steps[0][1]-187.5)<1e-9);
  assert.ok(Math.abs(steps[2][1]-steps[1][1]-62.5)<1e-9);
  assert.equal(steps[0][2], 187.5);
  assert.equal(steps[1][2], 62.5);
});
test('tempo changes alter subsequent clock intervals', () => {
  const {midi,messages,advance} = fixture();
  midi.clockEnabled=true; midi.start();
  midi.tempo=60;
  advance(40); advance(80);
  const clocks=messages.filter(m=>m.data[0]===0xf8);
  assert.ok(Math.abs(clocks.at(-1).at-clocks.at(-2).at-1000/24)<1e-9);
});
test('Stop clears queued events, releases active notes and sends Stop plus Panic on all channels', () => {
  const {midi,port,messages} = fixture();
  midi.clockEnabled=true; midi.start(); midi.note(7,67,100,1000);
  messages.length=0;
  const clears=port.clears;
  midi.stop();
  assert.equal(port.clears, clears+1);
  assert.equal(midi.playing, false);
  assert.equal(midi.active.size, 0);
  assert.ok(messages.some(m=>m.data.join(',') === '135,67,0'));
  for(let ch=0;ch<16;ch++) for(const cc of [64,120,123])
    assert.ok(messages.some(m=>m.data.join(',') === [0xb0|ch,cc,0].join(',')));
  assert.equal(messages.at(-1).data[0], 0xfc);
});
test('switching output silences the old device before using the new one', () => {
  const {midi,port,messages} = fixture();
  midi.start(); midi.note(0,60,100,1000);
  const other=[];
  midi.setOutput({state:'connected',clear(){},send(data){other.push([...data]);}});
  assert.equal(midi.playing,false);
  assert.equal(port.clears,1);
  assert.ok(messages.some(m=>m.data[0]===0x80));
  assert.equal(other.length,0);
  midi.cc(1,20,100);
  assert.deepEqual(other,[[0xb1,20,100]]);
});
test('a stalled scheduler stops rather than bursting stale notes and clocks', () => {
  const {midi,messages,advance,statuses} = fixture();
  midi.clockEnabled=true; midi.start(); messages.length=0;
  advance(1000);
  assert.equal(midi.playing,false);
  assert.equal(messages.filter(m=>m.data[0]===0xf8).length,0);
  assert.match(statuses[0],/suspendu/);
});
test('no output and device failures do not crash or leave transport running', () => {
  const {midi,statuses} = fixture();
  midi.setOutput(null);
  assert.equal(midi.note(0,60,100,100),false);
  midi.setOutput({state:'connected',clear(){},send(){throw Error('Disconnected');}});
  midi.clockEnabled=true;
  assert.doesNotThrow(()=>midi.start());
  assert.equal(midi.playing,false);
  assert.equal(midi.output,null);
  assert.ok(statuses.some(s=>s.includes('reconnectez')));
});
