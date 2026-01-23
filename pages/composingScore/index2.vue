<template>
  <scroll-view scroll-x class="score-scroll-container">
    <!-- 绑定 dynamicHeight -->
    <view class="canvas-wrapper" :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }">
      <canvas id="scoreCanvas" canvas-id="scoreCanvas" type="2d" :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }" />
    </view>
  </scroll-view>

  <image v-if="isDragging" class="drag-ghost" :style="ghostStyle" :src="selected.icon" mode="aspectFit" />
  <view class="add" @clcik="addStave">新增一行</view>
  <!-- 底部工具栏保持不变 -->
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
      <image class="note-icon" v-if="d.icon" :src="d.icon" mode="aspectFit" />
      <view class="note-label">{{ d.label }}</view>
    </view>
  </view>
  <view class="musicConfig">
    <view class="clef">
      <view class="item" @click="musicConfig.clef = item.id" v-for="item in clefList">{{ item.label }}</view>
    </view>
    <view class="timeSignatureList">
      <view class="item" @click="musicConfig.timeSignature = item.id" v-for="item in timeSignatureList">{{ item.id }}</view>
    </view>
    <view class="keySignatureList">
      <view class="item" @click="musicConfig.keySignature = item.id" v-for="item in keySignatureList">{{ item.id }}</view>
    </view>
  </view>
</template>

<script setup>
import { onMounted, getCurrentInstance, ref } from 'vue';
import Vex from 'vexflow';

// --- 基础配置 ---
const instance = getCurrentInstance();
const isDragging = ref(false);
const dragPoint = ref({ x: 0, y: 0 });
const ghostStyle = ref('');
const scoreWidth = ref(400);
let canvasNode = null;
let globalCtx = null;
let visualNoteMap = [];

// 动态布局变量
const dynamicStaveY = ref(60);
const dynamicHeight = ref(200);

// 全局音乐配置
const musicConfig = {
  clef: 'treble',
  keySignature: 'C',
  timeSignature: '4/4'
};
const clefList = [
  {
    value: 'treble',
    label: '高音谱号'
  },
  {
    value: 'bass',
    label: '低音谱号'
  },
  {
    value: 'alto',
    label: '中音谱号'
  },
  {
    value: 'tenor',
    label: '次中音谱号'
  }
];
const timeSignatureList = [
  {
    id: '4/4',
    label: '四四拍'
  },
  {
    id: '3/4',
    label: '三四拍'
  },
  {
    id: '2/4',
    label: '二四拍'
  },
  {
    id: '6/8',
    label: '六八拍'
  },
  {
    id: '3/8',
    label: '三八拍'
  },
  {
    id: '2/2',
    label: '二二拍'
  },
  {
    id: '9/8',
    label: '九八拍'
  },
  {
    id: '12/8',
    label: '十二八拍'
  },
  {
    id: '1/4',
    label: '一四拍'
  }
];
const keySignatureList = [
  // 无升降号
  {
    id: 'C',
    label: 'C大调/Am小调'
  },
  // 升号调（1-7个升号）
  {
    id: 'G',
    label: 'G大调/Em小调（1个升号）'
  },
  {
    id: 'D',
    label: 'D大调/Bm小调（2个升号）'
  },
  {
    id: 'A',
    label: 'A大调/F#m小调（3个升号）'
  },
  {
    id: 'E',
    label: 'E大调/C#m小调（4个升号）'
  },
  {
    id: 'B',
    label: 'B大调/G#m小调（5个升号）'
  },
  {
    id: 'F#',
    label: 'F#大调/D#m小调（6个升号）'
  },
  {
    id: 'C#',
    label: 'C#大调/A#m小调（7个升号）'
  },
  // 降号调（1-7个降号）
  {
    id: 'F',
    label: 'F大调/Dm小调（1个降号）'
  },
  {
    id: 'Bb',
    label: 'Bb大调/Gm小调（2个降号）'
  },
  {
    id: 'Eb',
    label: 'Eb大调/Cm小调（3个降号）'
  },
  {
    id: 'Ab',
    label: 'Ab大调/Fm小调（4个降号）'
  },
  {
    id: 'Db',
    label: 'Db大调/Bbm小调（5个降号）'
  },
  {
    id: 'Gb',
    label: 'Gb大调/Em小调（6个降号）'
  },
  {
    id: 'Cb',
    label: 'Cb大调/Abm小调（7个降号）'
  }
];
const durations = [
  { id: 'w', label: '全音符', duration: 'w', icon: '/static/icons/notes/w.png' },
  { id: 'h', label: '2分音符', duration: 'h', icon: '/static/icons/notes/h.png' },
  { id: 'q', label: '4分音符', duration: 'q', icon: '/static/icons/notes/q.png' },
  { id: '8', label: '8分音符', duration: '8', icon: '/static/icons/notes/8.png' },
  { id: '16', label: '16分音符', duration: '16', icon: '/static/icons/notes/16.png' },
  { id: '32', label: '32分音符', duration: '32', icon: '/static/icons/notes/16.png' },
  { id: '64', label: '64分音符', duration: '64', icon: '/static/icons/notes/16.png' },
  { id: 'wr', label: '休止符', duration: 'wr' }
];

