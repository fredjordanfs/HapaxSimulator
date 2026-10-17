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
    let pending = [], timer = null;
    function arm() {
      if (timer !== null) cancel(timer);
      timer = pending.length ? schedule(flush, Math.max(1, pending[0].at - now())) : null;
    }
    function clear() {
      if (timer !== null) cancel(timer);
      timer = null; pending = [];
    }
    function flush() {
      timer = null;
      if (port.state === 'disconnected') { clear(); return; }
      // One queue preserves insertion order for bank, program and note messages
      // sharing a timestamp, even when the bridge ignores native timestamps.
      while (pending.length && pending[0].at <= now()) {
        const event = pending.shift();
        try { port.send(event.data); }
        catch (error) { clear(); onError(error); return; }
      }
      arm();
    }
    return {
      raw:port,
      get id() { return port.id; },
      get name() { return port.name; },
      get state() { return port.state; },
      send(data, at = now()) {
        pending.push({data:Array.from(data), at});
        pending.sort((a,b) => a.at - b.at);
        if (timer !== null) cancel(timer);
        timer = null;
        flush();
      },
      clear

    };
  }
  root.HapaxMidiCompat = {ports, open, output};
})(globalThis);
