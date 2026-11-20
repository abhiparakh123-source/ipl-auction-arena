// Original synthesized audio (WebAudio) and browser speech synthesis. No third-party recordings are used.
import { session } from "./store";

let ctx: AudioContext | null = null;
let master: GainNode, musicG: GainNode, sfxG: GainNode, crowdG: GainNode, verb: ConvolverNode, verbSend: GainNode, comp: DynamicsCompressorNode;
let musicOn = false, crowdNode: AudioBufferSourceNode | null = null, crowdFilter: BiquadFilterNode | null = null, crowdBed: GainNode | null = null;
let musicTimer: any = null, musicStep = 0, musicHeat = 0;
const listeners = new Set<() => void>();

function impulse(c: AudioContext, secs = 2.6, decay = 2.8) {
  const len = Math.floor(c.sampleRate * secs);
  const b = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay); }
  return b;
}
function init() {
  if (ctx) return ctx;
  const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC() as AudioContext;
  comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 3; comp.connect(ctx.destination);
  master = ctx.createGain(); master.connect(comp);
  verb = ctx.createConvolver(); verb.buffer = impulse(ctx); verbSend = ctx.createGain(); verbSend.gain.value = 0.28; verbSend.connect(verb); verb.connect(master);
  musicG = ctx.createGain(); musicG.connect(master);
  sfxG = ctx.createGain(); sfxG.connect(master); sfxG.connect(verbSend);
  crowdG = ctx.createGain(); crowdG.connect(master); crowdG.connect(verbSend);
  applyVolumes();
  session.subscribe(applyVolumes);
  ctx.onstatechange = () => listeners.forEach((f) => f());
  return ctx;
}
function applyVolumes() {
  if (!ctx) return;
  const s = session.get().settings;
  master.gain.value = s.master;
  musicG.gain.value = s.music * 0.55;
  sfxG.gain.value = s.sfx;
  crowdG.gain.value = s.crowd * 0.6;
}
export function unlockAudio() {
  // iOS 17+: treat game audio as media playback so the ring/silent switch doesn't mute it.
  try { const as = (navigator as any).audioSession; if (as && as.type !== "playback") as.type = "playback"; } catch {}
  const c = init(); if (c && c.state === "suspended") c.resume().catch(() => {});
  if (c) loadClips();
  // iOS needs one utterance inside a gesture before speech works later.
  if ("speechSynthesis" in window && !primed) { primed = true; try { const u = new SpeechSynthesisUtterance(" "); u.volume = 0; speechSynthesis.speak(u); } catch {} }
}
export function audioState(): "running" | "suspended" | "unsupported" { if (!ctx) return (window as any).AudioContext || (window as any).webkitAudioContext ? "suspended" : "unsupported"; return ctx.state === "running" ? "running" : "suspended"; }
export function onAudioState(f: () => void) { listeners.add(f); return () => { listeners.delete(f); }; }

