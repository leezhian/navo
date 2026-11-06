import { FitAddon, Ghostty, Terminal } from "ghostty-web";
import wasmUrl from "ghostty-web/ghostty-vt.wasm?url";
import { isApplePlatform } from "@/utils/platform";
import { terminalOptions } from "./terminalOptions";

let engine: Promise<Ghostty> | undefined;
function loadEngine() {
  // 使用打包后的本地资源，不依赖 CDN、开发服务器根路径或本机 Ghostty 安装。
  engine ??= Ghostty.load(wasmUrl).catch((error) => { engine = undefined; throw error; });
  return engine;
}

class NavoTerminal extends Terminal {
  /** 上游 open 会调用 focus；离屏创建时不抢焦点，也不排队延迟抢回焦点。 */
  override focus() {
    if (this.element?.isConnected) this.textarea?.focus({ preventScroll: true });
  }
}

/** 每个会话只创建一次，移动整个容器即可保留画面、选择和滚动状态。 */
export class GhosttyTerminalSurface {
  readonly element = document.createElement("div");
  readonly terminal: Terminal;
  private readonly fitAddon = new FitAddon();
  private readonly subscriptions: Array<{ dispose(): void }> = [];
  private disposed = false;

  private constructor(ghostty: Ghostty, cols: number, rows: number, onInput: (data: string) => void, onResize: (cols: number, rows: number) => void) {
    this.element.className = "navo-terminal-surface";
    this.terminal = new NavoTerminal({ ...terminalOptions, ghostty, cols, rows });
    try {
      this.terminal.open(this.element);
      this.terminal.loadAddon(this.fitAddon);
      this.subscriptions.push(this.terminal.onData(onInput), this.terminal.onResize(({ cols, rows }) => onResize(cols, rows)));
      this.terminal.attachCustomKeyEventHandler((event) => this.handleShortcut(event));
      // 根节点不参与可编辑 DOM；中文输入由库创建的 textarea 承接。
      this.element.removeAttribute("contenteditable");
      this.element.tabIndex = -1;
      this.element.addEventListener("copy", this.copySelection);
    } catch (error) { this.dispose(); throw error; }
  }

  static async create(cols: number, rows: number, onInput: (data: string) => void, onResize: (cols: number, rows: number) => void) {
    const [ghostty] = await Promise.all([loadEngine(), document.fonts.ready]);
    return new GhosttyTerminalSurface(ghostty, cols, rows, onInput, onResize);
  }

  write(data: string) {
    if (this.disposed || !data) return;
    const viewport = this.terminal.getViewportY();
    const lines = this.terminal.getScrollbackLength();
    this.terminal.write(data);
    // 0.4.0 收到输出会回到底部；用户正在看历史时保留其阅读位置。
    if (viewport > 0) this.terminal.scrollToLine(viewport + Math.max(0, this.terminal.getScrollbackLength() - lines));
  }
  setReadOnly(readOnly: boolean) { this.terminal.options.disableStdin = readOnly; }
  resize(cols: number, rows: number) { this.terminal.resize(cols, rows); }
  fit() {
    const size = this.fitAddon.proposeDimensions();
    if (size) this.resize(Math.min(500, size.cols), Math.min(500, size.rows));
  }
  focus() { this.terminal.focus(); }
  setLabel(label: string) {
    this.element.setAttribute("aria-label", label);
    this.terminal.textarea?.setAttribute("aria-label", label);
  }

  private copySelection = (event: ClipboardEvent) => {
    const text = this.terminal.getSelection();
    if (!text || !event.clipboardData) return;
    event.preventDefault(); event.stopPropagation(); event.clipboardData.setData("text/plain", text);
  };
  private handleShortcut(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    const primary = isApplePlatform() ? event.metaKey && !event.ctrlKey : event.ctrlKey && event.shiftKey;
    if (primary && !event.altKey) {
      if (key === "c" || key === "v") return true; // 保留浏览器 copy/paste，不能当作 CLI 控制键发送。
      if (key === "a") { event.preventDefault(); this.terminal.selectAll(); return true; }
      if (key === "k") { event.preventDefault(); this.terminal.clear(); return true; }
    }
    if (event.key === "Escape") event.stopPropagation(); // CLI 的 Esc 不关闭承载终端的设置弹窗。
    return false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.subscriptions.forEach((subscription) => subscription.dispose());
    this.element.removeEventListener("copy", this.copySelection);
    this.terminal.dispose();
    this.element.remove();
  }
}
