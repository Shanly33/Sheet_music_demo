<template>
  <view class="container">
    <canvas
      id="scoreCanvas"
      canvas-id="scoreCanvas"
      type="2d"
      style="width: 100%; height: 220px"
    />
  </view>
</template>

<script setup>
import { onMounted, getCurrentInstance } from "vue";
import { Flow } from "vexflow";
const instance = getCurrentInstance();

onMounted(() => {
  uni
    .createSelectorQuery()
    .in(instance.proxy)
    .select("#scoreCanvas")
    .fields({ node: true, size: true })
    .exec((res) => {
      if (!res[0]) {
        console.error("canvas 未找到");
        return;
      }

      const { node: canvas, width, height } = res[0];

      // 创建 VexFlow 渲染器
      const renderer = new Flow.Renderer(canvas, Flow.Renderer.Backends.CANVAS);
      renderer.resize(width, height);
      const context = renderer.getContext();
      const stave = new Flow.Stave(10, 40, width - 20); // 动态计算宽度，避免超出

      stave.addClef("treble").addTimeSignature("4/4");
      stave.setContext(context).draw();

      // 创建八分音符（时值为 8）
      const notes = [
        new Flow.StaveNote({
          clef: "treble",
          keys: ["c/4"],
          duration: "q",
        }),
        new Flow.StaveNote({
          clef: "treble",
          keys: ["d/4"],
          duration: "q",
        }),
        new Flow.StaveNote({
          clef: "treble",
          keys: ["e/4"],
          duration: "q",
        }),
        new Flow.StaveNote({
          clef: "treble",
          keys: ["f/4"],
          duration: "q",
        }),
      ];

      // // 创建 Beam（横梁）
      // const beam = new Flow.Beam(notes);

      // 创建连奏线
      const tie1 = new Flow.StaveTie({
        first_note: notes[0],
        last_note: notes[1],
      });
      const tie2 = new Flow.StaveTie({
        first_note: notes[1],
        last_note: notes[2],
      });

      const voice = new Flow.Voice({ num_beats: 4, beat_value: 4 });
      voice.addTickables(notes);

      // 调整格式化间距，避免超出画布
      const formatter = new Flow.Formatter()
        .joinVoices([voice])
        .format([voice], width - 40); // 根据宽度调整格式化间距
      voice.draw(context, stave);

      // 渲染连奏线
      // tie1.setContext(context).draw();
      // tie2.setContext(context).draw();

      // // 渲染 Beam（横梁）
      // beam.setContext(context).draw();
    });
});
</script>

<style>
.container {
  margin-top: 300rpx;
  width: 100%;
}
</style>
