<template>
  <scroll-view scroll-x scroll-y class="score-scroll-container">
    <!-- 绑定 dynamicHeight -->
    <view
      class="canvas-wrapper"
      :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }"
    >
      <canvas
        id="scoreCanvas"
        canvas-id="scoreCanvas"
        type="2d"
        :style="{ width: scoreWidth + 'px', height: dynamicHeight + 'px' }"
        @touchstart="onCanvasClick"
      />
    </view>
  </scroll-view>

  <image
    v-if="isDragging"
    class="drag-ghost"
    :style="ghostStyle"
    :src="selected.icon"
    mode="aspectFit"
  />
  <!-- 音符工具栏 -->
  <view class="note_tools">
    <view class="item add" @click="addStave">新增一行</view>
    <view class="item delete" @click="clearCurrentStaveNotes">清空当前行</view>
    <view class="item delete" @click="deleteSelectedNote">删除音符</view>
    <view class="item delete" @click="resetScore">全部清空</view>
  </view>
  <view class="note-bar">
    <view
      v-for="d in durations"
      :key="d.id"
      class="note-btn"
      :class="{ active: selected?.id === d.id }"
      @touchstart.stop="(e) => onDragStart(e, d)"
      @touchmove.stop="onDragMove"
      @touchend.stop="onDragEnd"
    >
      <!-- <image class="note-icon" v-if="d.icon" :src="d.icon" mode="aspectFit" /> -->
      <view class="note-label">{{ d.label }}</view>
    </view>
  </view>
 

  <view class="tools">
    <!-- <view class="control-panel">
      <view class="add-btn" @click="addStave">
        <text style="font-size: 16px; margin-right: 4px">+</text>
        新增一行乐谱
      </view>
      <view class="info-text">当前选中：第 {{ activeStaveIndex + 1 }} 行</view>
    </view> -->

    <!-- 配置区域：操作的是当前选中的 Stave -->
     
    <view class="musicConfig" v-if="activeStaveConfig">
      <view class="tablist">
        <view  class="item" :class="{active:current===index}" @click="current=index" v-for="(item,index) in list" :key="item">{{ item }}</view>
      </view>
      <view class="clef" v-if="current===0">
        <view
          class="item"
          :class="{ active: activeStaveConfig.clef === item.value }"
          @click="updateStaveConfig('clef', item.value)"
          v-for="item in clefList"
          :key="item.value"
        >
          {{ item.label }}
        </view>
      </view>

      <view class="timeSignatureList" v-if="current===1">
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

      <view class="keySignatureList" v-if="current===2">
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
      <view class="modifier-tools" v-if="current===3">
    <!-- 临时记号 -->
    <view class="tool-group">
      <view
        v-for="a in accidentals"
        :key="a.id"
        class="item"
        :class="{ active: selectedAccidental === a.value }"
        @tap="updateNoteAccidental(a.value)"
      >
        {{ a.label }}
      </view>
       <view 
      class="item" 
      :class="{ active: isNoteDotted }" 
      @tap="toggleNoteDot"
    >
      附点 (.)
    </view>
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
const list = ref(['谱号', '调号', '拍号','修饰符']);  
const current = ref(1); 
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
  { id: 'C#' },
  { id: 'F' },
  { id: 'Bb' },
  { id: 'Eb' },
  { id: 'Ab' },
  { id: 'Db' },
  { id: 'Gb' },
  { id: 'Cb' }
];
const durations = [
  { id: 'w', label: '1', duration: 'w', icon: '/static/icons/notes/w.png' },
  { id: 'h', label: '1/2', duration: 'h', icon: '/static/icons/notes/h.png' },
  { id: 'q', label: '1/4', duration: 'q', icon: '/static/icons/notes/q.png' },
  { id: '8', label: '1/8', duration: '8', icon: '/static/icons/notes/8.png' },
  { id: '16', label: '1/16', duration: '16', icon: '/static/icons/notes/16.png' },
  { id: '32', label: '1/32', duration: '32', icon: '/static/icons/notes/16.png' },
  { id: '64', label: '1/64', duration: '64', icon: '/static/icons/notes/16.png' },
  { id: 'qr', label: '休止符', duration: 'qr', icon: '/static/icons/notes/16.png' }
];
// 修饰符
const accidentals = [
  { id: "#", label: "♯", value: "#",selected:false },
  { id: "b", label: "♭", value: "b",selected:false  },
  { id: "n", label: "♮", value: "n" ,selected:false },
  { id: "##", label: "𝄪", value: "##" ,selected:false },
  { id: "bb", label: "𝄫", value: "bb" ,selected:false },
];

