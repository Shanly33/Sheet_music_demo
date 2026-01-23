<template>
  <view class="page">
    <!-- 顶部：五线谱主区域 -->
    <view class="score-container">
      <view class="score-wrap" id="scoreWrap">
        <!-- 实际绘图 Canvas -->
        <canvas
          id="scoreCanvas"
          canvas-id="scoreCanvas"
          type="2d"
          class="score-canvas"
          :style="{
            width: viewW ? viewW + 'px' : '100%',
            height: canvasCssH + 'px',
          }"
        />

        <!-- 滚动交互层 -->
        <scroll-view
          class="score-scroll"
          scroll-x
          enhanced
          enable-passive
          :show-scrollbar="true"
          :bounces="false"
          @scroll="onScoreScroll"
          @tap="onScoreTap"
        >
          <!-- 撑开宽度的占位元素 -->
          <view
            :style="{ width: canvasCssW + 'px', height: canvasCssH + 'px' }"
          ></view>
        </scroll-view>
      </view>
    </view>

    <!-- 底部：操作控制面板 -->
    <view class="controls-area">
      <!-- 1. 基础配置 (谱号 / 调号 / 拍号) -->
      <view class="panel-section">
        <view class="panel-header">乐谱设置</view>
        <scroll-view scroll-x class="h-scroll">
          <view class="opt-group">
            <!-- 谱号 -->
            <view class="opt-column">
              <text class="sub-label">谱号</text>
              <view class="opt-row">
                <view
                  v-for="k in clefOptions"
                  :key="k.value"
                  class="opt-chip"
                  :class="{ active: scoreConfig.clef === k.value }"
                  @tap="setClef(k.value)"
                >
                  {{ k.label }}
                </view>
              </view>
            </view>
            <!-- 拍号 -->
            <view class="opt-column">
              <text class="sub-label">拍号</text>
              <view class="opt-row">
                <view
                  v-for="t in timeSigOptions"
                  :key="t.value"
                  class="opt-chip"
                  :class="{ active: scoreConfig.timeSig === t.value }"
                  @tap="selectTimeSig(t.value)"
                >
                  {{ t.label }}
                </view>
              </view>
            </view>
            <!-- 调号 -->
            <view class="opt-column">
              <text class="sub-label">调号</text>
              <view class="opt-row">
                <view
                  v-for="k in keySigOptions"
                  :key="k.value"
                  class="opt-chip"
                  :class="{ active: scoreConfig.keySig === k.value }"
                  @tap="selectKeySig(k.value)"
                >
                  {{ k.label }}
                </view>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <!-- 2. 音符输入工具栏 -->
      <view class="panel-section">
        <view class="panel-header">音符与记号</view>

        <!-- 音符时值 -->
        <scroll-view scroll-x class="h-scroll">
          <view class="note-list">
            <view
              v-for="d in durations"
              :key="d.id"
              class="note-card"
              :class="{ active: selected?.id === d.id }"
              @tap="selectDuration(d)"
            >
              <image class="note-icon" :src="d.icon" mode="aspectFit" />
              <text class="note-name">{{ d.label }}</text>
            </view>
          </view>
        </scroll-view>

        <!-- 临时记号 & 附点 & 功能 -->
        <view class="tools-row">
          <!-- 临时记号 -->
          <view class="tool-group">
            <view
              v-for="a in accidentals"
              :key="a.id"
              class="mini-btn"
              :class="{ active: selectedAccidental === a.value }"
              @tap="selectAccidental(a.value)"
            >
              {{ a.label }}
            </view>
          </view>

          <!-- 附点 -->
          <view class="tool-group">
            <view
              class="mini-btn"
              :class="{ active: selectedDots === 0 }"
              @tap="selectDots(0)"
              >无附点</view
            >
            <view
              class="mini-btn"
              :class="{ active: selectedDots === 1 }"
              @tap="selectDots(1)"
              >附点(.)</view
            >
          </view>

          <!-- 清空 -->
          <view class="tool-group right">
            <view class="mini-btn danger" @tap="clearAll">清空谱面</view>
          </view>
        </view>
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

