<template>
  <view class="page">
    <button type="primary" @click="onSelectMidi">选择 MIDI 文件</button>
    <canvas
      id="scoreCanvas"
      type="2d"
      style="width: 100%; height: 800px"
    ></canvas>
  </view>
</template>

<script setup>
import { getCurrentInstance, onMounted, ref, computed } from "vue";
import Vex from "vexflow";
import { selectAndParseMidi } from "@/utils/midi/readMidi";
import { midiJsonToScoreModel } from "./midiToScoreModel.js";

const instance = getCurrentInstance();
const VF = Vex.Flow; // VexFlow 4.x 正确入口

const midiJson = ref(null);

// 缓存 canvas & ctx（避免每次都 query）
const canvasRef = ref(null);
const wxCtxRef = ref(null);
const canvasSizeRef = ref({ width: 0, height: 0 });
const dprRef = ref(1);

// 新增：控制五线谱整体缩放比例（默认1，可根据需要调整）
const scaleRatio = ref(0.5); // 0.8表示缩小到80%，1是原大小，1.2是放大到120%

const canvasOriginalSizeRef = ref({ width: 0, height: 0 }); // 原始尺寸

// 新增：计算布局用的「有效宽度」（原始宽度 ÷ 缩放比例 → 缩放越小，有效宽度越大）
const layoutEffectiveWidth = computed(() => {
  const originalWidth = canvasOriginalSizeRef.value.width || 300;
  return originalWidth / scaleRatio.value; // 关键公式
});

/* ===============================
 * 获取微信小程序 canvas node + 2d ctx
 * =============================== */
function getWxCanvas2D(canvasId) {
  return new Promise((resolve, reject) => {
    // ✅ 建议加 .in(instance)，避免组件作用域找不到节点
    const query = uni.createSelectorQuery().in(instance);
    query
      .select(`#${canvasId}`)
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res && res[0];
        if (!item || !item.node)
          return reject(new Error("canvas node not found"));
        const canvas = item.node;
        const ctx = canvas.getContext("2d");
        resolve({ canvas, ctx, width: item.width, height: item.height });
      });
  });
}

function applyDots(note, dots) {
  const n = Number(dots) || 0;
  if (n > 0 && note instanceof VF.StaveNote) {
    for (let i = 0; i < n; i++) {
      note.addModifier(new VF.Dot()); // 用 addModifier 添加附点
    }
  }
}

// 新增：重置Canvas状态并应用当前缩放
function resetCanvasScale() {
  if (!wxCtxRef.value || !canvasRef.value) return;

  const ctx = wxCtxRef.value;
  const canvas = canvasRef.value;
  const dpr = dprRef.value;
  const currentScale = scaleRatio.value;

  // 1. 重置Canvas变换矩阵到初始状态（关键：清除之前的所有缩放/平移）
  if (ctx.setTransform) {
    ctx.setTransform(1, 0, 0, 1, 0, 0); // 重置变换矩阵
  } else {
    ctx.resetTransform(); // 兼容写法
  }

  // 2. 重新设置Canvas尺寸（避免重复渲染导致模糊）
  canvas.width = canvasSizeRef.value.width * dpr;
  canvas.height = canvasSizeRef.value.height * dpr;

  // 3. 重新应用DPR + 当前缩放比例（仅一次，不叠加）
  ctx.scale(dpr * currentScale, dpr * currentScale);

  // 4. 同步更新实际可用尺寸
  canvasSizeRef.value = {
    width: canvasSizeRef.value.width / currentScale,
    height: canvasSizeRef.value.height / currentScale,
  };
}

/* ===============================
 * 渲染：scoreModel -> canvas
 * =============================== */
