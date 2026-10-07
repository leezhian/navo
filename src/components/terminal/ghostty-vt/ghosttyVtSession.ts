import type { GhosttyTypeLayout, GhosttyWasmExports } from "./ghosttyVtTypes";
import { TERMINAL_CELL_HEIGHT_PX, TERMINAL_CELL_WIDTH_PX } from "../terminalConstants";

const GHOSTTY_SUCCESS = 0;
const GHOSTTY_FORMATTER_FORMAT_HTML = 2;

/**
 * 对官方 WASM C API 做最小封装。
 * Ghostty 的公开 API 使用指针和 sized struct，这里集中处理内存分配，
 * 上层只需要关心写入数据、调整尺寸和读取 HTML 帧。
 */
export class GhosttyVtSession {
  private constructor(
    private readonly exports: GhosttyWasmExports,
    private readonly types: Record<string, GhosttyTypeLayout>,
    private readonly terminal: number,
    private readonly formatter: number,
  ) {}

  static async create(cols: number, rows: number): Promise<GhosttyVtSession> {
    const { instance } = await loadGhosttyWasm();
    const exports = instance.exports as unknown as GhosttyWasmExports;
    const types = readTypeLayout(exports);
    const terminal = createTerminal(exports, cols, rows);
    const formatter = createFormatter(exports, types, terminal);
    return new GhosttyVtSession(exports, types, terminal, formatter);
  }

  write(data: string): string {
    // WASM 的零长度分配返回哨兵指针，不能传入 Uint8Array.set。
    if (!data) return this.formatHtml();
    const encoded = new TextEncoder().encode(data);
    const dataPointer = this.exports.ghostty_wasm_alloc_u8_array(encoded.length);
    viewBytes(this.exports).set(encoded, dataPointer);
    this.exports.ghostty_terminal_vt_write(this.terminal, dataPointer, encoded.length);
    this.exports.ghostty_wasm_free_u8_array(dataPointer, encoded.length);
    return this.formatHtml();
  }

  resize(cols: number, rows: number): string {
    const result = this.exports.ghostty_terminal_resize(
      this.terminal,
      cols,
      rows,
      TERMINAL_CELL_WIDTH_PX,
      TERMINAL_CELL_HEIGHT_PX,
    );
    if (result !== GHOSTTY_SUCCESS) {
      throw new Error(`Ghostty 终端调整尺寸失败，错误码：${result}`);
    }

    return this.formatHtml();
  }

  dispose(): void {
    this.exports.ghostty_formatter_free(this.formatter);
    this.exports.ghostty_terminal_free(this.terminal);
  }

  private formatHtml(): string {
    const outputPointerPointer = this.exports.ghostty_wasm_alloc_opaque();
    const outputLengthPointer = this.exports.ghostty_wasm_alloc_usize();
    const result = this.exports.ghostty_formatter_format_alloc(
      this.formatter,
      0,
      outputPointerPointer,
      outputLengthPointer,
    );
    if (result !== GHOSTTY_SUCCESS) {
      this.exports.ghostty_wasm_free_opaque(outputPointerPointer);
      this.exports.ghostty_wasm_free_usize(outputLengthPointer);
      throw new Error(`Ghostty 终端渲染失败，错误码：${result}`);
    }

    const outputPointer = readPointer(this.exports, outputPointerPointer);
    const outputLength = readPointer(this.exports, outputLengthPointer);
    const html = new TextDecoder().decode(viewBytes(this.exports).subarray(outputPointer, outputPointer + outputLength));
    this.exports.ghostty_free(0, outputPointer, outputLength);
    this.exports.ghostty_wasm_free_opaque(outputPointerPointer);
    this.exports.ghostty_wasm_free_usize(outputLengthPointer);
    return html;
  }
}

let wasmPromise: Promise<WebAssembly.WebAssemblyInstantiatedSource> | null = null;

function loadGhosttyWasm(): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  if (!wasmPromise) {
    wasmPromise = instantiateGhosttyWasm();
  }

  return wasmPromise;
}

async function instantiateGhosttyWasm(): Promise<WebAssembly.WebAssemblyInstantiatedSource> {
  const wasmUrl = new URL("../../../assets/terminal/ghostty-vt.wasm", import.meta.url);
  const response = await fetch(wasmUrl);
  if (!response.ok) {
    throw new Error(`无法加载 Ghostty WASM：${response.status}`);
  }

  const bytes = await response.arrayBuffer();
  const result = await WebAssembly.instantiate(bytes, {
    env: {
      // Ghostty 的调试日志不参与终端数据流，生产 UI 中保持静默。
      log(pointer: number, length: number) {
        void pointer;
        void length;
      },
    },
  });
  return result;
}