const MIN_NOTE_GAP = 18;
const MAX_TRY_STEPS = 40;

let canvasTop = 0;
let canvasLeft = 0;

const canvasCssW = ref(0); // 总谱虚拟宽（给 scroll-view 占位）
const canvasCssH = ref(300);
const viewW = ref(0); // 视口宽

let scrollLeftPx = 0;
let scrollTimer = null;

function onScoreScroll(e) {
  const sl = e.detail?.scrollLeft ?? 0;
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    scrollLeftPx = sl;
    redrawScore();
    scrollTimer = null;
  }, 16);
}

// 音符时值
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
  clef: "treble",
  timeSig: "4/4",
  keySig: "C",
});

const SHARP_ORDER = ["f", "c", "g", "d", "a", "e", "b"];
const FLAT_ORDER = ["b", "e", "a", "d", "g", "c", "f"];
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

const clefOptions = [
  { label: "高音谱号", value: "treble" },
  { label: "低音谱号", value: "bass" },
  { label: "中音谱号", value: "alto" },
  { label: "次中音谱号", value: "tenor" },
];

const selected = ref(durations[2]);
const measures = ref([{ notes: [], used: 0 }]);
const selectedAccidental = ref(null);
const selectedDots = ref(0);

// canvas & renderer
let scoreNode = null;
let scoreCtx = null;
let scoreRenderer = null;
let scoreStave = null;
let cssW = 0;
let dpr = 1;

function selectDuration(d) {
  selected.value = d;
}
function clearAll() {
  measures.value = [{ notes: [], used: 0 }];
  redrawScore();
}
function selectAccidental(a) {
  selectedAccidental.value = a;
}
function selectDots(k) {
  selectedDots.value = k;
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

// ===== ticks helpers（你现阶段按 x 放置时用不到 used，但保留）=====
const TPQ = 480;
function parseTimeSig(ts) {
  const [a, b] = String(ts)
    .split("/")
    .map((x) => Number(x));
  return { beats: a || 4, beatValue: b || 4 };
}
function durationToQuarters(dur) {
  const map = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25, 32: 0.125, 64: 0.0625 };
  return map[dur] ?? 1;
}
function noteToTicks(duration, dots) {
  const base = durationToQuarters(duration) * TPQ;
  const factor = dots ? 1.5 : 1.0;
  return Math.round(base * factor);
}

function getMeasureTicks() {
  const { beats, beatValue } = parseTimeSig(scoreConfig.value.timeSig);
  const quartersPerBeat = 4 / beatValue; // 一拍等于多少个四分音符
  return Math.round(beats * quartersPerBeat * TPQ);
}
// ✅ 点哪儿放哪儿：只要 measureIndex 存在，就放到指定小节
function addNoteToMeasures(noteData) {
  const measureTicks = getMeasureTicks();
  const ticks = noteToTicks(noteData.duration, noteData.dots);

  // 1) 目标小节 = 最后一个小节（按时间顺序追加）
  let idx = measures.value.length - 1;
  let m = measures.value[idx];

  // 2) 放不下 -> 新开小节
  if (m.used + ticks > measureTicks) {
    measures.value.push({ notes: [], used: 0 });
    idx++;
    m = measures.value[idx];
  }

  // 3) 计算该小节内的 userX（优先用点击 xAbs，如果不落在该小节，就用“时间进度自动 x”）
  const marginLeft = 10;
  const measureW = 200;
  const gapX = 0;

  const headBlock = idx === 0 ? 60 : 10; // 第一小节避开谱头
  const left = headBlock;
  const right = measureW - 10;

  let userX;

  // noteData.xAbs 是“总谱逻辑 x”（已加 scrollLeftPx），用它推算落在哪个小节内
  if (typeof noteData.xAbs === "number") {
    const xInMeasure = noteData.xAbs - (marginLeft + idx * (measureW + gapX));
    // 只有当点击 x 真正在目标小节范围内，才采用它
    if (xInMeasure >= 0 && xInMeasure <= measureW) {
      userX = Math.max(left, Math.min(right, xInMeasure));
    }
  }

  // 如果点击不在目标小节范围内（或没传 xAbs），就用“按时间进度”给一个稳定的 x
  if (typeof userX !== "number") {
    const progress = measureTicks ? m.used / measureTicks : 0; // 0~1
    userX = left + progress * (right - left);
    userX = Math.max(left, Math.min(right, userX));
  }

  // 4) 写入
  m.notes.push({
    ...noteData,
    ticks,
    userX, // 小节内像素 x（用于你当前的自定义对齐绘制）
    measureIndex: idx, // 记录归属小节（绘制时用）
    offsetTicks: m.used,
  });

  // 5) 更新 used
  m.used += ticks;
}

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
function applyKeySigToKey(naturalKey, keySig) {
  const accMap = getKeySigAccidentalMap(keySig);
  const [letterRaw, octaveRaw] = String(naturalKey).split("/");
  const letter = (letterRaw || "c").toLowerCase();
  const octave = octaveRaw || "4";
  const acc = accMap[letter];
  return acc ? `${letter}${acc}/${octave}` : `${letter}/${octave}`;
}

