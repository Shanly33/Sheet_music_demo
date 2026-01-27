<template>
  <scroll-view scroll-x scroll-y class="score-scroll-container">
    <!-- 绑定 dynamicHeight -->
    <view class="canvas-wrapper" :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }">
      <canvas id="scoreCanvas" canvas-id="scoreCanvas" type="2d" :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }" @touchstart="onCanvasClick" />
    </view>
  </scroll-view>

  <image v-if="isDragging" class="drag-ghost" :style="ghostStyle" :src="selected.icon" mode="aspectFit" />
  <!-- 音符工具栏 -->
  <view class="note-bar">
    <view
      v-for="d in durations"
      :key="d.id"
      class="note-btn"
      :class="{ active: selected?.id === d.id }"
      @tap.stop="selected = d"
      @touchstart.stop="(e) => onDragStart(e, d)"
      @touchmove.stop="onDragMove"
      @touchend.stop="onDragEnd"
    >
      <!-- <image class="note-icon" v-if="d.icon" :src="d.icon" mode="aspectFit" /> -->
      <view class="note-label">{{ d.label }}</view>
    </view>
  </view>
  <view class="tools">
    <view class="control-panel">
      <view class="add-btn" @click="addStave">
        <text style="font-size: 16px; margin-right: 4px">+</text>
        新增一行乐谱
      </view>
      <view class="info-text">当前选中：第 {{ activeStaveIndex + 1 }} 行</view>
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
  </view>
</template>

<script setup>
import { onMounted, getCurrentInstance, ref, computed, nextTick } from 'vue';
import Vex from 'vexflow';

// --- 基础配置 ---
const instance = getCurrentInstance();
const isDragging = ref(false);
const dragPoint = ref({ x: 0, y: 0 });
const ghostStyle = ref('');
const scoreWidth = ref(400);
let canvasNode = null;
let globalCtx = null;
const selectedNoteId = ref(null);//音符选中
// 画布高度动态计算
const dynamicHeight = ref(300);

// --- 多行数据结构 ---
// Stave 列表
const staveList = ref([createDefaultStave(1)]);

// 当前选中的 Stave ID
const activeStaveId = ref(1);

// 映射表
let visualMaps = {};
let layoutMaps = {};

// 计算属性
const activeStaveIndex = computed(() => staveList.value.findIndex((s) => s.id === activeStaveId.value));
// 增加空值保护，防止模板渲染报错
const activeStaveConfig = computed(() => {
  const stave = staveList.value.find((s) => s.id === activeStaveId.value);
  return stave ? stave.config : { clef: 'treble', keySignature: 'C', timeSignature: '4/4' };
});

// --- 常量定义 ---
const clefList = [
  { value: 'treble', label: '高音' },
  { value: 'bass', label: '低音' },
  { value: 'alto', label: '中音' },
  { value: 'tenor', label: '次中音' }
];
const timeSignatureList = [{ id: '4/4' }, { id: '3/4' }, { id: '2/4' }, { id: '6/8' }, { id: '3/8' }, { id: '2/2' }, { id: '9/8' }, { id: '12/8' }];
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
    config: {
      clef: 'treble',
      keySignature: 'C',
      timeSignature: '4/4'
    },
    notes: []
  };
}

function addStave() {
  const newId = Date.now();
  staveList.value.push(createDefaultStave(newId));
  activeStaveId.value = newId;
  // 等待数据更新后重绘
  nextTick(() => {
    drawScore();
  });
}

