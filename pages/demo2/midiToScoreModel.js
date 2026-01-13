//===========================================
//工具函数
function stableJoin(arr, sep = "+") {
  return (arr || []).slice().sort().join(sep);
}

// 简单短 hash（可选）：避免 id 太长
function hashStr(s) {
  s = String(s || "");
  let h = 2166136261; // FNV-like
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  // 转成无符号 32bit
  return (h >>> 0).toString(36);
}

function makeMeasureId(partId, measureIndex, startTick) {
  return `${partId}:m${measureIndex}:t${startTick}`;
}

function makeEventId({
  measureId,
  staff,
  type,
  startTick,
  durationTicks,
  keys,
}) {
  const k = type === "rest" ? "rest" : stableJoin(keys);
  // 你可以直接拼 k（更直观但更长）；也可以 hash（更短）
  const kHash = hashStr(k);
  return `${measureId}:${staff}:${type}:s${startTick}:d${durationTicks}:k${kHash}`;
}

function makeTieId(fromEventId, toEventId) {
  return `tie:${hashStr(fromEventId + "->" + toEventId)}`;
}

function findMeasureIndexByTick(measures, tick) {
  let lo = 0,
    hi = measures.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const m = measures[mid];
    if (tick < m.ticks.start) hi = mid - 1;
    else if (tick >= m.ticks.end) lo = mid + 1;
    else return mid;
  }
  // tick 超出范围：落在最后一个小节
  return Math.max(0, measures.length - 1);
}

//把一段 ticks 拆成多个“标准时值片段”
function splitTicksToStandardDurations(ppq, totalTicks) {
  // 返回一组片段 [{ticks, vf:{duration,dots,approx}} ...]
  // 目标：总和=totalTicks，且每段尽量是标准值（approx=false）
  let remaining = totalTicks;
  const pieces = [];

  // 允许的“标准时值（含附点）”按从大到小排列
  // ticks = whole * value
  const whole = ppq * 4;

  const candidates = [
    // 非附点
    { dur: "w", dots: 0, ratio: 1 },
    { dur: "h", dots: 0, ratio: 1 / 2 },
    { dur: "q", dots: 0, ratio: 1 / 4 },
    { dur: "8", dots: 0, ratio: 1 / 8 },
    { dur: "16", dots: 0, ratio: 1 / 16 },
    { dur: "32", dots: 0, ratio: 1 / 32 },
    { dur: "64", dots: 0, ratio: 1 / 64 },

    // 附点（*1.5）
    { dur: "h", dots: 1, ratio: (1 / 2) * 1.5 },
    { dur: "q", dots: 1, ratio: (1 / 4) * 1.5 },
    { dur: "8", dots: 1, ratio: (1 / 8) * 1.5 },
    { dur: "16", dots: 1, ratio: (1 / 16) * 1.5 },
    { dur: "32", dots: 1, ratio: (1 / 32) * 1.5 },
  ];

  // 计算每个候选的 ticks，并按 ticks 从大到小排序
  const candTicks = candidates
    .map((c) => ({ ...c, ticks: Math.round(whole * c.ratio) }))
    .filter((c) => c.ticks > 0)
    .sort((a, b) => b.ticks - a.ticks);

  // 贪心拆分：每次取不超过 remaining 的最大标准片段
  while (remaining > 0) {
    let picked = null;
    for (const c of candTicks) {
      if (c.ticks <= remaining) {
        picked = c;
        break;
      }
    }

    // 如果连最小都放不下（理论上不会发生，除非 remaining 很小且不是可表示 ticks）
    if (!picked) {
      // 兜底：用 ticksToVfDuration 近似一个
      const vf = ticksToVfDuration(ppq, remaining);
      pieces.push({ ticks: remaining, vf });
      break;
    }

    pieces.push({
      ticks: picked.ticks,
      vf: { duration: picked.dur, dots: picked.dots, approx: false },
    });
    remaining -= picked.ticks;
  }

  return pieces;
}

//调号映射（每个 keySignature 默认哪些音升/降）

// 升号/降号出现的固定顺序（乐理常识）
const SHARP_ORDER = ["F", "C", "G", "D", "A", "E", "B"];
const FLAT_ORDER = ["B", "E", "A", "D", "G", "C", "F"];

// 每个调的“调号数量”：正数=几个#，负数=几个b
// 覆盖常见 major + minor（可继续补全）
const KEY_SIG_COUNT = {
  // major
  "C:major": 0,
  "G:major": 1,
  "D:major": 2,
  "A:major": 3,
  "E:major": 4,
  "B:major": 5,
  "F#:major": 6,
  "C#:major": 7,
  "F:major": -1,
  "Bb:major": -2,
  "Eb:major": -3,
  "Ab:major": -4,
  "Db:major": -5,
  "Gb:major": -6,
  "Cb:major": -7,

  // minor（自然小调的调号和其“关系大调”一致）
  "A:minor": 0,
  "E:minor": 1,
  "B:minor": 2,
  "F#:minor": 3,
  "C#:minor": 4,
  "G#:minor": 5,
  "D#:minor": 6,
  "A#:minor": 7,
  "D:minor": -1,
  "G:minor": -2,
  "C:minor": -3,
  "F:minor": -4,
  "Bb:minor": -5,
  "Eb:minor": -6,
  "Ab:minor": -7,
};