const selected = ref(durations[2]);
let VF = null;
const selectedAccidental=ref(null)
// 【新增】存储当前选中音符的详细信息
const selectedNoteInfo = ref({
  step: '',       // 音名 (C, D, E...)
  accidental: '', // 修饰符 (#, b, n, bb...)
  octave: '',     // 八度 (3, 4, 5...)
  pitch: ''       // 完整 pitch 字符串
});
const isNoteDotted = ref(false); // 【新增】当前选中音符是否带附点
/**
 * 解析 pitch 字符串
 * @param {String} pitchStr 例如 "C#/4", "Bb/5", "C/4"
 */
function parsePitch(pitchStr) {
  if (!pitchStr) return { step: '', accidental: '', octave: '' };
  
  const [key, octave] = pitchStr.split('/'); // 分割 "C#" 和 "4"
  const step = key[0]; // "C"
  const accidental = key.substring(1); // "#" 或 "b" 或 "" (空字符串表示无修饰符)
  
  return {
    step,
    accidental,
    octave
  };
}
// 选中修饰符
// function selectAccidental(a) {
//   selectedAccidental.value = a;
// }
/**
 * 修改当前选中音符的修饰符
 * @param {String} accValue  修饰符值: '#', 'b', 'n', '##', 'bb' 或 null
 */
function updateNoteAccidental(accValue) {
  
  // 1. 更新 UI 选中状态
  selectedAccidental.value = accValue===selectedAccidental.value?'':accValue;

  // 2. 如果没有选中音符，则直接返回（或者你可以设计为设置“默认修饰符”）
  if (!selectedNoteId.value) return;

  // 3. 查找并修改数据
  const stave = staveList.value.find(s => s.id === activeStaveId.value);
  if (!stave) return;
  const note = stave.notes.find(n => n.id === selectedNoteId.value);

  if (note) {
    // 解析当前 pitch，保持音名(step)和八度(octave)不变，只替换修饰符
    const { step, octave } = parsePitch(note.pitch);
    let newAccSuffix = selectedAccidental.value;
    
    note.pitch = `${step}${newAccSuffix}/${octave}`;
    console.log("新的音符音高", note.pitch );
    
    
    // 重绘
    drawScore();
  }
}

/**
 * 切换当前选中音符的附点状态
 */
