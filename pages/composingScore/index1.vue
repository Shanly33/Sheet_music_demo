<template>
  <scroll-view scroll-x class="score-scroll-container">
    <!-- 绑定 dynamicHeight -->
    <view class="canvas-wrapper" :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }">
      <canvas id="scoreCanvas" canvas-id="scoreCanvas" type="2d" :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }" @touchstart="onCanvasClick" />
    </view>
  </scroll-view>

  <image v-if="isDragging" class="drag-ghost" :style="ghostStyle" :src="selected.icon" mode="aspectFit" />

  <view class="control-panel">
    <view class="add-btn" @click="addStave">
      <text style="font-size: 16px; margin-right: 4px">+</text>
      新增一行乐谱
    </view>
    <view class="info-text">当前选中：第 {{ activeStaveIndex + 1 }} 行</view>
  </view>

  <!-- 音符工具栏 -->
  <view class="note-bar">
    <view
      v-for="d in durations"
      :key="d.id"
      class="note-btn"
      :class="{ active: selected?.id === d.id }"
      @tap="selected = d"
      @touchstart="(e) => onDragStart(e, d)"
      @touchmove="onDragMove"
      @touchend="onDragEnd"
    >
      <!-- <image class="note-icon" v-if="d.icon" :src="d.icon" mode="aspectFit" /> -->
      <view class="note-label">{{ d.label }}</view>
    </view>
  </view>

  <!-- 配置区域：操作的是当前选中的 Stave -->
  <view class="musicConfig" v-if="activeStaveConfig">
    <view class="section-title">谱号 (Clef)</view>
    <view class="clef">
      <view class="item" :class="{ active: activeStaveConfig.clef === item.value }" @click="updateStaveConfig('clef', item.value)" v-for="item in clefList" :key="item.value">
        {{ item.label }}
      </view>
    </view>

    <view class="section-title">拍号 (Time Signature)</view>
    <view class="timeSignatureList">
      <view
        class="item"
        :class="{ active: activeStaveConfig.timeSignature === item.id }"
        @click="updateStaveConfig('timeSignature', item.id)"
        v-for="item in timeSignatureList"
        :key="item.id"
      >
        {{ item.id }}
      </view>
    </view>

    <view class="section-title">调号 (Key Signature)</view>
    <view class="keySignatureList">
      <view
        class="item"
        :class="{ active: activeStaveConfig.keySignature === item.id }"
        @click="updateStaveConfig('keySignature', item.id)"
        v-for="item in keySignatureList"
        :key="item.id"
      >
        {{ item.id }}
      </view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, getCurrentInstance, ref, computed } from 'vue';
import Vex from 'vexflow';

// --- 基础配置 ---
const instance = getCurrentInstance();
const isDragging = ref(false);
const dragPoint = ref({ x: 0, y: 0 });
const ghostStyle = ref('');
const scoreWidth = ref(400);
let canvasNode = null;
let globalCtx = null;
const dynamicHeight = ref(300);

// --- 核心数据结构 ---
const STAVE_BASE_HEIGHT = 120;
// Stave 列表
const staveList = ref([createDefaultStave(1)]);
// 当前选中的 Stave ID
const activeStaveId = ref(1);

// 映射表
let visualMaps = {};
let layoutMaps = {};

const activeStaveConfig = computed(() => {
  const stave = staveList.value.find((s) => s.id === activeStaveId.value);
  return stave ? stave.config : null;
});
const activeStaveIndex = computed(() => staveList.value.findIndex((s) => s.id === activeStaveId.value));