function getKeySigAccMap(keySignature) {
  const key = keySignature?.key || "C";
  const scale = keySignature?.scale || "major";
  const cnt = KEY_SIG_COUNT[`${key}:${scale}`] ?? 0;

  const map = {}; // {F:"#", B:"b", ...}
  if (cnt > 0) {
    for (let i = 0; i < cnt; i++) map[SHARP_ORDER[i]] = "#";
  } else if (cnt < 0) {
    for (let i = 0; i < -cnt; i++) map[FLAT_ORDER[i]] = "b";
  }
  return map;
}

//根据调号决定“更倾向升还是降”
function preferFlatForKey(keySignature) {
  const key = keySignature?.key || "C";
  // 有 b 的调倾向降号，有 # 倾向升号；F / d / g / c / f / bb / eb / ab 小调也倾向降号
  if (key.includes("b")) return true;
  if (key.includes("#")) return false;
  if (key === "F") return true;
  return false;
}

//把 MIDI 音高转成“字母+八度 + 升降号”
const NOTE_LETTERS_SHARP = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
];
const NOTE_LETTERS_FLAT = [
  "C",
  "Db",
  "D",
  "Eb",
  "E",
  "F",
  "Gb",
  "G",
  "Ab",
  "A",
  "Bb",
  "B",
];

function midiToPitch(midi, preferFlat) {
  const pc = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  const name = (preferFlat ? NOTE_LETTERS_FLAT : NOTE_LETTERS_SHARP)[pc]; // e.g. Bb
  const letter = name[0]; // A-G
  const acc = name.length > 1 ? name.slice(1) : ""; // # or b
  return { letter, acc, octave };
}

//旋律抽取函数（决定乐谱会渲染哪些音符）
function extractMelodyNotes(notes, options = {}) {
  const threshold = options.chordThresholdTicks ?? 0;
  const mode = options.melodyMode ?? "smoothHighest"; // "highest" | "smoothHighest"
  const maxLeap = options.melodyMaxLeap ?? 12; // 半音，12=一个八度
  const forceMonophonic = options.melodyForceMonophonic ?? true;

  // 1) 按 startTick 分组（把同一时刻的音当成“和弦候选”）
  const groups = [];
  for (let i = 0; i < notes.length; ) {
    const n0 = notes[i];
    const t0 = n0.startTick;
    const g = [n0];
    let j = i + 1;
    while (j < notes.length && Math.abs(notes[j].startTick - t0) <= threshold) {
      g.push(notes[j]);
      j++;
    }
    groups.push(g);
    i = j;
  }

  // 2) 每组选择一个“旋律音”
  const picked = [];
  let prevMidi = null;

  for (const g of groups) {
    // 按音高从高到低排序
    const sorted = g.slice().sort((a, b) => (b.midi ?? 0) - (a.midi ?? 0));

    let choose = sorted[0]; // 默认最高音

    if (mode === "smoothHighest" && prevMidi != null && sorted.length > 1) {
      // 如果最高音跳跃太大，尝试选更接近 prev 的音
      const best = sorted.reduce((best, cur) => {
        const jump = Math.abs((cur.midi ?? 0) - prevMidi);
        const bestJump = Math.abs((best.midi ?? 0) - prevMidi);
        // 更接近优先；但也别选得太低（仍然偏向高音）
        if (jump < bestJump) return cur;
        return best;
      }, choose);

      const jumpBest = Math.abs((best.midi ?? 0) - prevMidi);
      const jumpTop = Math.abs((choose.midi ?? 0) - prevMidi);

      // 只有当“最高音跳太大”时才换成更顺滑的
      if (jumpTop > maxLeap && jumpBest <= jumpTop) choose = best;
    }

    picked.push({ ...choose }); // 拷贝一份，避免污染原数组
    prevMidi = choose.midi ?? prevMidi;
  }

  // 3) 强制单声部：处理“前一个音还没结束，下一个音就开始”的重叠
  // 视唱谱通常希望旋律是单线条，所以把前一个音截断到下一个音开始
  if (forceMonophonic) {
    for (let i = 0; i < picked.length - 1; i++) {
      const cur = picked[i];
      const next = picked[i + 1];
      const nextStart = next.startTick;

      const curEnd = cur.startTick + cur.durationTicks;
      if (curEnd > nextStart) {
        const newDur = Math.max(1, nextStart - cur.startTick);
        cur.durationTicks = newDur;
        cur.endTick = cur.startTick + newDur;
      }
    }
  }

  return picked;
}

//==============================================
// ------------------------------
// 1) 基础工具
//把输入变成整数并限制范围，防止 header 里出现奇怪值
// ------------------------------
function clampInt(n, min, max) {
  n = Math.round(Number(n) || 0);
  return Math.max(min, Math.min(max, n));
}

//把 tick 对齐到网格（量化核心）：

function roundToGrid(ticks, grid) {
  if (!grid || grid <= 1) return Math.round(ticks);
  return Math.round(ticks / grid) * grid;
}

