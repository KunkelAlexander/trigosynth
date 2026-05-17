let audioCtx = null;
let masterGain = null;

const activeSources = new Map();

const piano = document.getElementById("piano");
const formulaInput = document.getElementById("formula");
const formulaPreset = document.getElementById("formulaPreset");
const formulaStatus = document.getElementById("formulaStatus");
const waveformCanvas = document.getElementById("waveform");
const waveformCtx = waveformCanvas.getContext("2d");

// Input variable for synth
const decay = 2.5;
// How long does a sample play at most?
const sampleDuration = 10;
// How many seconds to show in the waveform preview
const plotDuration = 3;
// Duration of ring after key is released
const release = 2.5;

const notes = [
  { name: "C4",  midi: 60, type: "white", key: "a" },
  { name: "C#4", midi: 61, type: "black", key: "w" },
  { name: "D4",  midi: 62, type: "white", key: "s" },
  { name: "D#4", midi: 63, type: "black", key: "e" },
  { name: "E4",  midi: 64, type: "white", key: "d" },
  { name: "F4",  midi: 65, type: "white", key: "f" },
  { name: "F#4", midi: 66, type: "black", key: "t" },
  { name: "G4",  midi: 67, type: "white", key: "g" },
  { name: "G#4", midi: 68, type: "black", key: "y" },
  { name: "A4",  midi: 69, type: "white", key: "h" },
  { name: "A#4", midi: 70, type: "black", key: "u" },
  { name: "B4",  midi: 71, type: "white", key: "j" },

  { name: "C5",  midi: 72, type: "white", key: "k" },
  { name: "C#5", midi: 73, type: "black", key: "o" },
  { name: "D5",  midi: 74, type: "white", key: "l" },
  { name: "D#5", midi: 75, type: "black", key: "p" },
  { name: "E5",  midi: 76, type: "white", key: ";" },
  { name: "F5",  midi: 77, type: "white", key: "z" },
  { name: "F#5", midi: 78, type: "black", key: "x" },
  { name: "G5",  midi: 79, type: "white", key: "c" },
  { name: "G#5", midi: 80, type: "black", key: "v" },
  { name: "A5",  midi: 81, type: "white", key: "b" },
  { name: "A#5", midi: 82, type: "black", key: "n" },
  { name: "B5",  midi: 83, type: "white", key: "m" },
  { name: "C6",  midi: 84, type: "white", key: "," }
];

const formulaPresets = {
  piano:
    "(sin(2*pi*f*t) + 0.4*sin(2*pi*2*f*t) + 0.2*sin(2*pi*3*f*t)) * exp(-decay*t)",

  violin:
    "((sin(2*pi*f*t + 0.08*sin(2*pi*5.5*t)) + 0.45*sin(2*pi*2*f*t + 0.06*sin(2*pi*5.1*t)) + 0.30*sin(2*pi*3*f*t + 0.05*sin(2*pi*6.2*t)) + 0.20*sin(2*pi*4*f*t) + 0.14*sin(2*pi*5*f*t) + 0.09*sin(2*pi*6*f*t)) * (1 - exp(-10*t)) * exp(-0.35*t))",

  bell:
    "(sin(2*pi*f*t) + 0.6*sin(2*pi*2.01*f*t) + 0.35*sin(2*pi*3.9*f*t)) * exp(-2.2*t)",

  organ:
    "0.45*sin(2*pi*f*t) + 0.25*sin(2*pi*2*f*t) + 0.15*sin(2*pi*3*f*t)",

  bass:
    "(sin(2*pi*f*t) + 0.3*sin(2*pi*0.5*f*t)) * exp(-1.4*t)",

  pluck:
    "(sin(2*pi*f*t) + 0.25*sin(2*pi*2*f*t)) * exp(-7*t)",

  sine:
    "sin(2*pi*f*t) * exp(-decay*t)",

  "8bit":
    "(4/pi) * (sin(2*pi*f*t) + sin(2*pi*3*f*t)/3 + sin(2*pi*5*f*t)/5 + sin(2*pi*7*f*t)/7 + sin(2*pi*9*f*t)/9 + sin(2*pi*11*f*t)/11) * exp(-decay*t)"
};