// --- 常量定义 ---
const clefList = [
  { value: 'treble', label: '高音' },
  { value: 'bass', label: '低音' },
  { value: 'alto', label: '中音' },
  { value: 'tenor', label: '次中音' }
];
const timeSignatureList = [{ id: '4/4' }, { id: '3/4' }, { id: '2/4' }, { id: '6/8' }, { id: '3/8' }, { id: '2/2' }, { id: '9/8' }, { id: '12/8' }];
// 调号列表 (Value 对应 VexFlow 的 KeySpec)
const keySignatureList = [
  { id: 'C' },
  { id: 'G' },
  { id: 'D' },
  { id: 'A' },
  { id: 'E' },
  { id: 'B' },
  { id: 'F#' },
  { id: 'F' },
  { id: 'Bb' },
  { id: 'Eb' },
  { id: 'Ab' },
  { id: 'Db' },
  { id: 'Gb' }
];
const durations = [
  { id: 'w', label: '全音符', duration: 'w', icon: '/static/icons/notes/w.png' },
  { id: 'h', label: '2分', duration: 'h', icon: '/static/icons/notes/h.png' },
  { id: 'q', label: '4分', duration: 'q', icon: '/static/icons/notes/q.png' },
  { id: '8', label: '8分', duration: '8', icon: '/static/icons/notes/8.png' },
  { id: '16', label: '16分', duration: '16', icon: '/static/icons/notes/16.png' },
  { id: '32', label: '32分', duration: '32', icon: '/static/icons/notes/16.png' },
  { id: '64', label: '64分', duration: '64', icon: '/static/icons/notes/16.png' },
  { id: 'qr', label: '休止', duration: 'qr', icon: '/static/icons/notes/16.png' }
];

const selected = ref(durations[2]);
let VF = null;

// ============================================================
// 初始化与工具
// ============================================================
function createDefaultStave(id) {
  return {
    id: id || Date.now(),
    config: { clef: 'treble', keySignature: 'C', timeSignature: '4/4' },
    notes: []
  };
}

function addStave() {
  const newId = Date.now();
  staveList.value.push(createDefaultStave(newId));
  activeStaveId.value = newId;
  drawScore();
}

function updateStaveConfig(key, value) {
  const stave = staveList.value.find((s) => s.id === activeStaveId.value);
  if (stave) {
    stave.config[key] = value;
    drawScore(); // 配置改变后，VexFlow 会根据新的 Key/Clef 重新渲染音符位置和升降号
  }
}

function applyContextPatch(ctx) {
  const mapProp = (methodName, propName) => {
    if (!ctx[methodName]) {
      ctx[methodName] = function (val) {
        this[propName] = val;
        return this;
      };
    }
  };
  mapProp('setFillStyle', 'fillStyle');
  mapProp('setStrokeStyle', 'strokeStyle');
  mapProp('setLineWidth', 'lineWidth');
  mapProp('setLineCap', 'lineCap');
  mapProp('setLineJoin', 'lineJoin');
  mapProp('setMiterLimit', 'miterLimit');
  mapProp('setGlobalAlpha', 'globalAlpha');
  if (!ctx.setFont) {
    ctx.setFont = function (font, size, weight) {
      this.font = `${weight || ''} ${size || 10}pt ${font || 'Arial'}`;
      return this;
    };
  }
  if (!ctx.clear) {
    ctx.clear = function () {
      this.clearRect(0, 0, 99999, 99999);
    };
  }
  if (!ctx.openGroup)
    ctx.openGroup = function () {
      return this;
    };
  if (!ctx.closeGroup)
    ctx.closeGroup = function () {
      return this;
    };
  if (!ctx.addClass)
    ctx.addClass = function () {
      return this;
    };
}

onMounted(() => {
  initCanvas();
});

function initCanvas() {
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select('#scoreCanvas')
    .fields({ node: true, size: true })
    .exec((res) => {
      if (!res[0]) return;
      const { node, width } = res[0];
      const ctx = node.getContext('2d');
      const dpr = uni.getWindowInfo().pixelRatio || 2;
      applyContextPatch(ctx);
      node.width = width * dpr;
      node.height = dynamicHeight.value * dpr;
      ctx.scale(dpr, dpr);
      canvasNode = node;
      globalCtx = ctx;
      VF = Vex.Flow;
      drawScore();
    });
}