// "E4" -> "e/4"
function noteNameToVfKey(name) {
  // 可能出现 "F#4" / "Bb3"
  // 统一：字母小写，升降号保留为 #/b，八度用 / 分隔
  // VexFlow key: "f#/4" "bb/3"
  const m = String(name).match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!m) return null;
  const letter = m[1].toLowerCase();
  const accidental = m[2] || "";
  const octave = m[3];
  return `${letter}${accidental}/${octave}`;
}

// ------------------------------
// 2) 读 header（支持变化，但先用“当前生效值”）
//tempo/拍号/调号可能会变化，这个函数用来找：
//在某个 tick 时刻“正在生效”的那条事件
// ------------------------------
function getActiveEventAtTick(list, tick, fallback) {
  // list: [{ticks:0, ...}, {ticks:1000, ...}]
  if (!Array.isArray(list) || list.length === 0) return fallback;
  let best = fallback;
  for (const item of list) {
    if (typeof item.ticks !== "number") continue;
    if (item.ticks <= tick) best = item;
    else break;
  }
  return best ?? fallback;
}

//把 header 里的：ppq,timeSignatures / keySignatures / tempo统一排序并返回，后面计算用。

function normalizeHeader(midiJson) {
  const header = midiJson?.header || {};
  const ppq = clampInt(header.ppq ?? 480, 1, 100000);

  const timeSignatures = (header.timeSignatures || [])
    .slice()
    .sort((a, b) => (a.ticks ?? 0) - (b.ticks ?? 0));

  const keySignatures = (header.keySignatures || [])
    .slice()
    .sort((a, b) => (a.ticks ?? 0) - (b.ticks ?? 0));

  const tempos = (header.tempos || [])
    .slice()
    .sort((a, b) => (a.ticks ?? 0) - (b.ticks ?? 0));

  return { ppq, timeSignatures, keySignatures, tempos };
}

// ------------------------------
// 3) 计算每小节 ticks（按拍号）
//算“每小节多少 ticks”
// ------------------------------
function ticksPerMeasure(ppq, timeSignature) {
  const [num, den] = timeSignature; // e.g. [6,8]
  // 一个“分母音符”的tick长度 = ppq * 4 / den
  const ticksPerDen = (ppq * 4) / den;
  return Math.round(num * ticksPerDen);
}

//默认量化网格选“分母音符的一半”（6/8 的分母是 8分）:8分=480 → 网格=240（16分网格）
function defaultGridTicks(ppq, timeSignature) {
  const den = timeSignature?.[1] ?? 4;
  const ticksPerDen = (ppq * 4) / den; // 8分=480 (ppq=960)
  // 默认：16分音符网格 = 分母音符的一半
  return Math.max(1, Math.round(ticksPerDen / 2));
}

// ------------------------------
// 4) 预处理 notes：量化、算 endTick
//过滤脏数据：没有 ticks/durationTicks 的不要;量化 startTick 和 durationTicks;生成规范 note 结构
//输出每个 note 长这样,并排序（按 startTick）：
// {
//   midi, name, vfKey,
//   startTick, durationTicks, endTick,
//   velocity,
//   raw: 原始对象
// }
// ------------------------------
function preprocessNotes(trackNotes, ppq, timeSignatures, options) {
  const result = [];
  const defaultTS = timeSignatures?.[0]?.timeSignature ?? [4, 4];

  for (const n of trackNotes || []) {
    if (typeof n?.ticks !== "number" || typeof n?.durationTicks !== "number")
      continue;

    const ts =
      getActiveEventAtTick(timeSignatures, n.ticks, {
        timeSignature: defaultTS,
      })?.timeSignature ?? defaultTS; // 当前生效拍号
    const grid = options?.gridTicks ?? defaultGridTicks(ppq, ts); //量化网格

    const start = roundToGrid(n.ticks, grid); //把 tick 对齐到网格（量化核心）
    const dur = Math.max(grid, roundToGrid(n.durationTicks, grid)); // dur 至少一个格
    const end = start + dur;

    const vfKey = n.name ? noteNameToVfKey(n.name) : null;

    result.push({
      raw: n,
      midi: n.midi,
      name: n.name,
      vfKey,
      velocity: n.velocity,
      startTick: start,
      durationTicks: dur, //一共占了多少格
      endTick: end,
    });
  }

  // 排序
  result.sort((a, b) => a.startTick - b.startTick || a.midi - b.midi);
  return result;
}

// ------------------------------
// 5) 分配到 treble/bass（先用简单规则）
// 最简单规则：
// midi >= 60 → treble;否则 bass
// ------------------------------
function assignStaff(note, options) {
  if (options?.forceSingleStaff === "treble") return "treble";
  if (options?.forceSingleStaff === "bass") return "bass";

  const split = options?.handSplitMidi ?? 60; // C4
  return (note.midi ?? 0) >= split ? "treble" : "bass";
}