const rawNotes = [];
const selected = ref(durations[2]);
let VF = null;

// ============================================================
// Context 补丁
// ============================================================
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
      const { node, width, height } = res[0];
      const ctx = node.getContext('2d');
      const windowInfo = uni.getWindowInfo();
      const dpr = windowInfo.pixelRatio || 2;

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
      const currentY = dynamicStaveY.value || 60;
      const tempStave = new VF.Stave(0, currentY, 400);

      const pitch = calculatePitchFromY(y, tempStave);
      insertNoteAtPosition(x, pitch, selected.value.duration);
      drawScore();
    }
    isDragging.value = false;
    ghostStyle.value = '';
  });
}

// ============================================================
// 修复 1: 优化插入逻辑 (避免覆盖)
// ============================================================
function insertNoteAtPosition(targetX, pitch, duration) {
  if (visualNoteMap.length === 0) {
    rawNotes.push({ pitch, duration, id: Date.now() });
    return;
  }

  // 默认追加到最后
  let insertIndex = rawNotes.length;

  // 寻找最佳插入点
  for (let i = 0; i < visualNoteMap.length; i++) {
    const visualNote = visualNoteMap[i];

    // 简单的距离判定：
    // 如果点击在音符左侧，或者点击位置距离音符中心偏左，就插在它前面
    // 这里加了 15px 的模糊范围，让判定更自然
    if (targetX < visualNote.x + 10) {
      insertIndex = visualNote.rawIndex;
      break;
    }
  }

  const newNote = { pitch, duration, id: Date.now() };

  // 安全检查
  if (insertIndex < 0) insertIndex = 0;
  if (insertIndex > rawNotes.length) insertIndex = rawNotes.length;

  rawNotes.splice(insertIndex, 0, newNote);
}

function calculatePitchFromY(y, stave) {
  const line = stave.getLineForY(y);
  const lineValue = Math.round(line * 2) / 2;
  const stepsFromC4 = Math.round((5 - lineValue) * 2);
  const octave = 4 + Math.floor(stepsFromC4 / 7);
  const noteIndex = stepsFromC4 % 7;
  const safeNoteIndex = noteIndex < 0 ? 7 + noteIndex : noteIndex;
  const scale = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  return `${scale[safeNoteIndex]}/${octave}`;
}