// ============================================================
// 交互：拖拽与计算 (核心优化部分)
// ============================================================
function onCanvasClick(e) {
  const touch = e.touches[0];
  const rectQuery = uni.createSelectorQuery().in(instance.proxy).select('#scoreCanvas').boundingClientRect();
  rectQuery.exec((res) => {
    if (!res[0]) return;
    const y = touch.pageY - res[0].top;
    for (let id in layoutMaps) {
      const layout = layoutMaps[id];
      if (y >= layout.y - 40 && y <= layout.y + layout.height + 40) {
        activeStaveId.value = parseInt(id);
        break;
      }
    }
    drawScore();
  });
}

function onDragStart(e, d) {
  selected.value = d;
  isDragging.value = true;
  updateGhost(e);
}
function onDragMove(e) {
  if (isDragging.value) updateGhost(e);
}
function updateGhost(e) {
  const touch = e.touches ? e.touches[0] : e.changedTouches[0];
  if (touch) {
    dragPoint.value = { x: touch.pageX, y: touch.pageY };
    ghostStyle.value = `left:${touch.pageX}px;top:${touch.pageY}px;`;
  }
}

function onDragEnd(e) {
  if (!isDragging.value) return;
  const touch = e.changedTouches[0];
  const rectQuery = uni.createSelectorQuery().in(instance.proxy).select('#scoreCanvas').boundingClientRect();
  rectQuery.exec((res) => {
    if (!res[0]) {
      isDragging.value = false;
      return;
    }
    const rect = res[0];
    const x = touch.pageX - rect.left;
    const y = touch.pageY - rect.top;

    if (x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
      let targetStaveId = null;
      let targetLayout = null;
      for (let id in layoutMaps) {
        const layout = layoutMaps[id];
        if (y >= layout.y - 50 && y <= layout.y + layout.height + 50) {
          targetStaveId = parseInt(id);
          targetLayout = layout;
          break;
        }
      }

      if (targetStaveId) {
        activeStaveId.value = targetStaveId;
        const staveObj = staveList.value.find((s) => s.id === targetStaveId);

        // 1. 创建临时的 VexFlow Stave 用于计算相对位置
        const tempStave = new VF.Stave(0, targetLayout.y, 400);

        // 2. 【核心】传入当前谱号和调号进行计算
        const pitch = calculatePitchFromY(y, tempStave, staveObj.config);

        insertNoteToStave(targetStaveId, x, pitch, selected.value.duration);
        drawScore();
      }
    }
    isDragging.value = false;
    ghostStyle.value = '';
  });
}

/**
 * 核心算法：根据 Y 坐标 + 谱号 + 调号，计算出准确的音高
 */
