<template>
  <view class="piano-wrapper">
    <!-- scroll-x 开启横向滚动 -->
    <view
      class="piano-scroll"
      @touchstart="handleTouchStartInit"
      @touchmove="handleTouchMove"
    >
      <view class="keyboard-container">
        <!-- 遍历生成的白键列表 -->
        <view
          v-for="(key, index) in pianoKeys"
          :key="key.id"
          class="white-key"
          data-type="white"
          :class="{ active: activeKey === key.id }"
          @touchstart.self="handleTouchStart(key.id,$event,'white')"
          @touchend.self="handleTouchEnd(key.id,$event,'white')"
          :style="{ zIndex: 99 - index }"
        >
          <!-- 白键文字 (底部) -->
          <text class="white-label">{{ key.name }}</text>

          <!-- 如果该白键拥有黑键，则渲染黑键 -->
          <view
            v-if="key.hasBlack"
            class="black-key"
            data-type="black"
            :class="{ active: activeKey === key.blackId }"
            @touchstart="handleTouchStart(key.blackId,$event,'black')"
            @touchend="handleTouchEnd(key.blackId,$event,'black');"
          >
            <!-- 黑键文字 (垂直居中，白色) -->
            <text class="black-label">{{ key.blackName }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<script setup>
import { ref, onMounted } from "vue";

const emit = defineEmits(["play"]);
const activeKey = ref(null);
const pianoKeys = ref([]);
// 2. 新增：滚动/点击判断所需变量

// --- 滚动防误触逻辑开始 ---
const isScrolling = ref(false); // 是否判定为滚动
const startX = ref(0); // 起始触摸点 X
const SCROLL_THRESHOLD = 10; // 阈值，超过 10px 视为滚动

// 1. 触摸开始（绑定在 piano-scroll 上）
const handleTouchStartInit = (e) => {
  isScrolling.value = false; // 重置滚动状态
  // 确保有触摸点
  if (e.touches && e.touches.length > 0) {
    startX.value = e.touches[0].clientX;
  }
};

// 2. 触摸移动（绑定在 piano-scroll 上）
const handleTouchMove = (e) => {
  // 如果已经是滚动状态，直接返回，减少计算
  if (isScrolling.value) return;

  if (e.touches && e.touches.length > 0) {
    const moveX = e.touches[0].clientX;
    const diff = Math.abs(moveX - startX.value);

    // 如果移动距离超过阈值，标记为滚动
    if (diff > SCROLL_THRESHOLD) {
      isScrolling.value = true;
      // 【关键优化】：一旦判定为滚动，立即取消当前按键的高亮状态，
      // 这样用户在拖动时，按键就不会一直显示被按下的灰色背景
      activeKey.value = null; 
    }
  }
}


// 生成88键数据的逻辑
const generate88Keys = () => {
  const keys = [];
  const whiteNotes = ["C", "D", "E", "F", "G", "A", "B"];
  // 定义哪些白键右边有黑键 (C右边有C#, E右边无, B右边无)
  const hasBlackMap = {
    C: true,
    D: true,
    E: false,
    F: true,
    G: true,
    A: true,
    B: false,
  };

  // 1. 处理开头的 A0, B0 (钢琴起始于 A0)
  keys.push({
    id: "A0",
    name: "A0",
    hasBlack: true,
    blackId: "A#0",
    blackName: "A#0",
  });
  keys.push({ id: "B0", name: "B0", hasBlack: false });

  // 2. 处理中间的 1-7 八度
  for (let octave = 1; octave <= 7; octave++) {
    whiteNotes.forEach((note) => {
      const id = `${note}${octave}`;
      const hasBlack = hasBlackMap[note];
      const blackId = hasBlack ? `${note}#${octave}` : null;

      keys.push({
        id,
        name: id,
        hasBlack,
        blackId,
        blackName: blackId,
      });
    });
  }

  // 3. 处理结尾的 C8 (钢琴结束于 C8)
  keys.push({ id: "C8", name: "C8", hasBlack: false }); // C8 通常作为最后一个键

  pianoKeys.value = keys;
};



// 按下按键 (绑定在具体的 Key 上)
const handleTouchStart = (note,e,type) => {
  const targetType=e.target.dataset?.type
  // 记录当前按下的键，用于显示高亮
  if(targetType===type)activeKey.value = note;
};

// 松开按键 (绑定在具体的 Key 上)
const handleTouchEnd = (note,e,type) => {
  // 【关键判断】：如果是滚动行为，不触发播放，直接结束
  if (isScrolling.value) {
    isScrolling.value=false;
    activeKey.value = null;
    return;
  }
  activeKey.value = null;
  const targetType=e.target.dataset?.type
  // 记录当前按下的键，用于显示高亮
  if(targetType===type)emit('play',note)
};


onMounted(() => {
  generate88Keys();
  // 可选：初始化时滚动到中间位置 (比如 C4)，C4 大约在第 40 个白键位置
  // 简单计算：40 * 白键宽度(60rpx) = 2400rpx
  // scrollLeft.value = 1200;
});
</script>

<style lang="scss" scoped>
.piano-wrapper {
  width: 100%;
  height: 210rpx;
  background-color: #222;
  position: relative;
}

.piano-scroll {
  touch-action: pan-x;
  -webkit-overflow-scrolling: touch; /* 小程序弹性滚动，提升体验 */
  width: 100%;
  height: 100%;
  white-space: nowrap; // 关键：禁止换行，实现横向排列
  overflow-x: scroll;
}

.keyboard-container {
  display: inline-flex; // 使用 inline-flex 让内容撑开宽度
  height: 100%;
  padding: 0 0rpx; // 两侧留白
}

/* --- 白键样式 --- */
.white-key {
  position: relative;
  width: 60rpx; // 白键宽度
  height: 200rpx; // 白键高度
  background: #fff;
  border: 1px solid #999;
  border-top: none; // 顶部不需要边框
  border-radius: 0 0 8rpx 8rpx;
  margin-right: -1px; // 消除边框双重厚度
  display: flex;
  align-items: flex-end;
  justify-content: center;
  padding-bottom: 10rpx;
  box-sizing: border-box;
  flex-shrink: 0; // 防止被压缩
  z-index: 1;

  &.active {
    background: #f0f0f0;
    transform: scaleY(0.99); // 轻微按压效果
    transform-origin: top;
  }
}

.white-label {
  font-size: 18rpx;
  color: #333;
  font-weight: bold;
  pointer-events: none;
}

/* --- 黑键样式 --- */
.black-key {
  position: absolute;
  top: 0;
  // 黑键位于当前白键右侧边框的中心，即 right: -50% 宽度
  // 但因为是 absolute 相对于父级，所以设为 right: -18rpx (宽度36的一半)
  right: -20rpx;
  width: 40rpx; // 黑键宽度 (通常是白键的 60% 左右)
  height: 120rpx; // 黑键高度 (通常是白键的 60% 左右)
  background: #000;
  border-radius: 0 0 6rpx 6rpx;
  z-index: 10; // 必须高于白键
  display: flex;
  align-items: flex-end; // 文字靠下一点
  justify-content: center;
  padding-bottom: 20rpx;
  box-shadow: 1px 2px 4px rgba(0, 0, 0, 0.5);

  &.active {
    background: #333;
    transform: scaleY(0.98);
    transform-origin: top;
  }
}

.black-label {
  font-size: 14rpx; // 字体要小，否则放不下
  color: #fff; // 白字
  // writing-mode: vertical-lr; // 如果文字太长，可以竖排，或者直接横排
  line-height: 1;
  margin-bottom: 10rpx;
  pointer-events: none;
}
</style>