// ============================================================
// 修复 2: 核心 BUG 修复 (防止全音符后吞音符)
// ============================================================
function processMusicData() {
  const measures = [];
  let currentMeasure = { notes: [], ties: [], beams: [] };
  let currentBeats = 0;

  const RESOLUTION = VF.RESOLUTION;
  const ticksPerBeat = RESOLUTION / 4;
  const maxTicksPerMeasure = ticksPerBeat * 4;

  // 1. 【修复点 A】补充 32、64 和休止符的 Ticks 映射
  const durationTicks = {
    w: ticksPerBeat * 4,
    h: ticksPerBeat * 2,
    q: ticksPerBeat,
    8: ticksPerBeat / 2,
    16: ticksPerBeat / 4,
    32: ticksPerBeat / 8, // 新增
    64: ticksPerBeat / 16, // 新增
    qr: ticksPerBeat, // 新增：四分休止符 (长度等于四分音符)
    hr: ticksPerBeat * 2,
    wr: ticksPerBeat * 4,
    '8r': ticksPerBeat / 2,
    '16r': ticksPerBeat / 4,
    '32r': ticksPerBeat / 8,
    '64r': ticksPerBeat / 16
    // 如果你有其他休止符，也要加在这里，比如 '8r': ticksPerBeat/2
  };

  // 2. 【修复点 B】补充反向查询，支持更小的单位
  function getBestDuration(ticks) {
    if (ticks >= durationTicks['w']) return 'w';
    if (ticks >= durationTicks['h']) return 'h';
    if (ticks >= durationTicks['q']) return 'q';
    if (ticks >= durationTicks['8']) return '8';
    if (ticks >= durationTicks['16']) return '16';
    if (ticks >= durationTicks['32']) return '32'; // 新增
    return '64'; // 最小兜底
  }

  // 构建队列
  let noteQueue = rawNotes.map((n, index) => ({
    pitch: n.pitch,
    rawDuration: n.duration,
    // 关键：如果字典里查不到(比如'qr')，会变成 undefined，导致后面报错或走兜底
    // 这里确保 'qr' 能查到 4096
    totalTicks: durationTicks[n.duration] || durationTicks['q'],
    rawIndex: index,
    // 标记是否为休止符 (只要 duration 包含 'r' 就算)
    isRest: n.duration.indexOf('r') !== -1
  }));

  let noteIndex = 0;
  let pendingNote = null;

  while (noteIndex < noteQueue.length || pendingNote) {
    let item = pendingNote || noteQueue[noteIndex];
    const ticksSpace = maxTicksPerMeasure - currentBeats;

    // 换行逻辑
    if (ticksSpace <= 0) {
      // 甚至可以用 < 10 来容错
      measures.push(currentMeasure);
      currentMeasure = { notes: [], ties: [], beams: [] };
      currentBeats = 0;
      continue;
    }

    if (!pendingNote) {
      noteIndex++;
    }

    // 3. 【修复点 C】生成 VexFlow 音符时的特殊处理
    // 封装一个创建音符的辅助函数，处理休止符逻辑
    const createVexNote = (ticks, originalItem) => {
      // 根据 ticks 算出最佳时值 (如 'q', '8')
      let baseDuration = getBestDuration(ticks);

      // 如果原始数据是休止符，要在时值后面加 'r' (例如 'q' -> 'qr')
      // 并且 key 必须设为默认值 (如 "b/4")
      let vfKeys = [originalItem.pitch];
      let vfDuration = baseDuration;

      if (originalItem.isRest) {
        vfKeys = ['b/4']; // 休止符通常画在中间
        vfDuration = baseDuration + 'r'; // VexFlow 格式: "qr", "8r"
      }

      const note = new VF.StaveNote({
        keys: vfKeys,
        duration: vfDuration,
        auto_stem: !originalItem.isRest // 休止符不需要符干
      });

      // 如果是休止符，通常加点样式或位置微调（可选）
      if (originalItem.isRest) {
        // 可以在这里做休止符的垂直居中微调，一般 b/4 就够了
      }

      return note;
    };

    if (item.totalTicks <= ticksSpace) {
      // === 情况 A: 能放下 ===
      const vfNote = createVexNote(item.totalTicks, item);

      vfNote.sourceRawIndex = item.rawIndex;
      currentMeasure.notes.push(vfNote);
      currentBeats += item.totalTicks;

      if (item.isLinkedToPrevious && !item.isRest) {
        vfNote.isIncomingTie = true;
      }

      pendingNote = null;
    } else {
      // === 情况 B: 放不下，拆分 ===
      // 注意：休止符通常尽量不拆分（乐理上休止符跨小节一般不连线，而是写成两个休止符）
      // 这里沿用统一拆分逻辑，VexFlow 会画出两个休止符，没问题

      const firstPartTicks = ticksSpace;
      const remainTicks = item.totalTicks - ticksSpace;

      const note1 = createVexNote(firstPartTicks, item);
      note1.sourceRawIndex = item.rawIndex;

      currentMeasure.notes.push(note1);
      currentBeats += firstPartTicks;

      pendingNote = {
        pitch: item.pitch,
        rawDuration: item.rawDuration, // 保持原始 duration 字符串 (含 'r')
        totalTicks: remainTicks,
        isLinkedToPrevious: true,
        rawIndex: item.rawIndex,
        isRest: item.isRest
      };

      // 休止符不画延音线 (Tie)
      if (!item.isRest) {
        currentMeasure.ties.push({ fromNote: note1, isCrossMeasure: true });
      }
    }
  }

  if (currentMeasure.notes.length > 0 || measures.length === 0) {
    measures.push(currentMeasure);
  }

  // 生成 Beams (休止符不参与连线)
  measures.forEach((m) => {
    // 过滤掉休止符再计算 Beam
    const notesToBeam = m.notes.filter((n) => !n.duration.includes('r'));
    if (notesToBeam.length > 0) {
      // 这里的 generateBeams 需要连续的音符列表，直接传 filter 后的可能导致隔着休止符连线
      // 更严谨的做法是按组 Beam，简单起见 VexFlow 通常能处理
      m.beams = VF.Beam.generateBeams(notesToBeam);
    }
  });

  return measures;
}