function renderScoreModelToCanvas(scoreModel, wx2dCtx, opts = {}) {
  const Renderer = VF.Renderer;
  const Stave = VF.Stave;
  const StaveNote = VF.StaveNote;
  const Voice = VF.Voice;
  const Formatter = VF.Formatter;
  const Beam = VF.Beam;
  const Tuplet = VF.Tuplet;
  const StaveTie = VF.StaveTie;
  const Accidental = VF.Accidental;

  // 新增：渲染前先重置Canvas缩放状态（核心修复）
  resetCanvasScale();

  // 小程序环境：用 proxy 更稳（如果你的构建产物支持这个开关）
  if (Renderer && "USE_CANVAS_PROXY" in Renderer) {
    Renderer.USE_CANVAS_PROXY = true;
  }

  // 关键：bolsterCanvasContext 在 VF.Renderer 上
  const ctx = VF.CanvasContext ? new VF.CanvasContext(wx2dCtx) : wx2dCtx;

  // // 新增：给VexFlow上下文应用缩放（和Canvas保持一致）
  // const currentScale = opts.scaleFactor || scaleRatio.value;
  // ctx.scale(currentScale, currentScale);

  // 清屏
  // 清屏（注意缩放后清屏范围也要对应调整）
  // const clearWidth = canvasSizeRef.value.width / currentScale;
  // const clearHeight = canvasSizeRef.value.height / currentScale;
  if (ctx.clear) ctx.clear();
  else if (ctx.clearRect) ctx.clearRect(0, 0, 9999, 9999);

  const part = scoreModel?.parts?.[0];
  if (!part) return;

  const staffId = opts.staff ?? "treble";
  const staveX0 = opts.x ?? 0; // 小节起始位置 x
  const staveY0 = opts.y ?? 10; // 小节起始位置 y
  const gapX = opts.gapX ?? 0; // 小节之间的间距
  // const maxLineWidth = canvasSizeRef.value.width ?? 300; // 每行的最大宽度
  // 关键：换行判断用「有效宽度」（和缩放联动）
  const maxLineWidth = layoutEffectiveWidth.value ?? 300;
  const lineHeight = opts.lineHeight ?? 80; // 每行的高度，保证足够容纳音符

  let currentLineWidth = 0; // 当前行的总宽度
  let currentLineY = staveY0; // 当前行的y坐标
  let x = staveX0; // 当前小节的起始横坐标
  let y = currentLineY; // 当前小节的纵坐标

  const eventNoteMap = new Map(); // eventId -> StaveNote

  // 获取调号
  const keySignature = scoreModel.header.keySignatures?.[0];
  const key = keySignature ? keySignature.key : null;
  createData(part.measures, staffId);

  //渲染每个小节
  for (let i = 0; i < part.measures.length; i++) {
    const m = part.measures[i];
    const voiceModel = m.voices?.[staffId];
    if (!voiceModel) continue;

    // 检查小节是否为空（仅包含休止符）
    const hasNotes = voiceModel.events.some((ev) => ev.type !== "rest");

    // 如果小节只有休止符，则跳过渲染
    if (!hasNotes) continue;

    // 1) 按 “小节+有效音符序号” 上色
    const highlightByIndex = opts.highlightByIndex || {};
    const idxColorMap = highlightByIndex[m.index] || {}; // 当前小节的规则

    // eventId -> color （只针对 note）
    const eventIdColorMap = new Map();

    // 有效音符计数（跳过 rest）
    let noteCounter = 0;

    // 注意：这里假设 voiceModel.events 已经按 startTick 排序过
    for (const ev of voiceModel.events) {
      if (ev.type !== "note") continue;

      const c = idxColorMap[noteCounter];
      if (c && ev.id) eventIdColorMap.set(ev.id, c);

      noteCounter++;
    }

    // 计算当前小节的宽度（包含小节间距）
    // const currentStaveWidth = staveW + gapX;
    const currentStaveWidth = m?.staveWidth + gapX;

    // 计算下一个小节的宽度（如果存在）
    const exceed = i > 0 && currentLineWidth + currentStaveWidth > maxLineWidth;
    if (exceed) {
      // 换行：重置当前行宽度为 0
      currentLineWidth = 0;
      currentLineY += lineHeight; // 行高增加
      y = currentLineY; // 更新当前y坐标
      x = staveX0; // 换行后x坐标重置
    }

    // 1) 画小节线
    const stave = new Stave(x, y, m.staveWidth - 1);
    const isFirstMeasure = m.index === 0;

    if (isFirstMeasure || (i > 0 && currentLineWidth === 0)) {
      stave.addClef(staffId === "bass" ? "bass" : "treble");
      if (isFirstMeasure) {
        stave.addTimeSignature(`${m.timeSignature[0]}/${m.timeSignature[1]}`);
      }
      // 添加调号
      if (key) {
        stave.addKeySignature(key); // 添加调号
      }
    } else {
      // 中间小节不画左边竖线
      // if (Barline?.type) stave.setBegBarType(Barline.type.NONE);
    }

    stave.setContext(ctx).draw();

    // 用于 beam 根据 eventId 找回 event 数据
    const eventModelMap = new Map();
    for (const ev of voiceModel.events) {
      if (ev.id) eventModelMap.set(ev.id, ev);
    }
    // 2) events -> tickables
    const tickables = [];
    for (const ev of voiceModel.events) {
      // const color = resolveHighlightColor(ev, m, hl);

      if (ev.type === "rest") {
        const restNote = new StaveNote({
          clef: staffId === "bass" ? "bass" : "treble",
          keys: ["b/4"],
          duration: ev.vf.duration,
          dots: ev.vf.dots || 0,
        });

        tickables.push(restNote);
        if (ev.id) eventNoteMap.set(ev.id, restNote);
        continue;
      }

      const note = new StaveNote({
        clef: staffId === "bass" ? "bass" : "treble",
        keys: ev.vf.keys,
        duration: ev.vf.duration,
        dots: ev.vf.dots || 0,
      });

      // 临时记号
      if (ev.vf.accidentals) {
        Object.entries(ev.vf.accidentals).forEach(([idx, acc]) => {
          note.addModifier(new Accidental(acc), Number(idx));
        });
      }

      // 按 “小节+有效音符序号” 的配置上色
      const color = ev.id ? eventIdColorMap.get(ev.id) : null;
      if (color && typeof note.setStyle === "function") {
        note.setStyle({ strokeStyle: color, fillStyle: color });
      }

      // 添加附点
      applyDots(note, ev.vf.dots);

      tickables.push(note);
      if (ev.id) eventNoteMap.set(ev.id, note);
    }

    // 3) Voice + 排版
    const vfVoice = new Voice({
      num_beats: m.timeSignature[0],
      beat_value: m.timeSignature[1],
    }).addTickables(tickables);

    const formatter = new Formatter().joinVoices([vfVoice]);
    formatter.preCalculateMinTotalWidth([vfVoice]);
    let voiceWidth = formatter.getMinTotalWidth();
    if (isFirstMeasure) voiceWidth = currentStaveWidth - 100;
    if (x === staveX0 && !isFirstMeasure) voiceWidth = currentStaveWidth - 60;
    if (x !== staveX0 && !isFirstMeasure) voiceWidth = currentStaveWidth - 20;
    formatter.format([vfVoice], voiceWidth);

    // 4) beams
    const vfBeams = [];
    for (const b of voiceModel.beams || []) {
      const ids = b.eventIds || [];
      const notesForBeam = ids
        .map((id) => eventNoteMap.get(id))
        .filter(Boolean);

      if (notesForBeam.length >= 2) {
        const beam = new Beam(notesForBeam);

        const ids = b.eventIds || [];
        const colors = ids.map((id) => eventIdColorMap.get(id)).filter(Boolean);
        const beamColor = colors.length ? colors[0] : null;

        // 如果这一组都同色才染色
        const same =
          colors.length === ids.length && colors.every((x) => x === colors[0]);

        if (same && beamColor && typeof beam.setStyle === "function") {
          beam.setStyle({ strokeStyle: beamColor, fillStyle: beamColor });
        }

        vfBeams.push(beam);
      }
    }

    // 先画音符
    vfVoice.draw(ctx, stave);

    // 再画 beams
    for (const beam of vfBeams) {
      beam.setContext(ctx).draw();
    }

    // 5) tuplets
    const vfTuplets = [];
    for (const t of voiceModel.tuplets || []) {
      const notesForTuplet = (t.eventIds || [])
        .map((id) => eventNoteMap.get(id))
        .filter(Boolean);
      if (notesForTuplet.length >= 2) {
        vfTuplets.push(
          new Tuplet(notesForTuplet, {
            num_notes: t.numNotes,
            notes_occupied: t.notesOccupied,
          })
        );
      }
    }
    for (const tuplet of vfTuplets) {
      tuplet.setContext(ctx).draw();
    }

    // 6) ties
    for (const tieModel of voiceModel.ties || []) {
      const first = eventNoteMap.get(tieModel.fromId);
      const last = eventNoteMap.get(tieModel.toId);
      if (first && last) {
        const tie = new StaveTie({ first_note: first, last_note: last });
        tie.setContext(ctx).draw();
      }
    }

    // 更新小节的 x 位置和当前行宽度
    x += currentStaveWidth + gapX;
    currentLineWidth += currentStaveWidth; // 更新当前行宽度
  }
  // 恢复 Canvas 状态
  // ctx.restore();
  return { eventNoteMap };
}

