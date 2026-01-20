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
        <view class="note-label">{{ d.label }}</view>
      </view>

      <view class="note-btn danger" @tap="clearAll">
        <view class="danger-text">清空</view>
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

const selected = ref(durations[2]); // 默认四分音符

// 记录已放入谱面的音符：{ key: "e/4", duration: "q" }
const notes = ref([]);

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
  notes.value = [];
  redrawScore();
}

// =============== 核心：y -> 音高 key（treble，按线/间吸附） ===============
/**
 * 以高音谱号为例：
 * 底线（第 5 线）是 E4，然后往上依次：
 * E4(线) F4(间) G4(线) A4(间) B4(线) C5(间) D5(线) E5(间) F5(线) ...
 */
function yToKey_Treble(y) {
  if (!scoreStave) return "e/4";

  const spacing = scoreStave.getSpacingBetweenLines(); // 相邻线的距离（px）
  const stepSize = spacing / 2; // 线/间的步长
  const bottomLineY = scoreStave.getYForLine(4); // line=4 是底线（VexFlow：0 顶线，4 底线）

  // step=0 表示底线 E4；step=1 表示 F4（底线与第二线之间的间）
  let step = Math.round((bottomLineY - y) / stepSize);

  // 限制范围，避免点太高/太低导致疯狂飙 octave
  step = Math.max(-10, Math.min(14, step));

  return diatonicStepToKeyFromE4(step);
}

/**
 * 从 E4 开始按自然音阶（不带升降号）走 step 步，返回 vexflow key 格式：比如 "c/5"
 */
function diatonicStepToKeyFromE4(step) {
  const letters = ["c", "d", "e", "f", "g", "a", "b"];
  // E 在 letters 里是 index=2
  let letterIndex = 2;
  let octave = 4;

  // 往上
  if (step > 0) {
    for (let i = 0; i < step; i++) {
      // 下一音名
      letterIndex += 1;
      if (letterIndex >= 7) {
        letterIndex = 0; // 回到 c
        octave += 1; // b -> c 需要进一个八度
      }
    }
  }

  // 往下
  if (step < 0) {
    for (let i = 0; i < Math.abs(step); i++) {
      letterIndex -= 1;
      if (letterIndex < 0) {
        letterIndex = 6; // 回到 b
        octave -= 1; // c -> b 需要退一个八度
      }
    }
  }

  return `${letters[letterIndex]}/${octave}`;
}

// =============== 初始化：主谱面 + 底部图标 canvas ===============
onReady(() => {
  initScoreCanvas();
  initDurationIcons();
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

function initDurationIcons() {
  // 每个小图标 canvas 单独渲染一个“该时值的音符”
  durations.forEach((d) => {
    const id = `#icon_${d.id}`;
    const q = uni.createSelectorQuery().in(instance);
    q.select(id)
      .fields({ node: true, size: true })
      .exec((res) => {
        const info = res?.[0];
        if (!info?.node) return;

        const node = info.node;
        const w = info.width;
        const h = info.height;

        const localDpr = uni.getSystemInfoSync().pixelRatio || 1;
        node.width = Math.floor(w * localDpr);
        node.height = Math.floor(h * localDpr);

        const ctx = node.getContext("2d");
        ctx.scale(localDpr, localDpr);

        const r = new VF.Renderer(node, VF.Renderer.Backends.CANVAS);
        const context = r.getContext();

        // 清屏
        ctx.clearRect(0, 0, w, h);

        // 画一个很短的小谱表，放一个固定音高 c/4 的音符作为图标
        const stave = new VF.Stave(2, 8, w - 4);
        stave.setContext(context).draw();

        const note = new VF.StaveNote({
          clef: "treble",
          keys: ["c/4"],
          duration: d.duration,
        });

        const voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        voice.setStrict(false);
        voice.addTickables([note]);

        new VF.Formatter().joinVoices([voice]).format([voice], w - 20);
        voice.draw(context, stave);
      });
  });
}

// =============== 重绘主谱面（每次点击都全量重绘，MVP 最稳） ===============
function redrawScore() {
  if (!scoreRenderer || !scoreCtx) return;

  // 清屏（注意我们已经 scale 过，所以用 css 尺寸清）
  scoreCtx.clearRect(0, 0, cssW, cssH);

  const context = scoreRenderer.getContext();

  // 五线谱
  scoreStave = new VF.Stave(10, 40, cssW - 20);
  scoreStave.addClef("treble").addTimeSignature("4/4");
  scoreStave.setContext(context).draw();

  if (notes.value.length === 0) return;

  const tickables = notes.value.map((n) => {
    return new VF.StaveNote({
      clef: "treble",
      keys: [n.key],
      duration: n.duration,
    });
  });

  const voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
  voice.setStrict(false);
  voice.addTickables(tickables);

  new VF.Formatter().joinVoices([voice]).format([voice], cssW - 60);
  voice.draw(context, scoreStave);
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

  const p = getCanvasPoint(e);
  if (!p) return;

  const key = yToKey_Treble(p.y);

  notes.value.push({
    key,
    duration: selected.value.duration,
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
  height: 520px;
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
  width: 92px;
  padding: 10px 8px;
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
  width: 40px;
  height: 40px;
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
</style>
