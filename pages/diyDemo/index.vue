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

// ==========================================
// 1. 基础常量与选项定义
// ==========================================
const MIN_MEASURE_WIDTH = 120; // 普通小节音符区最小宽度
const MEASURE_PADDING_RIGHT = 30; // 小节末尾留白，防止音符挤到小节线上
const TPQ = 480;

/** 动态计算第一小节头部符号的总宽度 */
function getHeaderWidth() {
  let width = 40; // 谱号
  const keySig = scoreConfig.value?.keySig || "C";
  const accInfo = KEY_SIG_ACC_COUNT[keySig] || { count: 0 };
  width += accInfo.count * 10; // 调号
  width += 35; // 拍号
  return width;
}

// 第一小节初始总宽度
const getFirstMeasureMinWidth = () => getHeaderWidth() + MIN_MEASURE_WIDTH;

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

const clefOptions = [
  { label: "高音谱号", value: "treble" },
  { label: "低音谱号", value: "bass" },
  { label: "中音谱号", value: "alto" },
  { label: "次中音谱号", value: "tenor" },
];

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

// ==========================================
// 2. 响应式状态
// ==========================================
const scoreConfig = ref({ clef: "treble", timeSig: "4/4", keySig: "C" });
const measures = ref([{ notes: [], used: 0, width: 230 }]); // 初始给定一个大概宽度
const selected = ref(durations[2]);
const selectedAccidental = ref(null);
const selectedDots = ref(0);

const canvasCssW = ref(0);
const canvasCssH = ref(300);
const viewW = ref(0);

// ==========================================
// 3. 内部变量
// ==========================================
let canvasTop = 0;
let canvasLeft = 0;
let scrollLeftPx = 0;
let scrollTimer = null;
let scoreNode = null;
let scoreCtx = null;
let scoreRenderer = null;
let scoreStave = null;
let cssW = 0;
let dpr = 1;

// ==========================================
// 4. 音乐理论与坐标计算工具
// ==========================================

function getNoteStartOffset(measureIndex) {
  return measureIndex === 0 ? getHeaderWidth() : 20;
}

function updateMeasureWidth(measureIndex) {
  const m = measures.value[measureIndex];
  if (!m) return;
  const headerW = getNoteStartOffset(measureIndex);
  const minW = headerW + MIN_MEASURE_WIDTH;

  const maxRelX =
    m.notes.length > 0 ? Math.max(...m.notes.map((n) => n.relX || 0)) : 0;

  m.width = Math.max(minW, headerW + maxRelX + MEASURE_PADDING_RIGHT);
}

function getMeasureX(measureIndex) {
  let x = 10;
  for (let i = 0; i < measureIndex; i++) {
    x += measures.value[i].width || MIN_MEASURE_WIDTH;
  }
  return x;
}

function calcTotalScoreWidth() {
  let total = 10;
  measures.value.forEach((m) => (total += m.width || 200));
  return total + 50;
}

function parseTimeSig(ts) {
  const [a, b] = String(ts).split("/").map(Number);
  return { beats: a || 4, beatValue: b || 4 };
}

function noteToTicks(duration, dots) {
  const map = { w: 4, h: 2, q: 1, 8: 0.5, 16: 0.25, 32: 0.125, 64: 0.0625 };
  const base = (map[duration] ?? 1) * TPQ;
  return Math.round(base * (dots ? 1.5 : 1.0));
}

function getMeasureTicks() {
  const { beats, beatValue } = parseTimeSig(scoreConfig.value.timeSig);
  return Math.round(beats * (4 / beatValue) * TPQ);
}

function applyKeySigToKey(naturalKey, keySig) {
  const info = KEY_SIG_ACC_COUNT[keySig] || { count: 0 };
  const map = {};
  const order = info.type === "sharp" ? SHARP_ORDER : FLAT_ORDER;
  for (let i = 0; i < info.count; i++)
    map[order[i]] = info.type === "sharp" ? "#" : "b";

  const [letterRaw, octaveRaw] = String(naturalKey).split("/");
  const letter = (letterRaw || "c").toLowerCase();
  const acc = map[letter];
  return acc
    ? `${letter}${acc}/${octaveRaw || "4"}`
    : `${letter}/${octaveRaw || "4"}`;
}

