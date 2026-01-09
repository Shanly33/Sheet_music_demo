// 纯数据结构说明
function createVFNote({
  keys,
  duration,
  dots = 0,
  isRest = false,
  stemDirection = null,
  sourceIndex = null,
}) {
  return {
    keys,
    duration,
    dots,
    isRest,
    stemDirection,
    sourceIndex,
  };
}
function createVFMeasure({ index, voice, ties }) {
  return {
    index,
    voice,
    ties,
  };
}

function pitchToVFKey(pitch) {
  // 已经是 vexflow key
  if (typeof pitch === "string") {
    return pitch; // e/4
  }

  if (typeof pitch !== "number") return null;

  const NOTE_NAMES = [
    "c",
    "c#",
    "d",
    "d#",
    "e",
    "f",
    "f#",
    "g",
    "g#",
    "a",
    "a#",
    "b",
  ];
  const note = NOTE_NAMES[pitch % 12];
  const octave = Math.floor(pitch / 12) - 1;

  return `${note}/${octave}`;
}

function countDotsFromDuration(duration) {
  if (duration.endsWith("dd")) return 2;
  if (duration.endsWith("d")) return 1;
  return 0;
}

function mapNoteModelToVF(note, noteIndex) {
  const isRest = note.isRest === true;
  const key = isRest ? "b/4" : pitchToVFKey(note.pitch);
  if (!isRest && !key) {
    console.error("❌ pitchToVFKey 返回 undefined", {
      note,
      pitch: note.pitch,
      noteIndex,
    });
  }

  return createVFNote({
    keys: [key],
    duration: isRest ? note.durationType + "r" : note.durationType,
    dots: countDotsFromDuration(note.durationType),
    isRest,
    stemDirection: null,
    sourceIndex: noteIndex,
  });
}

function collectTies(notes) {
  const ties = [];

  notes.forEach((note, i) => {
    if (note.tieToNext) {
      ties.push({
        from: { noteIndex: i, keyIndex: 0 },
        to: { noteIndex: i + 1, keyIndex: 0 },
      });
    }
  });

  return ties;
}
function mapMeasureToVF(measure) {
  return {
    index: measure.index,
    voice: {
      timeSig: `${measure.timeSig.beats}/${measure.timeSig.beatValue}`,
      strict: true,
      notes: measure.notes.map(mapNoteModelToVF),
    },
    ties: collectTies(measure.notes),
  };
}

export function buildVFScore(scoreModel) {
  const {
    measures,
    timeSig = { beats: 4, beatValue: 4 },
    keySig = "C",
  } = scoreModel;

  return {
    timeSig,
    keySig,
    measures: measures.map(mapMeasureToVF),
  };
}