function drawScore() {
  if (!VF || !canvasNode || !globalCtx) return;
  const ctx = globalCtx;

  visualNoteMap = [];
  const measures = processMusicData();

  // --- 阶段 1: 预计算布局 (Calculate Layout) ---
  let calculatedWidths = [];
  let totalRequiredWidth = 10;

  let globalMinY = 0;
  let globalMaxY = 100;

  measures.forEach((measure, index) => {
    // 1. Modifier (谱号/调号) 宽度计算
    const dummyStave = new VF.Stave(0, 0, 500);
    if (index === 0) {
      dummyStave.addClef(musicConfig.clef).addKeySignature(musicConfig.keySignature).addTimeSignature(musicConfig.timeSignature);
    }
    const modifierWidth = dummyStave.getNoteStartX();

    // 2. 音符内容宽度计算
    let minNoteWidth = 0;
    let voice = null;

    if (measure.notes.length > 0) {
      voice = new VF.Voice({ num_beats: 4, beat_value: 4 });
      voice.setStrict(false);
      voice.addTickables(measure.notes);

      const formatter = new VF.Formatter().joinVoices([voice]);

      // 【关键步骤】让 VexFlow 算出如果不重叠，最小需要多少像素
      formatter.preCalculateMinTotalWidth([voice]);
      minNoteWidth = formatter.getMinTotalWidth();

      // 用于计算高度 (BoundingBox)
      formatter.format([voice], 500);

      measure.notes.forEach((note) => {
        note.setStave(dummyStave);
        const box = note.getBoundingBox();
        if (box) {
          if (box.y < globalMinY) globalMinY = box.y;
          if (box.y + box.h > globalMaxY) globalMaxY = box.y + box.h;
        }
      });
    } else {
      minNoteWidth = 40; // 空小节默认宽
    }

    // =======================================================
    // 【核心优化】: 让 VexFlow 自己决定排版
    // =======================================================

    // 1. 呼吸空间：在“极限挤压宽度”的基础上，给 30px 的缓冲
    // 这样音符不会贴在一起，也不会像之前那样隔得老远
    let contentWidth = minNoteWidth + 30;

    // 2. 最小保底：防止单音符小节太窄 (至少60px)
    contentWidth = Math.max(contentWidth, 60);

    // 3. 右侧留白 (Padding)
    // 中间的小节给 10px 即可，最后一小节给 80px 拖拽区
    let extraRightPadding = 10;
    if (index === measures.length - 1) {
      extraRightPadding = 80;
    }

    // 小节总宽 = 头部修饰宽 + 内容宽 + 右侧留白
    let measureWidth = modifierWidth + contentWidth + extraRightPadding;

    calculatedWidths.push({
      measureWidth: measureWidth,
      formatWidth: contentWidth, // 告诉 Formatter 用这个宽度去排版
      modifierWidth: modifierWidth,
      voice: voice
    });
    totalRequiredWidth += measureWidth;
  });

  // --- 阶段 2: 动态高度/宽度调整 (逻辑不变) ---
  const topPadding = 20;
  let newStaveY = 60;
  if (globalMinY < 0) {
    newStaveY = Math.abs(globalMinY) + topPadding;
  }
  const bottomPadding = 50;
  let newHeight = newStaveY + globalMaxY + bottomPadding;
  newHeight = Math.max(newHeight, 200);

  dynamicStaveY.value = newStaveY;
  dynamicHeight.value = newHeight;

  const finalScoreWidth = Math.max(totalRequiredWidth + 50, 350);

  if (Math.abs(scoreWidth.value - finalScoreWidth) > 5 || Math.abs(canvasNode.height / (uni.getWindowInfo().pixelRatio || 2) - newHeight) > 5) {
    scoreWidth.value = finalScoreWidth;
    const dpr = uni.getWindowInfo().pixelRatio || 2;
    canvasNode.width = finalScoreWidth * dpr;
    canvasNode.height = newHeight * dpr;
    ctx.scale(dpr, dpr);
    applyContextPatch(ctx);
  }

  // --- 阶段 3: 绘制 (逻辑不变) ---
  ctx.clear();
  let currentX = 10;
  const yPos = dynamicStaveY.value;

  let prevMeasureLastNote = null;
  let needTieFromPrev = false;

  measures.forEach((measure, index) => {
    const layoutInfo = calculatedWidths[index];
    const measureWidth = layoutInfo.measureWidth;

    const stave = new VF.Stave(currentX, yPos, measureWidth);
    if (index === 0) {
      stave.addClef(musicConfig.clef).addKeySignature(musicConfig.keySignature).addTimeSignature(musicConfig.timeSignature);
    }
    if (index === measures.length - 1) {
      stave.setEndBarType(VF.Barline.type.END);
    }
    stave.setContext(ctx).draw();

    const voice = layoutInfo.voice;
    if (voice) {
      // 使用计算好的 contentWidth 给 VexFlow 排版
      const availableWidth = layoutInfo.formatWidth;
      const formatter = new VF.Formatter().joinVoices([voice]);

      // 【关键】VexFlow 会自动在这个宽度内均匀分布音符
      formatter.format([voice], availableWidth);

      voice.draw(ctx, stave);

      measure.notes.forEach((note) => {
        let noteX = stave.getX() + 50;
        try {
          noteX = note.getAbsoluteX();
        } catch (e) {}
        if (note.sourceRawIndex !== undefined) {
          visualNoteMap.push({ x: noteX, rawIndex: note.sourceRawIndex });
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
}
// 新增一行
const addStave = () => {};
</script>

<style scoped lang="scss">
/* 样式保持不变 */
.score-scroll-container {
  width: 100%;
  white-space: nowrap;
  background: #fff;
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
  .clef,
  .timeSignatureList,
  .keySignatureList {
    margin: 20rpx 0;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    .item {
      padding: 10rpx;
      border: 1px solid #ccc;
    }
  }
}
.add {
  margin: 20rpx 0;
}
</style>