function env(g: GainNode, t: number, peak: number, a: number, d: number) {
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.2, when = 0, dest?: AudioNode, slide?: number, attack = 0.008) {
  const c = init(); if (!c) return;
  const t = c.currentTime + when;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
  env(g, t, gain, attack, dur);
  o.connect(g); g.connect(dest || sfxG); o.start(t); o.stop(t + attack + dur + 0.05);
}
/** FM bell: bright, metallic chime. */
function bell(freq: number, dur: number, gain = 0.12, when = 0, ratio = 3.5, index = 2.2) {
  const c = init(); if (!c) return;
  const t = c.currentTime + when;
  const car = c.createOscillator(), mod = c.createOscillator(), mg = c.createGain(), g = c.createGain();
  car.frequency.value = freq; mod.frequency.value = freq * ratio;
  mg.gain.setValueAtTime(freq * index, t); mg.gain.exponentialRampToValueAtTime(1, t + dur);
  mod.connect(mg); mg.connect(car.frequency);
  env(g, t, gain, 0.004, dur);
  car.connect(g); g.connect(sfxG);
  car.start(t); mod.start(t); car.stop(t + dur + 0.1); mod.stop(t + dur + 0.1);
}
let noiseBuf: AudioBuffer | null = null;
function nb(c: AudioContext) { if (!noiseBuf) { noiseBuf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; }
function noise(dur: number, gain = 0.2, freq = 1200, when = 0, dest?: AudioNode, type: BiquadFilterType = "bandpass", q = 0.8, attack = 0.004, sweepTo?: number) {
  const c = init(); if (!c) return;
  const t = c.currentTime + when;
  const s = c.createBufferSource(); s.buffer = nb(c); s.loop = true;
  const f = c.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = c.createGain(); env(g, t, gain, attack, dur);
  s.connect(f); f.connect(g); g.connect(dest || sfxG); s.start(t, Math.random()); s.stop(t + attack + dur + 0.05);
}
/** Wooden gavel strike: resonant body modes + thump + click. */
function knock(when = 0, strength = 1) {
  noise(0.012, 0.9 * strength, 3500, when, undefined, "highpass", 0.7, 0.001);
  [[620, 0.16], [1140, 0.09], [1790, 0.06], [2650, 0.04]].forEach(([f, d]) => noise(d, 0.55 * strength, f, when, undefined, "bandpass", 18, 0.001));
  tone(120, 0.22, "sine", 0.55 * strength, when, undefined, 55, 0.002);
}
/** Applause: hundreds of tiny filtered claps scattered over time. */
function applause(dur = 2.5, density = 90, gain = 0.06) {
  const c = init(); if (!c) return;
  const n = Math.floor(dur * density);
  for (let i = 0; i < n; i++) {
    const t = Math.pow(Math.random(), 0.8) * dur;
    const fade = 1 - t / dur;
    noise(0.018 + Math.random() * 0.02, gain * (0.4 + Math.random() * 0.8) * fade, 1100 + Math.random() * 2400, t, crowdG, "bandpass", 1.4, 0.001);
  }
}
/** Crowd roar: swelling band-limited noise with vowel-like formants. */
function roar(dur = 2.4, gain = 0.25, when = 0) {
  [[420, 4], [900, 3], [1700, 2.5], [2600, 3]].forEach(([f, q], i) => noise(dur, gain * (i === 1 ? 1 : 0.6), f, when, crowdG, "bandpass", q, 0.35));
}
function aww(gain = 0.18) {
  noise(1.3, gain, 900, 0, crowdG, "bandpass", 5, 0.2, 380);
  noise(1.3, gain * 0.6, 1600, 0.05, crowdG, "bandpass", 6, 0.2, 700);
}

export const sfx = {
  click: () => { tone(1200, 0.035, "triangle", 0.05); tone(2400, 0.02, "sine", 0.02); },
  hover: () => tone(1800, 0.02, "sine", 0.015),
  /** Paddle raise: soft clack + rising chime; brighter for your own bid. */
  bid: (mine = false) => {
    noise(0.03, 0.25, 2200, 0, undefined, "bandpass", 3, 0.001);
    if (mine) { bell(988, 0.5, 0.11); bell(1480, 0.6, 0.07, 0.07); }
    else bell(740, 0.35, 0.06);
  },
  /** Clock tick with a heartbeat underneath in the final seconds. */
  tick: () => { noise(0.015, 0.25, 5200, 0, undefined, "bandpass", 8, 0.001); tone(58, 0.16, "sine", 0.45, 0, undefined, 40, 0.004); tone(54, 0.14, "sine", 0.3, 0.17, undefined, 38, 0.004); },
  /** Lot reveal: cinematic whoosh, sub boom and shimmer. */
  reveal: () => {
    noise(0.9, 0.22, 180, 0, undefined, "lowpass", 1.2, 0.5, 6500);
    tone(48, 1.1, "sine", 0.5, 0.55, undefined, 32, 0.01);
    [1318, 1760, 2637].forEach((f, i) => bell(f, 1.1, 0.03, 0.6 + i * 0.05, 2.01, 1.2));
  },
  gavel: () => knock(0, 1),
  /** Gavel triple-strike, brass hit, crowd roar and applause. */
  sold: () => {
    knock(0, 0.7); knock(0.16, 0.8); knock(0.36, 1.15);
    const brass = (f: number, w: number) => { tone(f, 0.9, "sawtooth", 0.05, w, undefined, undefined, 0.04); tone(f * 1.005, 0.9, "sawtooth", 0.04, w, undefined, undefined, 0.04); };
    [[392, 0.42], [494, 0.42], [587, 0.42], [784, 0.62]].forEach(([f, w]) => brass(f, w));
    roar(2.6, 0.22, 0.38); applause(3.2, 110, 0.05);
  },
  unsold: () => { tone(220, 0.6, "triangle", 0.09, 0, undefined, 110); tone(165, 0.7, "triangle", 0.07, 0.15, undefined, 82); aww(0.16); },
  error: () => { tone(220, 0.12, "square", 0.05); tone(180, 0.18, "square", 0.05, 0.1); },
  trophy: () => { [392, 523, 659, 784, 1046, 1318].forEach((f, i) => bell(f, 1.2, 0.08, i * 0.12, 2, 1.5)); roar(3.5, 0.25, 0.3); applause(4, 120, 0.06); },
  wicket: () => { knock(0, 0.6); noise(0.3, 0.3, 900, 0.02, undefined, "bandpass", 2); roar(1.4, 0.18, 0.1); },
  boundary: () => { tone(80, 0.25, "sine", 0.4, 0, undefined, 50); roar(1.8, 0.2, 0.05); applause(1.6, 80, 0.04); },
  six: () => { tone(70, 0.3, "sine", 0.5, 0, undefined, 40); bell(1046, 0.6, 0.06, 0.05); roar(2.4, 0.28, 0.05); applause(2.4, 110, 0.05); },
};

export function cheer(intensity = 1) { roar(0.8 + intensity * 0.8, 0.12 * intensity); if (intensity > 1) applause(intensity, 70, 0.04); }

export function crowdAmbience(on: boolean) {
  const c = init(); if (!c) return;
  if (on && !crowdNode) {
    const b = c.createBuffer(2, c.sampleRate * 6, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let last = 0; for (let i = 0; i < d.length; i++) { last = last * 0.985 + (Math.random() * 2 - 1) * 0.015; d[i] = last * 6 * (0.8 + 0.2 * Math.sin(i / 9000 + ch)); } }
    crowdNode = c.createBufferSource(); crowdNode.buffer = b; crowdNode.loop = true;
    crowdFilter = c.createBiquadFilter(); crowdFilter.type = "bandpass"; crowdFilter.frequency.value = 700; crowdFilter.Q.value = 0.6;
    crowdBed = c.createGain(); crowdBed.gain.value = 0.22;
    crowdNode.connect(crowdFilter); crowdFilter.connect(crowdBed); crowdBed.connect(crowdG); crowdNode.start();
  } else if (!on && crowdNode) { try { crowdNode.stop(); } catch {} crowdNode = null; }
}
export function crowdIntensity(x: number) {
  musicHeat = x;
  if (crowdFilter && ctx && crowdBed) { crowdFilter.frequency.setTargetAtTime(500 + x * 1600, ctx.currentTime, 0.4); crowdBed.gain.setTargetAtTime(0.16 + x * 0.4, ctx.currentTime, 0.4); }
}

/** Original generative auction score: pad, bass pulse and a beat that tightens as bidding heats up. */
export function music(on: boolean) {
  const c = init(); if (!c) return;
  if (on === musicOn) return;
  musicOn = on;
  clearInterval(musicTimer);
  if (!on) return;
  const prog = [[110, 164.8, 220, 261.6], [98, 146.8, 196, 246.9], [87.3, 130.8, 174.6, 220], [98, 146.8, 196, 233.1]];
  const stepDur = 0.25; // 16ths at 60 bpm-ish feel; doubled feel when hot
  musicStep = 0;
  const tickFn = () => {
    const s = musicStep++;
    const bar = Math.floor(s / 16) % prog.length, ch = prog[bar], i = s % 16;
    if (i === 0) ch.forEach((f, k) => { tone(f * 2, 4.2, "sine", 0.028, 0, musicG, undefined, 0.6); if (k > 1) tone(f * 4, 3.6, "triangle", 0.006, 0.1, musicG, undefined, 0.8); });
    if (i % 4 === 0) tone(55, 0.22, "sine", 0.22, 0, musicG, 38, 0.004); // kick
    if (musicHeat > 0.35 && i % 4 === 2) tone(55, 0.16, "sine", 0.12, 0, musicG, 40, 0.004);
    if (i % 2 === 1) noise(0.03, 0.02 + musicHeat * 0.03, 8000, 0, musicG, "highpass", 0.7, 0.001); // hat
    if (i === 4 || i === 12) noise(0.12, 0.05, 1800, 0, musicG, "bandpass", 1, 0.002); // snare-ish
    if (i % 4 === 0) tone(ch[0], 0.2, "triangle", 0.05, 0, musicG); // bass pulse
  };
  tickFn();
  musicTimer = setInterval(tickFn, stepDur * 1000);
}

/* ---------------- Voice: recorded auctioneer + commentator clips (primary) ---------------- */
// Clips are generated speech recordings bundled with the app (client/public/voice). They play through WebAudio,
// so they work wherever sound effects work, including in-app browsers without speechSynthesis.
const TEAM_IDS = ["CSK", "MI", "RCB", "KKR", "SRH", "RR", "DC", "PBKS", "GT", "LSG"];
export const VOICE_KEYS = [
  "a_next", "a_next2", "a_start", "a_once", "a_twice", "a_sold", "a_unsold", "a_sealed", "a_more", "a_fair", "a_new",
  ...TEAM_IDS.map((t) => "a_soldto_" + t), ...TEAM_IDS.map((t) => "a_bid_" + t),
  "c_open", "c_war", "c_jump", "c_ten", "c_crowd", "c_value", "c_premium", "c_noone", "c_four", "c_six", "c_wicket", "c_innings", "c_win",
];
const vbuf = new Map<string, AudioBuffer>();
let vLoad: Promise<void> | null = null;
let voiceG: GainNode | null = null;
let curVoice: { src: AudioBufferSourceNode; prio: number; end: number } | null = null;
function loadClips() {
  const c = init(); if (!c) return Promise.resolve();
  if (vLoad) return vLoad;
  vLoad = Promise.all(VOICE_KEYS.map(async (k) => {
    try { const r = await fetch(`./voice/${k}.mp3`); if (!r.ok) return; const ab = await r.arrayBuffer(); vbuf.set(k, await c.decodeAudioData(ab)); } catch {}
  })).then(() => {});
  return vLoad;
}
export function clipsReady() { return vbuf.size; }
function duck(secs: number) {
  if (!ctx) return; const t = ctx.currentTime, s = session.get().settings;
  for (const [g, v] of [[musicG, s.music * 0.55], [crowdG, s.crowd * 0.6]] as [GainNode, number][]) {
    g.gain.cancelScheduledValues(t); g.gain.setTargetAtTime(v * 0.35, t, 0.05); g.gain.setTargetAtTime(v, t + secs, 0.3);
  }
}
/** Play a recorded voice line. Returns its duration in ms (0 if it was not played). Higher priority interrupts lower. */
export function say(key: string, prio = 1): number {
  const s = session.get().settings as any;
  if (!s.voice || s.master <= 0) return 0;
  const c = init(); if (!c) return 0;
  if (c.state !== "running") { c.resume().catch(() => {}); }
  const b = vbuf.get(key); if (!b) { loadClips(); return 0; }
  const now = c.currentTime;
  if (curVoice && curVoice.end > now + 0.05) { if (prio <= curVoice.prio) return 0; try { curVoice.src.stop(); } catch {} }
  if (prio >= 2) stopSpeech();
  if (!voiceG) { voiceG = c.createGain(); voiceG.connect(master); const send = c.createGain(); send.gain.value = 0.12; voiceG.connect(send); send.connect(verb); }
  voiceG.gain.value = Math.min(1.4, (s.voiceVol ?? 0.9) * 1.25);
  const src = c.createBufferSource(); src.buffer = b; src.connect(voiceG); src.start();
  curVoice = { src, prio, end: now + b.duration };
  duck(b.duration);
  return b.duration * 1000;
}
export function voiceBusy() { return !!(ctx && curVoice && curVoice.end > ctx.currentTime) || ttsBusyUntil > Date.now(); }
/** Play a clip, then run `then` when it finishes (used to follow a recorded call with a spoken player name). */
export function sayThen(key: string, prio: number, then: () => void) { const d = say(key, prio); setTimeout(then, d ? d + 60 : 0); return d; }

/* ---------------- Speech synthesis (optional extra for player names and prices) ---------------- */
let primed = false;
let voices: SpeechSynthesisVoice[] = [];
let ttsBusyUntil = 0, ttsPrio = 0;
function loadVoices() { try { voices = speechSynthesis.getVoices(); } catch {} }
if (typeof window !== "undefined" && "speechSynthesis" in window) { loadVoices(); try { speechSynthesis.addEventListener("voiceschanged", loadVoices); } catch {} }
function pickVoice(kind: "auctioneer" | "commentator") {
  if (!voices.length) loadVoices();
  const en = voices.filter((v) => /^en/i.test(v.lang));
  const prefs = kind === "auctioneer" ? [/en-GB/i, /en-IN/i, /en-AU/i] : [/en-IN/i, /en-US/i, /en-GB/i];
  for (const p of prefs) { const v = en.find((x) => p.test(x.lang)); if (v) return v; }
  return en[0] || voices[0] || null;
}
export function speechSupported() { return typeof window !== "undefined" && "speechSynthesis" in window; }
export function ttsAvailable() { if (!speechSupported()) return false; if (!voices.length) loadVoices(); return voices.length > 0; }
/** Speak dynamic text with the device voice. Never blocks recorded clips; silently does nothing where unsupported. */
export function speak(text: string, kind: "auctioneer" | "commentator" = "commentator", priority = 1) {
  const s = session.get().settings as any;
  if (!ttsAvailable() || !s.voice || s.master <= 0) return false;
  if (ctx && curVoice && curVoice.end > ctx.currentTime + 0.05) return false;
  if (ttsBusyUntil > Date.now() && priority <= ttsPrio) return false;
  try {
    speechSynthesis.cancel(); speechSynthesis.resume();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(kind); if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = kind === "auctioneer" ? 1.1 : 1.04; u.pitch = kind === "auctioneer" ? 0.9 : 1.05;
    u.volume = Math.min(1, s.master * (s.voiceVol ?? 0.9) + 0.2);
    ttsBusyUntil = Date.now() + 700 + text.length * 75; ttsPrio = priority;
    u.onend = u.onerror = () => { ttsBusyUntil = 0; ttsPrio = 0; };
    setTimeout(() => { try { speechSynthesis.speak(u); } catch {} }, 50);
    duck((700 + text.length * 75) / 1000);
    return true;
  } catch { return false; }
}
export function stopSpeech() { try { if (speechSupported()) speechSynthesis.cancel(); } catch {} ttsBusyUntil = 0; }

/** User-initiated voice check: unlocks audio, waits for clips, plays a sample call. Returns a short status string. */
export async function testVoice(): Promise<string> {
  unlockAudio();
  const c = init(); if (!c) return "This browser has no Web Audio support.";
  try { await c.resume(); } catch {}
  await loadClips();
  if (!(session.get().settings as any).voice) return "Voice is switched off in settings.";
  const d = say(Math.random() < 0.5 ? "a_soldto_MI" : "a_soldto_CSK", 9);
  if (!d) return vbuf.size ? "Audio is blocked. Check your phone isn't on silent and the volume is up." : "Voice clips failed to load. Check your connection.";
  setTimeout(() => speak("Device voice check.", "commentator", 1), d + 200);
  return ttsAvailable() ? "Playing voice clip, then the device voice for player names." : "Playing voice clip. This browser has no device voice, so player names appear as captions only.";
}