function calculatePitchFromY(y, stave, config) {
  const { clef, keySignature } = config;

  // 1. 获取五线谱的“线位”数值 (Line)
  const line = stave.getLineForY(y);

  // 2. 根据谱号确定基准线
  let bottomLineNote = { step: 'E', octave: 4 }; // Treble default
  if (clef === 'bass') bottomLineNote = { step: 'G', octave: 2 };
  if (clef === 'alto') bottomLineNote = { step: 'F', octave: 3 };
  if (clef === 'tenor') bottomLineNote = { step: 'D', octave: 3 };

  // 音阶字典
  const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

  // 将最低线转换为绝对索引
  const bottomLineIndex = bottomLineNote.octave * 7 + noteNames.indexOf(bottomLineNote.step);

  // 计算鼠标位置相对于最低线的差距
  const visualSteps = Math.round((4 - line) * 2);

  // 目标音符的绝对索引
  const targetIndex = bottomLineIndex + visualSteps;

  const octave = Math.floor(targetIndex / 7);
  const stepIndex = targetIndex % 7;
  // 处理负数取模
  const safeStepIndex = stepIndex < 0 ? 7 + stepIndex : stepIndex;

  const noteName = noteNames[safeStepIndex];

  // 3. 【修复点】不再依赖 VF.KeySignature.keySpecs
  // 手动定义调号映射表 (Key Map)
  // 这是最稳健的方法，不依赖库的内部实现
  const KEY_DICT = {
    C: { type: null },
    G: { type: '#' },
    D: { type: '#' },
    A: { type: '#' },
    E: { type: '#' },
    B: { type: '#' },
    'F#': { type: '#' },
    'C#': { type: '#' },
    F: { type: 'b' },
    Bb: { type: 'b' },
    Eb: { type: 'b' },
    Ab: { type: 'b' },
    Db: { type: 'b' },
    Gb: { type: 'b' },
    Cb: { type: 'b' }
  };

  const currentKey = KEY_DICT[keySignature] || { type: null };
  let acc = '';

  if (currentKey.type) {
    // 仍然利用 VexFlow 的实例方法来获取受影响的音符列表（这个API是公开稳定的）
    // 例如 G大调 -> affectedNotes = ['F']
    try {
      const tempKeySig = new VF.KeySignature(keySignature);
      const affectedNotes = tempKeySig.accidentalList();

      if (affectedNotes.includes(noteName)) {
        acc = currentKey.type; // '#' 或 'b'
      }
    } catch (e) {
      console.error('KeySignature calculation error:', e);
    }
  }

  return `${noteName}${acc}/${octave}`;
}

function insertNoteToStave(staveId, targetX, pitch, duration) {
  const stave = staveList.value.find((s) => s.id === staveId);
  if (!stave) return;
  const notes = stave.notes;
  const visualMap = visualMaps[staveId] || [];

  if (visualMap.length === 0) {
    notes.push({ pitch, duration, id: Date.now() });
    return;
  }
  let insertIndex = notes.length;
  for (let i = 0; i < visualMap.length; i++) {
    const visualNote = visualMap[i];
    if (targetX < visualNote.x + 10) {
      insertIndex = visualNote.rawIndex;
      break;
    }
  }
  const newNote = { pitch, duration, id: Date.now() };
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > notes.length) insertIndex = notes.length;
  notes.splice(insertIndex, 0, newNote);
}

