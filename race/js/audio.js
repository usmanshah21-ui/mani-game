/**
 * VELOCITY RUSH – Audio Engine (Web Audio API)
 * Procedural engine sounds, SFX, and background music.
 */

const AudioEngine = (() => {
  let ctx = null;
  let masterGain = null;
  let musicGain = null;
  let sfxGain = null;
  let engineNode = null;
  let engineGain = null;
  let musicSource = null;
  let musicBuffer = null;
  let initialized = false;
  let engineRunning = false;
  let currentRPM = 0;
  let settings = { masterVolume: 0.7, musicVolume: 0.4, sfxVolume: 0.8 };

  // -- Internal helpers --

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      masterGain = ctx.createGain();
      masterGain.gain.value = settings.masterVolume;
      masterGain.connect(ctx.destination);

      musicGain = ctx.createGain();
      musicGain.gain.value = settings.musicVolume;
      musicGain.connect(masterGain);

      sfxGain = ctx.createGain();
      sfxGain.gain.value = settings.sfxVolume;
      sfxGain.connect(masterGain);
    }
    return ctx;
  }

  function playTone({ freq = 440, type = 'sine', duration = 0.3, vol = 0.5, attack = 0.02, release = 0.1 }) {
    try {
      const c = getCtx();
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(vol, c.currentTime + attack);
      g.gain.setValueAtTime(vol, c.currentTime + duration - release);
      g.gain.linearRampToValueAtTime(0, c.currentTime + duration);
      osc.connect(g); g.connect(sfxGain);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + duration);
    } catch(e) {}
  }

  function playNoise({ duration = 0.2, vol = 0.4, highpass = 800 }) {
    try {
      const c = getCtx();
      const bufLen = Math.floor(c.sampleRate * duration);
      const buf = c.createBuffer(1, bufLen, c.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < bufLen; i++) data[i] = Math.random() * 2 - 1;

      const src = c.createBufferSource();
      src.buffer = buf;

      const filter = c.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.value = highpass;

      const g = c.createGain();
      g.gain.setValueAtTime(vol, c.currentTime);
      g.gain.linearRampToValueAtTime(0, c.currentTime + duration);

      src.connect(filter);
      filter.connect(g);
      g.connect(sfxGain);
      src.start();
    } catch(e) {}
  }

  // -- Engine Sound --

  function startEngine() {
    try {
      const c = getCtx();
      if (engineRunning) return;

      // Multi-oscillator engine sound
      engineGain = c.createGain();
      engineGain.gain.value = 0;
      engineGain.connect(sfxGain);

      const oscs = [];
      const baseFreq = CONFIG.audio.engineBaseFreq;
      const types = ['sawtooth', 'square', 'sawtooth'];
      const freqMuls = [1, 0.5, 2];
      const vols = [0.4, 0.15, 0.1];

      types.forEach((type, i) => {
        const osc = c.createOscillator();
        const g = c.createGain();
        osc.type = type;
        osc.frequency.value = baseFreq * freqMuls[i];
        g.gain.value = vols[i];
        osc.connect(g);
        g.connect(engineGain);
        osc.start();
        oscs.push(osc);
      });

      // Low-pass filter for realism
      const filter = c.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 800;

      engineGain.connect(filter);
      filter.connect(sfxGain);

      engineNode = { oscs, filter, gain: engineGain };
      engineRunning = true;

      // Fade in
      engineGain.gain.setValueAtTime(0, c.currentTime);
      engineGain.gain.linearRampToValueAtTime(0.3, c.currentTime + 0.5);
    } catch(e) {}
  }

  function updateEngine(rpm, speed) {
    if (!engineRunning || !engineNode) return;
    try {
      const c = getCtx();
      currentRPM = rpm;
      const t = c.currentTime;
      const baseFreq = CONFIG.audio.engineBaseFreq;
      const maxFreq = CONFIG.audio.engineMaxFreq;
      const freq = baseFreq + (maxFreq - baseFreq) * (rpm / 100);

      engineNode.oscs.forEach((osc, i) => {
        const muls = [1, 0.5, 2];
        osc.frequency.setValueAtTime(freq * muls[i], t);
      });

      // Volume scales with RPM
      const vol = 0.15 + 0.2 * (rpm / 100);
      engineNode.gain.gain.setTargetAtTime(vol, t, 0.1);

      // Filter cutoff changes with speed
      engineNode.filter.frequency.setTargetAtTime(400 + speed * 8, t, 0.1);
    } catch(e) {}
  }

  function stopEngine() {
    if (!engineRunning || !engineNode) return;
    try {
      const c = getCtx();
      engineNode.gain.gain.linearRampToValueAtTime(0, c.currentTime + 1);
      setTimeout(() => {
        try {
          engineNode.oscs.forEach(o => o.stop());
        } catch(e) {}
        engineRunning = false;
        engineNode = null;
      }, 1200);
    } catch(e) {}
  }

  // -- Background Music (procedural) --

  function generateMusicBuffer(type = 'race') {
    try {
      const c = getCtx();
      const duration = 32;
      const sr = c.sampleRate;
      const buf = c.createBuffer(2, sr * duration, sr);

      // Simple procedural music: beat + bass
      const bpm = type === 'race' ? 140 : type === 'menu' ? 120 : 90;
      const beatLen = sr * (60 / bpm);

      for (let ch = 0; ch < 2; ch++) {
        const data = buf.getChannelData(ch);
        for (let i = 0; i < data.length; i++) {
          const beat = Math.floor(i / beatLen) % 4;
          const beatPhase = (i % beatLen) / beatLen;

          // Kick
          if (beatPhase < 0.05 && (beat === 0 || beat === 2)) {
            const kickFreq = 60 * (1 - beatPhase * 10);
            data[i] += Math.sin(2 * Math.PI * kickFreq * beatPhase * 0.1) * (1 - beatPhase * 20) * 0.3;
          }
          // Hi-hat
          if (beatPhase < 0.03) {
            data[i] += (Math.random() * 2 - 1) * 0.05 * (1 - beatPhase * 30);
          }
          // Bass synth
          const bassNote = [55, 55, 65, 55][beat];
          data[i] += Math.sin(2 * Math.PI * bassNote * i / sr) * 0.08 *
                     Math.sin(Math.PI * beatPhase) * (type === 'race' ? 1 : 0.5);
          // Pad
          const padFreq = [220, 277, 330, 415][beat];
          data[i] += Math.sin(2 * Math.PI * padFreq * i / sr) * 0.04;

          // Clip
          data[i] = Math.max(-0.9, Math.min(0.9, data[i]));
        }
      }
      return buf;
    } catch(e) { return null; }
  }

  function playMusic(type = 'race') {
    try {
      stopMusic();
      const c = getCtx();
      const buf = generateMusicBuffer(type);
      if (!buf) return;

      musicSource = c.createBufferSource();
      musicSource.buffer = buf;
      musicSource.loop = true;
      musicSource.connect(musicGain);
      musicSource.start();
    } catch(e) {}
  }

  function stopMusic() {
    try {
      if (musicSource) {
        musicSource.stop();
        musicSource = null;
      }
    } catch(e) {}
  }

  // -- SFX --

  function playTireScreech() {
    playNoise({ duration: 0.3, vol: 0.25, highpass: 1200 });
  }

  function playNitroBoost() {
    playTone({ freq: 180, type: 'sawtooth', duration: 0.5, vol: 0.5, attack: 0.05, release: 0.2 });
    playTone({ freq: 360, type: 'square', duration: 0.4, vol: 0.3, attack: 0.02, release: 0.15 });
  }

  function playCollision(severity = 0.5) {
    playNoise({ duration: 0.4, vol: 0.6 * severity, highpass: 100 });
    playTone({ freq: 60, type: 'sawtooth', duration: 0.3, vol: 0.4 * severity, attack: 0.01, release: 0.2 });
  }

  function playMenuClick() {
    playTone({ freq: 880, type: 'sine', duration: 0.1, vol: 0.3, attack: 0.01, release: 0.08 });
  }

  function playCoinPickup() {
    playTone({ freq: 1320, type: 'sine', duration: 0.15, vol: 0.4, attack: 0.01, release: 0.1 });
    setTimeout(() => playTone({ freq: 1760, type: 'sine', duration: 0.1, vol: 0.3, attack: 0.01, release: 0.08 }), 80);
  }

  function playCountdownBeep(final = false) {
    const freq = final ? 1200 : 660;
    playTone({ freq, type: 'sine', duration: final ? 0.4 : 0.25, vol: 0.6, attack: 0.01, release: 0.15 });
  }

  function playLapComplete() {
    [660, 880, 1100, 1320].forEach((f, i) => {
      setTimeout(() => playTone({ freq: f, type: 'sine', duration: 0.2, vol: 0.5, attack: 0.01, release: 0.1 }), i * 100);
    });
  }

  function playVictory() {
    const melody = [523, 659, 784, 1047, 784, 659, 1047];
    melody.forEach((f, i) => {
      setTimeout(() => playTone({ freq: f, type: 'sine', duration: 0.35, vol: 0.6, attack: 0.02, release: 0.15 }), i * 200);
    });
  }

  function playPowerupPickup() {
    [400, 600, 900, 1200].forEach((f, i) => {
      setTimeout(() => playTone({ freq: f, type: 'triangle', duration: 0.15, vol: 0.5, attack: 0.01, release: 0.1 }), i * 60);
    });
  }

  function resume() {
    try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch(e) {}
  }

  function setMasterVolume(v) {
    settings.masterVolume = v;
    if (masterGain) masterGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.1);
  }

  function setMusicVolume(v) {
    settings.musicVolume = v;
    if (musicGain) musicGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.1);
  }

  function setSFXVolume(v) {
    settings.sfxVolume = v;
    if (sfxGain) sfxGain.gain.setTargetAtTime(v, getCtx().currentTime, 0.1);
  }

  return {
    startEngine, updateEngine, stopEngine,
    playMusic, stopMusic,
    playTireScreech, playNitroBoost, playCollision,
    playMenuClick, playCoinPickup, playCountdownBeep,
    playLapComplete, playVictory, playPowerupPickup,
    setMasterVolume, setMusicVolume, setSFXVolume,
    resume,
  };
})();
