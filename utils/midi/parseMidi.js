export function parseMidiToNotes(midi) {
  const ppq = midi.header.ppq || 480;
  const timeSig = midi.header.timeSignatures[0];
  const beatsPerMeasure = timeSig?.timeSignature[0] || 4;

  const track = midi.tracks[0];
  if (!track) return [];

  let result = track.notes.map((note) => {
    const startBeat = note.ticks / ppq;
    const durationBeat = note.durationTicks / ppq;

    return {
      pitch: midiNameToPitch(note.name),
      midi: note.midi,
      startBeat: startBeat + 1, // 拍从 1 开始
      durationBeat,
      measure: Math.floor(startBeat / beatsPerMeasure) + 1,
      velocity: note.velocity,
    };
  });
  return normalizeNoteModel(result);
}

function midiNameToPitch(name) {
  const pitch = name.slice(0, -1).toLowerCase();
  const octave = name.slice(-1);
  return `${pitch}/${octave}`;
}

const DURATIONS = [
  { beat: 4, vex: "w", priority: 1 },
  { beat: 3, vex: "hd", priority: 2 },

  { beat: 2, vex: "h", priority: 1 },
  { beat: 1.5, vex: "qd", priority: 2 },

  { beat: 1, vex: "q", priority: 1 },
  { beat: 0.75, vex: "8d", priority: 2 },

  { beat: 0.5, vex: "8", priority: 1 },
  { beat: 1 / 3, vex: "8t", priority: 3 },

  { beat: 0.25, vex: "16", priority: 1 },
  { beat: 1 / 6, vex: "16t", priority: 3 },

  { beat: 0.125, vex: "32", priority: 1 },
];

export function quantizeDurationBeat(rawBeat, tolerance = 0.03) {
  let best = null;
  let minError = Infinity;

  for (const d of DURATIONS) {
    const error = Math.abs(rawBeat - d.beat);
    if (error / d.beat <= tolerance) {
      if (
        error < minError ||
        (Math.abs(error - minError) < 1e-6 &&
          d.priority < (best?.priority ?? Infinity))
      ) {
        minError = error;
        best = d;
      }
    }
  }

  if (!best) {
    console.warn("无法精确量化的 durationBeat:", rawBeat);
    best = DURATIONS.reduce((a, b) =>
      Math.abs(a.beat - rawBeat) < Math.abs(b.beat - rawBeat) ? a : b
    );
  }

  return best;
}

export function normalizeNoteModel(noteModels) {
  return noteModels.map((note) => {
    const q = quantizeDurationBeat(note.durationBeat);

    return {
      ...note,
      durationBeatRaw: note.durationBeat,
      durationBeat: q.beat,
      durationType: q.vex, // 先叫这个名字，后面会用
    };
  });
}