// ------------------------------
// 6) durationTicks -> VexFlow duration + dots（基础版）
//把 tick 时值换成 VexFlow 的 "q" "8" "16" ... + 附点
// ------------------------------
function ticksToVfDuration(ppq, durationTicks) {
  // 用“全音符 ticks”做分母：whole = 4 * ppq
  const whole = ppq * 4;
  const ratio = durationTicks / whole;

  // 支持：w h q 8 16 32 64 + 附点（1点）
  const base = [
    { dur: "w", v: 1 },
    { dur: "h", v: 1 / 2 },
    { dur: "q", v: 1 / 4 },
    { dur: "8", v: 1 / 8 },
    { dur: "16", v: 1 / 16 },
    { dur: "32", v: 1 / 32 },
    { dur: "64", v: 1 / 64 },
  ];

  // 允许误差：因为量化/四舍五入
  const EPS = 0.0008;

  // 先匹配非附点
  for (const b of base) {
    if (Math.abs(ratio - b.v) < EPS) return { duration: b.dur, dots: 0 };
  }

  // 再匹配附点（*1.5）
  for (const b of base) {
    if (Math.abs(ratio - b.v * 1.5) < EPS) return { duration: b.dur, dots: 1 };
  }

  // 匹配不到：先返回最接近的（后面你可以用 tie 拆分更精确）
  let best = base[0],
    bestDiff = Infinity,
    bestDots = 0;
  for (const b of base) {
    const d0 = Math.abs(ratio - b.v);
    if (d0 < bestDiff) {
      best = b;
      bestDiff = d0;
      bestDots = 0;
    }
    const d1 = Math.abs(ratio - b.v * 1.5);
    if (d1 < bestDiff) {
      best = b;
      bestDiff = d1;
      bestDots = 1;
    }
  }
  return { duration: best.dur, dots: bestDots, approx: true };
}

// ------------------------------
// 7) 小节切分（把事件分桶到 measure）
// ------------------------------
function buildMeasureGrid(
  ppq,
  timeSignatures,
  keySignatures,
  endOfTrackTicks,
  partId = "track0"
) {
  const defaultTS = timeSignatures?.[0]?.timeSignature ?? [4, 4];
  const defaultKS = keySignatures?.[0] ?? {
    key: "C",
    scale: "major",
    ticks: 0,
  };

  const measures = [];
  const totalTicks = Math.max(0, Math.round(endOfTrackTicks || 0));

  let i = 0;
  let curStart = 0;

  // 防御：避免死循环
  const MAX_MEASURES = 20000;

  while (curStart <= totalTicks && i < MAX_MEASURES) {
    const ts =
      getActiveEventAtTick(timeSignatures, curStart, {
        timeSignature: defaultTS,
      })?.timeSignature ?? defaultTS;

    const ks =
      getActiveEventAtTick(keySignatures, curStart, defaultKS) ?? defaultKS;

    const len = Math.max(1, ticksPerMeasure(ppq, ts)); // 每小节 ticks（随拍号变化）
    const start = curStart;
    const end = start + len;

    const id = makeMeasureId(partId, i, start);

    measures.push({
      id,
      index: i,
      timeSignature: ts,
      keySignature: { key: ks.key, scale: ks.scale },
      ticks: { start, end, length: len },
      voices: {
        treble: { events: [], beams: [], tuplets: [], ties: [] },
        bass: { events: [], beams: [], tuplets: [], ties: [] },
      },
    });

    curStart = end;
    i++;
  }

  // 如果 totalTicks=0，至少保留 1 小节
  if (measures.length === 0) {
    const len = Math.max(1, ticksPerMeasure(ppq, defaultTS));
    const id = makeMeasureId(partId, 0, 0);
    measures.push({
      id,
      index: 0,
      timeSignature: defaultTS,
      keySignature: { key: defaultKS.key, scale: defaultKS.scale },
      ticks: { start: 0, end: len, length: len },
      voices: {
        treble: { events: [], beams: [], tuplets: [], ties: [] },
        bass: { events: [], beams: [], tuplets: [], ties: [] },
      },
    });
  }

  return measures;
}

// ------------------------------
// 8) 小节内：合并和弦 + 补休止
//每个 note 分到哪一小节、哪个谱表;在每个 measure、每个 staff 里生成 events
// ------------------------------
function pushRestEvents(
  ppq,
  voice,
  { partId, measureId, staff },
  startTick,
  durationTicks
) {
  const pieces = splitTicksToStandardDurations(ppq, durationTicks);

  let cursor = startTick;
  for (const p of pieces) {
    const vf = p.vf; // {duration,dots,approx}
    const segDur = p.ticks;
    const endTick = cursor + segDur;

    const event = {
      type: "rest",
      startTick: cursor,
      durationTicks: segDur,
      range: { startTick: cursor, endTick },
      vf: { duration: `${vf.duration}r`, dots: vf.dots, approx: !!vf.approx },
    };

    event.id = makeEventId({
      partId,
      measureId,
      staff,
      type: event.type,
      startTick: cursor,
      durationTicks: segDur,
      keys: [],
    });

    voice.events.push(event);
    cursor = endTick;
  }
}

// ------------------------------
// 跨小节拆分并写入 measures
// ------------------------------

