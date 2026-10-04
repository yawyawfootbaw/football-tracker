// ?loud: nonstop randomly generated loud noises, one right after another (a prank mode).
// Browsers won't play audio until the visitor interacts with the page, so the noises start after the first
// click, tap or key press.

const WAVES = ["sine", "square", "sawtooth", "triangle"];
const random = (min, max) => min + Math.random() * (max - min);

let audio;

/** Plays one random noise and returns its length in seconds. */
function playNoise() {
  const now = audio.currentTime;
  const duration = random(0.3, 1.5);
  const volume = audio.createGain();
  // Loud but capped below full scale, with a quick attack and fade so it doesn't click.
  volume.gain.setValueAtTime(0, now);
  volume.gain.linearRampToValueAtTime(0.7, now + 0.01);
  volume.gain.exponentialRampToValueAtTime(0.001, now + duration);
  volume.connect(audio.destination);

  // One to three oscillators, each with a random wave and a pitch that swoops up or down.
  const voices = Math.ceil(random(0, 3));
  for (let i = 0; i < voices; i++) {
    const osc = audio.createOscillator();
    osc.type = WAVES[Math.floor(random(0, WAVES.length))];
    osc.frequency.setValueAtTime(random(80, 1200), now);
    osc.frequency.exponentialRampToValueAtTime(random(60, 2000), now + duration);
    osc.connect(volume);
    osc.start(now);
    osc.stop(now + duration);
  }
  return duration;
}

// Start the next noise as soon as the current one ends. Until the page is clicked, check back every quarter second.
function playForever() {
  const seconds = audio.state === "running" ? playNoise() : 0.25;
  setTimeout(playForever, seconds * 1000);
}

export function startLoudMode() {
  audio = new AudioContext();
  const unlock = () => audio.resume();
  for (const type of ["pointerdown", "keydown"]) document.addEventListener(type, unlock, { once: true });
  playForever();
}