function processNotesToMeasures(rawNotes) {
  const measures = [];
  let currentMeasure = { notes: [], ties: [], beams: [] };
  let currentBeats = 0;
  const RESOLUTION = VF.RESOLUTION;
  const ticksPerBeat = RESOLUTION / 4;
  const maxTicksPerMeasure = ticksPerBeat * 4;

  const durationTicks = {
    w: ticksPerBeat * 4,
    h: ticksPerBeat * 2,
    q: ticksPerBeat,
    8: ticksPerBeat / 2,
    16: ticksPerBeat / 4,
    32: ticksPerBeat / 8,
    64: ticksPerBeat / 16,
    qr: ticksPerBeat,
    hr: ticksPerBeat * 2,
    wr: ticksPerBeat * 4,
    '8r': ticksPerBeat / 2,
    '16r': ticksPerBeat / 4,
    '32r': ticksPerBeat / 8,
    '64r': ticksPerBeat / 16
  };
  function getBestDuration(ticks) {
    if (ticks >= durationTicks['w']) return 'w';
    if (ticks >= durationTicks['h']) return 'h';
    if (ticks >= durationTicks['q']) return 'q';
    if (ticks >= durationTicks['8']) return '8';
    if (ticks >= durationTicks['16']) return '16';
    if (ticks >= durationTicks['32']) return '32';
    return '64';
  }
  let noteQueue = rawNotes.map((n, index) => ({
    pitch: n.pitch,
    rawDuration: n.duration,
    totalTicks: durationTicks[n.duration] || durationTicks['q'],
    rawIndex: index,
    isRest: n.duration.indexOf('r') !== -1
  }));

  let noteIndex = 0;
  let pendingNote = null;

  while (noteIndex < noteQueue.length || pendingNote) {
    let item = pendingNote || noteQueue[noteIndex];
    const ticksSpace = maxTicksPerMeasure - currentBeats;

    if (ticksSpace <= 0) {
      measures.push(currentMeasure);
      currentMeasure = { notes: [], ties: [], beams: [] };
      currentBeats = 0;
      continue;
    }
    if (!pendingNote) noteIndex++;

    const createVexNote = (ticks, originalItem) => {
      let baseDuration = getBestDuration(ticks);
      let vfKeys = [originalItem.pitch];
      let vfDuration = baseDuration;
      if (originalItem.isRest) {
        vfKeys = ['b/4'];
        vfDuration = baseDuration + 'r';
      }
      return new VF.StaveNote({
        keys: vfKeys,
        duration: vfDuration,
        auto_stem: !originalItem.isRest
      });
    };

    if (item.totalTicks <= ticksSpace) {
      const vfNote = createVexNote(item.totalTicks, item);
      vfNote.sourceRawIndex = item.rawIndex;
      currentMeasure.notes.push(vfNote);
      currentBeats += item.totalTicks;
      if (item.isLinkedToPrevious && !item.isRest) vfNote.isIncomingTie = true;
      pendingNote = null;
    } else {
      const firstPartTicks = ticksSpace;
      const remainTicks = item.totalTicks - ticksSpace;
      const note1 = createVexNote(firstPartTicks, item);
      note1.sourceRawIndex = item.rawIndex;
      currentMeasure.notes.push(note1);
      currentBeats += firstPartTicks;
      pendingNote = {
        pitch: item.pitch,
        rawDuration: item.rawDuration,
        totalTicks: remainTicks,
        isLinkedToPrevious: true,
        rawIndex: item.rawIndex,
        isRest: item.isRest
      };
      if (!item.isRest) {
        currentMeasure.ties.push({ fromNote: note1, isCrossMeasure: true });
      }
    }
  }
  if (currentMeasure.notes.length > 0 || measures.length === 0) {
    measures.push(currentMeasure);
  }
  measures.forEach((m) => {
    const notesToBeam = m.notes.filter((n) => !n.duration.includes('r'));
    if (notesToBeam.length > 0) m.beams = VF.Beam.generateBeams(notesToBeam);
  });
  return measures;
}