function emitChordEventSplitAcrossMeasures(
  ppq,
  measures,
  startMeasureIndex,
  staff,
  chordNotes,
  startTick,
  durationTicks,
  options
) {
  let remaining = durationTicks;
  let curMeasureIndex = startMeasureIndex;
  let curStartTick = startTick;

  let prevEventId = null;
  let prevMeasureIndex = null;

  // chord keys 只算一次，保证拆分段 keys 一致
  const keys = chordNotes.map((n) => n.vfKey).filter(Boolean);
  const vfKeys = keys.length ? keys : chordNotes.map(() => "c/4");

  while (remaining > 0 && curMeasureIndex < measures.length) {
    const m = measures[curMeasureIndex];
    const mStart = m.ticks.start;
    const mEnd = m.ticks.end;

    // 当前段落起点：第一段从真实 startTick 开始，后面段从小节起点开始
    const segStart = Math.max(curStartTick, mStart);
    const segMax = Math.max(0, mEnd - segStart);
    const segDur = Math.min(remaining, segMax);

    if (segDur <= 0) {
      // 防止死循环：跳到下一小节
      curMeasureIndex += 1;
      curStartTick = measures[curMeasureIndex]?.ticks.start ?? curStartTick;
      continue;
    }

    const voice = m.voices[staff];
    const ctx = { partId: options.partId || "track0", measureId: m.id, staff };

    // 直接在该小节追加 note event（先不补 rest，rest 之后统一补）
    // 这里用一个“仅写 note 的版本”，避免重复计算 keys
    const vfDur = ticksToVfDuration(ppq, segDur);
    const endTick = segStart + segDur;

    const event = {
      type: "note",
      startTick: segStart,
      durationTicks: segDur,
      range: { startTick: segStart, endTick },
      vf: {
        keys: vfKeys,
        duration: vfDur.duration,
        dots: vfDur.dots,
        approx: !!vfDur.approx,
        accidentals: {},
      },
      rawNotes: chordNotes.map((n) => ({ midi: n.midi, name: n.name })),
    };

    event.id = makeEventId({
      partId: ctx.partId,
      measureId: ctx.measureId,
      staff: ctx.staff,
      type: event.type,
      startTick: segStart,
      durationTicks: segDur,
      keys: vfKeys,
    });

    voice.events.push(event);

    // 如果不是第一段，则建立 tie：上一段 -> 当前段
    if (prevEventId) {
      const tie = {
        id: makeTieId(prevEventId, event.id),
        type: "tie",
        staff,
        from: { measureIndex: prevMeasureIndex, eventId: prevEventId },
        to: { measureIndex: curMeasureIndex, eventId: event.id },
        keys: vfKeys, // 后续渲染时可以按 keys 做逐音 tie
      };
      measures[prevMeasureIndex].voices[staff].ties.push(tie);
    }

    prevEventId = event.id;
    prevMeasureIndex = curMeasureIndex;

    remaining -= segDur;
    curMeasureIndex += 1;
    curStartTick = measures[curMeasureIndex]?.ticks.start ?? curStartTick;
  }
}

function emitChordEvent(
  ppq,
  voice,
  { partId, measureId, staff },
  chordNotes,
  startTick,
  durationTicks
) {
  const keys = chordNotes.map((n) => n.vfKey).filter(Boolean);

  // 如果 key 解析失败，兜底用 midi/name（你也可以选择丢弃）
  const vfKeys = keys.length ? keys : chordNotes.map((n) => `c/4`);

  const vfDur = ticksToVfDuration(ppq, durationTicks);
  const endTick = startTick + durationTicks;

  const event = {
    type: "note",
    startTick,
    durationTicks,
    range: { startTick, endTick },
    vf: {
      keys: vfKeys,
      duration: vfDur.duration,
      dots: vfDur.dots,
      approx: !!vfDur.approx,
      accidentals: {},
    },
    rawNotes: chordNotes.map((n) => ({ midi: n.midi, name: n.name })),
    // 可选：以后想从“原始note”反查/高亮，会很有用
    // sourceIds: chordNotes.map(n => n.sourceId).filter(Boolean),
  };

  event.id = makeEventId({
    measureId,
    staff,
    type: event.type,
    startTick,
    durationTicks,
    keys: vfKeys,
  });

  voice.events.push(event);
}

