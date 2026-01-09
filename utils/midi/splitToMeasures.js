// src/music/model/splitToMeasures.js

import { quantizeDurationBeat } from "./parseMidi";

function createEmptyMeasure(index, timeSig, maxBeats) {
  return {
    index,
    timeSig,
    timeSigKey: `${timeSig.beats}/${timeSig.beatValue}`,
    maxBeats,
    usedBeats: 0,
    notes: [],
  };
}

function fillRests(measure, beats) {
  if (beats <= 1e-6) return;

  const quant = quantizeDurationBeat(beats);

  measure.notes.push({
    pitch: null,
    durationBeat: beats,
    durationType: quant.vex,
    isRest: true,
    tieFromPrev: false,
    tieToNext: false,
  });

  measure.usedBeats += beats;
}

// src/model/timeSig.js

function getTimeSigAtTick(timeSigs, tick) {
  if (!timeSigs || timeSigs.length === 0) {
    return { beats: 4, beatValue: 4 };
  }

  let current = timeSigs[0];

  for (const ts of timeSigs) {
    if (ts.ticks <= tick) {
      current = ts;
    } else {
      break;
    }
  }
  return {
    beats: current.timeSignature[0],
    beatValue: current.timeSignature[1],
  };
}

function calcMaxBeats(timeSig) {
  return timeSig.beats * (4 / timeSig.beatValue);
}

// export function splitNotesToMeasures(notes, beatsPerMeasure = 4) {
//   const measures = [];

//   let currentMeasure = createEmptyMeasure(0);
//   let currentMeasureStartBeat = 0;

//   for (const note of notes) {
//     let remaining = note.durationBeat;
//     let noteStart = note.startBeat;

//     // 如果 noteStart 跳过了当前小节（中间有空拍）
//     while (
//       noteStart >
//       currentMeasureStartBeat + currentMeasure.usedBeats + 1e-6
//     ) {
//       const gap =
//         noteStart - (currentMeasureStartBeat + currentMeasure.usedBeats);
//       fillRests(currentMeasure, gap);

//       if (currentMeasure.usedBeats >= beatsPerMeasure - 1e-6) {
//         measures.push(currentMeasure);
//         currentMeasure = createEmptyMeasure(currentMeasure.index + 1);
//         currentMeasureStartBeat += beatsPerMeasure;
//       }
//     }

//     // 处理音符（可能跨小节）
//     while (remaining > 1e-6) {
//       const available = beatsPerMeasure - currentMeasure.usedBeats;
//       const slice = Math.min(remaining, available);

//       currentMeasure.notes.push({
//         pitch: note.pitch,
//         durationBeat: slice,
//         durationType: quantizeDurationBeat(slice).vex,
//         isRest: false,
//         tieFromPrev: remaining !== note.durationBeat,
//         tieToNext: remaining > available,
//       });

//       currentMeasure.usedBeats += slice;
//       remaining -= slice;

//       if (currentMeasure.usedBeats >= beatsPerMeasure - 1e-6) {
//         measures.push(currentMeasure);
//         currentMeasure = createEmptyMeasure(currentMeasure.index + 1);
//         currentMeasureStartBeat += beatsPerMeasure;
//       }
//     }
//   }

//   // 最后一个小节补齐
//   if (currentMeasure.usedBeats > 1e-6) {
//     fillRests(currentMeasure, beatsPerMeasure - currentMeasure.usedBeats);
//     measures.push(currentMeasure);
//   }

//   if (Math.abs(currentMeasure.usedBeats - 4) > 1e-6) {
//     console.warn("小节节拍不守恒", index, currentMeasure.usedBeats);
//   }

//   return measures;
// }

export function splitNotesToMeasures(notes, midiHeader) {
  const measures = [];

  let currentMeasure = null;
  let currentMeasureStartBeat = 0;

  for (const note of notes) {
    // ===== 1️⃣ 根据 tick 获取当前拍号 =====
    const timeSig = getTimeSigAtTick(midiHeader.timeSignatures, note.startTick);

    const beatsPerMeasure = timeSig.beats * (4 / timeSig.beatValue);
    const timeSigKey = `${timeSig.beats}/${timeSig.beatValue}`;

    // ===== 2️⃣ 是否需要开启新小节 =====
    if (!currentMeasure || currentMeasure.timeSigKey !== timeSigKey) {
      if (currentMeasure) {
        // 补齐旧小节
        if (currentMeasure.usedBeats < currentMeasure.maxBeats - 1e-6) {
          fillRests(
            currentMeasure,
            currentMeasure.maxBeats - currentMeasure.usedBeats
          );
        }
        measures.push(currentMeasure);
      }

      currentMeasure = createEmptyMeasure(
        measures.length,
        timeSig,
        beatsPerMeasure
      );
      currentMeasureStartBeat = note.startBeat;
    }

    let remaining = note.durationBeat;
    let noteStart = note.startBeat;

    // ===== 3️⃣ 处理中间空拍（休止符） =====
    while (
      noteStart >
      currentMeasureStartBeat + currentMeasure.usedBeats + 1e-6
    ) {
      const gap =
        noteStart - (currentMeasureStartBeat + currentMeasure.usedBeats);

      fillRests(currentMeasure, gap);

      if (currentMeasure.usedBeats >= currentMeasure.maxBeats - 1e-6) {
        measures.push(currentMeasure);
        currentMeasure = createEmptyMeasure(
          measures.length,
          timeSig,
          beatsPerMeasure
        );
        currentMeasureStartBeat += beatsPerMeasure;
      }
    }

    // ===== 4️⃣ 处理音符（可能跨小节） =====
    while (remaining > 1e-6) {
      const available = currentMeasure.maxBeats - currentMeasure.usedBeats;
      const slice = Math.min(remaining, available);

      const quant = quantizeDurationBeat(slice);

      currentMeasure.notes.push({
        pitch: note.pitch,
        durationBeat: slice,
        durationType: quant.vex,
        isRest: false,
        tieFromPrev: remaining !== note.durationBeat,
        tieToNext: remaining > available,
      });

      currentMeasure.usedBeats += slice;
      remaining -= slice;

      if (currentMeasure.usedBeats >= currentMeasure.maxBeats - 1e-6) {
        measures.push(currentMeasure);
        currentMeasure = createEmptyMeasure(
          measures.length,
          timeSig,
          beatsPerMeasure
        );
        currentMeasureStartBeat += beatsPerMeasure;
      }
    }
  }

  // ===== 5️⃣ 收尾：补齐最后一个小节 =====
  if (currentMeasure) {
    if (currentMeasure.usedBeats < currentMeasure.maxBeats - 1e-6) {
      fillRests(
        currentMeasure,
        currentMeasure.maxBeats - currentMeasure.usedBeats
      );
    }
    measures.push(currentMeasure);
  }

  return measures;
}