function toggleNoteDot() {
  if (!selectedNoteId.value) return;

  const stave = staveList.value.find(s => s.id === activeStaveId.value);
  if (!stave) return;
  const note = stave.notes.find(n => n.id === selectedNoteId.value);

  if (note) {
    // 切换状态
    isNoteDotted.value = !isNoteDotted.value;

    // 修改 duration 字符串
    // 规则：如果有 'd' 去掉，没有 'd' 加上
    if (isNoteDotted.value) {
      if (!note.duration.includes('d')) {
        note.duration += 'd';
      }
    } else {
      note.duration = note.duration.replace('d', '');
    }
    
    // 重绘
    drawScore();
  }
}
// 处理音符按钮点击：切换工具 OR 修改选中音符时值
const onNoteBtnClick=(d)=> {
  // 1. 无论如何，先把当前工具选中（视觉反馈）
  selected.value = d;

  // 2. 如果当前有选中的音符 (selectedNoteId 不为空)
  if (selectedNoteId.value) {
    // 找到当前激活的 Stave
    const stave = staveList.value.find((s) => s.id === activeStaveId.value);
    if (!stave) return;

    // 在该 Stave 中找到对应的音符数据
    const targetNote = stave.notes.find((n) => n.id === selectedNoteId.value);
    console.log("notes",targetNote);
    
    if (targetNote) {
      // 3. 修改音符数据的时值
      targetNote.duration = d.duration;

      // 特殊处理：如果是修改为休止符，或者从休止符改回音符，可能需要处理 pitch
      // 这里简易处理：processNotesToMeasures 里的逻辑已经能处理 'qr', '8r' 等字符串
      // 如果你希望变成休止符后 pitch 归位到中间线，可以在这里重置 targetNote.pitch = 'B/4'
      // 但保留原音高通常更符合直觉（方便改回音符）

      // 4. 重绘乐谱
      drawScore();
    }
  }
}

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
// canvas交互：点击 & 拖拽
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
            // 找到点击音符数据================================================
            const currentStave = staveList.value.find(s => s.id === parseInt(staveIdStr));
            if (currentStave) {
              // 2. 找到该音符原始数据
              const rawNote = currentStave.notes.find(n => n.id === visual.id);
              if (rawNote) {
                // 3. 解析 Pitch 获取修饰符
                const info = parsePitch(rawNote.pitch);
                
                selectedNoteInfo.value = {
                  ...info,
                  pitch: rawNote.pitch
                };
                selectedAccidental.value = info.accidental || null; //修饰符回显
                isNoteDotted.value = rawNote.duration.indexOf('d') !== -1;//附点回显
                console.log('选中音符详情：', selectedNoteInfo.value);
                console.log('获取到的修饰符：', info.accidental); // 这里就是你要的 #, b
                  console.log('回显 - 修饰符:', selectedAccidental.value, '附点:', isNoteDotted.value);
              }
            }
            // 找到点击音符数据========================================================
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
      // 清空点击音符详情
      selectedNoteInfo.value = { step: '', accidental: '', octave: '', pitch: '' };
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
// 【新增】用于区分点击和拖拽的临时变量
const dragStartPoint = { x: 0, y: 0 };
const dragThreshold = 5; // 移动超过5px才算拖拽
function onDragStart(e, d) {
   const touch = e.touches ? e.touches[0] : e.changedTouches[0];
  dragStartPoint.x = touch.pageX;
  dragStartPoint.y = touch.pageY;
  selected.value = d;
  isDragging.value = false;
  updateGhost(e);
}
function onDragMove(e) {
  const touch = e.touches ? e.touches[0] : e.changedTouches[0];
  if (!touch) return;

  // 2. 计算移动距离
  const deltaX = Math.abs(touch.pageX - dragStartPoint.x);
  const deltaY = Math.abs(touch.pageY - dragStartPoint.y);

  // 3. 只有移动距离超过阈值，才正式激活“拖拽模式”
  if (!isDragging.value && (deltaX > dragThreshold || deltaY > dragThreshold)) {
    isDragging.value = true;
  }

  // 4. 如果是拖拽模式，更新幽灵图标位置
  if (isDragging.value) {
    updateGhost(e);
  }
}
function updateGhost(e) {
  const touch = e.touches ? e.touches[0] : e.changedTouches[0];
  if (touch) {
    dragPoint.value = { x: touch.pageX, y: touch.pageY };
    ghostStyle.value = `left:${touch.pageX - 20}px;top:${touch.pageY - 40}px;`;
  }
}