function fillMeasureVoices(ppq, measures, notes, options) {
  const chordThreshold = options?.chordThresholdTicks ?? 0;

  // 先清空（确保可重复调用不叠加）
  for (const m of measures) {
    m.voices.treble.events = [];
    m.voices.bass.events = [];
    m.voices.treble.ties = m.voices.treble.ties || [];
    m.voices.bass.ties = m.voices.bass.ties || [];
  }

  // ---------- Phase 1: 只放 note（含跨小节拆分），不补 rest ----------
  // notes 已经量化并排序
  for (let i = 0; i < notes.length; ) {
    const n0 = notes[i];
    const staff = assignStaff(n0, options);
    const groupStart = n0.startTick;

    // 找所属小节（固定拍号版）
    const startMeasureIndex = findMeasureIndexByTick(measures, groupStart);
    if (!measures[startMeasureIndex]) {
      i++;
      continue;
    }

    // 收集和弦组（同 tick 或阈值内）
    const chord = [n0];
    let j = i + 1;
    while (j < notes.length) {
      const nj = notes[j];
      if (assignStaff(nj, options) !== staff) break;
      if (Math.abs(nj.startTick - groupStart) <= chordThreshold) {
        chord.push(nj);
        j++;
      } else break;
    }

    // duration：取组内最大 duration
    const dur = Math.max(...chord.map((x) => x.durationTicks));

    // 关键：不再 durClamped，而是跨小节拆分 + tie
    emitChordEventSplitAcrossMeasures(
      ppq,
      measures,
      startMeasureIndex,
      staff,
      chord,
      groupStart,
      dur,
      options
    );

    i = j;
  }

  // ---------- Phase 2: 每小节排序 + 补 rest，保证填满 ----------
  for (const m of measures) {
    const start = m.ticks.start;
    const end = m.ticks.end;

    for (const staff of ["treble", "bass"]) {
      const voice = m.voices[staff];
      const ctx = {
        partId: options.partId || "track0",
        measureId: m.id,
        staff,
      };

      // 先按 startTick 排序
      voice.events.sort((a, b) => a.startTick - b.startTick);

      // 然后补 rest
      const filled = [];
      let cursor = start;

      const keyAccMap = getKeySigAccMap(m.keySignature);
      const preferFlat = preferFlatForKey(m.keySignature);
      const accState = new Map(); // "B4" -> "", "#", "b", "n"

      for (const ev of voice.events) {
        if (ev.startTick > cursor) {
          // gap rest
          const gap = ev.startTick - cursor;
          // 这里用你现有的 pushRestEvents
          pushRestEvents(ppq, { events: filled }, ctx, cursor, gap);
          cursor = ev.startTick;
        }

        if (ev.type === "note") {
          // 重新根据 midi 生成更合理的拼写（不要用原 name）
          // 同时 keys 用自然音字母，accidentals 控制升降
          const accs = {};
          const newKeys = [];

          ev.rawNotes.forEach((rn, idx) => {
            const p = midiToPitch(rn.midi, preferFlat); // letter, acc, octave
            const letter = p.letter;
            const octave = p.octave;

            // keys 用自然字母（不带升降），VexFlow 更稳
            newKeys.push(`${letter.toLowerCase()}/${octave}`);

            // 这个音在调号下默认应该是什么
            const defaultAcc = keyAccMap[letter] || ""; // "#" / "b" / ""
            const wantedAcc = p.acc || ""; // "#" / "b" / ""

            // 小节内当前状态：默认等于调号
            const stateKey = `${letter}${octave}`;
            const cur = accState.has(stateKey)
              ? accState.get(stateKey)
              : defaultAcc;

            // 如果 wantedAcc != cur，则需要写临时记号
            if (wantedAcc !== cur) {
              if (wantedAcc === "") accs[idx] = "n"; // 还原
              else if (wantedAcc === "#") accs[idx] = "#";
              else if (wantedAcc === "b") accs[idx] = "b";
              accState.set(stateKey, wantedAcc);
            } else {
              // 不写 accidental，但也要确保状态初始化
              accState.set(stateKey, cur);
            }
          });

          ev.vf.keys = newKeys;
          ev.vf.accidentals = accs;
        }

        // --- accidentals normalize (per-measure) ---
        filled.push(ev);
        cursor = Math.max(cursor, ev.startTick + ev.durationTicks);
      }

      if (cursor < end) {
        pushRestEvents(ppq, { events: filled }, ctx, cursor, end - cursor);
      }

      voice.events = filled;
      buildTupletsForVoice(ppq, m, staff, options);
    }
  }
}

function buildTupletsForVoice(ppq, measure, staff, options = {}) {
  const voice = measure.voices[staff];
  if (!voice) return;

  voice.tuplets = []; // 每次重建

  // 只看 note（rest 直接断开）
  const notes = (voice.events || []).filter((ev) => ev.type === "note");

  if (notes.length < 3) return;

  // 常见 tuplet 规则：3 in 2、5 in 4（后面你可以继续加）
  const RULES = options.tupletRules || [
    { num: 3, in: 2 }, // triplet
    { num: 5, in: 4 }, // quintuplet
  ];

  // 常用 baseTicks：以“标准音符时值”为基准（全/二/四/八/十六/三十二）
  const baseTicksList = [
    ppq * 4, // w
    ppq * 2, // h
    ppq, // q
    ppq / 2, // 8
    ppq / 4, // 16
    ppq / 8, // 32
    ppq / 16, // 64
  ]
    .map((x) => Math.round(x))
    .filter((x) => x >= 1);

  const tol = Math.max(
    1,
    Math.round(
      (options.tupletToleranceTicks ?? options.gridTicks ?? ppq / 24) / 2
    )
  );

  // 判断两个 tick 是否“足够接近”
  const close = (a, b) => Math.abs(a - b) <= tol;

  // 尝试在 notes 中找 run：连续 num 个音符，duration 近似 base * (in/num)，并且相邻 startTick 连续
  let i = 0;
  while (i < notes.length) {
    let matched = false;

    for (const rule of RULES) {
      const { num, in: inCount } = rule;

      if (i + num - 1 >= notes.length) continue;

      // 取一个候选窗口
      const win = notes.slice(i, i + num);

      // 必须在同一小节内（保险起见）
      const mStart = measure.ticks.start;
      const mEnd = measure.ticks.end;
      if (
        win[0].startTick < mStart ||
        win[num - 1].startTick + win[num - 1].durationTicks > mEnd
      ) {
        continue;
      }

      // 找最可能的 baseTicks（标准时值）
      // 期望每个 tuplet 音的 ticks = baseTicks * inCount / num
      // 总跨度 = baseTicks * inCount
      const span =
        win[num - 1].startTick + win[num - 1].durationTicks - win[0].startTick;

      // 连续性校验：相邻 startTick 应该递增接近各自 duration
      let continuous = true;
      for (let k = 0; k < num - 1; k++) {
        const expectedNext = win[k].startTick + win[k].durationTicks;
        if (!close(win[k + 1].startTick, expectedNext)) {
          continuous = false;
          break;
        }
      }
      if (!continuous) continue;

      // 在 baseTicksList 里找一个使 span ≈ baseTicks * inCount 的
      let bestBase = null;
      for (const baseTicks of baseTicksList) {
        if (close(span, baseTicks * inCount)) {
          bestBase = baseTicks;
          break;
        }
      }
      if (!bestBase) continue;

      // 再校验每个音的 durationTicks ≈ bestBase * inCount / num
      const expectedDur = Math.round((bestBase * inCount) / num);
      const okDur = win.every((ev) => close(ev.durationTicks, expectedDur));
      if (!okDur) continue;

      // ✅ 识别为 tuplet
      voice.tuplets.push({
        id: `tuplet:${hashStr(
          `${measure.id}:${staff}:${win[0].id}:${num}in${inCount}`
        )}`,
        numNotes: num, // 3 / 5 ...
        notesOccupied: inCount, // 2 / 4 ...
        ratio: `${num}:${inCount}`,
        eventIds: win.map((x) => x.id),
      });

      // 跳过这个窗口
      i += num;
      matched = true;
      break;
    }

    if (!matched) i += 1;
  }
}

