const test = require('node:test');
const assert = require('node:assert/strict');
require('../midi-compat.js');
const {ports, open, output} = HapaxMidiCompat;

test('enumerates native Map and older bridge iterators without Symbol.iterator', () => {
  const a={id:'a'},b={id:'b'};
  assert.deepEqual(ports(new Map([['a',a],['b',b]])),[a,b]);
  assert.deepEqual(ports({values(){let i=0;return {next:()=>i<2?{value:[a,b][i++],done:false}:{done:true}}}}),[a,b]);
  assert.deepEqual(ports(null),[]);
});
test('supports bridge ports with missing open(), synchronous open() and failed open()', async () => {
  await open({});
  let opened=false;
  await open({open(){opened=true;}});assert(opened);
  await assert.rejects(open({open(){throw Error('Unavailable');}}),/Unavailable/);
  await assert.rejects(open({open:()=>new Promise(()=>{})},10),/timeout/);
});
function fixture(softwareTiming=true) {
  let time=0,seq=0;
  const queue=new Map(),messages=[];
  const port={id:'legacy',name:'USB MIDI',state:'connected',send(data){messages.push([...data]);}};
  const wrapped=output(port,{softwareTiming,now:()=>time,
    schedule:(fn,delay)=>{queue.set(++seq,{fn,at:time+delay});return seq;},cancel:id=>queue.delete(id)});
  return {port,wrapped,messages,queue,advance(t){time=t;for(const [id,event] of [...queue])if(event.at<=time){queue.delete(id);event.fn();}}};
}
test('an immediate-only bridge preserves future Note On/Off timing', () => {
  const {wrapped,messages,advance}=fixture();
  wrapped.send([0x90,60,100],10);wrapped.send([0x80,60,0],110);
  assert.equal(messages.length,0);
  advance(10);assert.deepEqual(messages,[[0x90,60,100]]);
  advance(100);assert.equal(messages.length,1);
  advance(110);assert.deepEqual(messages[1],[0x80,60,0]);
});
test('Panic can cancel future bridge notes and clock pulses', () => {
  const {wrapped,messages,advance,queue}=fixture();
  wrapped.send([0x90,60,100],10);wrapped.send([0xf8],20);
  wrapped.clear();assert.equal(queue.size,0);
  advance(100);assert.equal(messages.length,0);
  wrapped.send([0xb0,120,0]);assert.deepEqual(messages,[[0xb0,120,0]]);
});
test('disconnected bridge drops pending events and native ports retain their scheduler', () => {
  const {wrapped,port,messages,advance}=fixture();
  wrapped.send([0xf8],10);port.state='disconnected';advance(10);
  assert.equal(messages.length,0);
  const native={clear(){},send(){}};
  assert.equal(output(native),native);
});
test('ports missing clear() automatically use cancellable software timing', () => {
  const {port,wrapped,queue}=fixture(false);
  assert.notEqual(wrapped,port);
  wrapped.send([0xf8],10);assert.equal(queue.size,1);
  wrapped.clear();assert.equal(queue.size,0);
});

test('bridge queue preserves bank/program/note ordering at the same timestamp', () => {
  const {wrapped,messages,advance,queue}=fixture();
  const ordered=[[0xb0,0,1],[0xb0,32,3],[0xc0,4],[0x90,60,100]];
  for(const message of ordered)wrapped.send(message,10);
  assert.equal(queue.size,1);
  advance(10);assert.deepEqual(messages,ordered);
});

test('queuing later bridge events never rearms the imminent note timer', () => {
 const {wrapped,queue,messages,advance}=fixture();
 wrapped.send([0x90,60,100],10);const first=[...queue.keys()][0];
 for(let i=0;i<100;i++)wrapped.send([0x80,61,0],100+i);
 assert.deepEqual([...queue.keys()],[first]);
 advance(12);assert.deepEqual(messages[0],[0x90,60,100]);
 assert.equal(wrapped.timing.notes,1);assert.equal(wrapped.timing.maxLate,2);
});
