/** 可见窗口，用当前投影的坐标。空窗口表示整段铺满。时间投影的单位是毫秒，等宽记录的单位是槽位。 */
export interface TimelineViewport {
  /** 窗口起点，含。 */
  start: number;
  /** 窗口终点。跨度是 end − start。 */
  end: number;
}

/** 与 DeepSeek Harness 轨迹概览相同的滚轮灵敏度：时长乘以 exp(deltaY × 该值)。 */
export const TIMELINE_ZOOM_SENSITIVITY = 0.0015;
/** 时间投影的窗口最短 20ms。等宽记录另用槽位下限。整段更短时不能再放大。 */
export const TIMELINE_MIN_VIEWPORT_MS = 20;
/** 放到整段的这个比例以上就回到铺满，避免停在几乎全长的窗口上。 */
export const TIMELINE_ZOOM_RESET_RATIO = 0.999;
/** 框选拖进左右边缘时跟着平移。边缘宽度取轴线的这个比例，并且不超过最大像素。 */
export const TIMELINE_EDGE_PAN_ZONE = 0.08;
export const TIMELINE_EDGE_PAN_MAX_PX = 32;
/** 每一移步大约走当前窗口的这个比例，再按深入边缘的程度加重。 */
export const TIMELINE_EDGE_PAN_STEP = 0.025;

/** DOM WheelEvent.DOM_DELTA_LINE。按行上报时 deltaY 往往是 ±1，不换算则几乎不缩放。 */
const WHEEL_DELTA_LINE = 1;
const WHEEL_LINE_PX = 16;

/** 把滚轮位移换成像素。双指张开在 macOS 上是带 ctrlKey 的滚轮，调用方不要按 ctrlKey 过滤。 */
export function timelineWheelPixels(deltaY: number, deltaMode: number): number {
  if (!Number.isFinite(deltaY)) return 0;
  return deltaMode === WHEEL_DELTA_LINE ? deltaY * WHEEL_LINE_PX : deltaY;
}

/** 一次滚轮的原始分量。水平分量用于已放大后的左右滑，垂直分量用于缩放。 */
export interface TimelineWheelInput {
  /** WheelEvent.deltaX。触控板左右滑主要走这一路。 */
  deltaX: number;
  /** WheelEvent.deltaY。鼠标滚轮、双指上下滑和双指张开都用它缩放。 */
  deltaY: number;
  /** WheelEvent.deltaMode。按行上报时要先换成像素。 */
  deltaMode: number;
  /** 双指张开会带 ctrlKey。这时即使水平分量更大，也只缩放，不改成平移。 */
  ctrlKey: boolean;
  /** 指针在轴线宽度上的比例。缩放时夹到 0–1，用来固定锚点下的时刻。 */
  anchorFraction: number;
  /** 轴线宽度。左右滑把像素换成当前窗口里的投影跨度。 */
  widthPx: number;
  /** 窗口最短跨度。缺省 20。等宽记录传槽位数，避免放到比几条操作还窄。 */
  minDuration?: number;
}

function clampStart(fullStart: number, fullEnd: number, start: number, duration: number): number {
  const limit = Math.max(fullStart, fullEnd - duration);
  return Math.min(Math.max(start, fullStart), limit);
}

/** 当前用来画块和换算指针的窗口。没有放大时就是整段。 */
export function timelineWindow(fullStart: number, fullEnd: number, viewport: TimelineViewport | null): { start: number; duration: number } {
  const full = Math.max(1, fullEnd - fullStart);
  if (!viewport) return { start: fullStart, duration: full };
  return { start: viewport.start, duration: Math.max(1, viewport.end - viewport.start) };
}

/**
 * 整段变化后把窗口夹回去。和整段不再相交就恢复铺满；时长已经盖住整段时也恢复铺满。
 * 仍相交则尽量保持时长。
 */
export function clampTimelineViewport(fullStart: number, fullEnd: number, viewport: TimelineViewport | null): TimelineViewport | null {
  if (!viewport) return null;
  const fullDuration = Math.max(1, fullEnd - fullStart);
  if (viewport.end < fullStart || viewport.start > fullEnd) return null;
  const duration = viewport.end - viewport.start;
  if (!(duration > 0) || duration >= fullDuration * TIMELINE_ZOOM_RESET_RATIO) return null;
  const start = clampStart(fullStart, fullEnd, viewport.start, duration);
  if (start === viewport.start && start + duration === viewport.end) return viewport;
  return { start, end: start + duration };
}

/**
 * 以锚点时间缩放。deltaY 为正放大可见时长（缩小），为负则看更短的一段时间。
 * 锚点在窗口里的比例保持不变。放到接近整段时返回 null。
 */
export function zoomTimelineViewport(
  fullStart: number,
  fullEnd: number,
  viewport: TimelineViewport | null,
  anchorFraction: number,
  deltaY: number,
  minDuration = TIMELINE_MIN_VIEWPORT_MS,
): TimelineViewport | null {
  if (!Number.isFinite(deltaY) || deltaY === 0) return viewport;
  const fullDuration = Math.max(1, fullEnd - fullStart);
  const current = timelineWindow(fullStart, fullEnd, viewport);
  const fraction = Math.min(1, Math.max(0, anchorFraction));
  const floor = Math.min(minDuration, fullDuration);
  const nextDuration = Math.min(fullDuration, Math.max(floor, current.duration * Math.exp(deltaY * TIMELINE_ZOOM_SENSITIVITY)));
  if (nextDuration >= fullDuration * TIMELINE_ZOOM_RESET_RATIO) return null;
  const anchorTime = current.start + fraction * current.duration;
  const nextStart = clampStart(fullStart, fullEnd, anchorTime - fraction * nextDuration, nextDuration);
  if (viewport && nextStart === viewport.start && nextStart + nextDuration === viewport.end) return viewport;
  return { start: nextStart, end: nextStart + nextDuration };
}