function getStemDirectionByKey(key) {
  const midByClef = { treble: "b/4", bass: "d/3", alto: "c/4", tenor: "a/3" };
  const mid = midByClef[scoreConfig.value.clef] || "b/4";
  const toDiatonic = (k) => {
    const m = String(k).match(/^([a-g])(bb|##|b|#|n)?\/(\d+)$/i);
    return m
      ? Number(m[3]) * 7 +
          { c: 0, d: 1, e: 2, f: 3, g: 4, a: 5, b: 6 }[m[1].toLowerCase()]
      : 0;
  };
  return toDiatonic(key) >= toDiatonic(mid) ? VF.Stem.DOWN : VF.Stem.UP;
}

function yToKey(y) {
  if (!scoreStave) return "c/4";
  const stepSize = scoreStave.getSpacingBetweenLines() / 2;
  const bottomLineY = scoreStave.getYForLine(4);
  let step = Math.round((bottomLineY - y) / stepSize);
  const letters = ["c", "d", "e", "f", "g", "a", "b"];
  const base =
    { bass: "g/2", alto: "f/3", tenor: "d/3", treble: "e/4" }[
      scoreConfig.value.clef
    ] || "e/4";
  let [bL, bO] = base.split("/");
  let idx = letters.indexOf(bL),
    oct = Number(bO);
  for (let i = 0; i < Math.abs(step); i++) {
    if (step > 0) {
      idx++;
      if (idx > 6) {
        idx = 0;
        oct++;
      }
    } else {
      idx--;
      if (idx < 0) {
        idx = 6;
        oct--;
      }
    }
  }
  return `${letters[idx]}/${oct}`;
}

/**
 * 根据拍号返回 Beam 的分组规则
 */
function getBeamGroups(timeSig) {
  const [beats, beatValue] = String(timeSig).split("/").map(Number);

  if (beats === 6 && beatValue === 8) {
    // 6/8 拍：每 3 个八分音符一组
    return [new VF.Fraction(3, 8)];
  } else if (beats === 12 && beatValue === 8) {
    // 12/8 拍：每 3 个八分音符一组
    return [new VF.Fraction(3, 8)];
  } else if (beatValue === 4) {
    // 2/4, 3/4, 4/4 拍：按 1 拍（2个八分音符）分组更整齐
    return [new VF.Fraction(1, 4)];
  }

  return [new VF.Fraction(1, 4)]; // 默认
}

// ==========================================
// 5. 核心绘图与渲染逻辑
// ==========================================

function ensureCanvasSize() {
  if (!scoreNode || !scoreCtx) return;
  canvasCssW.value = Math.max(viewW.value || 0, calcTotalScoreWidth());
  scoreNode.width = Math.floor(viewW.value * dpr);
  scoreNode.height = Math.floor(canvasCssH.value * dpr);
  scoreCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function buildStaveNote(n, context, stave) {
  // 检查是否是短时值音符（需要连杠的）
  const isBeamable = ["8", "16", "32", "64"].includes(n.duration);

  const note = new VF.StaveNote({
    clef: scoreConfig.value.clef,
    keys: [n.key],
    duration: n.duration,
    // 如果是需要连杠的音符，初始方向给 AUTO (null)，让 Beam 逻辑去决定
    stem_direction: isBeamable ? null : getStemDirectionByKey(n.key),
  });

  note.setContext(context).setStave(stave);
  if (n.accidental) note.addModifier(new VF.Accidental(n.accidental), 0);
  if (n.dots) VF.Dot.buildAndAttach([note], { all: true });
  return note;
}

function redrawScore() {
  if (!scoreRenderer || !scoreCtx) return;
  ensureCanvasSize();

  scoreCtx.clearRect(0, 0, viewW.value, canvasCssH.value);
  const context = scoreRenderer.getContext();

  let currentXAbs = 10;
  measures.value.forEach((m, i) => {
    updateMeasureWidth(i);
    const measureW = m.width;
    const x = currentXAbs - scrollLeftPx;
    const y = 30;

    if (x + measureW >= -50 && x <= viewW.value + 50) {
      const stave = new VF.Stave(x, y, measureW);
      if (i === 0) {
        scoreStave = stave;
        stave
          .addClef(scoreConfig.value.clef)
          .addKeySignature(scoreConfig.value.keySig)
          .addTimeSignature(scoreConfig.value.timeSig);
      }
      stave.setEndBarType(
        i === measures.value.length - 1
          ? VF.Barline.type.END
          : VF.Barline.type.SINGLE,
      );
      stave.setContext(context).draw();

      if (m.notes?.length) {
        const writingStart = stave.getNoteStartX();
        const fallbackStart = stave.getX() + getNoteStartOffset(i);
        const actualStart =
          writingStart > stave.getX() ? writingStart : fallbackStart;

        // 1. 【重要】按坐标对音符数据进行排序，防止连杠交叉
        const sortedNoteData = [...m.notes].sort(
          (a, b) => (a.relX || 0) - (b.relX || 0),
        );

        const staveNotes = [];
        sortedNoteData.forEach((n) => {
          const note = buildStaveNote(n, context, stave);

          const tc = new VF.TickContext().addTickable(note).preFormat();
          tc.setX(0);
          note.setTickContext(tc);

          const desiredAbsX = actualStart + (n.relX || 0);
          const currentX = note.getAbsoluteX();
          note.setXShift(desiredAbsX - currentX);

          staveNotes.push(note);
        });

        // 2. 生成 Beam
        try {
          // 使用 generateBeams 时，第二个参数非常重要
          const beams = VF.Beam.generateBeams(staveNotes, {
            groups: getBeamGroups(scoreConfig.value.timeSig),
            // 允许 Beam 自动修改音符的符干方向，以解决图片中“打架”的问题
            maintain_stem_directions: false,
          });

          // 3. 先画音符
          staveNotes.forEach((sn) => sn.setContext(context).draw());

          // 4. 再画符杠
          beams.forEach((b) => {
            b.setContext(context).draw();
          });
        } catch (e) {
          // 如果自动生成失败，回退到只画音符
          staveNotes.forEach((sn) => sn.setContext(context).draw());
          console.error("Beam error:", e);
        }
      }
    }
    currentXAbs += measureW;
  });
}
// ==========================================
// 6. 交互处理
// ==========================================

function onScoreTap(e) {
  if (!selected.value) return;
  const p = getCanvasPoint(e);
  if (!p) return;

  // 确保有 stave 用于计算坐标
  if (!scoreStave) redrawScore();

  const naturalKey = yToKey(p.y);
  const key = applyKeySigToKey(naturalKey, scoreConfig.value.keySig);

  addNoteToMeasures({
    key,
    duration: selected.value.duration,
    dots: selectedDots.value ?? 0,
    accidental: selectedAccidental.value ?? null,
    xAbs: p.x,
  });
}

function addNoteToMeasures(noteData) {
  const measureTicks = getMeasureTicks();
  const ticks = noteToTicks(noteData.duration, noteData.dots);

  let targetIdx = -1;
  let accX = 10;
  for (let i = 0; i < measures.value.length; i++) {
    const w = measures.value[i].width;
    if (noteData.xAbs >= accX && noteData.xAbs <= accX + w) {
      targetIdx = i;
      break;
    }
    accX += w;
  }
  if (targetIdx === -1) targetIdx = measures.value.length - 1;

  let m = measures.value[targetIdx];
  if (m.used + ticks > measureTicks) {
    targetIdx = measures.value.length - 1;
    m = measures.value[targetIdx];
    if (m.used + ticks > measureTicks) {
      measures.value.push({
        notes: [],
        used: 0,
        width: MIN_MEASURE_WIDTH + 20,
      });
      targetIdx++;
      m = measures.value[targetIdx];
    }
  }

  const mX = getMeasureX(targetIdx);
  const offset = getNoteStartOffset(targetIdx);
  let relX = noteData.xAbs - (mX + offset);
  if (relX < 0) relX = 0;

  m.notes.push({ ...noteData, ticks, relX, measureIndex: targetIdx });
  m.used += ticks;

  updateMeasureWidth(targetIdx);
  redrawScore();
}

function getCanvasPoint(e) {
  const t = e.changedTouches?.[0] || e.touches?.[0];
  let x = e.detail?.x ?? t?.x ?? t?.clientX ?? t?.pageX;
  let y = e.detail?.y ?? t?.y ?? t?.clientY ?? t?.pageY;
  if (typeof x !== "number" || typeof y !== "number") return null;
  return {
    x: x - canvasLeft + scrollLeftPx,
    y: y - canvasTop,
  };
}

function initScoreCanvas() {
  const q = uni.createSelectorQuery().in(instance);
  q.select("#scoreCanvas").fields({ node: true, size: true });
  q.select("#scoreWrap").boundingClientRect();
  q.exec((res) => {
    if (!res?.[0]?.node) return;
    const info = res[0],
      wrap = res[1];
    canvasTop = wrap.top;
    canvasLeft = wrap.left;
    scoreNode = info.node;
    cssW = wrap.width;
    viewW.value = wrap.width;
    dpr = uni.getSystemInfoSync().pixelRatio || 1;
    scoreCtx = scoreNode.getContext("2d");
    scoreRenderer = new VF.Renderer(scoreNode, VF.Renderer.Backends.CANVAS);
    redrawScore();
  });
}

function onScoreScroll(e) {
  const sl = e.detail?.scrollLeft ?? 0;
  if (scrollTimer) return;
  scrollTimer = setTimeout(() => {
    scrollLeftPx = sl;
    redrawScore();
    scrollTimer = null;
  }, 16);
}

// UI 绑定
function selectDuration(d) {
  selected.value = d;
}
function selectAccidental(a) {
  selectedAccidental.value = a;
}
function selectDots(k) {
  selectedDots.value = k;
}
function clearAll() {
  measures.value = [{ notes: [], used: 0, width: getFirstMeasureMinWidth() }];
  redrawScore();
}
function setClef(v) {
  scoreConfig.value.clef = v;
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

onReady(initScoreCanvas);
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
