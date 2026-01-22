<template>
  <view class="page">
    <!-- 主五线谱 -->
    <canvas
      id="scoreCanvas"
      canvas-id="scoreCanvas"
      type="2d"
      class="score-canvas"
      @tap="onScoreTap"
    />

    <view class="opt-bar">
      <view class="opt-title">谱号</view>
      <view class="opt-row">
        <!-- <view
          class="opt-btn"
          :class="{ active: scoreConfig.clef === 'treble' }"
          @tap="setClef('treble')"
          >高音谱号</view
        >
        <view
          class="opt-btn"
          :class="{ active: scoreConfig.clef === 'bass' }"
          @tap="setClef('bass')"
          >低音谱号</view
        > -->
        <view
          v-for="k in clefOptions"
          :key="k.value"
          class="opt-btn"
          :class="{ active: scoreConfig.clef === k.value }"
          @tap="setClef(k.value)"
        >
          {{ k.label }}
        </view>
      </view>
    </view>

    <!-- 调号 -->
    <view class="opt-bar">
      <view class="opt-title">调号</view>
      <view class="opt-row">
        <view
          v-for="k in keySigOptions"
          :key="k.value"
          class="opt-btn"
          :class="{ active: scoreConfig.keySig === k.value }"
          @tap="selectKeySig(k.value)"
        >
          {{ k.label }}
        </view>
      </view>
    </view>

    <!-- 拍号 -->
    <view class="opt-bar">
      <view class="opt-title">拍号</view>
      <view class="opt-row">
        <view
          v-for="t in timeSigOptions"
          :key="t.value"
          class="opt-btn"
          :class="{ active: scoreConfig.timeSig === t.value }"
          @tap="selectTimeSig(t.value)"
        >
          {{ t.label }}
        </view>
      </view>
    </view>

    <!-- 底部：音符时值选择（图标用 VexFlow 画） -->
    <view class="note-bar">
      <view
        v-for="d in durations"
        :key="d.id"
        class="note-btn"
        :class="{ active: selected?.id === d.id }"
        @tap="selectDuration(d)"
      >
        <image class="note-icon" :src="d.icon" mode="aspectFit" />
      </view>

      <view class="note-btn danger" @tap="clearAll">
        <view class="danger-text">清空</view>
      </view>
    </view>

    <!-- 临时记号选择 -->
    <view class="opt-bar">
      <view class="opt-title">临时记号</view>
      <view class="opt-row">
        <view
          v-for="a in accidentals"
          :key="a.id"
          class="opt-btn"
          :class="{ active: selectedAccidental === a.value }"
          @tap="selectAccidental(a.value)"
        >
          {{ a.label }}
        </view>
      </view>
    </view>

    <!-- 附点选择 -->
    <view class="opt-bar">
      <view class="opt-title">附点</view>
      <view class="opt-row">
        <view
          class="opt-btn"
          :class="{ active: selectedDots === 0 }"
          @tap="selectDots(0)"
          >0</view
        >
        <view
          class="opt-btn"
          :class="{ active: selectedDots === 1 }"
          @tap="selectDots(1)"
          >1</view
        >
        <!-- <view
          class="opt-btn"
          :class="{ active: selectedDots === 2 }"
          @tap="selectDots(2)"
          >2</view
        > -->
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, getCurrentInstance } from "vue";
import { onReady } from "@dcloudio/uni-app";
import Vex from "vexflow";

const VF = Vex.Flow;
const instance = getCurrentInstance();

const MIN_NOTE_GAP = 18; // 音符最小水平间距（像素）
const MAX_TRY_STEPS = 40; // 最多向两边尝试多少个槽位

let canvasTop = 0;
let canvasLeft = 0;

/**
 * 你要给用户选的“音符类型/时值”
 * VexFlow duration：
 * w=全音符, h=二分, q=四分, 8=八分, 16=十六分
 */