const keyToMidi = new Map(notes.map(note => [note.key, note.midi]));

let currentSampleFunction = compileFormula(formulaInput.value);
let formulaPreviewTimer = null;

function initAudio() {
  if (audioCtx) return;

  audioCtx = new AudioContext();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.8;
  masterGain.connect(audioCtx.destination);
}

async function ensureAudio() {
  initAudio();

  if (audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
}

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function compileFormula(input) {
  const expr = input
    .replaceAll("np.", "")
    .replaceAll("numpy.", "")
    .replaceAll("^", "**");

  const fn = new Function('t', 'f', 'freq', 'decay', `"use strict";
const pi = Math.PI, e = Math.E;
const sin = Math.sin, cos = Math.cos, tan = Math.tan, tanh = Math.tanh;
const asin = Math.asin, acos = Math.acos, atan = Math.atan, atan2 = Math.atan2;
const exp = Math.exp, log = Math.log, log2 = Math.log2, log10 = Math.log10;
const sqrt = Math.sqrt, cbrt = Math.cbrt, pow = Math.pow;
const abs = Math.abs, sign = Math.sign, floor = Math.floor, ceil = Math.ceil, round = Math.round;
const min = Math.min, max = Math.max;
return ${expr};`);

  fn(0, 440, 440, 2.8);
  return fn;
}

function createCustomSample(freq, duration = sampleDuration) {
  if (!audioCtx) {
    initAudio();
  }

  const sampleRate = audioCtx.sampleRate;
  const length = Math.floor(sampleRate * duration);
  const buffer = audioCtx.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < length; i++) {
    const t = i / sampleRate;

    let value = currentSampleFunction(t, freq, freq, decay);

    if (!Number.isFinite(value)) {
      value = 0;
    }

    data[i] = Math.tanh(value) * 0.8;
  }

  return buffer;
}

async function playNote(midi) {
  await ensureAudio();

  if (activeSources.has(midi)) return;

  const freq = midiToFreq(midi);
  const buffer = createCustomSample(freq);

  const source = audioCtx.createBufferSource();
  const gain = audioCtx.createGain();

  source.buffer = buffer;

  const now = audioCtx.currentTime;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(1, now + 0.01);

  source.connect(gain);
  gain.connect(masterGain);

  source.start(now);

  activeSources.set(midi, { source, gain });

  source.onended = () => {
    activeSources.delete(midi);
    setKeyActive(midi, false);
  };

  setKeyActive(midi, true);
}

function stopNote(midi) {
  const active = activeSources.get(midi);
  if (!active) return;

  const { source, gain } = active;
  const now = audioCtx.currentTime;

  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + release);

  source.stop(now + release);

  activeSources.delete(midi);
  setKeyActive(midi, false);
}

function setKeyActive(midi, isActive) {
  const el = document.querySelector(`[data-midi="${midi}"]`);
  if (!el) return;

  el.classList.toggle("active", isActive);
}

function buildPianoUI() {
  piano.innerHTML = "";

  const whiteNotes = notes.filter(note => note.type === "white");
  const blackNotes = notes.filter(note => note.type === "black");

  for (const note of whiteNotes) {
    const key = document.createElement("div");
    key.className = "key white";
    key.dataset.midi = note.midi;
    key.textContent = `${note.name} ${note.key.toUpperCase()}`;

    attachKeyEvents(key, note.midi);
    piano.appendChild(key);
  }

  for (const note of blackNotes) {
    const key = document.createElement("div");
    key.className = "key black";
    key.dataset.midi = note.midi;
    key.textContent = note.key.toUpperCase();

    const blackLeft = getBlackKeyLeft(note.midi);
    key.style.left = `${blackLeft}%`;

    attachKeyEvents(key, note.midi);
    piano.appendChild(key);
  }
}

