/**
 * 将钢琴键字符串转换为 VexFlow 所需的数据格式
 * @param {String} pianoKey - 钢琴键ID，例如 "C4", "C#4", "Bb3", "A0"
 * @returns {Object} { key: string, accidental: string | null }
 */
export const pianoKeyToVexFlow = (pianoKey) => {
  if (!pianoKey) return null;

  // 正则解析：分组1=音名(A-G), 分组2=变音号(#或b, 可选), 分组3=八度(0-9)
  // 之前的组件生成的黑键是 "#", 如果你有 "b" 也可以兼容
  const regex = /^([a-gA-G])(#|b)?(\d)$/;
  const match = pianoKey.match(regex);

  if (!match) {
    console.error(`Invalid piano key format: ${pianoKey}`);
    return null;
  }

  const noteName = match[1].toLowerCase(); // VexFlow 推荐小写，如 'c'
  const accidental = match[2] || ""; // '#' or 'b' or ''
  const octave = match[3]; // '4'

  // VexFlow 的 key 格式: "c/4" 或 "c#/4"
  const vexKey = `${noteName}${accidental}/${octave}`;

  return {
    key: vexKey, // 传给 keys 数组，如 "c#/4"
    accidental: accidental || null, // 用于判断是否需要 addModifier
    octave: parseInt(octave),
  };
};