const durations = [
  {
    id: "w",
    label: "全音符",
    duration: "w",
    icon: "/static/icons/notes/w.png",
  },
  {
    id: "h",
    label: "二分音符",
    duration: "h",
    icon: "/static/icons/notes/h.png",
  },
  {
    id: "q",
    label: "四分音符",
    duration: "q",
    icon: "/static/icons/notes/q.png",
  },
  {
    id: "8",
    label: "八分音符",
    duration: "8",
    icon: "/static/icons/notes/8.png",
  },
  {
    id: "16",
    label: "十六分音符",
    duration: "16",
    icon: "/static/icons/notes/16.png",
  },
  {
    id: "32",
    label: "三十二分音符",
    duration: "32",
    icon: "/static/icons/notes/32.png",
  },
  {
    id: "64",
    label: "六十四分音符",
    duration: "64",
    icon: "/static/icons/notes/64.png",
  },
];

// 临时记号
const accidentals = [
  { id: "none", label: "无", value: null },
  { id: "#", label: "♯", value: "#" },
  { id: "b", label: "♭", value: "b" },
  { id: "n", label: "♮", value: "n" },
  { id: "##", label: "𝄪", value: "##" },
  { id: "bb", label: "𝄫", value: "bb" },
];

const timeSigOptions = [
  { label: "2/4", value: "2/4" },
  { label: "3/4", value: "3/4" },
  { label: "4/4", value: "4/4" },
  { label: "6/8", value: "6/8" },
  { label: "12/8", value: "12/8" },
];

// 常见调号（大调写法），够用
const keySigOptions = [
  { label: "C (0)", value: "C" },
  { label: "G (1#)", value: "G" },
  { label: "D (2#)", value: "D" },
  { label: "A (3#)", value: "A" },
  { label: "E (4#)", value: "E" },
  { label: "B (5#)", value: "B" },
  { label: "F# (6#)", value: "F#" },
  { label: "C# (7#)", value: "C#" },
  { label: "F (1b)", value: "F" },
  { label: "Bb (2b)", value: "Bb" },
  { label: "Eb (3b)", value: "Eb" },
  { label: "Ab (4b)", value: "Ab" },
  { label: "Db (5b)", value: "Db" },
  { label: "Gb (6b)", value: "Gb" },
  { label: "Cb (7b)", value: "Cb" },
];

const scoreConfig = ref({
  clef: "treble", // 你现在固定也行；后面再扩展 treble/bass
  timeSig: "4/4",
  keySig: "C",
});

// 升号、降号的固定顺序（乐理规则）
const SHARP_ORDER = ["f", "c", "g", "d", "a", "e", "b"];
const FLAT_ORDER = ["b", "e", "a", "d", "g", "c", "f"];
// 常见大调调号：有几个升/降
const KEY_SIG_ACC_COUNT = {
  C: { type: "sharp", count: 0 },
  G: { type: "sharp", count: 1 },
  D: { type: "sharp", count: 2 },
  A: { type: "sharp", count: 3 },
  E: { type: "sharp", count: 4 },
  B: { type: "sharp", count: 5 },
  "F#": { type: "sharp", count: 6 },
  "C#": { type: "sharp", count: 7 },

  F: { type: "flat", count: 1 },
  Bb: { type: "flat", count: 2 },
  Eb: { type: "flat", count: 3 },
  Ab: { type: "flat", count: 4 },
  Db: { type: "flat", count: 5 },
  Gb: { type: "flat", count: 6 },
  Cb: { type: "flat", count: 7 },
};

//谱号选项
const clefOptions = [
  { label: "高音谱号", value: "treble" },
  { label: "低音谱号", value: "bass" },
  { label: "中音谱号", value: "alto" },
  { label: "次中音谱号", value: "tenor" },
];

const selected = ref(durations[2]); // 默认四分音符

// 记录已放入谱面的音符：{ key: "e/4", duration: "q" }
const notes = ref([]);
// 一个小节：{ notes: [], used: 0 }
const measures = ref([{ notes: [], used: 0 }]);
const selectedAccidental = ref(null); // null | "#" | "b" | "n"
const selectedDots = ref(0); // 0 | 1 | 2

// 主谱面 canvas & vexflow 对象
let scoreNode = null;
let scoreCtx = null;
let scoreRenderer = null;
let scoreStave = null;

let cssW = 0;
let cssH = 0;
let dpr = 1;

function selectDuration(d) {
  selected.value = d;
}

function clearAll() {
  measures.value = [{ notes: [], used: 0 }];
  redrawScore();
}

function selectAccidental(a) {
  selectedAccidental.value = a; // a: null | "#" | "b" | "n"
}

function selectDots(k) {
  selectedDots.value = k; // 0|1
}

