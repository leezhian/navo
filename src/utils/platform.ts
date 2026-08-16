/**
 * 判断当前渲染进程是否运行在 Apple 平台，用于选择系统对应的快捷键修饰符。
 * 兼容浏览器预览环境，避免服务端或非浏览器上下文访问 navigator 时抛错。
 */
export function isApplePlatform() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform);
}