function getStemDirectionByKey(key) {
  const midByClef = { treble: "b/4", bass: "d/3", alto: "c/4", tenor: "a/3" };
  const mid = midByClef[scoreConfig.value.clef] || "b/4";
  function toDiatonicIndex(k) {
    const m = String(k).match(/^([a-g])(bb|##|b|#|n)?\/(\d+)$/i);
    if (!m) return 0;
    const letter = m[1].toLowerCase();
    const octave = Number(m[3]);
    const order = { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 };
    return octave * 7 + order[letter];
  }
  return toDiatonicIndex(key) >= toDiatonicIndex(mid)
    ? VF.Stem.DOWN
    : VF.Stem.UP;
}

// ===== y -> key =====
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

// ===== x helpers（避免你后续调用报 isXFree 未定义）=====
function gapForDuration(dur) {
  const map = { w: 30, h: 24, q: 20, 8: 18, 16: 18, 32: 18, 64: 18 };
  return map[dur] ?? 28;
}
function isXFree(_x) {
  // 你现在未启用碰撞逻辑，这里先返回 true 兜底
  return true;
}
function placeXAvoidOverlap(xCanvasRaw) {
  // 你目前没在用它，但保留也不炸
  return xCanvasRaw;
}

// 小节可写区（绝对坐标）
function getMeasureWriteRange(stave, isFirstMeasure) {
  const left = isFirstMeasure
    ? (stave.getNoteStartX?.() ?? stave.getX() + 60)
    : stave.getX() + 10;
  const right = stave.getX() + stave.getWidth() - 10;
  return { left, right };
}

// 总宽（决定 scroll-view 可滚范围）
function calcTotalScoreWidth() {
  const marginLeft = 10;
  const measureW = 200;
  const gapX = 10;
  const paddingRight = 20;
  return marginLeft + measures.value.length * (measureW + gapX) + paddingRight;
}

function ensureCanvasSize() {
  if (!scoreNode || !scoreCtx) return;

  // 1) 虚拟总宽（scroll-view 占位）
  const wantVirtualW = Math.max(viewW.value || 0, calcTotalScoreWidth());
  if (canvasCssW.value !== wantVirtualW) canvasCssW.value = wantVirtualW;

  // 2) 实际画布宽（只画视口，性能关键）
  const wCss = viewW.value || cssW || 0;
  const hCss = canvasCssH.value;

  const targetW = Math.floor(wCss * dpr);
  const targetH = Math.floor(hCss * dpr);

  if (scoreNode.width !== targetW) scoreNode.width = targetW;
  if (scoreNode.height !== targetH) scoreNode.height = targetH;

  scoreCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

onReady(() => {
  initScoreCanvas();
});

function initScoreCanvas() {
  const q = uni.createSelectorQuery().in(instance);
  q.select("#scoreCanvas").fields({ node: true, size: true });
  q.select("#scoreWrap").boundingClientRect();

  q.exec((res) => {
    const info = res?.[0];
    const wrap = res?.[1];
    if (!info?.node || !wrap) {
      console.error("找不到 canvas node 或 scoreWrap rect");
      return;
    }

    canvasTop = wrap.top;
    canvasLeft = wrap.left;

    scoreNode = info.node;
    cssW = wrap.width;
    viewW.value = wrap.width;

    dpr = uni.getSystemInfoSync().pixelRatio || 1;
    scoreCtx = scoreNode.getContext("2d");

    canvasCssH.value = 300;
    canvasCssW.value = Math.max(cssW, calcTotalScoreWidth());

    ensureCanvasSize();
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

  if (n.accidental) note.addModifier(new VF.Accidental(n.accidental), 0);
  if (dots) VF.Dot.buildAndAttach([note], { all: true });

  return note;
}

// ✅ 核心：按“用户点击 x”硬对齐（稳定版）
function redrawScore() {
  if (!scoreRenderer || !scoreCtx) return;

  ensureCanvasSize();
  scoreCtx.clearRect(0, 0, viewW.value, canvasCssH.value);

  const context = scoreRenderer.getContext();

  const marginLeft = 10;
  const top = 30;
  const measureW = 200;
  const gapX = 0;

  const viewLeft = -50;
  const viewRight = viewW.value + 50;

  measures.value.forEach((m, i) => {
    const x = marginLeft + i * (measureW + gapX) - scrollLeftPx;
    const y = top;

    if (x + measureW < viewLeft || x > viewRight) return;

    const stave = new VF.Stave(x, y, measureW);

    if (i === 0) {
      scoreStave = stave;
      stave.addClef(scoreConfig.value.clef);
      if (scoreConfig.value.keySig)
        stave.addKeySignature(scoreConfig.value.keySig);
      if (scoreConfig.value.timeSig)
        stave.addTimeSignature(scoreConfig.value.timeSig);
    }

    if (i === measures.value.length - 1) {
      stave.setEndBarType(VF.Barline.type.END);
    } else {
      stave.setEndBarType(VF.Barline.type.SINGLE);
    }

    // stave.setEndBarType(VF.Barline.type.SINGLE);
    stave.setContext(context).draw();

    if (!m.notes?.length) return;

    // 1) 纯显示顺序：按 userX 排序
    const sortedNotes = [...m.notes].sort(
      (a, b) => (a.userX ?? 0) - (b.userX ?? 0),
    );

    // 2) 可写区（绝对坐标）
    const isFirst = i === 0;
    const { left, right } = getMeasureWriteRange(stave, isFirst);

    // 3) 每个音符独立 tickContext -> preFormat -> 用 setXShift 对齐到 desiredAbsX
    sortedNotes.forEach((n) => {
      const note = buildStaveNote(n, context, stave);

      const tc = new VF.TickContext();
      tc.addTickable(note);
      tc.preFormat(); // ✅ 让 note 成为“已格式化”状态

      // 先放到左边一个基准 x（不重要，后面会 shift 对齐）
      tc.setX(left);
      note.setTickContext(tc);

      const ux = typeof n.userX === "number" ? n.userX : 0;

      // 你存的是“小节内像素”，变成当前画布的“绝对 x”
      const desiredAbsX = Math.max(left, Math.min(right, stave.getX() + ux));

      // ✅ 当前真实绝对 x（关键：不要用 tc.getX 代替）
      const curAbsX = note.getAbsoluteX();

      // 平移到目标点
      note.setXShift(desiredAbsX - curAbsX);

      note.draw();
    });
  });
}

function getCanvasPoint(e) {
  const t = e.changedTouches?.[0] || e.touches?.[0];
  let x = e.detail?.x ?? t?.x ?? t?.clientX ?? t?.pageX;
  let y = e.detail?.y ?? t?.y ?? t?.clientY ?? t?.pageY;
  if (typeof x !== "number" || typeof y !== "number") return null;

  // 转成“总谱逻辑坐标”：x 需要 + scrollLeftPx
  x = x - canvasLeft + scrollLeftPx;
  y = y - canvasTop;

  x = Math.max(0, Math.min(canvasCssW.value, x));
  y = Math.max(0, Math.min(canvasCssH.value, y));
  return { x, y };
}

function onScoreTap(e) {
  if (!selected.value) return;
  if (!scoreStave) redrawScore();
  if (!scoreStave) return;

  const p = getCanvasPoint(e);
  if (!p) return;

  const naturalKey = yToKey(p.y);
  const key = applyKeySigToKey(naturalKey, scoreConfig.value.keySig);

  // ✅ 注意：不再根据点击 x 来决定 measureIndex
  //     只把“总谱逻辑 xAbs”传进去，让 addNoteToMeasures 在“目标小节”里判断是否采用点击 x
  addNoteToMeasures({
    key,
    duration: selected.value.duration,
    dots: selectedDots.value ?? 0,
    accidental: selectedAccidental.value ?? null,
    xAbs: p.x, // ✅ 传总谱逻辑 x
  });

  ensureCanvasSize();
  redrawScore();
}
</script>

<style lang="scss" scoped>
/* 页面背景 */
.page {
  min-height: 100vh;
  background-color: #f5f7fa;
  padding: 16px;
  box-sizing: border-box;
}

/* 顶部乐谱区域 */
.score-container {
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  margin-bottom: 20px;
}

.score-wrap {
  position: relative;
  width: 100%;
  height: 300px;
}

.score-canvas {
  position: absolute;
  left: 0;
  top: 0;
  z-index: 1;
}

.score-scroll {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2;
  background: transparent;
}

/* 控制区域整体布局 */
.controls-area {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 通用板块样式 */
.panel-section {
  background: #fff;
  border-radius: 12px;
  padding: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);

  .panel-header {
    font-size: 14px;
    font-weight: 600;
    color: #333;
    margin-bottom: 10px;
    padding-left: 4px;
    border-left: 3px solid #1677ff;
  }
}

/* 横向滚动容器 */
.h-scroll {
  width: 100%;
  white-space: nowrap;
}

/* 选项组布局 */
.opt-group {
  display: flex;
  gap: 16px;
  padding-bottom: 4px; /* 防止滚动条遮挡 */
}

.opt-column {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .sub-label {
    font-size: 12px;
    color: #999;
  }
}

.opt-row {
  display: flex;
  gap: 8px;
}

/* 小胶囊按钮 */
.opt-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 12px;
  background: #f0f2f5;
  border: 1px solid transparent;
  border-radius: 16px;
  font-size: 13px;
  color: #666;
  transition: all 0.2s;

  &.active {
    background: #e6f7ff;
    border-color: #1677ff;
    color: #1677ff;
    font-weight: 500;
  }
}

/* 音符选择列表 */
.note-list {
  display: flex;
  gap: 12px;
  padding: 4px 2px;
}

.note-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  background: #fff;
  border: 1px solid #eee;
  border-radius: 10px;
  flex-shrink: 0;
  transition: all 0.2s;

  &.active {
    border-color: #1677ff;
    background: #e6f7ff;
    box-shadow: 0 2px 8px rgba(22, 119, 255, 0.15);
  }

  .note-icon {
    width: 28px;
    height: 28px;
    margin-bottom: 4px;
  }

  .note-name {
    font-size: 11px;
    color: #666;
  }
}

/* 工具行 (记号、附点、按钮) */
.tools-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 16px;
  align-items: center;
}

.tool-group {
  display: flex;
  gap: 8px;

  &.right {
    margin-left: auto; /* 推到最右边 */
  }
}

/* 迷你功能按钮 */
.mini-btn {
  padding: 6px 12px;
  border: 1px solid #ddd;
  border-radius: 6px;
  font-size: 13px;
  color: #555;
  background: #fff;
  min-width: 24px;
  text-align: center;

  &.active {
    border-color: #1677ff;
    background: #1677ff;
    color: #fff;
  }

  &.danger {
    border-color: #ff4d4f;
    color: #ff4d4f;
    &:active {
      background: #fff1f0;
    }
  }
}
</style>
