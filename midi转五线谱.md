# Midi 转 VexFlow 问题

## Midi 数据格式：

```json
{
  header: {
    keySignatures: [{ key: "G", scale: "major", ticks: 0 }],
    meta: [],
    name: "",
    ppq: 960,
    tempos: [{ bpm: 100, ticks: 0 }],
    timeSignatures: [{ ticks: 0, timeSignature: [6, 8], measures: 0 }],
  },
  tracks: [
    {
      channel: 0,
      controlChanges: {
        7: [{ number: 7, ticks: 0, time: 0, value: 0.7874015748031497 }],
        10: [{ number: 10, ticks: 0, time: 0, value: 0.5039370078740157 }],
        64: [{ number: 64, ticks: 0, time: 0, value: 0 }],
        91: [{ number: 91, ticks: 0, time: 0, value: 0.3779527559055118 }],
        121: [{ number: 121, ticks: 0, time: 0, value: 0 }],
      },
      pitchBends: [],
      instrument: { family: "piano", number: 1, name: "bright acoustic piano" },
      name: " ",
      notes: [
        {
          duration: 0.305,
          durationTicks: 488,
          midi: 64,
          name: "E4",
          ticks: 0,
          time: 0,
          velocity: 0.6614173228346457,
        },
        {
          duration: 0.305,
          durationTicks: 488,
          midi: 67,
          name: "G4",
          ticks: 480,
          time: 0.3,
          velocity: 0.6771653543307087,
        },
        ...
      ],
      endOfTrackTicks: 22966,
    },
  ],
}
```

---

## VexFlow 相关参数计算：

### 1. 小节与节拍线：Stave / Barline

**能算出的数值**：每小节有多少 tick（决定怎么切小节）；每个音符属于第几小节、在小节内的位置；小节内的节拍分组（比如 6/8 长按 3+3）

**怎么算**：来自：`header.ppq` 和 `header.timeSignatures`

以 6/8、ppq=960 为例：

- 1 个四分音符 = ppq = 960 ticks
- 6/8 一小节 = 6 个八分音符
- 1 个八分音符 = ppq / 2 = 480 ticks
- **每小节 ticks**：`ticksPerMeasure = 6 * 480 = 2880`

然后对每个 note：

- **第几小节**：`measureIndex = floor(note.ticks / ticksPerMeasure)`
- **小节内 tick**：`tickInMeasure = note.ticks % ticksPerMeasure`

---

### 2. 音符音高：StaveNote.keys + clef

**能算出的数值**：VexFlow 的 keys（如 `"e/4"`, `"g/4"`）

**怎么算**：来自：`notes[].midi` 或 `notes[].name`

- `name: "E4"` → 直接变成 `"e/4"`（小写 + 用 `/` 分隔）

---

### 3. 时值（几分音符）：duration（比如 `"8"`, `"q"`, `"16"`, `"qd"`…）

**能算出的数值**：每个音符在谱面上应该是：全音符/二分/四分/八分/十六分...（以及附点）；同时还能算出每小节时值是否"刚好填满"（用于校验/补休止）

**怎么算**：来自：`notes[].durationTicks` 和 `ppq`

先算“以四分音符为单位”的长度：

- `q = durationTicks / ppq`

常见映射：

- `q = 1` → 四分音符 `"q"`
- `q = 0.5` → 八分 `"8"`
- `q = 0.25` → 十六分 `"16"`
- `q = 2` → 二分 `"h"`
- `q = 4` → 全音 `"w"`

附点判断（允许误差）：

- 例如附点四分 = 1.5 拍：`q ≈ 1.5` → `"qd"`
- 附点八分 = 1.5 拍：`q ≈ 1.5` → `"qd"`
- 把 durationTicks 和 ticks 都吸附到“最小网格”（比如 1/16 或 1/24）
- 6/8 常用网格：`480/2 = 240` (16 分) 或三连音网格 `480/3 = 160`

---

### 4. 休止符：StaveNote + isRest

**能算出的数值**：每小节里哪里“没音符”要补休止；休止符的时值（8 分休、4 分休、附点休止等）

**怎么算**：来自：同一轨/同一手的音符时间轴空档

步骤很直白：

