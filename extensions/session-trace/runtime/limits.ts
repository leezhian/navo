/** 单行 JSONL 的最大长度；超过则停止解析或丢弃该行。 */
export const MAX_LINE = 8 * 1024 * 1024;
/** 按块读取日志时的上限。 */
export const READ_CHUNK = 64 * 1024;
/** JSONL 行分隔符（LF）。 */
export const NEWLINE = 10;
