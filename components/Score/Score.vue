<template>
  <canvas
    id="scoreCanvas"
    canvas-id="scoreCanvas"
    type="2d"
    style="width: 100%; height: 220px"
  />
</template>

<script setup>
import { onMounted, getCurrentInstance } from "vue";
import Vex from "vexflow";

const instance = getCurrentInstance();

onMounted(() => {
  uni
    .createSelectorQuery()
    .in(instance.proxy) // ⭐⭐ 核心：限定组件作用域
    .select("#scoreCanvas")
    .fields({ node: true, size: true })
    .exec((res) => {
      if (!res[0]) {
        console.error("canvas 未找到");
        return;
      }

      const { node: canvas, width, height } = res[0];
      const ctx = canvas.getContext("2d");

      const dpr = uni.getSystemInfoSync().pixelRatio;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);

      drawScore(canvas);
    });
});

function drawScore(canvas) {
  const VF = Vex.Flow;

  const renderer = new VF.Renderer(canvas, VF.Renderer.Backends.CANVAS);
  const context = renderer.getContext();

  // ⚠️ stave 宽度用 CSS 宽度，不要用 canvas.width（那是 dpr 后的）
  const stave = new VF.Stave(10, 40, 300); //五线谱Stave(x, y, width);
  stave.addClef("treble").addTimeSignature("4/4");
  stave.setContext(context).draw();

  // ⚠️ 必须是“普通数组”，不能是 ref / reactive
  const notes = [
    //音符StaveNote：keys: 音高（决定 Y,音名 / 八度）
    // duration：时值（决定节拍）【w:全音符，拍数4；h:二分音符，拍数2；q:四分音符，拍数1；8:八分音符，拍数1/2；16:16分音符，拍数1/4；32:32分音符，拍数1/8；】
    // cllef:  参与 Y 轴映射,modifiers：点、升降号、连线
    new VF.StaveNote({ clef: "treble", keys: ["a/4"], duration: "q" }),
    new VF.StaveNote({ clef: "treble", keys: ["c/4"], duration: "q" }),
    new VF.StaveNote({ keys: ["b/4"], duration: "qr" }),
    new VF.StaveNote({ keys: ["b/4"], duration: "qr" }),
  ];

  const voice = new VF.Voice({
    //节拍容器
    num_beats: 4,
    beat_value: 4,
  });
  voice.addTickables(notes);

  new VF.Formatter().joinVoices([voice]).format([voice], 250); //排版,不调用 Formatter，音符可能全挤在一起

  voice.draw(context, stave);
}
</script>