1. 同一小节内把音符按 `tickInMeasure` 排序
2. 从小节起点 `tick=0` 开始，计算：`gap = 下一个音符开始 tick - 当前指针 tick`
3. `gap > 0` 就生成对应时值的休止符（同样要量化/拆分成可写的组合）
4. 指针推进到：音符结束 tick（开始 + durationTicks）
5. 小节末尾如果还有 gap，也补休止

VexFlow 的休止符本质也是 StaveNote，只是 keys 写 `"b/4"` 这类占位并用 duration: `"8r"`、`"qr"` 表示 rest。

---

### 5. 同时发声（和弦）：一个 StaveNote 多个 keys

**能算出的数值**：哪些音符应该合并成一个“和弦”；和弦内有哪些音（keys 列表）

**怎么算**：来自：`notes[].ticks`（开始时间）

在同一手（treble/bass）里：

- 把 ticks 相同（或在一个很小阈值内，比如 ≤10~20 ticks）的音符归为一组
- 每组生成一个 VexFlow `StaveNote({ keys: [...], duration })`

**duration 怎么取？**

- 通常取这组里 最长/或共同量化后的时值
- 如果组内时值差异大，就会变成“复合节奏”，需要拆成多个 voice（进阶）

---

### 6. 横梁（Beam）：Vex.Flow.Beam

**能算出的数值**：哪些音符要连横梁；横梁的分组边界（强拍处断开）

**怎么算**：来自：拍号 + 音符的时值与位置

原则：

- 只有 小于四分音符 的音（8、16...）才会有横梁
- 横梁分组通常按节拍分组断开

6/8 的典型分组：

- 一小节 6 个八分，通常分成 3+3
- 换成 tick：每组长度 = `3 * 480 = 1440 ticks`
- 所以同一小节内：
  - `[0, 1440)` 一组
  - `[1440, 2880)` 一组

做法：

- 把小节内所有可 beam 的音符，按它们落在哪个“分组区间”划分
- 每个分组里连续的 8/16 音符生成一个 `new Beam(groupNotes)`

---

### 7. 调号与临时记号：KeySignature + Accidental

**能算出的数值**：stave 上的调号（G 大调：一个升号）；每个音是否要显示 `#` / `b` / `♮`（临时记号）

**怎么算**：来自：`header.keySignatures` + 音名

- stave：直接 `addKeySignature("G")`
- 临时记号（Accidental）需要对每个小节做“记号状态表”：
  1. 根据调号确定默认升降（G 大调默认 F#）
  2. 看每个音的实际音名（比如 F natural）
  3. 如果与当前小节的该音级状态不同，就加 `new Accidental("n")` / `("#")` / `("b")`

---

### 8. 力度（pp/p/mf/f）：DynamicText（可选）

**能算出的数值**：根据 velocity 推断力度标记（不一定准，但可以做）

**怎么算**：来自：`notes[].velocity`（0~1）

一个很常用的粗映射：

- `<0.25` → p
- `<0.45` → mp
- `<0.65` → mf
- `<0.8` → f
- `>=0.8` → ff

也可以每小节取平均 velocity，再放一个力度记号更像真实谱面。

---

## 五线谱/小节计算时最常用的换算:

1. **tick ↔ 拍子（四分音符单位）**

   `ppq = 960`

   四分音符长度（tick）= 960

   某音符的“以四分音符为单位的时值”：

   `durationQuarter = durationTicks / ppq`

   例如 `488 / 960 ≈ 0.5083`（接近“八分 + 十六分”的组合，或带连音/切分的结果）

2. **6/8 拍每小节多少 ticks？**

   MIDI 的 ppq 基于“四分音符”，而 6/8 的“拍号分母是八分音符”。

   每小节的“四分音符数” = `6 * (4/8) = 3`

   所以 每小节 ticks：

   `ticksPerMeasure = ppq * 3 = 2880`

   用它就能算：

   音符属于第几小节：`measureIndex = floor(ticks / 2880)`

   小节内位置：`tickInMeasure = ticks % 2880`

3. **tick ↔ 秒（在 tempo 恒定时）**

   如果全曲 bpm 不变（你这份从 0 开始 100bpm）：

   1 个四分音符秒数：`60 / bpm = 0.6s`

   1 tick 秒数：`(60 / bpm) / ppq = 0.6 / 960 = 0.000625s`

   但注意：有变速时必须分段按 tempos 列表累计（你的结构已经直接给了 time，用它更稳）

---