function getBlackKeyLeft(midi) {
  const blackKeyPositionByMidi = {
    61: 1,
    63: 2,
    66: 4,
    68: 5,
    70: 6,

    73: 8,
    75: 9,
    78: 11,
    80: 12,
    82: 13
  };

  const whiteIndexAfter = blackKeyPositionByMidi[midi];
  const whiteKeyWidth = 100 / 15;

  return whiteIndexAfter * whiteKeyWidth - whiteKeyWidth * 0.31;
}

function attachKeyEvents(element, midi) {
  element.addEventListener("pointerdown", event => {
    event.preventDefault();
    element.setPointerCapture(event.pointerId);
    playNote(midi);
  });

  element.addEventListener("pointerup", event => {
    event.preventDefault();
    stopNote(midi);
  });

  element.addEventListener("pointercancel", event => {
    event.preventDefault();
    stopNote(midi);
  });

  element.addEventListener("pointerleave", event => {
    event.preventDefault();
    stopNote(midi);
  });
}

function resizeWaveformCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const rect = waveformCanvas.getBoundingClientRect();

  waveformCanvas.width = rect.width * dpr;
  waveformCanvas.height = rect.height * dpr;

  waveformCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

  previewFormula();
}

function drawWaveform(buffer) {
  const data = buffer.getChannelData(0);
  const rect = waveformCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  const midY = height / 2;

  waveformCtx.clearRect(0, 0, width, height);

  waveformCtx.lineWidth = 2;
  waveformCtx.strokeStyle = "black";

  waveformCtx.beginPath();

  for (let x = 0; x < width; x++) {
    const index = Math.floor((x / width) * data.length);
    const y = midY - data[index] * midY * 0.9;

    if (x === 0) {
      waveformCtx.moveTo(x, y);
    } else {
      waveformCtx.lineTo(x, y);
    }
  }

  waveformCtx.stroke();

  waveformCtx.globalAlpha = 0.2;
  waveformCtx.beginPath();
  waveformCtx.moveTo(0, midY);
  waveformCtx.lineTo(width, midY);
  waveformCtx.stroke();
  waveformCtx.globalAlpha = 1;
}

function setFormulaStatus(message, type) {
  formulaStatus.textContent = message;
  formulaStatus.classList.remove("ok", "error");
  formulaStatus.classList.add(type);
}

function previewFormula() {
  try {
    if (!audioCtx) {
      initAudio();
    }

    const buffer = createCustomSample(20, plotDuration);

    drawWaveform(buffer);
  } catch {
    // Ignore preview errors. The live parser handles visible error messages.
  }
}

function updateFormulaLive() {
  clearTimeout(formulaPreviewTimer);

  formulaPreviewTimer = setTimeout(() => {
    try {
      const compiled = compileFormula(formulaInput.value);

      currentSampleFunction = compiled;
      formulaPreset.value = "custom";

      setFormulaStatus("", "ok");
      previewFormula();
    } catch (error) {
      setFormulaStatus(error.message, "error");
    }
  }, 100);
}

const pressedKeys = new Set();

document.addEventListener("keydown", event => {
  if (document.activeElement === formulaInput) return;

  const key = event.key.toLowerCase();
  const midi = keyToMidi.get(key);

  if (midi === undefined) return;

  event.preventDefault();

  if (pressedKeys.has(key)) return;

  pressedKeys.add(key);
  playNote(midi);
});

document.addEventListener("keyup", event => {
  if (document.activeElement === formulaInput) return;

  const key = event.key.toLowerCase();
  const midi = keyToMidi.get(key);

  if (midi === undefined) return;

  event.preventDefault();
  pressedKeys.delete(key);
  stopNote(midi);
});

formulaInput.addEventListener("input", updateFormulaLive);

formulaPreset.addEventListener("change", () => {
  const preset = formulaPreset.value;

  if (preset === "custom") return;

  formulaInput.value = formulaPresets[preset];

  try {
    currentSampleFunction = compileFormula(formulaInput.value);
    setFormulaStatus("", "ok");
    previewFormula();
  } catch (error) {
    setFormulaStatus(error.message, "error");
  }
});

window.addEventListener("resize", resizeWaveformCanvas);

buildPianoUI();
resizeWaveformCanvas();
setFormulaStatus("", "ok");
previewFormula();