function onDragEnd(e) {

  if (!isDragging.value){
    if(selected.value) onNoteBtnClick(selected.value);
  }else{
    handleDrop(e);
  };
    isDragging.value = false;
    ghostStyle.value = '';
}
// 音符拖拽落点
function handleDrop(e){
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

  const RESOLUTION = Vex.Flow.RESOLUTION; 
  const [numStr, denStr] = timeSignature.split('/');
  const num = parseInt(numStr) || 4;
  const den = parseInt(denStr) || 4;
  const ticksPerBeatUnit = RESOLUTION / den;
  const maxTicksPerMeasure = ticksPerBeatUnit * num;

  // 1. 定义标准时值映射（从大到小排列，用于贪心拆解）
  // 注意：VexFlow 中 'd' 表示附点，时值是 1.5 倍
  const DURATION_CONFIGS = [
    { name: 'w',  ticks: RESOLUTION },           // 全音符
    { name: 'hd', ticks: RESOLUTION / 2 * 1.5 }, // 附点二分
    { name: 'h',  ticks: RESOLUTION / 2 },       // 二分
    { name: 'qd', ticks: RESOLUTION / 4 * 1.5 }, // 附点四分
    { name: 'q',  ticks: RESOLUTION / 4 },       // 四分
    { name: '8d', ticks: RESOLUTION / 8 * 1.5 }, // 附点八分
    { name: '8',  ticks: RESOLUTION / 8 },       // 八分
    { name: '16d',ticks: RESOLUTION / 16 * 1.5}, // 附点十六
    { name: '16', ticks: RESOLUTION / 16 },      // 十六分
    { name: '32', ticks: RESOLUTION / 32 },      // 三十二分
    { name: '64', ticks: RESOLUTION / 64 }       // 六十四分
  ];

   // 辅助：获取输入字符串的总 Ticks
  function getDurationTicks(durationStr) {
    // 1. 定义纯净的基础时值映射 (不含附点)
    const baseDurationMap = {
      'w': RESOLUTION,
      'h': RESOLUTION / 2,
      'q': RESOLUTION / 4,
      '8': RESOLUTION / 8,
      '16': RESOLUTION / 16,
      '32': RESOLUTION / 32,
      '64': RESOLUTION / 64
    };

    // 2. 提取基础键名 (移除 'r' 和 'd')
    // 例如: "q" -> "q", "qd" -> "q", "8r" -> "8"
    const baseKey = durationStr.replace(/[rd]/g, '');

    // 3. 获取基础 ticks
    let ticks = baseDurationMap[baseKey];
    
    // 兜底：如果没找到，默认按四分音符处理，防止崩溃
    if (!ticks) ticks = RESOLUTION / 4; 

    // 4. 如果输入字符串明确包含 'd'，则乘以 1.5
    if (durationStr.includes('d')) {
      ticks *= 1.5;
    }

    return ticks;
  }

  /**
   * 核心算法：将任意 ticks 拆解为一组标准的 VexFlow 音符时长
   * 例如：2.5拍 (2560 ticks) -> [ 'h', '8' ] (二分 + 八分)
   */
  function decomposeDuration(ticks) {
    const result = [];
    let remaining = ticks;

    // 贪心算法：每次都取能塞下的最大音符
    while (remaining > 10) { // 允许极小误差
      let matched = false;
      for (const config of DURATION_CONFIGS) {
        if (remaining >= config.ticks) {
          result.push({
            duration: config.name.replace('d', ''), // VexFlow duration 基础名 (如 'h')
            isDotted: config.name.includes('d'),    // 是否有附点
            ticks: config.ticks
          });
          remaining -= config.ticks;
          matched = true;
          break; 
        }
      }
      // 防止死循环（如果有无法处理的极小剩余，强制退出）
      if (!matched) break;
    }
    return result;
  }

  // 2. 初始化队列
  let noteQueue = rawNotes.map((n, index) => ({
    pitch: n.pitch,
    rawDuration: n.duration,
    totalTicks: getDurationTicks(n.duration),
    rawIndex: index,
    id: n.id,
    isRest: n.duration.includes('r'),
    // 标记是否为连音线的中间部分（如果是被拆解出来的，需要连线）
    tieStart: false, 
    tieEnd: false
  }));

  let queueIndex = 0;
  // pendingParts 用于存储同一个原始音符被拆解后的后续部分（为了保持 rawIndex 和 id）
  let pendingParts = []; 

  while (queueIndex < noteQueue.length || pendingParts.length > 0) {
    // 优先处理 pendingParts (同一个音符拆出来的部分)，否则处理队列下一个
    let item = pendingParts.length > 0 ? pendingParts.shift() : noteQueue[queueIndex];
    
    // 如果是从队列拿的新音符，索引+1；如果是 pendingParts，索引不变
    if (pendingParts.length === 0 && item === noteQueue[queueIndex]) {
        queueIndex++;
    }

    const ticksSpace = maxTicksPerMeasure - currentTicks;

    // A. 换行判断：剩余空间太小，直接换小节
    if (ticksSpace <= 10) {
      measures.push(currentMeasure);
      currentMeasure = { notes: [], ties: [], beams: [] };
      currentTicks = 0;
      // 当前 item 还没处理，放回 pendingParts 头部，下一轮循环处理
      pendingParts.unshift(item); 
      continue;
    }

    // B. 计算当前小节应该吃掉多少 ticks
    // 如果音符能塞下，就全吃；塞不下，就吃掉 ticksSpace (剩余空间)
    const takeTicks = Math.min(item.totalTicks, ticksSpace);
    const remainingTicks = item.totalTicks - takeTicks;

    // C. 将 takeTicks 拆解为标准音符组合 (Decompose)
    // 即使能塞下，也可能需要拆分（例如 2.5 拍塞入 4/4 拍，需要拆成 二分+八分）
    const parts = decomposeDuration(takeTicks);

    // D. 生成 VexFlow 音符
    parts.forEach((part, pIndex) => {
      let vfKeys = [item.pitch];
      let vfDuration = part.duration; 
      
      // 休止符处理
      if (item.isRest) {
        vfKeys = ['b/4'];
        vfDuration += 'r';
      }

      const vfNote = new VF.StaveNote({
        keys: vfKeys,
        duration: vfDuration,
        auto_stem: !item.isRest,
        clef: clef
      });

      // 只有原始音符的第一部分才绑定 sourceNoteId (用于高亮)
      // 或者所有部分都绑定，看你需求。这里都绑定以便选中整组
      vfNote.sourceNoteId = item.id;
      vfNote.sourceRawIndex = item.rawIndex;

      // 添加附点
      if (part.isDotted && !item.isRest) {
         vfNote.addModifier(new VF.Dot(), 0);
      }

      // 添加升降号 (仅在非休止符且确实有修饰符时)
      if (!item.isRest) {
         const match = item.pitch.match(/^([a-gA-G])([#bn]+)?\/\d+$/);
         if (match && match[2]) {
            vfNote.addModifier(new VF.Accidental(match[2]), 0);
         }
      }

      // === 连音线 (Ties) 逻辑 ===
      // 1. 它是跨小节的前半部分 (Incoming)
      if (item.tieEnd && pIndex === 0 && !item.isRest) {
         vfNote.isIncomingTie = true; // VexFlow 内部标记，或者手动处理
      }

      // 2. 它是被 Decompose 拆分出来的组 (例如 二分->八分)，内部需要连线
      if (!item.isRest) {
        // 如果不是组里的最后一个，说明要连到下一个
        if (pIndex < parts.length - 1) {
           currentMeasure.ties.push({ fromNote: vfNote, isInternal: true }); // 标记稍后处理
        }
        
        // 如果是组里的最后一个，且原始 item 还有剩余 ticks (跨小节)，则连到下一小节
        if (pIndex === parts.length - 1 && remainingTicks > 10) {
           currentMeasure.ties.push({ fromNote: vfNote, isCrossMeasure: true });
        }
      }

      // 处理内部连线的配对 (将上一个 Internal tie 的 toNote 指向当前)
      const lastTie = currentMeasure.ties[currentMeasure.ties.length - 1];
      if (lastTie && lastTie.isInternal && !lastTie.last_note) {
          // 这里 VexFlow 的 StaveTie 需要 first_note 和 last_note
          // 我们在循环中只能拿到 first_note，last_note 需要在下一个循环拿到
          // 但这里我们可以简单点：因为 parts 是连续生成的
          // 实际上 VexFlow 创建 Tie 需要两个 Note 对象都存在。
          // 更好的办法是：收集完 parts 生成的 notes 后，再批量创建 Tie
      }

      currentMeasure.notes.push(vfNote);
    });

    // 修正内部连线的目标 (因为上面循环只是 push 了 notes，还没把 tie 连接起来)
    // 遍历刚才生成的 parts 对应的 notes
    const startIdx = currentMeasure.notes.length - parts.length;
    for (let i = 0; i < parts.length - 1; i++) {
        if (!item.isRest) {
            const n1 = currentMeasure.notes[startIdx + i];
            const n2 = currentMeasure.notes[startIdx + i + 1];
            currentMeasure.ties.push({
                first_note: n1,
                last_note: n2,
                first_indices: [0],
                last_indices: [0]
            });
        }
    }

    // 更新当前小节 ticks
    currentTicks += takeTicks;

    // E. 如果还有剩余 (跨小节了)，生成新的 Pending Item
    if (remainingTicks > 10) {
        // 创建剩余部分的 item，插入到 pendingParts 头部，确保下次循环最先处理它
        const remainderItem = {
            ...item,
            totalTicks: remainingTicks,
            tieEnd: true, // 标记它是被连线过来的
            // 注意：rawDuration 不再准确，仅供参考，计算全靠 totalTicks
        };
        pendingParts.unshift(remainderItem);
    }
  }

  // 收尾
  if (currentMeasure.notes.length > 0 || measures.length === 0) {
    measures.push(currentMeasure);
  }

  // --- 3. 后处理：生成 Beam 和 Tie 对象 ---
  const beamableDurations = ['8', '16', '32', '64'];
  measures.forEach((m) => {
    // 处理 Beams
    let noteGroup = [];
    m.notes.forEach(note => {
        const durationKey = note.duration.replace(/[rd]/g, '');
        const isRest = note.duration.includes('r');
        if (beamableDurations.includes(durationKey) && !isRest) {
            noteGroup.push(note);
        } else {
            if (noteGroup.length > 1) m.beams.push(new VF.Beam(noteGroup));
            noteGroup = [];
        }
    });
    if (noteGroup.length > 1) m.beams.push(new VF.Beam(noteGroup));

    // 处理 Ties (将简单的配置对象转换为 VexFlow StaveTie)
    // 我们需要把跨小节的连线单独处理
    const vfTies = [];
    
    // 内部连线 (measure 内的分解连线)
    m.ties.forEach(t => {
        if (t.first_note && t.last_note) {
            vfTies.push(new VF.StaveTie({
                first_note: t.first_note,
                last_note: t.last_note,
                first_indices: [0],
                last_indices: [0]
            }));
        }
    });
    
    // 跨小节连线逻辑：
    // 找到本小节最后一个标记为 isCrossMeasure 的 tie
    const crossTieConfig = m.ties.find(t => t.isCrossMeasure);
    if (crossTieConfig) {
        // 这里的逻辑需要拿到“下一小节的第一个音符”
        // 由于我们在 map 过程中是线性的，很难直接拿到“下一小节对象”
        // 技巧：在 VexFlow 渲染时 (drawScore)，会保存 prevMeasureLastNote
        // 所以这里我们只保留标记，渲染层去实例化 StaveTie
    }
    
    // 覆盖 ties 数组为 VexFlow 对象 (保留 crossTieConfig 供渲染层使用)
    m.vfTies = vfTies; // 渲染层用这个画内部连线
    m.crossTie = crossTieConfig; // 渲染层用这个画跨小节连线
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


        
        // 1. 画符尾连线 (Beams)
        if (measure.beams) {
          measure.beams.forEach((b) => b.setContext(ctx).draw());
        }

        // 2. 画小节内部的连线 (由 processNotesToMeasures 生成的 m.vfTies)
        // 这些是同小节内音符拆分产生的连线 (例如 2.5拍拆成 二分+八分)
        if (measure.vfTies) {
          measure.vfTies.forEach((t) => t.setContext(ctx).draw());
        }

        // 3. 画跨小节连线 (连接 "上一小节末尾" -> "本小节开头")
        if (needTieFromPrev && prevMeasureLastNote && measure.notes.length > 0) {
          const firstNote = measure.notes[0];
          
          // 确保不是休止符才连线 (虽然 VexFlow 通常能处理，但加个判断更稳妥)
          const isRest = firstNote.noteType === 'r' || (firstNote.duration && firstNote.duration.includes('r'));
          
          if (!isRest) {
            const tie = new VF.StaveTie({
              first_note: prevMeasureLastNote,
              last_note: firstNote,
              first_indices: [0],
              last_indices: [0]
            });
            tie.setContext(ctx).draw();
          }
        }

        // 4. 更新状态，供下一个小节使用
        // 检查本小节是否有跨小节连线请求 (crossTie 包含 fromNote)
        if (measure.crossTie) {
          prevMeasureLastNote = measure.crossTie.fromNote;
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
/**
 * 删除当前选中音符
 */
function deleteSelectedNote() {
  if (!selectedNoteId.value) return;

  const stave = staveList.value.find(s => s.id === activeStaveId.value);
  if (stave) {
    const idx = stave.notes.findIndex(n => n.id === selectedNoteId.value);
    if (idx > -1) {
      stave.notes.splice(idx, 1);
      selectedNoteId.value = null; // 清空选中
      drawScore();
    }
  }
}
/**
 * 辅助函数：重置选中状态
 * 清空当前的音符选中ID、修饰符回显、附点回显等
 */
function resetSelectionState() {
  selectedNoteId.value = null;
  selectedNoteInfo.value = { step: '', accidental: '', octave: '', pitch: '' };
  selectedAccidental.value = null;
  isNoteDotted.value = false;
}

/**
 * 方法一：清空当前选中行的所有音符
 * 只操作 activeStaveId 对应的那一行，保留谱号/调号/拍号配置
 */
function clearCurrentStaveNotes() {
  const stave = staveList.value.find(s => s.id === activeStaveId.value);
  if (stave) {
    // 1. 清空音符数组
    stave.notes = [];
    
    // 2. 重置选中状态（防止删除后还保留着选中高亮）
    resetSelectionState();

    // 3. 重绘
    drawScore();
    
    // 提示反馈 (可选)
    uni.showToast({ title: '当前行已清空', icon: 'none' });
  }
}

/**
 * 方法二：清空整个乐谱回到初始化
 * 删除所有行，只保留一行默认状态，重置所有配置
 */
function resetScore() {
  // double check 防止误触
  uni.showModal({
    title: '确认清空',
    content: '确定要清空所有乐谱内容回到初始状态吗？此操作不可恢复。',
    success: (res) => {
      if (res.confirm) {
        // 1. 生成一个新的 ID
        const newId = Date.now();
        
        // 2. 重置 staveList 为包含一个默认 Stave 的数组
        // createDefaultStave 是你代码里已有的函数
        staveList.value = [createDefaultStave(newId)];
        
        // 3. 重置当前激活 ID
        activeStaveId.value = newId;
        
        // 4. 重置选中状态
        resetSelectionState();
        
        // 5. 重绘
        drawScore();
      }
    }
  });
}
</script>

<style scoped lang="scss">
/* 保持原有样式，新增部分如下 */
.control-panel {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20rpx;
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
  width: 100vw;
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
  gap: 20rpx;
  padding: 10rpx 20rpx;
  flex-wrap: wrap;
}
.note-btn {
  text-align: center;
  padding: 10rpx 20rpx;
  border: 1px solid #ccc;
  border-radius: 10rpx;
  font-size: 32rpx;
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
  box-sizing: border-box;
  .tablist{
    width: 100%;
    display: flex;
    justify-content: space-between;
    border-bottom: 1rpx solid #f5f5f5;
    padding: 0 20rpx;
    .item{
      text-align: center;
      font-size: 32rpx;
      color: #303133;
      line-height: 2;
    }
    .item.active{
      color: #3c9cff;
      font-weight: bold;
      border-bottom: 1rpx solid #3c9cff;
    }
  }
  .clef,
  .timeSignatureList,
  .keySignatureList {
    margin: 20rpx 20rpx;
    display: flex;
    flex-wrap: wrap;
    gap: 10rpx;
    .item {
      padding: 6rpx 12rpx;
      border: 1px solid #ddd;
      border-radius: 8rpx;
      font-size: 32rpx;
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
.note_tools,.modifier-tools .tool-group{
  display: flex;
  padding:10rpx 20rpx;
  font-size: 32rpx;
  gap:20rpx;
  .item{
    padding: 4rpx 10rpx;
    border-radius: 6rpx;
    border: 1px solid #ddd;
     &.active {
        background: #1890ff;
        color: #fff;
        border-color: #1890ff;
      }
  }
}

</style>