function setClef(clef) {
  scoreConfig.value.clef = clef;
  redrawScore();
}

function selectTimeSig(v) {
  scoreConfig.value.timeSig = v;
  redrawScore();
}

function selectKeySig(v) {
  scoreConfig.value.keySig = v;
  redrawScore();
}

// ================= 分小节：时间轴基础 =================
const TPQ = 480; // 每四分音符 ticks（固定常量即可）

function parseTimeSig(ts) {
  const [a, b] = String(ts)
    .split("/")
    .map((x) => Number(x));
  return { beats: a || 4, beatValue: b || 4 };
}

function getMeasureTicks() {
  const { beats, beatValue } = parseTimeSig(scoreConfig.value.timeSig);
  // 一拍 = 4/beatValue 个四分音符
  const quartersPerBeat = 4 / beatValue;
  return Math.round(beats * quartersPerBeat * TPQ);
}

function durationToQuarters(dur) {
  const map = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25, 32: 0.125, 64: 0.0625 };
  return map[dur] ?? 1;
}

function noteToTicks(duration, dots) {
  const base = durationToQuarters(duration) * TPQ;
  const factor = dots ? 1.5 : 1.0; // 你现在只支持 0/1 点
  return Math.round(base * factor);
}

//往小节里“顺序追加音符”的
function addNoteToMeasures(noteData) {
  const measureTicks = getMeasureTicks();
  const ticks = noteToTicks(noteData.duration, noteData.dots);

  let m = measures.value[measures.value.length - 1];

  // 放不下 -> 新开小节
  if (m.used + ticks > measureTicks) {
    measures.value.push({ notes: [], used: 0 });
    m = measures.value[measures.value.length - 1];
  }

  m.notes.push({
    ...noteData,
    ticks,
    offsetTicks: m.used,
  });

  m.used += ticks;
}

/**
 * 根据当前调号，返回一个映射：{ f: "#", c: "#", ... } 或 { b:"b", e:"b", ...}
 */
function getKeySigAccidentalMap(keySig) {
  const info = KEY_SIG_ACC_COUNT[keySig] || KEY_SIG_ACC_COUNT.C;
  const map = {};

  if (info.count <= 0) return map;

  if (info.type === "sharp") {
    for (let i = 0; i < info.count; i++) map[SHARP_ORDER[i]] = "#";
  } else {
    for (let i = 0; i < info.count; i++) map[FLAT_ORDER[i]] = "b";
  }
  return map;
}

/**
 * 把一个自然音 key（例如 "f/4"）按调号变成默认音高（例如 D大调 => "f#/4"）
 * 注意：这里只改变 key 字符串，不添加临时记号（因为调号已显示）
 */
function applyKeySigToKey(naturalKey, keySig) {
  const accMap = getKeySigAccidentalMap(keySig);

  const [letterRaw, octaveRaw] = String(naturalKey).split("/");
  const letter = (letterRaw || "c").toLowerCase();
  const octave = octaveRaw || "4";

  const acc = accMap[letter]; // "#" 或 "b" 或 undefined
  return acc ? `${letter}${acc}/${octave}` : `${letter}/${octave}`;
}

