export const SESSION_SIDEBAR_WIDTH = 280;
export const SESSION_SIDEBAR_TRANSITION = {
  duration: 0.14,
  ease: "easeOut",
} as const;
/** 普通窗口下左侧 header 格宽度：包含原生红黄绿占位和切换边栏按钮。 */
export const WINDOW_CONTROLS_WIDTH = 128;
/** macOS 全屏后原生红黄绿移入系统栏，应用内只保留切换边栏按钮空间。 */
export const FULL_SCREEN_WINDOW_CONTROLS_WIDTH = 48;
/** Electron 原生 traffic lights 坐标，y=18 用于对齐 48px header 的视觉中心。 */
export const TRAFFIC_LIGHT_POSITION = {
  x: 16,
  y: 18,
};
/** 普通窗口下切换边栏按钮起点，给原生红黄绿留出更接近系统窗口的间距。 */
export const SIDEBAR_TOGGLE_OFFSET = 88;
/** 全屏时隐藏红黄绿占位，只保留按钮自身的左内边距。 */
export const FULL_SCREEN_SIDEBAR_TOGGLE_OFFSET = 12;
