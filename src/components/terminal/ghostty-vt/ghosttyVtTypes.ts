export interface GhosttyTypeField {
  offset: number;
  type: string;
}

export interface GhosttyTypeLayout {
  size: number;
  fields: Record<string, GhosttyTypeField>;
}

export interface GhosttyWasmExports {
  memory: WebAssembly.Memory;
  ghostty_type_json(): number;
  ghostty_wasm_alloc_opaque(): number;
  ghostty_wasm_free_opaque(pointer: number): void;
  ghostty_wasm_alloc_u8_array(length: number): number;
  ghostty_wasm_free_u8_array(pointer: number, length: number): void;
  ghostty_wasm_alloc_usize(): number;
  ghostty_wasm_free_usize(pointer: number): void;
  ghostty_terminal_new(allocator: number, output: number, cols: number, rows: number): number;
  ghostty_terminal_free(terminal: number): void;
  ghostty_terminal_resize(
    terminal: number,
    cols: number,
    rows: number,
    cellWidth: number,
    cellHeight: number,
  ): number;
  ghostty_terminal_vt_write(terminal: number, data: number, length: number): void;
  ghostty_formatter_terminal_new(allocator: number, output: number, terminal: number, options: number): number;
  ghostty_formatter_format_alloc(formatter: number, allocator: number, output: number, length: number): number;
  ghostty_formatter_free(formatter: number): void;
  ghostty_free(allocator: number, pointer: number, length: number): void;
}

export interface GhosttyFrameMessage {
  type: "frame";
  sessionId: string;
  html: string;
}

export interface GhosttyReadyMessage {
  type: "ready";
  sessionId: string;
}

export interface GhosttyErrorMessage {
  type: "error";
  sessionId: string;
  message: string;
}

export type GhosttyWorkerMessage = GhosttyFrameMessage | GhosttyReadyMessage | GhosttyErrorMessage;
