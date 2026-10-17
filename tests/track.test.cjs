const test=require('node:test');
const assert=require('node:assert/strict');
require('../track.js');
const T=HapaxTrack;
test('old projects receive independent, bounded track and pattern settings',()=>{
 const a=T.settings(),b=T.settings();a.patterns[0].length=4;
 assert.equal(b.patterns[0].length,16);
 const restored=T.settings({inputChannel:99,patterns:[{length:900,run:'invalid',pc:128}]});
 assert.equal(restored.inputChannel,16);assert.equal(restored.patterns[0].length,512);
 assert.equal(restored.patterns[0].run,'FORWARD');assert.equal(restored.patterns[0].pc,127);
 assert.equal(restored.patterns.length,16);
});
test('forward, reverse and ping-pong play actual steps in order',()=>{
 const sequence=run=>Array.from({length:8},(_,i)=>T.position({length:4,run},i));
 assert.deepEqual(sequence('FORWARD'),[0,1,2,3,0,1,2,3]);
 assert.deepEqual(sequence('REVERSE'),[3,2,1,0,3,2,1,0]);
 assert.deepEqual(sequence('PING-PONG'),[0,1,2,3,2,1,0,1]);
 assert.equal(T.position({length:1,run:'PING-PONG'},99),0);
});
test('random bar/beat preserve the offsets within the chosen musical group',()=>{
 const random=()=>0.9;
 assert.deepEqual(Array.from({length:4},(_,i)=>T.position({length:32,run:'RANDOM BEAT'},i,random)),[28,29,30,31]);
 assert.deepEqual(Array.from({length:4},(_,i)=>T.position({length:32,run:'RANDOM BAR'},i,random)),[28,29,30,31]);
 assert.equal(T.position({length:32,run:'RANDOM 1/16'},10,random),28);
 for(const run of T.runs)for(let tick=0;tick<60;tick++){
  const pos=T.position({length:7,run},tick,random);assert(pos>=0&&pos<7);
 }
});
test('FREE preserves the step across lengths and run direction changes',()=>{
 const oldPosition=T.position({length:4,run:'FORWARD'},5);
 for(const run of ['FORWARD','REVERSE','PING-PONG']){
  const config={length:6,run};
  assert.equal(T.position(config,T.phase(config,oldPosition)),1);
 }
});
test('512-step patterns cover all 32 pages and then loop',()=>{
 assert.equal(T.position({length:512,run:'FORWARD'},511),511);
 assert.equal(T.position({length:512,run:'FORWARD'},512),0);
});
test('bank select MSB/LSB precede Program Change and OFF sends nothing',()=>{
 assert.deepEqual(T.program({pc:21,msb:2,lsb:9},4),[[0xb4,0,2],[0xb4,32,9],[0xc4,21]]);
 assert.deepEqual(T.program({pc:0,msb:-1,lsb:-1},15),[[0xcf,0]]);
 assert.deepEqual(T.program({pc:-1,msb:2,lsb:9},4),[]);
});
test('input OFF, specific port/channel, ALL channels and ALL ACTIVE filter independently',()=>{
 assert(!T.accepts({input:'',inputChannel:0},'keyboard',0,true));
 assert(T.accepts({input:'keyboard',inputChannel:5},'keyboard',4,false));
 assert(!T.accepts({input:'keyboard',inputChannel:5},'keyboard',3,true));
 assert(!T.accepts({input:'keyboard',inputChannel:0},'other',4,true));
 assert(T.accepts({input:'keyboard',inputChannel:0},'keyboard',15,false));
 assert(T.accepts({input:'@active',inputChannel:5},'other',3,true));
 assert(!T.accepts({input:'@active',inputChannel:5},'keyboard',4,false));
});
