/* Web MIDI output and transport. No SysEx permission or external dependencies. */
(function (root) {
  'use strict';
  class HapaxMidi {
    constructor({now = () => performance.now(), onStep = () => {}, onHalt = () => {}, onStatus = () => {}, onSync = null, beforeStop = () => {}} = {}) {
      this.now = now;
      this.onStep = onStep;
      this.onHalt = onHalt;
      this.onStatus = onStatus;
      this.onSync = onSync;
      this.beforeStop = beforeStop;
      this.output = null;
      this.playing = false;
      this.clockEnabled = false;
      this.tempo = 120;
      this.swing = 0;
      this.active = new Map();
      this.visualSteps = [];
      this.step = 0;
      this.absoluteStep = 0;
    }
    sync(data,at=this.now()){if(this.onSync)this.onSync(data,at);else this.send(data,at);}
    hold(channel,pitch,velocity){
      const key=channel+':'+pitch;
      if((this.active.get(key)?.until||0)>this.now())return false;
      if(!this.send([0x90|channel,pitch,velocity]))return false;
      this.active.set(key,{channel,pitch,until:Infinity});return true;
    }
    release(channel,pitch){
      const key=channel+':'+pitch;
      if(this.active.get(key)?.until!==Infinity)return;
      this.send([0x80|channel,pitch,0]);this.active.delete(key);
    }
    send(data, at = this.now()) {
      if (!this.output || this.output.state === 'disconnected') return false;
      try { this.output.send(data, at); return true; }
      catch (error) {
        this.stop();
        this.output = null;
        this.onStatus('Envoi MIDI impossible : reconnectez la sortie.');
        return false;
      }
    }
    note(channel, pitch, velocity, duration, at = this.now()) {
      channel = Math.max(0, Math.min(15, Math.round(channel)));
      pitch = Math.max(0, Math.min(127, Math.round(pitch)));
      velocity = Math.max(0, Math.min(127, Math.round(velocity)));
      if (!velocity || !Number.isFinite(duration) || duration <= 0) return false;
      const key = channel + ':' + pitch;
      // Avoid a previous scheduled Note Off cutting a repeated live note short.
      const previousEnd = this.active.get(key)?.until || 0;
      if (previousEnd > at + 0.001) return false;
      // Floating-point clock accumulation must not skip adjacent 100% gate notes.
      at = Math.max(at, previousEnd);
      if (!this.send([0x90 | channel, pitch, velocity], at)) return false;
      this.active.set(key, {channel, pitch, until:at + duration});
      if (!this.send([0x80 | channel, pitch, 0], at + duration)) return false;
      return true;
    }
    cc(channel, controller, value) {
      return this.send([0xb0 | channel, controller, Math.max(0, Math.min(127, Math.round(value)))]);
    }
    silence() {
      // Clear future notes AND clocks before explicitly silencing sounding notes.
      const port = this.output;
      if (port && port.state !== 'disconnected') {
        try {
          port.clear();
          for (const {channel, pitch} of this.active.values()) port.send([0x80 | channel, pitch, 0]);
          for (let channel = 0; channel < 16; channel++) {
            port.send([0xb0 | channel, 64, 0]); // Sustain off
            port.send([0xb0 | channel, 123, 0]); // All Notes Off
            port.send([0xb0 | channel, 120, 0]); // All Sound Off
          }
        } catch (error) { this.onStatus('Sortie MIDI inaccessible ; vérifiez la connexion.'); }
      }
      this.active.clear();
    }
    stop() {
      const wasPlaying = this.playing;
      this.playing = false;
      this.beforeStop();
      this.silence();
      if (wasPlaying && this.clockEnabled && this.output?.state !== 'disconnected') {
        try { this.sync([0xfc]); } catch (error) { /* Disconnected port. */ }
      }
      this.visualSteps = [];
      this.step = 0;
      this.absoluteStep = 0;
      this.onHalt();
    }
    setOutput(output) {
      this.stop();
      this.output = output;
    }
    start() {
      if (this.playing) return;
      this.playing = true;
      this.clockIndex = 0;
      this.step = 0;
      this.absoluteStep = 0;
      this.nextClock = this.now() + 10;
      this.lastPump = this.now();
      this.visualSteps = [];
      if (this.clockEnabled) this.sync([0xfa], this.nextClock);
      this.pump();
    }
    pump() {
      const now = this.now();
      for (const [key, note] of this.active) if (note.until <= now) this.active.delete(key);
      if (!this.playing) return;
      // Never burst stale clocks or notes after a suspended/backgrounded browser.
      if (now - this.lastPump > 250) {
        this.stop();
        this.onStatus('Lecture arrêtée : navigateur suspendu. Appuyez sur PLAY.');
        return;
      }
      this.lastPump = now;
      const clockInterval = 60000 / (this.tempo * 24);
      const stepInterval = clockInterval * 6;
      while (this.playing && this.nextClock < now + 40) {
        const at = this.nextClock;
        if (this.clockEnabled) this.sync([0xf8], at);
        if (!this.playing) break;
        if (this.clockIndex % 6 === 0) {
          const step = (this.clockIndex / 6) % 16;
          const swing = Math.max(0, Math.min(50, this.swing)) / 100;
          const noteTime = at + (step % 2 ? stepInterval * swing : 0);
          const duration = stepInterval * (step % 2 ? 1 - swing : 1 + swing);
          this.visualSteps.push({step, absolute:this.clockIndex/6, at:noteTime});
          this.onStep(step, noteTime, duration, this.clockIndex/6);
        }
        this.clockIndex++;
        this.nextClock += clockInterval;
      }
      while (this.visualSteps.length && this.visualSteps[0].at <= now) {
        const visual=this.visualSteps.shift();this.step=visual.step;this.absoluteStep=visual.absolute;
      }
    }
  }
  root.HapaxMidi = HapaxMidi;
})(globalThis);
