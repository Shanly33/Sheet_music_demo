/**
 * 自定义标题高度动态计算
 */
export const getNavbarTitleHeight = () => {
  // 获取顶部状态栏高度
  // const { statusBarHeight } = uni.getSystemInfoSync();
  // 获取胶囊按钮距离顶部的top高度和按钮的高度
  const { top, height } = uni.getMenuButtonBoundingClientRect();
  const navTitleTop = top;
  return {
    top: navTitleTop + "px", // 定位距离顶部的高度
    lineHeight: height + "px", // 标题的跟胶囊按钮上下居中
    total: navTitleTop + height + "px",
  };
};

// 生成UUID的函数
export function generateUUID() {
  // 获取设备信息
  const deviceInfo = uni.getSystemInfoSync();

  // 生成时间戳部分
  const timestamp = Date.now().toString(36);

  // 生成随机数部分
  const randomStr = Math.random().toString(36).substr(2, 9);

  // 获取设备信息作为标识（保证在不同设备上唯一）
  const deviceId = (deviceInfo.system + deviceInfo.model + deviceInfo.platform)
    .replace(/\s+/g, "")
    .substr(0, 10);

  // 组合成UUID
  return `uni-${timestamp}-${randomStr}-${deviceId}`;
}
