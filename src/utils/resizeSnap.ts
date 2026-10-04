const SNAP_DISTANCE = 8;
const RELEASE_DISTANCE = 16;

/** 按像素吸附到均分点；更大的脱离阈值避免鼠标在边缘抖动，比例不包含分隔条。 */
export function snapResizeRatio(ratio: number, extent: number, wasSnapped = false): number {
  if (extent <= 0) return ratio;
  const distance = Math.abs(ratio - 0.5) * extent;
  return distance <= (wasSnapped ? RELEASE_DISTANCE : SNAP_DISTANCE) ? 0.5 : ratio;
}