// ============================================================
// 渲染主循环
// ============================================================
function drawScore() {
  if (!VF || !canvasNode || !globalCtx) return;
  const ctx = globalCtx;
  visualMaps = {};
  layoutMaps = {};

  let currentStaveY = 50;
  let maxRequiredWidth = 0;
  const renderDataList = [];

  staveList.value.forEach((staveObj) => {
    const measures = processNotesToMeasures(staveObj.notes);

    const calculatedWidths = [];
    let rowWidth = 10;
    let rowMinY = 0;
    let rowMaxY = 80;

    measures.forEach((measure, index) => {
      const dummyStave = new VF.Stave(0, 0, 500);
      if (index === 0) {
        dummyStave.addClef(staveObj.config.clef).addKeySignature(staveObj.config.keySignature).addTimeSignature(staveObj.config.timeSignature);
      }
      const modifierWidth = dummyStave.getNoteStartX();

      let minNoteWidth = 0;
      let voice = null;

      if (measure.notes.length > 0) {
        voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
        voice.setStrict(false);
        voice.addTickables(measure.notes);

        // 【关键步骤】应用调号规则 (Accidentals)
        // 这行代码会自动检测：如果 f#/4 符合 G大调，就不画升号；如果不符合，就画还原号
        VF.Accidental.applyAccidentals([voice], staveObj.config.keySignature);

        const formatter = new VF.Formatter().joinVoices([voice]);
        formatter.preCalculateMinTotalWidth([voice]);
        minNoteWidth = formatter.getMinTotalWidth();
        formatter.format([voice], 500);

        measure.notes.forEach((note) => {
          note.setStave(dummyStave);
          const box = note.getBoundingBox();
          if (box) {
            if (box.y < rowMinY) rowMinY = box.y;
            if (box.y + box.h > rowMaxY) rowMaxY = box.y + box.h;
          }
        });
      } else {
        minNoteWidth = 40;
      }

      let contentWidth = minNoteWidth + 30;
      contentWidth = Math.max(contentWidth, 60);
      let extraRightPadding = index === measures.length - 1 ? 80 : 10;
      let measureWidth = modifierWidth + contentWidth + extraRightPadding;

      calculatedWidths.push({
        measureWidth,
        formatWidth: contentWidth,
        voice
      });
      rowWidth += measureWidth;
    });

    if (rowWidth > maxRequiredWidth) maxRequiredWidth = rowWidth;

    const topPadding = 30;
    let offsetY = 0;
    if (rowMinY < 0) offsetY = Math.abs(rowMinY) + topPadding;
    const actualHeight = offsetY + rowMaxY + 30;

    renderDataList.push({
      staveObj,
      measures,
      calculatedWidths,
      offsetY,
      actualHeight
    });
  });

  const finalScoreWidth = Math.max(maxRequiredWidth + 50, 350);
  let totalCanvasHeight = 50;
  renderDataList.forEach((d) => (totalCanvasHeight += d.actualHeight));
  totalCanvasHeight = Math.max(totalCanvasHeight, 300);

  if (Math.abs(scoreWidth.value - finalScoreWidth) > 5 || Math.abs(canvasNode.height / (uni.getWindowInfo().pixelRatio || 2) - totalCanvasHeight) > 5) {
    scoreWidth.value = finalScoreWidth;
    dynamicHeight.value = totalCanvasHeight;
    const dpr = uni.getWindowInfo().pixelRatio || 2;
    canvasNode.width = finalScoreWidth * dpr;
    canvasNode.height = totalCanvasHeight * dpr;
    ctx.scale(dpr, dpr);
    applyContextPatch(ctx);
  }

  ctx.clear();
  let cursorY = 50;

  renderDataList.forEach((data) => {
    const { staveObj, measures, calculatedWidths, offsetY, actualHeight } = data;
    const staveY = cursorY + offsetY;
    layoutMaps[staveObj.id] = { y: staveY, height: actualHeight };
    visualMaps[staveObj.id] = [];

    if (staveObj.id === activeStaveId.value) {
      ctx.save();
      ctx.globalAlpha = 0.05;
      ctx.fillStyle = '#1890ff';
      ctx.fillRect(0, cursorY, finalScoreWidth, actualHeight);
      ctx.restore();
    }

    let currentX = 10;
    let prevMeasureLastNote = null;
    let needTieFromPrev = false;

    measures.forEach((measure, index) => {
      const layoutInfo = calculatedWidths[index];
      const measureWidth = layoutInfo.measureWidth;

      const stave = new VF.Stave(currentX, staveY, measureWidth);
      if (index === 0) {
        stave.addClef(staveObj.config.clef).addKeySignature(staveObj.config.keySignature).addTimeSignature(staveObj.config.timeSignature);
      }
      if (index === measures.length - 1) {
        stave.setEndBarType(VF.Barline.type.END);
      }
      stave.setContext(ctx).draw();

      const voice = layoutInfo.voice;
      if (voice) {
        const availableWidth = layoutInfo.formatWidth;
        const formatter = new VF.Formatter().joinVoices([voice]);
        formatter.format([voice], availableWidth);
        voice.draw(ctx, stave);

        measure.notes.forEach((note) => {
          let noteX = stave.getX() + 50;
          try {
            noteX = note.getAbsoluteX();
          } catch (e) {}
          if (note.sourceRawIndex !== undefined) {
            visualMaps[staveObj.id].push({ x: noteX, rawIndex: note.sourceRawIndex });
          }
        });

        if (measure.beams) measure.beams.forEach((b) => b.setContext(ctx).draw());
        if (needTieFromPrev && prevMeasureLastNote) {
          const firstNote = measure.notes[0];
          if (firstNote) {
            const tie = new VF.StaveTie({
              first_note: prevMeasureLastNote,
              last_note: firstNote,
              first_indices: [0],
              last_indices: [0]
            });
            tie.setContext(ctx).draw();
          }
        }
        const crossTie = measure.ties.find((t) => t.isCrossMeasure);
        if (crossTie) {
          prevMeasureLastNote = crossTie.fromNote;
          needTieFromPrev = true;
        } else {
          prevMeasureLastNote = null;
          needTieFromPrev = false;
        }
      }
      currentX += measureWidth;
    });
    cursorY += actualHeight;
  });
}
</script>