/**
 * 按按下后的指针位移平移。deltaPx 向右为正，窗口起点减小，块跟着指针走。
 * duration 用按下时的窗口时长，平移过程中不改变缩放。
 */
export function panTimelineViewport(
  fullStart: number,
  fullEnd: number,
  anchorStart: number,
  duration: number,
  deltaPx: number,
  widthPx: number,
): TimelineViewport {
  const fullDuration = Math.max(1, fullEnd - fullStart);
  const span = Math.min(Math.max(1, duration), fullDuration);
  const delta = widthPx ? (deltaPx / Math.max(1, widthPx)) * span : 0;
  const start = clampStart(fullStart, fullEnd, anchorStart - delta, span);
  return { start, end: start + span };
}

/**
 * 框选拖到左右边缘时挪动窗口，便于选区跨出当前画面。
 * 每步按深入边缘的程度加重，最轻也保留 0.2，避免刚进边缘就停住。
 */
export function edgePanTimelineViewport(
  fullStart: number,
  fullEnd: number,
  viewport: TimelineViewport,
  localX: number,
  widthPx: number,
): TimelineViewport {
  const width = Math.max(1, widthPx);
  const edgeWidth = Math.min(TIMELINE_EDGE_PAN_MAX_PX, Math.max(1, width * TIMELINE_EDGE_PAN_ZONE));
  const direction = localX < edgeWidth ? -1 : localX > width - edgeWidth ? 1 : 0;
  if (direction === 0) return viewport;
  const edgeDistance = direction < 0 ? edgeWidth - localX : localX - (width - edgeWidth);
  const strength = Math.min(1, Math.max(0, edgeDistance / edgeWidth));
  const span = Math.min(Math.max(1, viewport.end - viewport.start), Math.max(1, fullEnd - fullStart));
  const desired = viewport.start + direction * span * TIMELINE_EDGE_PAN_STEP * Math.max(0.2, strength);
  const start = clampStart(fullStart, fullEnd, desired, span);
  if (start === viewport.start) return viewport;
  return { start, end: start + span };
}

/**
 * 选中事件不在窗口内时，只平移使它进入，不改变时长。
 * 事件在窗口左侧时把窗口起点对齐到事件起点；在右侧时让事件终点贴住窗口终点。
 */
export function revealTimelineViewport(
  fullStart: number,
  fullEnd: number,
  viewport: TimelineViewport,
  spanStart: number,
  spanEnd: number,
): TimelineViewport {
  const from = Math.min(spanStart, spanEnd);
  const to = Math.max(spanStart, spanEnd);
  if (to > viewport.start && from < viewport.end) return viewport;
  const span = Math.min(Math.max(1, viewport.end - viewport.start), Math.max(1, fullEnd - fullStart));
  const desired = to <= viewport.start ? from : to - span;
  const start = clampStart(fullStart, fullEnd, desired, span);
  if (start === viewport.start) return viewport;
  return { start, end: start + span };
}

/**
 * 滚轮怎么改窗口，对齐 DeepSeek Harness：deltaY 缩放，放大后才能平移。
 * 右键拖动是另一条平移路径。触控板左右滑没有右键，水平分量更大时走同一套平移。
 * 双指张开的 ctrlKey 优先于水平分量，避免张开手势被当成左右滑。
 */
export function applyTimelineWheel(
  fullStart: number,
  fullEnd: number,
  viewport: TimelineViewport | null,
  input: TimelineWheelInput,
): TimelineViewport | null {
  const fitted = clampTimelineViewport(fullStart, fullEnd, viewport);
  const deltaX = timelineWheelPixels(input.deltaX, input.deltaMode);
  const deltaY = timelineWheelPixels(input.deltaY, input.deltaMode);
  if (!input.ctrlKey && fitted && Math.abs(deltaX) > Math.abs(deltaY) && deltaX !== 0) {
    // deltaX 为正是向右滚动，窗口起点增大，看到更晚的时间。拖动平移是抓住内容，方向相反，所以这里取负。
    return panTimelineViewport(fullStart, fullEnd, fitted.start, fitted.end - fitted.start, -deltaX, input.widthPx);
  }
  return zoomTimelineViewport(fullStart, fullEnd, fitted, input.anchorFraction, deltaY, input.minDuration);
}

/** 投影区间是否与窗口相交，含贴住端点。span 为 0 时只看时刻。坐标是槽位或毫秒，跟当前投影一致。 */
export function intersectsTimelineWindow(start: number, span: number, windowStart: number, windowEnd: number): boolean {
  if (!Number.isFinite(start)) return false;
  const end = start + (Number.isFinite(span) ? Math.max(0, span) : 0);
  return start <= windowEnd && end >= windowStart;
}
