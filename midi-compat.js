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
    const pending = new Set();
    return {
      raw:port,
      get id() { return port.id; },
      get name() { return port.name; },
      get state() { return port.state; },
      send(data, at = now()) {
        const delay = at - now();
        if (delay <= 0) { port.send(Array.from(data)); return; }
        // Some bridges send immediately and ignore the Web MIDI timestamp.
        const message = Array.from(data);
        const timer = schedule(() => {
          pending.delete(timer);
          if (port.state === 'disconnected') return;
          try { port.send(message); }
          catch (error) { this.clear(); onError(error); }
        }, delay);
        pending.add(timer);
      },
      clear() { for (const timer of pending) cancel(timer); pending.clear(); }
    };
  }
  root.HapaxMidiCompat = {ports, open, output};
})(globalThis);
