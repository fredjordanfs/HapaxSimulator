/* Primary track settings from Hapax manual 3.10, sections 6.2 and 6.3. */
(function(root){
  'use strict';
  const runs=['FORWARD','REVERSE','PING-PONG','RANDOM BAR','RANDOM BEAT','RANDOM 1/16'];
  const integer=(value,min,max,fallback)=>Number.isInteger(value)?Math.max(min,Math.min(max,value)):fallback;
  function pattern(value={}){
    return {length:integer(value.length,1,512,16),run:runs.includes(value.run)?value.run:'FORWARD',
      trig:value.trig==='RESTART'?'RESTART':'FREE',pc:integer(value.pc,-1,127,-1),
      msb:integer(value.msb,-1,127,-1),lsb:integer(value.lsb,-1,127,-1)};
  }
  function settings(value={}){
    const port=v=>typeof v==='string'&&v.length<=512?v:'';
    return {output:port(value.output)||'@default',input:port(value.input),
      inputChannel:integer(value.inputChannel,0,16,0),
      patterns:Array.from({length:16},(_,i)=>pattern(value.patterns?.[i]))};
  }
  function position(config,tick,random=Math.random){
    const length=config.length;
    tick=Math.max(0,Math.floor(tick));
    switch(config.run){
      case 'REVERSE':return length-1-tick%length;
      case 'PING-PONG':{
        if(length===1)return 0;
        const p=tick%(2*length-2);return p<length?p:2*length-2-p;
      }
      case 'RANDOM BAR':return (Math.floor(random(Math.floor(tick/16))*length)+tick%16)%length;
      case 'RANDOM BEAT':return (Math.floor(random(Math.floor(tick/4))*length)+tick%4)%length;
      case 'RANDOM 1/16':return Math.floor(random(tick)*length)%length;
      default:return tick%length;
    }
  }
  function phase(config,position){
    position%=config.length;
    return config.run==='REVERSE'?config.length-1-position:position;
  }
  function program(config,channel){
    if(config.pc<0)return [];
    const messages=[];
    if(config.msb>=0)messages.push([0xb0|channel,0,config.msb]);
    if(config.lsb>=0)messages.push([0xb0|channel,32,config.lsb]);
    messages.push([0xc0|channel,config.pc]);return messages;
  }
  function accepts(config,port,channel,selected){
    if(config.input==='@active')return selected;
    return config.input===port&&(config.inputChannel===0||config.inputChannel===channel+1);
  }
  root.HapaxTrack={runs,settings,position,phase,program,accepts};
})(globalThis);