/* ===============================
 * 用户点击：选择 MIDI -> 转换 -> 渲染
 * =============================== */
async function onSelectMidi() {
  try {
    const midi = await selectAndParseMidi();
    midiJson.value = midi;

    // ✅ 这里才生成 scoreModel
    const scoreModel = midiJsonToScoreModel(midi, {
      // 你想传的 options 都在这里
      forceSingleStaff: "treble",
      allowDottedBeam: true,
      // ...其它
    });

    console.log("scoreModel", scoreModel);

    // ✅ 确保 ctx 已初始化
    if (!wxCtxRef.value) {
      console.warn("canvas ctx not ready yet");
      return;
    }

    renderScoreModelToCanvas(scoreModel, wxCtxRef.value, {
      staff: "treble",
      measureWidth: 220,
      gapX: 0, //小节空隙
      highlightByIndex: {
        // 小节 index -> (有效音符序号 -> 颜色)
        1: { 0: "#1f5eff", 1: "#1f5eff", 2: "#1f5eff" }, // 第0小节的第0/1/2个有效音符
        3: { 0: "#ff3b30", 1: "#ff3b30", 2: "#ff3b30", 3: "#ff3b30" }, // 第3小节的第1/2个有效音符染红
      },
      // scaleFactor: 0.5,
    });
  } catch (e) {
    console.error("❌ MIDI 加载失败", e);
  }
}

