<template>
  <view class="page">
    <button type="primary" @click="onSelectMidi">选择 MIDI 文件</button>
    <canvas
      id="scoreCanvas"
      type="2d"
      style="width: 750rpx; height: 800px"
    ></canvas>
  </view>
</template>

<script setup>
import { getCurrentInstance, onMounted, ref } from "vue";
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

  // 小程序环境：用 proxy 更稳（如果你的构建产物支持这个开关）
  if (Renderer && "USE_CANVAS_PROXY" in Renderer) {
    Renderer.USE_CANVAS_PROXY = true;
  }

  // 关键：bolsterCanvasContext 在 VF.Renderer 上
  const ctx = VF.CanvasContext ? new VF.CanvasContext(wx2dCtx) : wx2dCtx;

  // 清屏
  if (ctx.clear) ctx.clear();
  else if (ctx.clearRect) ctx.clearRect(0, 0, 99999, 99999);

  const part = scoreModel?.parts?.[0];
  if (!part) return;

  const staffId = opts.staff ?? "treble";
  const staveX0 = opts.x ?? 10; // 小节起始位置 x
  const staveY0 = opts.y ?? 10; // 小节起始位置 y
  const staveW = opts.measureWidth ?? 280; // 小节宽度
  const gapX = opts.gapX ?? 20; // 小节之间的间距
  const maxLineWidth = opts.maxLineWidth ?? 300; // 每行的最大宽度
  const lineHeight = opts.lineHeight ?? 80; // 每行的高度，保证足够容纳音符

  let currentLineWidth = 0; // 当前行的总宽度
  let currentLineY = staveY0; // 当前行的y坐标
  let x = staveX0; // 当前小节的起始横坐标
  let y = currentLineY; // 当前小节的纵坐标

  const eventNoteMap = new Map(); // eventId -> StaveNote

  // 获取调号
  const keySignature = scoreModel.header.keySignatures?.[0];
  const key = keySignature ? keySignature.key : null;

  for (let i = 0; i < part.measures.length; i++) {
    const m = part.measures[i];
    const voiceModel = m.voices?.[staffId];
    if (!voiceModel) continue;

    // 计算当前小节的宽度（包含小节间距）
    const currentStaveWidth = staveW + gapX;

    // 计算下一个小节的宽度（如果存在）
    const nextStaveWidth = i + 1 < part.measures.length ? staveW + gapX : 0;

    // 判断从第二小节开始是否超出最大行宽
    if (
      i > 0 &&
      currentLineWidth + currentStaveWidth + nextStaveWidth > maxLineWidth
    ) {
      // 换行：重置当前行宽度为 0
      currentLineWidth = 0;
      currentLineY += lineHeight; // 行高增加
      y = currentLineY; // 更新当前y坐标
      x = staveX0; // 换行后x坐标重置
    }

    // 1) 画小节线
    const stave = new Stave(x, y, staveW);
    const isFirstMeasure = m.index === 0;

    if (isFirstMeasure) {
      stave.addClef(staffId === "bass" ? "bass" : "treble");
      stave.addTimeSignature(`${m.timeSignature[0]}/${m.timeSignature[1]}`);

      // 添加调号
      if (key) {
        stave.addKeySignature(key); // 添加调号
      }
    } else {
      // 中间小节不画左边竖线
      // if (Barline?.type) stave.setBegBarType(Barline.type.NONE);
    }

    stave.setContext(ctx).draw();

    // 2) events -> tickables
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

    new Formatter().joinVoices([vfVoice]).format([vfVoice], staveW - 60);

    // 4) beams
    const vfBeams = [];
    for (const b of voiceModel.beams || []) {
      const notesForBeam = (b.eventIds || [])
        .map((id) => eventNoteMap.get(id))
        .filter(Boolean);

      if (notesForBeam.length >= 2) {
        vfBeams.push(new Beam(notesForBeam));
      }
    }

    vfVoice.draw(ctx, stave);

    // 绘制横梁
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
    x += staveW + gapX;
    currentLineWidth += currentStaveWidth; // 更新当前行宽度
  }

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

  // 重置缩放，避免重复 mounted/热更新时叠加
  if (ctx.setTransform) ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
});
</script>
<style scoped>
.page {
  margin-top: 10vh;
  padding: 32rpx;
}
.status {
  margin-top: 24rpx;
  color: #666;
}
</style>