function updateStaveConfig(key, value) {
  const stave = staveList.value.find((s) => s.id === activeStaveId.value);
  if (stave) {
    stave.config[key] = value;
    drawScore();
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
// 交互：点击 & 拖拽
// ============================================================

function onCanvasClick(e) {
  const touch = e.touches && e.touches[0];
  if (!touch) return;

  const rectQuery = uni.createSelectorQuery().in(instance.proxy).select('#scoreCanvas').boundingClientRect();
  rectQuery.exec((res) => {
    if (!res[0]) return;
    // 获取相对于 Canvas 内部的坐标
    const clickX = touch.pageX - res[0].left;
    const clickY = touch.pageY - res[0].top;

    let foundStave = false;
    let foundNote = false;

    // 1. 遍历所有行，查找是否点中了某个音符
    for (let staveIdStr in visualMaps) {
      const notesVisuals = visualMaps[staveIdStr];
      
      // 遍历该行所有可见音符
      for (let i = 0; i < notesVisuals.length; i++) {
        const visual = notesVisuals[i];
        if (visual.bbox) {
          // 增加一点点击容错范围 (padding 5px)
          const padding = 10;
          const bx = visual.bbox.x - padding;
          const by = visual.bbox.y - padding;
          const bw = visual.bbox.w + padding * 2;
          const bh = visual.bbox.h + padding * 2;

          // 碰撞检测
          if (clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh) {
            selectedNoteId.value = visual.id; // 选中音符
            activeStaveId.value = parseInt(staveIdStr); // 同时激活所在的行
            foundNote = true;
            break;
          }
        }
      }
      if (foundNote) break;
    }

    // 2. 如果没有点中音符，判断是否点中了行（原有逻辑）
    if (!foundNote) {
      // 点击空白处，取消音符选中
      selectedNoteId.value = null;

      for (let id in layoutMaps) {
        const layout = layoutMaps[id];
        // 扩大一点判定范围
        if (clickY >= layout.y - 40 && clickY <= layout.y + layout.height + 40) {
          activeStaveId.value = parseInt(id);
          foundStave = true;
          break;
        }
      }
    }

    // 重绘以更新高亮状态
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
    ghostStyle.value = `left:${touch.pageX - 20}px;top:${touch.pageY - 40}px;`;
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

      // 1. 严格判定：手指落在哪个“蓝色区域”内
      for (let id in layoutMaps) {
        const layout = layoutMaps[id];
        // 直接使用 drawScore 里记录的 top 和 bottom
        if (y >= layout.top && y <= layout.bottom) {
          targetStaveId = parseInt(id);
          targetLayout = layout;
          break;
        }
      }

      // 2. 兜底逻辑（可选）：如果正好点在两个区域的缝隙（虽然现在应该没有缝隙），或者点在最下方空白处
      // 如果你希望点在空白处自动吸附到最后一行，可以保留下面的逻辑，否则可以删除
      if (!targetStaveId) {
        // 寻找距离最近的行作为备选（防止拖出边界无效）
        let minDistance = Infinity;
        for (let id in layoutMaps) {
          const layout = layoutMaps[id];
          const center = layout.top + (layout.bottom - layout.top) / 2;
          const dist = Math.abs(y - center);
          if (dist < minDistance && dist < 200) {
            // 200px 范围内吸附
            minDistance = dist;
            targetStaveId = parseInt(id);
            targetLayout = layout;
          }
        }
      }

      if (targetStaveId) {
        activeStaveId.value = targetStaveId;
        const staveObj = staveList.value.find((s) => s.id === targetStaveId);

        if (staveObj) {
          // 注意：这里用 targetLayout.y (五线谱线的起始Y) 来创建临时 Stave
          const tempStave = new VF.Stave(0, targetLayout.y, 400);
          tempStave.addClef(staveObj.config.clef || 'treble');

          const pitch = calculatePitchFromY(y, tempStave, staveObj.config);
          insertNoteToStave(targetStaveId, x, pitch, selected.value.duration);
          drawScore();
        }
      }
    }
    isDragging.value = false;
    ghostStyle.value = '';
  });
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

/**
 * 核心算法：根据 Y 坐标 + 谱号 + 调号，计算出准确的音高
 * 修复：【新增限制】限制最大加线数量，防止拖拽到无穷远导致渲染崩溃
 */
function calculatePitchFromY(y, stave, config) {
  const { clef, keySignature } = config;

  // 1. 获取五线谱 Line (原始值)
  let line = stave.getLineForY(y);

  // ======================================================
  // 【新增限制】: 限制加线数量 (Clamping)
  // ======================================================
  const MAX_LEDGER_LINES = 5; // 允许最大加线数 (5条)

  // 顶线是 0，往上是负数。限制为 -5
  const TOP_LIMIT = 0 - MAX_LEDGER_LINES;
  // 底线是 4，往下是正数。限制为 4 + 5 = 9
  const BOTTOM_LIMIT = 4 + MAX_LEDGER_LINES;

  // 强制修正 line 的范围
  if (line < TOP_LIMIT) line = TOP_LIMIT;
  if (line > BOTTOM_LIMIT) line = BOTTOM_LIMIT;
  // ======================================================

  // 2. 确定基准音
  let bottomLineNote = { step: 'E', octave: 4 }; // Treble
  if (clef === 'bass') bottomLineNote = { step: 'G', octave: 2 };
  if (clef === 'alto') bottomLineNote = { step: 'F', octave: 3 };
  if (clef === 'tenor') bottomLineNote = { step: 'D', octave: 3 };

  const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const bottomLineIndex = bottomLineNote.octave * 7 + noteNames.indexOf(bottomLineNote.step);

  // 使用限制后的 line 计算步数
  const visualSteps = Math.round((4 - line) * 2);
  const targetIndex = bottomLineIndex + visualSteps;

  const octave = Math.floor(targetIndex / 7);
  const stepIndex = targetIndex % 7;
  const safeStepIndex = stepIndex < 0 ? 7 + stepIndex : stepIndex;
  const noteName = noteNames[safeStepIndex];

  // 3. 调号处理
  const KEY_DATA = {
    C: { type: '', notes: [] },
    G: { type: '#', notes: ['F'] },
    D: { type: '#', notes: ['F', 'C'] },
    A: { type: '#', notes: ['F', 'C', 'G'] },
    E: { type: '#', notes: ['F', 'C', 'G', 'D'] },
    B: { type: '#', notes: ['F', 'C', 'G', 'D', 'A'] },
    'F#': { type: '#', notes: ['F', 'C', 'G', 'D', 'A', 'E'] },
    'C#': { type: '#', notes: ['F', 'C', 'G', 'D', 'A', 'E', 'B'] },
    F: { type: 'b', notes: ['B'] },
    Bb: { type: 'b', notes: ['B', 'E'] },
    Eb: { type: 'b', notes: ['B', 'E', 'A'] },
    Ab: { type: 'b', notes: ['B', 'E', 'A', 'D'] },
    Db: { type: 'b', notes: ['B', 'E', 'A', 'D', 'G'] },
    Gb: { type: 'b', notes: ['B', 'E', 'A', 'D', 'G', 'C'] },
    Cb: { type: 'b', notes: ['B', 'E', 'A', 'D', 'G', 'C', 'F'] }
  };

  const currentKeyData = KEY_DATA[keySignature] || KEY_DATA['C'];
  let acc = '';

  if (currentKeyData.notes.includes(noteName)) {
    acc = currentKeyData.type;
  }

  return `${noteName}${acc}/${octave}`;
}
// ============================================================
// 数据处理逻辑 (支持动态拍号 + 动态谱号)
// ============================================================
// 1. 增加 clef 参数，默认为 treble
function processNotesToMeasures(rawNotes, timeSignature = '4/4', clef = 'treble') {
  const measures = [];
  let currentMeasure = { notes: [], ties: [], beams: [] };
  let currentTicks = 0;

  const RESOLUTION = VF.RESOLUTION;
  const [numStr, denStr] = timeSignature.split('/');
  const num = parseInt(numStr) || 4;
  const den = parseInt(denStr) || 4;
  const ticksPerBeatUnit = RESOLUTION / den;
  const maxTicksPerMeasure = ticksPerBeatUnit * num;

  const durationTicks = {
    w: RESOLUTION,
    h: RESOLUTION / 2,
    q: RESOLUTION / 4,
    8: RESOLUTION / 8,
    16: RESOLUTION / 16,
    32: RESOLUTION / 32,
    64: RESOLUTION / 64,
    qr: RESOLUTION / 4,
    hr: RESOLUTION / 2,
    wr: RESOLUTION,
    '8r': RESOLUTION / 8,
    '16r': RESOLUTION / 16,
    '32r': RESOLUTION / 32,
    '64r': RESOLUTION / 64
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
    id: n.id, // <--- 关键：音符高亮保留原始ID
    isRest: n.duration.indexOf('r') !== -1
  }));

  let noteIndex = 0;
  let pendingNote = null;

  while (noteIndex < noteQueue.length || pendingNote) {
    let item = pendingNote || noteQueue[noteIndex];
    const ticksSpace = maxTicksPerMeasure - currentTicks;

    if (ticksSpace <= 10) {
      measures.push(currentMeasure);
      currentMeasure = { notes: [], ties: [], beams: [] };
      currentTicks = 0;
      continue;
    }

    if (!pendingNote) noteIndex++;

    const createVexNote = (ticks, originalItem) => {
      let baseDuration = getBestDuration(ticks);
      let vfKeys = [originalItem.pitch];
      let vfDuration = baseDuration;

      // 休止符位置处理
      if (originalItem.isRest) {
        // 根据谱号调整休止符的默认位置，让它好看点
        // 默认 b/4 在高音谱号是中间，但在低音谱号可能偏了，通常 b/4 是通用的中间线
        vfKeys = ['b/4'];
        vfDuration = baseDuration + 'r';
      }

     const vfNote = new VF.StaveNote({
        keys: vfKeys,
        duration: vfDuration,
        auto_stem: !originalItem.isRest,
        clef: clef 
      });

      // 音符高亮，将原始音符ID挂载到 VexFlow 对象上
      vfNote.sourceNoteId = originalItem.id; 
      
      return vfNote;
    };

    if (item.totalTicks <= ticksSpace + 10) {
      const vfNote = createVexNote(item.totalTicks, item);
      vfNote.sourceRawIndex = item.rawIndex;
      currentMeasure.notes.push(vfNote);
      currentTicks += item.totalTicks;
      if (item.isLinkedToPrevious && !item.isRest) vfNote.isIncomingTie = true;
      pendingNote = null;
    } else {
      const firstPartTicks = ticksSpace;
      const remainTicks = item.totalTicks - ticksSpace;
      const note1 = createVexNote(firstPartTicks, item);
      note1.sourceRawIndex = item.rawIndex;
      currentMeasure.notes.push(note1);
      currentTicks += firstPartTicks;

      pendingNote = {
        pitch: item.pitch,
        rawDuration: item.rawDuration,
        totalTicks: remainTicks,
        isLinkedToPrevious: true,
        rawIndex: item.rawIndex,
        id: item.id, // 音符高亮：跨小节的后半部分音符也要有 ID
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
 // 定义哪些时值的音符支持符尾连线 (通常是 8分及更短)
  const beamableDurations = ['8', '16', '32', '64'];

  measures.forEach((m) => {
    m.beams = [];
    let noteGroup = []; // 当前正在收集的连续可连线音符组

    m.notes.forEach((note) => {
      // 1. 获取音符的纯时值字符串（去掉 'r' 等修饰，例如 '8r' -> '8'）
      // 注意：VexFlow note.duration 可能是 '8', 'q', 'h', '8r' 等
      const durationKey = note.duration.replace('r', '');
      
      // 2. 判断是否为休止符
      const isRest = note.duration.includes('r');

      // 3. 判断是否可连线：必须在列表中，且不能是休止符（通常休止符打断连线）
      const isBeamable = beamableDurations.includes(durationKey) && !isRest;

      if (isBeamable) {
        // 如果是可连线音符，加入当前组
        noteGroup.push(note);
      } else {
        // --- 遇到不可连线音符（4分、2分、休止符），结算上一组 ---
        if (noteGroup.length > 1) {
          // 使用 generateBeams 自动处理组内的节拍划分（比如4个16分音符会自动分组）
          const beams = VF.Beam.generateBeams(noteGroup, {
            beam_rests: false,
            beam_middle_only: false
          });
          m.beams.push(...beams);
        }
        // 清空组，重新开始
        noteGroup = [];
      }
    });

    // --- 循环结束后，处理最后可能残留的一组 ---
    if (noteGroup.length > 1) {
      const beams = VF.Beam.generateBeams(noteGroup);
      m.beams.push(...beams);
    }
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

  const windowInfo = uni.getWindowInfo();
  const screenWidth = windowInfo.windowWidth;

  const renderDataList = [];

  staveList.value.forEach((staveObj) => {
     // 1. 获取当前行的拍号配置（用于创建正确的 Voice）
    const timeSigStr = staveObj.config.timeSignature || '4/4';
    const [numStr, denStr] = timeSigStr.split('/');
    const numBeats = parseInt(numStr) || 4;
    const beatValue = parseInt(denStr) || 4;
    // 传入配置的拍号
    const measures = processNotesToMeasures(staveObj.notes, staveObj.config.timeSignature, staveObj.config.clef);

    const calculatedWidths = [];
    let rowWidth = 10;
    let rowMinY = 0;
    let rowMaxY = 80;

    measures.forEach((measure, index) => {
      // 1. Modifier (谱号/调号) 宽度计算
      const dummyStave = new VF.Stave(0, 0, 500);
      if (index === 0) {
        dummyStave.addClef(staveObj.config.clef).addKeySignature(staveObj.config.keySignature).addTimeSignature(staveObj.config.timeSignature);
      }
      const modifierWidth = dummyStave.getNoteStartX();

      // 2. 音符内容宽度计算
      let measureContentWidth = 0; // 纯音符内容的宽度
      let voice = null;

      if (measure.notes.length > 0) {
        voice = new VF.Voice({ num_beats: numBeats, beat_value: beatValue })
        voice.setStrict(false);
        voice.addTickables(measure.notes);

        // 自动升降号
        if (VF.Accidental) {
          VF.Accidental.applyAccidentals([voice], staveObj.config.keySignature);
        }

        const formatter = new VF.Formatter().joinVoices([voice]);
        // 这会让 VexFlow 计算出音符紧凑排列所需的“绝对最小宽度”
        formatter.preCalculateMinTotalWidth([voice]);
        measureContentWidth = formatter.getMinTotalWidth();

        // 计算高度包围盒
        formatter.format([voice], 0); // 0 表示只计算不强制拉伸
        measure.notes.forEach((note) => {
          note.setStave(dummyStave);
          const box = note.getBoundingBox();
          if (box) {
            if (box.y < rowMinY) rowMinY = box.y;
            if (box.y + box.h > rowMaxY) rowMaxY = box.y + box.h;
          }
        });
      } else {
        measureContentWidth  = 40; // 空小节默认宽
      }

      // =======================================================
      // 【核心优化】: 比例系数 + 小额补偿
      // =======================================================

      // 1. 弹性宽度：极限宽度 * 1.25
      let finalContentWidth = Math.max(measureContentWidth + 20, 60);

      // 4. 右侧留白 (Padding)
      let extraRightPadding = index === measures.length - 1 ? 50 : 20;// 中间小节不给额外 padding，让小节线紧凑点

      let measureWidth = modifierWidth + finalContentWidth + extraRightPadding;

      calculatedWidths.push({
        measureWidth,
        formatWidth: finalContentWidth, // 告诉 Formatter 用这个宽度去排版
        voice
      });
      rowWidth += measureWidth;
    });

    // 计算每行的布局高度
    const topPadding = 30;
    let offsetY = 0;
    if (rowMinY < 0) offsetY = Math.abs(rowMinY) + topPadding;
    const actualHeight = offsetY + rowMaxY + 30;

    renderDataList.push({
      staveObj,
      measures,
      calculatedWidths,
      offsetY,
      actualHeight,
      rowWidth
    });
  });

  // --- 计算最大宽度 ---
  let maxRequiredWidth = 0;
  renderDataList.forEach((d) => {
    if (d.rowWidth > maxRequiredWidth) maxRequiredWidth = d.rowWidth;
  });

  // 宽度计算加入 screenWidth 保底
  const finalScoreWidth = Math.max(maxRequiredWidth + 50, screenWidth);

  let totalCanvasHeight = 20;
  renderDataList.forEach((d) => (totalCanvasHeight += d.actualHeight));
  totalCanvasHeight = Math.max(totalCanvasHeight, 300);

  // Resize Check
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
  let cursorY = 20;

  renderDataList.forEach((data) => {
    const { staveObj, measures, calculatedWidths, offsetY, actualHeight } = data;
    const staveY = cursorY + offsetY;

    // 记录区域
    layoutMaps[staveObj.id] = { top: cursorY, bottom: cursorY + actualHeight, y: staveY };
    visualMaps[staveObj.id] = [];

    // 选中高亮
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
        // 使用带有“富裕空间”的宽度进行排版
        const availableWidth = layoutInfo.formatWidth;
        const formatter = new VF.Formatter().joinVoices([voice]);

        // 【关键】VexFlow 会把 extra space 均匀撒在音符之间
        formatter.format([voice], availableWidth);
        // 音符高亮
        measure.notes.forEach((note) => {
          // 如果该音符的源ID 等于 当前选中的ID
          if (note.sourceNoteId && note.sourceNoteId === selectedNoteId.value) {
            note.setStyle({ fillStyle: '#ff4d4f', strokeStyle: '#ff4d4f' }); // 红色高亮
          } else {
            // 确保非选中音符恢复默认样式 (黑色)
            note.setStyle({ fillStyle: 'black', strokeStyle: 'black' });
          }
        });
        voice.draw(ctx, stave);

        measure.notes.forEach((note) => {
          let noteX = stave.getX() + 50;
           let bbox = null;// 音符高亮
          try {
            noteX = note.getAbsoluteX();
            // 获取音符的包围盒 (x, y, w, h)
            bbox = note.getBoundingBox();
          } catch (e) {}
          if (note.sourceRawIndex !== undefined) {
            // 存入 visualMaps，包含 id 和 包围盒
            visualMaps[staveObj.id].push({ 
              x: noteX, 
              rawIndex: note.sourceRawIndex,
              id: note.sourceNoteId, // 原始ID
              bbox: bbox // 碰撞区域
            });
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
  height: 50vh;
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
.tools {
  height: 30vh;
  overflow-y: auto;
}
</style>