/* ===============================
 * 初始化 canvas（只做一次）
 * =============================== */
onMounted(async () => {
  const { canvas, ctx, width, height } = await getWxCanvas2D("scoreCanvas");

  canvasRef.value = canvas;
  wxCtxRef.value = ctx;
  canvasSizeRef.value = { width, height };

  // DPR 处理：注意每次设置 width/height 会重置 transform，所以要在设置后 scale
  const dpr = uni.getSystemInfoSync().pixelRatio || 1;
  dprRef.value = dpr;

  canvas.width = width * dpr;
  canvas.height = height * dpr;

  // 首次初始化缩放
  resetCanvasScale();

  // 重置缩放，避免重复 mounted/热更新时叠加
  // if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  // ctx.scale(dpr, dpr);

  // // 关键：同步更新canvasSizeRef的宽高（因为缩放后实际可用宽度会变化）
  // canvasSizeRef.value = {
  //   width: width / scaleRatio.value,
  //   height: height / scaleRatio.value,
  // };
});

const createData = (measures, staffId) => {
  let scoreWidth = {};
  for (let i = 0; i < measures.length; i++) {
    const m = measures[i];
    const staveWidth = getMinVoiceWidth(m, staffId, i);
    if (staveWidth !== 0) scoreWidth[i] = staveWidth;
  }
  // 关键：布局宽度计算用「有效宽度」（和缩放联动）
  // const res = layoutWidthsObject(scoreWidth, canvasSizeRef.value.width);
  const res = layoutWidthsObject(scoreWidth, layoutEffectiveWidth.value);
  Object.keys(res).forEach((key) => {
    measures[key].staveWidth = res[key];
  });
};
/** 获取voiceWidth */
function getMinVoiceWidth(m, staffId, i) {
  const voiceModel = m.voices?.[staffId];
  const StaveNote = VF.StaveNote;
  const Voice = VF.Voice;
  const Formatter = VF.Formatter;
  if (!voiceModel) return;

  // 检查小节是否为空（仅包含休止符）
  const hasNotes = voiceModel.events.some((ev) => ev.type !== "rest");

  // 如果小节只有休止符，则跳过渲染
  if (!hasNotes) return 0;
  const tickables = [];
  for (const ev of voiceModel.events) {
    if (ev.type === "rest") {
      tickables.push(
        new StaveNote({
          clef: staffId === "bass" ? "bass" : "treble",
          keys: ["b/4"], // 占位 key
          duration: ev.vf.duration,
          dots: ev.vf.dots || 0,
        })
      );
    }

    const note = new StaveNote({
      clef: staffId === "bass" ? "bass" : "treble",
      keys: ev.vf.keys,
      duration: ev.vf.duration,
      dots: ev.vf.dots || 0,
    });

    // 添加附点
    applyDots(note, ev.vf.dots);

    tickables.push(note);
    // if (ev.id) eventNoteMap.set(ev.id, note);
  }

  // 3) Voice + 排版
  const vfVoice = new Voice({
    num_beats: m.timeSignature[0],
    beat_value: m.timeSignature[1],
  }).addTickables(tickables);

  const formatter = new Formatter().joinVoices([vfVoice]);
  formatter.preCalculateMinTotalWidth([vfVoice]);
  // 第一小节加上表头100
  if (i === 0) return formatter.getMinTotalWidth() + 100;
  // 其他小节加上音符20左右间距
  return formatter.getMinTotalWidth() + 20;
}
function layoutWidthsObject(widthMap, lineWidth, indent = 60) {
  const keys = Object.keys(widthMap)
    .map(Number)
    .sort((a, b) => a - b);

  const result = {};
  let lineItems = []; // 当前行参与布局的 key
  let lineSum = 0;
  let lineIndex = 0;

  function flushLine() {
    if (lineItems.length === 0) return;

    const effectiveWidth = lineIndex === 0 ? lineWidth : lineWidth - indent;

    const remaining = effectiveWidth - lineSum;
    const extra = remaining / lineItems.length;

    // 均分
    for (const k of lineItems) {
      result[k] = widthMap[k] + extra;
    }

    // 第二行开始：indent 加到第一个非 0 元素
    if (lineIndex > 0) {
      result[lineItems[0]] += indent;
    }

    lineItems = [];
    lineSum = 0;
    lineIndex++;
  }

  for (const k of keys) {
    const w = widthMap[k];

    // width = 0：直接返回 0，不参与布局
    if (w === 0) {
      result[k] = 0;
      continue;
    }

    const effectiveWidth = lineIndex === 0 ? lineWidth : lineWidth - indent;

    if (lineSum + w > effectiveWidth) {
      flushLine();
    }

    lineItems.push(k);
    lineSum += w;
  }

  // 最后一行
  flushLine();

  return result;
}
</script>
<style scoped>
.page {
  margin-top: 10vh;
  padding: 32rpx;
  box-sizing: border-box;
}
.status {
  margin-top: 24rpx;
  color: #666;
}
</style>
