/* Compatibility with MIDI browser bridges on iPad. No MIDI access is added to Safari. */
(function (root) {
  'use strict';
  function ports(collection) {
    if (!collection) return [];
    if (typeof collection.values === 'function') {
      const iterator = collection.values(), result = [];
      // Older iOS MIDI bridges expose next(), but no Symbol.iterator.
      if (typeof iterator.next === 'function') {
        for (let item = iterator.next(); !item.done; item = iterator.next()) result.push(item.value);
        return result;
      }
      if (Array.isArray(iterator)) return iterator;
    }
    const result = [];
    if (typeof collection.forEach === 'function') collection.forEach(port => result.push(port));
    return result;
  }
  async function open(port, timeout = 5000) {
    if (typeof port.open !== 'function') return;
    let timer;
    try {
      await Promise.race([Promise.resolve().then(() => port.open()), new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('MIDI port open timeout')), timeout);
      })]);
    } finally { clearTimeout(timer); }
  }
  function output(port, {softwareTiming = false, onError = () => {},
    now = () => performance.now(), schedule = setTimeout, cancel = clearTimeout} = {}) {
    if (!softwareTiming && typeof port.clear === 'function') return port;
    let pending = [], timer = null, armedAt = Infinity;
    const timing={notes:0,totalLate:0,maxLate:0};
    function arm() {
      const next=pending[0]?.at??Infinity;
      if(timer!==null&&armedAt===next)return;
      if(timer!==null)cancel(timer);
      armedAt=next;
      timer=pending.length?schedule(flush,Math.max(1,next-now())):null;
    }
    function clear() {
      if (timer !== null) cancel(timer);
      timer = null; armedAt=Infinity; pending = [];
    }
    function flush() {
      timer = null;armedAt=Infinity;
      if (port.state === 'disconnected') { clear(); return; }
      // One queue preserves insertion order for bank, program and note messages
      // sharing a timestamp, even when the bridge ignores native timestamps.
      while (pending.length && pending[0].at <= now()) {
        const event = pending.shift();
        if((event.data[0]&0xf0)===0x90&&event.data[2]>0){
          const late=Math.max(0,now()-event.at);timing.notes++;timing.totalLate+=late;timing.maxLate=Math.max(timing.maxLate,late);
        }
        try { port.send(event.data); }
        catch (error) { clear(); onError(error); return; }
      }
      arm();
    }
    return {
      raw:port,timing,
      get id() { return port.id; },
      get name() { return port.name; },
      get state() { return port.state; },
      send(data, at = now()) {
        const event={data:Array.from(data),at};
        // Stable insertion keeps equal-time bank/program/notes in send order.
        let index=pending.length;while(index>0&&pending[index-1].at>at)index--;
        pending.splice(index,0,event);
        if(pending[0].at<=now()){
          if(timer!==null)cancel(timer);
          flush();
        }else arm();
      },
      clear

    };
  }
  root.HapaxMidiCompat = {ports, open, output};
})(globalThis);