// ------------------------------
// 9) beam 分组（基础版：只按拍号分 6/8 的 3+3）
// ------------------------------

function getDefaultBeamGroups([num, den]) {
  // 返回数组：用“分母音符”为单位的分组，比如 6/8 => [3,3]（三个八分为一组）
  // 这些分组只决定“在哪些边界断开 beam”，不会改变音符时值

  // compound meter：6/8 9/8 12/8 ... 通常按 3 个 8 分一组
  if (den === 8 && num % 3 === 0 && num > 3) {
    const groups = [];
    for (let i = 0; i < num; i += 3) groups.push(3);
    return groups;
  }

  // 常见不规则拍号的默认分组（可按你需求调整）
  if (den === 8 && num === 5) return [2, 3]; // 5/8: 2+3
  if (den === 8 && num === 7) return [2, 2, 3]; // 7/8: 2+2+3
  if (den === 8 && num === 8) return [3, 3, 2]; // 8/8 常见：3+3+2（也有人用 2+2+2+2）

  // 简单拍号：按“每拍”分组
  // 4/4 => [1,1,1,1]（每个四分一拍）
  // 3/4 => [1,1,1]
  // 2/4 => [1,1]
  // 3/8 => [1,1,1]（每个八分一拍）
  return Array.from({ length: num }, () => 1);
}

function buildBeamsForMeasure(ppq, measure, options = {}) {
  const [num, den] = measure.timeSignature;
  const start = measure.ticks.start;

  // 1) 计算“一个分母音符”是多少 ticks
  const unitTicks = (ppq * 4) / den; // 例如 den=8 => 八分音符 ticks
  if (!unitTicks || unitTicks <= 0) {
    // 防御
    measure.voices.treble.beams = [];
    measure.voices.bass.beams = [];
    return;
  }

  // 2) 得到分组（可自定义覆盖）
  const key = `${num}/${den}`;
  const groups =
    (options.beamGroupsMap && options.beamGroupsMap[key]) ||
    getDefaultBeamGroups([num, den]);

  // 3) 生成“分组边界”（tick 范围）
  const boundaries = [];
  let cur = start;
  for (const g of groups) {
    const gTicks = Math.round(g * unitTicks);
    const next = cur + gTicks;
    boundaries.push({ start: cur, end: next });
    cur = next;
  }

  // 4) beam 规则：只连短音符（8/16/32/64），并且可以选择是否允许附点音符连 beam
  function isBeamable(ev) {
    if (ev.type !== "note") return false;
    const d = ev.vf?.duration;
    const dots = ev.vf?.dots || 0;
    if (dots > 0 && !options.allowDottedBeam) return false; // 附点音符是否允许 beam
    return d === "8" || d === "16" || d === "32" || d === "64";
  }

  const minNotes = options.beamMinNotes ?? 2;

  // 5) 生成 beam 分组
  for (const staff of ["treble", "bass"]) {
    const voice = measure.voices[staff];
    const events = (voice.events || [])
      .slice()
      .sort((a, b) => a.startTick - b.startTick);

    const beamGroups = [];

    // 按分组边界逐段做 beam（保证不会跨拍/跨组乱连）
    for (const seg of boundaries) {
      const segEvents = events.filter(
        (ev) => ev.startTick >= seg.start && ev.startTick < seg.end
      );

      let run = []; // 连续可连的音符 eventId 列表
      for (const ev of segEvents) {
        if (isBeamable(ev)) {
          run.push(ev.id);
        } else {
          // 碰到 rest 或长音符：断开
          if (run.length >= minNotes) beamGroups.push({ eventIds: run });
          run = [];
        }
      }
      if (run.length >= minNotes) beamGroups.push({ eventIds: run });
    }

    voice.beams = beamGroups;
  }
}