//判断符杆方向
function getStemDirectionByKey(key) {
  // 用一个简单、稳定的阈值：看音符是否“高于当前谱号的中线”
  // treble 中线是 B4；bass 中线是 D3；alto 中线是 C4；tenor 中线是 A3
  const midByClef = {
    treble: "b/4",
    bass: "d/3",
    alto: "c/4",
    tenor: "a/3",
  };

  const mid = midByClef[scoreConfig.value.clef] || "b/4";

  // 把 key 变成可比较的“度数”（只按字母+八度，不考虑#b；对杆方向足够）
  function toDiatonicIndex(k) {
    const m = String(k).match(/^([a-g])(bb|##|b|#|n)?\/(\d+)$/i);
    if (!m) return 0;
    const letter = m[1].toLowerCase();
    const octave = Number(m[3]);
    const order = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
    return octave * 7 + order[letter];
  }

  const idx = toDiatonicIndex(key);
  const midIdx = toDiatonicIndex(mid);

  // 高于中线 => DOWN；低于中线 => UP；等于中线你可选 DOWN
  return idx >= midIdx ? VF.Stem.DOWN : VF.Stem.UP;
}

// =============== 核心：y -> 音高 key（treble，按线/间吸附） ===============
/**
 * 以高音谱号为例：
 * 底线（第 5 线）是 E4，然后往上依次：
 * E4(线) F4(间) G4(线) A4(间) B4(线) C5(间) D5(线) E5(间) F5(线) ...
 */

function diatonicStepToKeyFromBase(step, baseKey) {
  const letters = ["c", "d", "e", "f", "g", "a", "b"];
  const [baseLetter, baseOct] = String(baseKey).split("/");
  let idx = letters.indexOf(baseLetter);
  let oct = Number(baseOct);
  if (idx < 0 || Number.isNaN(oct)) return "c/4";

  if (step > 0) {
    for (let i = 0; i < step; i++) {
      idx++;
      if (idx >= 7) {
        idx = 0;
        oct++;
      }
    }
  } else if (step < 0) {
    for (let i = 0; i < -step; i++) {
      idx--;
      if (idx < 0) {
        idx = 6;
        oct--;
      }
    }
  }
  return `${letters[idx]}/${oct}`;
}

function getBaseKeyForClef(clef) {
  switch (clef) {
    case "bass":
      return "g/2";
    case "alto":
      return "f/3";
    case "tenor":
      return "d/3";
    case "treble":
    default:
      return "e/4";
  }
}

function yToKey(y) {
  if (!scoreStave) return "c/4";

  const spacing = scoreStave.getSpacingBetweenLines();
  const stepSize = spacing / 2;
  const bottomLineY = scoreStave.getYForLine(4);

  let step = Math.round((bottomLineY - y) / stepSize);
  step = Math.max(-10, Math.min(14, step));

  const baseKey = getBaseKeyForClef(scoreConfig.value.clef);
  return diatonicStepToKeyFromBase(step, baseKey);
}

//获取音符开始时间
function getNoteStartX() {
  return scoreStave?.getNoteStartX?.() ?? 0;
}

// canvas 绝对 x -> VexFlow 布局 x（以 noteStartX 为 0）
function canvasXToLayoutX(canvasX) {
  return canvasX - getNoteStartX();
}

function getDrawableXRange() {
  const minX = scoreStave?.getNoteStartX?.() ?? 0;
  const maxX =
    (scoreStave?.getX?.() ?? 0) + (scoreStave?.getWidth?.() ?? cssW) - 10;
  return { minX, maxX };
}

function isCollidingAtX(xCanvas) {
  for (const n of notes.value) {
    const xn = n.xCanvas ?? n.x; // 兼容旧字段
    if (typeof xn !== "number") continue;
    if (Math.abs(xCanvas - xn) < MIN_NOTE_GAP) return true;
  }
  return false;
}

/**
 * 输入：用户点击的 xCanvas（canvas 绝对坐标）
 * 输出：一个“附近不重叠”的 xCanvas（尽量贴近原点）
 */
function placeXAvoidOverlap(xCanvasRaw) {
  const { minX, maxX } = getDrawableXRange();

  // 先 clamp 到可写区
  let x0 = Math.max(minX, Math.min(maxX, xCanvasRaw));

  // 如果当前位置不冲突，直接用
  if (isXFree(x0)) return x0;

  // 否则以 MIN_NOTE_GAP 为步长，左右交替找最近空位
  for (let k = 1; k <= MAX_TRY_STEPS; k++) {
    const xr = x0 + k * gapForDuration(selected.value.duration);
    if (xr <= maxX && isXFree(xr)) return xr;

    const xl = x0 - k * gapForDuration(selected.value.duration);
    if (xl >= minX && isXFree(xl)) return xl;
  }

  // 实在找不到就返回 clamp 后的值（兜底）
  return x0;
}

// /**
//  * 按自然音阶（不带升降号）走 step 步，返回 vexflow key 格式：比如 "c/5"
//  */
// function diatonicStepToKeyFromBase(step, baseKey) {
//   const letters = ["c", "d", "e", "f", "g", "a", "b"];

//   const [baseLetter, baseOct] = baseKey.split("/");
//   let letterIndex = letters.indexOf(baseLetter);
//   let octave = Number(baseOct);

//   if (letterIndex < 0 || Number.isNaN(octave)) return "c/4";

//   if (step > 0) {
//     for (let i = 0; i < step; i++) {
//       letterIndex += 1;
//       if (letterIndex >= 7) {
//         letterIndex = 0;
//         octave += 1; // b -> c 进八度
//       }
//     }
//   } else if (step < 0) {
//     for (let i = 0; i < Math.abs(step); i++) {
//       letterIndex -= 1;
//       if (letterIndex < 0) {
//         letterIndex = 6;
//         octave -= 1; // c -> b 退八度
//       }
//     }
//   }

//   return `${letters[letterIndex]}/${octave}`;
// }

// =============== 初始化：主谱面 + 底部图标 canvas ===============
onReady(() => {
  initScoreCanvas();
});

function initScoreCanvas() {
  const q = uni.createSelectorQuery().in(instance);

  q.select("#scoreCanvas").fields({ node: true, size: true });
  q.select("#scoreCanvas").boundingClientRect();

  q.exec((res) => {
    const info = res?.[0];
    const rect = res?.[1];

    if (!info?.node || !rect) {
      console.error("找不到主 canvas 或 rect");
      return;
    }

    canvasTop = rect.top;
    canvasLeft = rect.left;

    scoreNode = info.node;
    cssW = info.width;
    cssH = info.height;

    dpr = uni.getSystemInfoSync().pixelRatio || 1;
    scoreNode.width = Math.floor(cssW * dpr);
    scoreNode.height = Math.floor(cssH * dpr);

    scoreCtx = scoreNode.getContext("2d");
    scoreCtx.scale(dpr, dpr);

    scoreRenderer = new VF.Renderer(scoreNode, VF.Renderer.Backends.CANVAS);
    redrawScore();
  });
}

function buildStaveNote(n, context, stave) {
  const dots = n.dots ?? 0;

  const note = new VF.StaveNote({
    clef: scoreConfig.value.clef,
    keys: [n.key],
    duration: n.duration,
    stem_direction: getStemDirectionByKey(n.key),
  });

  note.setContext(context);
  note.setStave(stave);

  if (n.accidental) {
    note.addModifier(new VF.Accidental(n.accidental), 0);
  }
  if (dots) {
    VF.Dot.buildAndAttach([note], { all: true });
  }

  return note;
}

function drawStave(context) {
  scoreStave = new VF.Stave(10, 40, cssW - 20);

  const { clef, timeSig, keySig } = scoreConfig.value;
  if (clef) scoreStave.addClef(clef);
  if (timeSig) scoreStave.addTimeSignature(timeSig);
  if (keySig) scoreStave.addKeySignature(keySig);

  scoreStave.setContext(context).draw();
}

// =============== 重绘主谱面（每次点击都全量重绘，MVP 最稳） ===============
function redrawScore() {
  if (!scoreRenderer || !scoreCtx) return;

  scoreCtx.clearRect(0, 0, cssW, cssH);
  const context = scoreRenderer.getContext();

  const { beats, beatValue } = parseTimeSig(scoreConfig.value.timeSig);

  // ====== 小节布局参数（你可以自己调） ======
  const marginLeft = 10;
  const top = 30;
  const measureW = 200; // 每小节宽度
  const gapX = 10; // 小节之间间距
  const rowGap = 110; // 行间距（一个系统到下一行）
  const perRow = Math.max(
    1,
    Math.floor((cssW - marginLeft) / (measureW + gapX)),
  );

  measures.value.forEach((m, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;

    const x = marginLeft + col * (measureW + gapX);
    const y = top + row * rowGap;

    // 每小节一个 stave
    const stave = new VF.Stave(x, y, measureW);

    // 第一小节画 clef/key/time
    if (i === 0) {
      scoreStave = stave;
      stave.addClef(scoreConfig.value.clef);
      if (scoreConfig.value.keySig)
        stave.addKeySignature(scoreConfig.value.keySig);
      if (scoreConfig.value.timeSig)
        stave.addTimeSignature(scoreConfig.value.timeSig);
    }

    // 小节线
    stave.setEndBarType(VF.Barline.type.SINGLE);
    stave.setContext(context).draw();

    if (!m.notes.length) return;

    // 构建小节内 notes
    const tickables = m.notes.map((n) => buildStaveNote(n, context, stave));

    const voice = new VF.Voice({ num_beats: beats, beat_value: beatValue });
    voice.setStrict(false); // MVP：允许没填满
    voice.addTickables(tickables);

    new VF.Formatter().joinVoices([voice]).format([voice], measureW - 20);
    voice.draw(context, stave);
  });
}

function gapForDuration(dur) {
  const map = { w: 30, h: 24, q: 20, 8: 18, 16: 18, 32: 18, 64: 18 };
  return map[dur] ?? 28;
}

//获取canvas坐标

function getCanvasPoint(e) {
  const t = e.changedTouches?.[0] || e.touches?.[0];

  // 尽量拿页面/视口坐标（不同端字段不同）
  let x = e.detail?.x ?? t?.x ?? t?.clientX ?? t?.pageX;
  let y = e.detail?.y ?? t?.y ?? t?.clientY ?? t?.pageY;

  if (typeof x !== "number" || typeof y !== "number") return null;

  // 统一转换成 canvas 内部坐标
  x = x - canvasLeft;
  y = y - canvasTop;

  // 防止点到 canvas 外面
  x = Math.max(0, Math.min(cssW, x));
  y = Math.max(0, Math.min(cssH, y));

  return { x, y };
}

// =============== 用户点主谱面：y 决定音高 + 当前选中 duration 决定时值 ===============
function onScoreTap(e) {
  if (!selected.value) return;
  if (!scoreStave) redrawScore(); // 确保映射用谱表存在（首次进入）
  if (!scoreStave) return;

  const p = getCanvasPoint(e);
  if (!p) return;

  // y → 音高（线/间吸附）
  const naturalKey = yToKey(p.y); // 你现有 y->自然音
  const key = applyKeySigToKey(naturalKey, scoreConfig.value.keySig); // ✅ 按调号默认升降

  console.log("keySig raw:", scoreConfig.value.keySig);
  console.log("accMap:", getKeySigAccidentalMap(scoreConfig.value.keySig));
  console.log("naturalKey", naturalKey, "key", key);

  // x → 限制在可写区域（避开谱号/拍号）
  // const minX = scoreStave.getNoteStartX?.() ?? 60;
  // const maxX = scoreStave.getX() + scoreStave.getWidth() - 10;
  // const x = Math.max(minX, Math.min(maxX, p.x));
  // // console.log("点击了", x, minX, maxX, p.x);
  // // const xPlaced = placeXAvoidOverlap(x);
  // // === 碰撞检测：冲突就提示，不自动挪位置 ===
  // if (isCollidingAtX(x)) {
  //   uni.showToast({
  //     title: `离已有音符太近，请重新选择位置`,
  //     icon: "none",
  //     duration: 1200,
  //   });
  //   return;
  // }

  addNoteToMeasures({
    key,
    duration: selected.value.duration,
    dots: selectedDots.value ?? 0,
    accidental: selectedAccidental.value ?? null,
  });

  redrawScore();
}
</script>

<style scoped>
.page {
  padding: 16px;
}

.score-canvas {
  width: 100%;
  height: 300px;
  border: 1px solid #333;
  border-radius: 10px;
  background: #fff;
}

.note-bar {
  margin-top: 12px;
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  align-items: flex-start;
}

.note-btn {
  padding: 8px;
  border: 1px solid #999;
  border-radius: 12px;
  background: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
}
.note-btn.active {
  border-color: #1677ff;
}

.note-icon {
  width: 30px;
  height: 30px;
}
.note-label {
  margin-top: 6px;
  font-size: 12px;
}

.icon-canvas {
  width: 70px;
  height: 44px;
}

.note-btn.danger {
  width: 92px;
  justify-content: center;
  border-color: #ff4d4f;
}

.danger-text {
  font-size: 14px;
  color: #ff4d4f;
}

.opt-bar {
  margin-top: 10px;
  padding: 10px 8px;
  border: 1px solid #eee;
  border-radius: 12px;
  background: #fff;
}
.opt-title {
  font-size: 12px;
  color: #666;
  margin-bottom: 8px;
}
.opt-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.opt-btn {
  min-width: 44px;
  padding: 6px 10px;
  border: 1px solid #999;
  border-radius: 10px;
  text-align: center;
  font-size: 14px;
}
.opt-btn.active {
  border-color: #1677ff;
}
</style>
