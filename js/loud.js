// ?loud: nonstop loud cartoon sound effects, one right after another (a prank mode).
// Browsers won't play audio until the visitor interacts with the page, so a full-screen play button covers
// everything until it's pressed. Once it is, the button goes away and there's no way to pause or stop.

const random = (min, max) => min + Math.random() * (max - min);
const pick = (list) => list[Math.floor(Math.random() * list.length)];

let audio, out;

// One oscillator from `start` to `start + duration`, gliding from f1 to f2, with its own volume envelope.
function voice({ type = "sine", f1, f2 = f1, start, duration, peak = 1, into = out }) {
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f1, start);
  osc.frequency.exponentialRampToValueAtTime(f2, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.015);
  gain.gain.setValueAtTime(peak, start + duration * 0.8);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(into);
  osc.start(start);
  osc.stop(start + duration);
  return osc;
}

// Wobble a frequency (vibrato) by `depth` Hz at `rate` times per second.
function wobble(param, rate, depth, start, duration) {
  const lfo = audio.createOscillator();
  const amount = audio.createGain();
  lfo.frequency.value = rate;
  amount.gain.value = depth;
  lfo.connect(amount).connect(param);
  lfo.start(start);
  lfo.stop(start + duration);
}

function filter(type, frequency, q = 1) {
  const f = audio.createBiquadFilter();
  f.type = type;
  f.frequency.value = frequency;
  f.Q.value = q;
  f.connect(out);
  return f;
}

// Each effect schedules itself at time t and returns how long it lasts, in seconds.
const EFFECTS = {
  slideWhistle(t) {
    const up = random(0.3, 0.6), down = random(0.3, 0.6), low = random(300, 500), high = random(1300, 2000);
    wobble(voice({ f1: low, f2: high, start: t, duration: up }).frequency, 6, 20, t, up);
    wobble(voice({ f1: high, f2: low, start: t + up, duration: down }).frequency, 6, 20, t + up, down);
    return up + down;
  },
  boing(t) {
    const d = random(0.5, 0.9);
    wobble(voice({ f1: random(250, 400), f2: 70, start: t, duration: d }).frequency, 16, 45, t, d);
    return d;
  },
  quack(t) {
    const quacks = 1 + Math.floor(random(0, 3));
    const nasal = filter("bandpass", 1300, 5);
    for (let i = 0; i < quacks; i++) {
      voice({ type: "sawtooth", f1: random(550, 700), f2: 330, start: t + i * 0.22, duration: 0.16, into: nasal });
    }
    return quacks * 0.22;
  },
  sadTrombone(t) {
    const base = random(330, 420);  // starts on a random note, then three half-steps down
    const muffled = filter("lowpass", 1400);
    const notes = [0, -1, -2, -3].map((step) => base * 2 ** (step / 12));
    notes.forEach((f, i) => {
      const last = i === notes.length - 1, d = last ? 1.1 : 0.38;
      const osc = voice({ type: "sawtooth", f1: f, f2: last ? f * 0.97 : f, start: t + i * 0.42, duration: d, into: muffled });
      if (last) wobble(osc.frequency, 5, 8, t + i * 0.42, d);
    });
    return 0.42 * 3 + 1.1;
  },
  airHorn(t) {
    const blasts = 1 + Math.floor(random(0, 3)), root = random(380, 460);
    for (let i = 0; i < blasts; i++) {
      for (const ratio of [1, 1.26, 1.5]) {  // a major chord, like a stadium horn
        voice({ type: "sawtooth", f1: root * ratio, start: t + i * 0.55, duration: 0.45, peak: 0.4 });
      }
    }
    return blasts * 0.55;
  },
  fart(t) {
    const d = random(0.5, 1.3);
    const rumble = filter("lowpass", random(250, 450));
    const osc = voice({ type: "sawtooth", f1: random(80, 120), f2: random(45, 70), start: t, duration: d, into: rumble });
    wobble(osc.frequency, random(18, 32), 25, t, d);  // the flutter
    return d;
  },
  bonk(t) {
    voice({ f1: random(700, 1000), f2: 60, start: t, duration: 0.18 });
    voice({ type: "triangle", f1: 180, f2: 120, start: t, duration: 0.3, peak: 0.5 });
    return 0.35;
  },
};

// Play a random effect, then the next as soon as it ends.
function playForever() {
  const seconds = pick(Object.values(EFFECTS))(audio.currentTime + 0.02);
  setTimeout(playForever, seconds * 1000);
}

export function startLoudMode() {
  const gate = document.createElement("div");
  gate.id = "loud-gate";
  gate.innerHTML = `<button id="loud-play" aria-label="Play">
    <svg width="48" height="56" viewBox="0 0 48 56" aria-hidden="true"><path d="M0 0 48 28 0 56Z" fill="currentColor"/></svg></button>`;
  document.body.append(gate);
  gate.querySelector("button").focus();
  gate.querySelector("button").addEventListener("click", async () => {
    gate.remove();
    audio = new AudioContext();
    // Everything goes through a limiter and a master volume, so stacked effects stay loud but capped.
    const limiter = audio.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.ratio.value = 20;
    const master = audio.createGain();
    master.gain.value = 0.7;
    limiter.connect(master).connect(audio.destination);
    out = limiter;
    await audio.resume();
    playForever();
  });
}