// ------------------------------
// 10) 主入口：track -> scoreModel
//options: {
//   handSplitMidi: 60,        // 左右手分界（可调）
//   chordThresholdTicks: 0,   // 同 tick 才合并成和弦（可调）
//   gridTicks: 240,        // 也可以强制指定量化网格，不写就自动算
// }
// ------------------------------
export function midiJsonToScoreModel(midiJson, options = {}) {
  //ppq,timeSignatures / keySignatures / tempo统一排序并返回
  const { ppq, timeSignatures, keySignatures, tempos } =
    normalizeHeader(midiJson);

  const tracks = midiJson?.tracks || []; //轨道数组
  const parts = [];

  tracks.forEach((t, trackIndex) => {
    const partId = `track${trackIndex}`; // 通用、稳定
    const rawNotes = t?.notes || []; // 音符事件列表
    const endTicks = t?.endOfTrackTicks ?? 0; //该轨道结束位置（tick）

    // 音符事件预处理：归一化、排序、合并和弦
    let notes = preprocessNotes(rawNotes, ppq, timeSignatures, {
      gridTicks: options.gridTicks,
    });

    if (options.melodyOnly) {
      notes = extractMelodyNotes(notes, options);
    }

    const lastNoteEnd = notes.length ? notes[notes.length - 1].endTick : 0;
    const gridEnd = Math.max(endTicks, lastNoteEnd);

    //小节切分
    const measures = buildMeasureGrid(
      ppq,
      timeSignatures,
      keySignatures,
      gridEnd,
      partId
    );

    //把一整条 track 的“音符列表 notes”，按小节（measure）和谱表（treble/bass）分配进去，
    // 并在每个小节里生成“可以直接渲染的事件序列 events”（音符/和弦 + 休止符），保证每个小节的时间被填满。
    fillMeasureVoices(ppq, measures, notes, { ...options, partId });

    // beam
    measures.forEach((m) => buildBeamsForMeasure(ppq, m, options));

    parts.push({
      id: partId,
      name: t?.instrument?.name || t?.name || `Track ${trackIndex}`,
      instrument: t?.instrument || null,
      channel: t?.channel,
      staves: [
        { id: "treble", clef: "treble" },
        { id: "bass", clef: "bass" },
      ],
      measures,
    });
  });

  return {
    header: { ppq, tempos, timeSignatures, keySignatures },
    parts,
  };
}

//调用方式（视唱推荐配置）
// const scoreModel = midiJsonToScoreModel(midiJson, {
//   handSplitMidi: 60,        // 左右手分界（midi>=60 归为高音谱表 treble，否则 bass）；当未强制单谱表时生效
//   melodyOnly: true,    // 是否启用“只保留旋律”的抽取：把同一时刻/和弦里只选一个音，输出更适合视唱的单旋律
//   melodyMode: "smoothHighest", // 旋律抽取模式："highest"：每个时刻直接取最高音;"smoothHighest"：默认优先最高音，但如果跳进太大，会选更接近上一个旋律音的音（更顺滑）
//   melodyMaxLeap: 12,  //旋律抽取允许的最大跳进（半音数），超过就更倾向选更“接近上一个音”的候选；12=一个八度
//   melodyForceMonophonic: true, // // 是否强制单声部：如果前一个音还没结束下一个音就开始，会把前一个音截断到下一个音开始（更像视唱单线条）
//   forceSingleStaff: "treble", // 强制只用一个谱表："treble"：全部音都进高音谱表（常用于视唱）;"bass"：全部音都进低音谱表;不传/undefined：按 handSplitMidi 自动分 treble/bass
//   chordThresholdTicks: 0, // // 和弦判定阈值：同一谱表内，startTick 差值 <= 该值就视为同一“和弦组”（0 表示必须完全同 tick 才合并）
//   gridTicks: undefined, //// 量化网格（tick）：把 startTick/durationTicks 对齐到该网格；不传则根据拍号自动计算默认网格
//   //拍号 → beam 分组规则（自定义覆盖默认分组）：
//   //例如 7/8: [3,2,2] 表示按 3+2+2 个“分母音符”为一组，beam 不跨组
//   beamGroupsMap: { "7/8": [3, 2, 2], "5/8": [3, 2], "8/8": [2, 2, 2, 2], },  //拍号 → beam 分组规则
//   beamMinNotes: 2, // 生成一条 beam 的最小音符数：一组里至少有多少个可连的短音符（8/16/32/64）才会连横梁
//   allowDottedBeam: false,  // // 是否允许“附点音符”参与 beam：false：附点音符(如 8.)会打断 beam（更保守、更常见）;true：附点音符也可加入 beam（更紧凑的写法）
//   tupletToleranceTicks: 20, // tuplet 识别容错（tick）：判断三连/五连等时，允许的 tick 偏差范围；越大越容易识别，但也更可能误判
//   tupletRules: [
//      //tuplet 识别规则列表：每条表示 “num 个音” 挤进 “in 个同类型音的时长”
//      //3 in 2 = 三连音（3个音占2个音的时间）
//      //5 in 4 = 五连音（5个音占4个音的时间）
//     { num: 3, in: 2 },
//     { num: 5, in: 4 },

//   ],
// });
