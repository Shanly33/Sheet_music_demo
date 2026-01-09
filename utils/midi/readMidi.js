import { Midi } from "@tonejs/midi";

export function selectAndParseMidi() {
  return new Promise((resolve, reject) => {
    uni.chooseMessageFile({
      count: 1,
      type: "file",
      extension: ["mid", "midi"],
      success(res) {
        const filePath = res.tempFiles[0].path;
        const fs = uni.getFileSystemManager();

        fs.readFile({
          filePath,
          // 小程序中读取二进制文件用 binary 编码
          encoding: "binary",
          success(readRes) {
            try {
              let buffer;
              const rawData = readRes.data;

              // 关键修复：将二进制字符串转换为 ArrayBuffer
              if (typeof rawData === "string") {
                // 二进制字符串转 ArrayBuffer
                const bytes = new Uint8Array(rawData.length);
                for (let i = 0; i < rawData.length; i++) {
                  bytes[i] = rawData.charCodeAt(i) & 0xff;
                }
                buffer = bytes.buffer;
              } else if (rawData instanceof ArrayBuffer) {
                // 兼容其他可能的环境
                buffer = rawData;
              } else {
                throw new Error("不支持的文件数据类型");
              }

              console.log("转换后 ArrayBuffer 长度(bytes):", buffer.byteLength);

              // 解析 MIDI
              const midi = new Midi(buffer);
              resolve(midi);
            } catch (e) {
              console.error("解析MIDI失败:", e);
              reject(e);
            }
          },
          fail(err) {
            console.error("读取文件失败:", err);
            reject(err);
          },
        });
      },
      fail(err) {
        console.error("选择文件失败:", err);
        reject(err);
      },
    });
  });
}
