<template>
  <view class="page">
    <button type="primary" @click="onSelectMidi">选择 MIDI 文件</button>
    <canvas
      id="score"
      canvas-id="score"
      type="2d"
      style="width: 100%; height: 300px; margin-top: 16px"
    />
  </view>
</template>

<script setup>
import { getCurrentInstance } from "vue";
import Vex from "vexflow";
import { selectAndParseMidi } from "@/utils/midi/readMidi";
import { parseMidiToNotes } from "@/utils/midi/parseMidi";
import { splitNotesToMeasures } from "@/utils/midi/splitToMeasures";
import { buildVFScore } from "@/utils/midi/buildVFScore";
const { Renderer, Stave, Voice, Formatter, StaveNote, StaveTie, Dot, Beam } =
  Vex.Flow;

const instance = getCurrentInstance();
/* ===============================
 * 用户点击：选择 MIDI
 * =============================== */
async function onSelectMidi() {
  try {
    const midi = await selectAndParseMidi();
    const track = midi.tracks[0];

    console.log("midi数据", midi);
    const noteModels = parseMidiToNotes(midi);
    console.log("noteModels", noteModels);
    const measures = splitNotesToMeasures(noteModels, midi.header);

    console.log("measures", measures);

    const scoreModel = {
      timeSig: measures[0].timeSig,
      keySig: midi.header.keySignature ?? "C",
      measures,
    };

    const vfScore = buildVFScore(scoreModel);

    console.log("VF 中间结构", vfScore);

    const { canvas } = await getCanvasNode({
      selector: "#score",
      instance: instance.proxy,
    });

    renderVFScore(vfScore, canvas);
  } catch (e) {
    console.error("❌ MIDI 加载失败", e);
  }
}

//VFNote → StaveNote（纯映射）
function createVexNote(vfNote) {
  const note = new StaveNote({
    keys: vfNote.keys,
    duration: vfNote.duration,
  });

  for (let i = 0; i < (vfNote.dots || 0); i++) {
    Dot.buildAndAttach([note], { all: true });
  }

  if (vfNote.stemDirection !== null) {
    note.setStemDirection(vfNote.stemDirection);
  }

  return note;
}

//绘制一整行小节（自动拉伸）
function drawMeasureRow(
  context,
  rowMeasures,
  startX,
  startY,
  rowWidth,
  usableWidth,
  vfScore,
  staveHeight
) {
  const scale = rowWidth > usableWidth ? usableWidth / rowWidth : 1;

  let x = startX;

  rowMeasures.forEach(({ measure, width }, idx) => {
    const staveWidth = width * scale;

    const stave = new Stave(x, startY, staveWidth);

    // 只在每行第一个小节画谱号和拍号
    if (idx === 0) {
      stave.addClef("treble");
      stave.addTimeSignature(
        `${vfScore.timeSig.beats}/${vfScore.timeSig.beatValue}`
      );
    }

    stave.setContext(context).draw();

    drawVoiceInStave(context, stave, measure);

    x += staveWidth + 10;
  });
}

//连音线（Tie）
function drawTies(context, notes, ties) {
  ties.forEach((tie) => {
    const staveTie = new StaveTie({
      first_note: notes[tie.from.noteIndex],
      last_note: notes[tie.to.noteIndex],
      first_indices: [tie.from.keyIndex],
      last_indices: [tie.to.keyIndex],
    });

    staveTie.setContext(context).draw();
  });
}

//Voice + Note + Tie 渲染
function drawVoiceInStave(context, stave, measure) {
  const voice = new Voice({
    num_beats: parseInt(measure.voice.timeSig.split("/")[0], 10),
    beat_value: parseInt(measure.voice.timeSig.split("/")[1], 10),
    strict: true,
  });

  const notes = measure.voice.notes.map(createVexNote);

  voice.addTickables(notes);

  new Formatter().joinVoices([voice]).formatToStave([voice], stave);

  voice.draw(context, stave);

  drawTies(context, notes, measure.ties);
}

function renderVFScore(vfScore, canvas) {
  const estimatedRows = Math.ceil(vfScore.measures.length / 4); // 粗估
  const requiredHeight = PAGE_PADDING * 2 + estimatedRows * (STAVE_HEIGHT + 30);

  if (canvas.height < requiredHeight) {
    canvas.height = requiredHeight;
  }
  const renderer = new Renderer(canvas, Renderer.Backends.CANVAS);
  const context = renderer.getContext();
  context.clearRect(0, 0, canvas.width, canvas.height);

  const PAGE_PADDING = 10;
  const STAVE_HEIGHT = 100;
  const MEASURE_GAP = 10;
  const MEASURE_MIN_WIDTH = 140;

  const usableWidth = canvas.width - PAGE_PADDING * 2;

  let x = PAGE_PADDING;
  let y = PAGE_PADDING;
  let rowMeasures = [];
  let rowWidth = 0;

  vfScore.measures.forEach((measure, index) => {
    const estimatedWidth = Math.max(
      MEASURE_MIN_WIDTH,
      measure.voice.notes.length * 30
    );

    if (rowWidth + estimatedWidth > usableWidth && rowMeasures.length > 0) {
      drawMeasureRow(
        context,
        rowMeasures,
        x,
        y,
        rowWidth,
        usableWidth,
        vfScore,
        STAVE_HEIGHT
      );

      y += STAVE_HEIGHT + 30;
      rowMeasures = [];
      rowWidth = 0;
    }

    rowMeasures.push({ measure, width: estimatedWidth });
    rowWidth += estimatedWidth + MEASURE_GAP;
  });

  if (rowMeasures.length > 0) {
    drawMeasureRow(
      context,
      rowMeasures,
      x,
      y,
      rowWidth,
      usableWidth,
      vfScore,
      STAVE_HEIGHT
    );
  }
}

/**
 * 获取小程序 canvas node，并自动处理 DPR
 * @param {Object} options
 * @param {string} options.selector - canvas 的选择器，如 "#score"
 * @param {Object} options.instance - getCurrentInstance().proxy
 * @returns {Promise<{ canvas: any, ctx: CanvasRenderingContext2D, width: number, height: number, dpr: number }>}
 */
function getCanvasNode({ selector, instance }) {
  return new Promise((resolve, reject) => {
    uni
      .createSelectorQuery()
      .in(instance)
      .select(selector)
      .fields({ node: true, size: true })
      .exec((res) => {
        const item = res?.[0];

        if (!item || !item.node) {
          reject(new Error("canvas node 获取失败"));
          return;
        }

        const { node: canvas, width, height } = item;
        const dpr = uni.getSystemInfoSync().pixelRatio;

        canvas.width = width * dpr;
        canvas.height = height * dpr;

        const ctx = canvas.getContext("2d");
        ctx.scale(dpr, dpr);

        resolve({
          canvas,
          ctx,
          width,
          height,
          dpr,
        });
      });
  });
}
</script>

<style scoped>
.page {
  margin-top: 40vh;
  padding: 32rpx;
}
.status {
  margin-top: 24rpx;
  color: #666;
}
</style>