<style scoped lang="scss">
/* 保持原有样式，新增部分如下 */
.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background-color: #f8f9fa;
  border-bottom: 1px solid #eee;
}
.add-btn {
  background-color: #1890ff;
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 14px;
  display: flex;
  align-items: center;
}
.info-text {
  font-size: 12px;
  color: #666;
}
.score-scroll-container {
  width: 100%;
  white-space: nowrap;
  background: #fff;
  border-bottom: 1px solid #eee;
}
.canvas-wrapper {
  display: inline-block;
}
.note-bar {
  display: flex;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid #eee;
  flex-wrap: wrap;
}
.note-btn {
  text-align: center;
  padding: 5px;
  border: 1px solid #ccc;
  border-radius: 8px;
  min-width: 60px;
}
.note-btn.active {
  background: #e6f7ff;
  border-color: #1890ff;
}
.note-icon {
  width: 30px;
  height: 30px;
}
.drag-ghost {
  position: fixed;
  width: 40px;
  height: 40px;
  pointer-events: none;
  z-index: 999;
}
.musicConfig {
  width: 100%;
  padding: 10px;
  box-sizing: border-box;
  .section-title {
    font-size: 14px;
    font-weight: bold;
    margin: 10px 0 5px 0;
    color: #333;
  }
  .clef,
  .timeSignatureList,
  .keySignatureList {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    .item {
      padding: 6px 12px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
      background: #fff;
      &.active {
        background: #1890ff;
        color: #fff;
        border-color: #1890ff;
      }
    }
  }
}
</style>

//
<style scoped lang="scss">
// /* 样式保持不变 */
// .score-scroll-container {
//   width: 100%;
//   white-space: nowrap;
//   background: #fff;
// }
// .canvas-wrapper {
//   display: inline-block;
// }
// .note-bar {
//   display: flex;
//   gap: 10px;
//   padding: 10px;
//   border-top: 1px solid #eee;
//   flex-wrap: wrap;
// }
// .note-btn {
//   text-align: center;
//   padding: 5px;
//   border: 1px solid #ccc;
//   border-radius: 8px;
// }
// .note-btn.active {
//   background: #e6f7ff;
//   border-color: #1890ff;
// }
// .note-icon {
//   width: 30px;
//   height: 30px;
// }
// .drag-ghost {
//   position: fixed;
//   width: 40px;
//   height: 40px;
//   pointer-events: none;
//   z-index: 999;
// }
// .musicConfig {
//   width: 100%;
//   .clef,
//   .timeSignatureList,
//   .keySignatureList {
//     margin: 20rpx 0;
//     display: flex;
//     flex-wrap: wrap;
//     gap: 10px;
//     .item {
//       padding: 10rpx;
//       border: 1px solid #ccc;
//     }
//   }
// }
// .add {
//   margin: 20rpx 0;
// }
//
</style>