function createTerminal(exports: GhosttyWasmExports, cols: number, rows: number): number {
  const outputPointer = exports.ghostty_wasm_alloc_opaque();
  const result = exports.ghostty_terminal_new(0, outputPointer, cols, rows);
  if (result !== GHOSTTY_SUCCESS) {
    exports.ghostty_wasm_free_opaque(outputPointer);
    throw new Error(`Ghostty 终端初始化失败，错误码：${result}`);
  }

  const terminal = readPointer(exports, outputPointer);
  exports.ghostty_wasm_free_opaque(outputPointer);
  return terminal;
}

function createFormatter(
  exports: GhosttyWasmExports,
  types: Record<string, GhosttyTypeLayout>,
  terminal: number,
): number {
  const optionsType = types.GhosttyFormatterTerminalOptions;
  const extraType = types.GhosttyFormatterTerminalExtra;
  const screenType = types.GhosttyFormatterScreenExtra;
  const optionsPointer = exports.ghostty_wasm_alloc_u8_array(optionsType.size);
  viewBytes(exports).fill(0, optionsPointer, optionsPointer + optionsType.size);

  const options = new DataView(exports.memory.buffer, optionsPointer, optionsType.size);
  setField(options, optionsType, "size", optionsType.size);
  setField(options, optionsType, "emit", GHOSTTY_FORMATTER_FORMAT_HTML);
  setField(options, optionsType, "unwrap", 0);
  setField(options, optionsType, "trim", 0);

  const extraOffset = fieldOffset(optionsType, "extra");
  const extraView = new DataView(exports.memory.buffer, optionsPointer + extraOffset, extraType.size);
  setField(extraView, extraType, "size", extraType.size);
  const screenOffset = fieldOffset(extraType, "screen");
  const screenView = new DataView(
    exports.memory.buffer,
    optionsPointer + extraOffset + screenOffset,
    screenType.size,
  );
  setField(screenView, screenType, "size", screenType.size);
  setField(screenView, screenType, "style", 1);

  const formatterPointer = exports.ghostty_wasm_alloc_opaque();
  const result = exports.ghostty_formatter_terminal_new(0, formatterPointer, terminal, optionsPointer);
  exports.ghostty_wasm_free_u8_array(optionsPointer, optionsType.size);
  if (result !== GHOSTTY_SUCCESS) {
    exports.ghostty_wasm_free_opaque(formatterPointer);
    exports.ghostty_terminal_free(terminal);
    throw new Error(`Ghostty 格式化器初始化失败，错误码：${result}`);
  }

  const formatter = readPointer(exports, formatterPointer);
  exports.ghostty_wasm_free_opaque(formatterPointer);
  return formatter;
}

function readTypeLayout(exports: GhosttyWasmExports): Record<string, GhosttyTypeLayout> {
  const pointer = exports.ghostty_type_json();
  const json = new TextDecoder().decode(viewBytes(exports).subarray(pointer)).split("\0", 1)[0];
  return JSON.parse(json) as Record<string, GhosttyTypeLayout>;
}

function readPointer(exports: GhosttyWasmExports, pointer: number): number {
  return new DataView(exports.memory.buffer).getUint32(pointer, true);
}

function viewBytes(exports: GhosttyWasmExports): Uint8Array {
  return new Uint8Array(exports.memory.buffer);
}

function fieldOffset(type: GhosttyTypeLayout, fieldName: string): number {
  const field = type.fields[fieldName];
  if (!field) {
    throw new Error(`Ghostty 类型缺少字段：${fieldName}`);
  }

  return field.offset;
}

function setField(view: DataView, type: GhosttyTypeLayout, fieldName: string, value: number): void {
  const field = type.fields[fieldName];
  if (!field) {
    throw new Error(`Ghostty 类型缺少字段：${fieldName}`);
  }

  switch (field.type) {
    case "u8":
    case "bool":
      view.setUint8(field.offset, value);
      return;
    case "u16":
      view.setUint16(field.offset, value, true);
      return;
    case "u32":
    case "enum":
      view.setUint32(field.offset, value, true);
      return;
    case "u64":
      view.setBigUint64(field.offset, BigInt(value), true);
      return;
    default:
      throw new Error(`暂不支持的 Ghostty 字段类型：${field.type}`);
  }
}
