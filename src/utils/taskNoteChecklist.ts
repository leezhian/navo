import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface MarkdownNode {
  type: string;
  checked?: boolean | null;
  position?: { start: { offset?: number; line: number }; end: { offset?: number } };
  children?: MarkdownNode[];
  data?: { hProperties?: Record<string, string | number> };
}

interface NoteChecklistMarker {
  offset: number;
  end: number;
  line: number;
  label: string;
  checked: boolean;
}

const markerSyntax = /^\[([xX \t]|\r\n?|\n)\]/;
const offsetProperty = "data-checklist-offset";

/** 用 GFM 识别清单。源码位置用于修改原字符，保留换行、引用和列表格式。 */
export function remarkNoteChecklist(collect?: (marker: NoteChecklistMarker) => void) {
  return (tree: MarkdownNode, file: { value: unknown }) => {
    if (typeof file.value !== "string") return;
    const source = file.value;
    function visit(node: MarkdownNode) {
      const start = node.position?.start;
      if (node.type === "listItem" && typeof node.checked === "boolean" && start?.offset !== undefined) {
        // GFM 保证此列表项的首段以清单标记开头，标记可在列表符号的下一行。
        const offset = source.indexOf("[", start.offset);
        const marker = offset < 0 ? null : markerSyntax.exec(source.slice(offset));
        if (marker) {
          const end = offset + marker[0].length;
          node.data ??= {};
          node.data.hProperties = { ...node.data.hProperties, [offsetProperty]: offset };
          if (collect) {
            const prefix = source.slice(start.offset, offset);
            const paragraphEnd = node.children?.[0]?.position?.end.offset ?? end;
            const label = prefix + "[]" + source.slice(end, paragraphEnd);
            const line = start.line + (prefix.match(/\r\n?|\n/g)?.length ?? 0);
            collect({ offset, end, line, label, checked: node.checked });
          }
        }
      }
      node.children?.forEach(visit);
    }
    visit(tree);
  };
}

export function noteChecklistOffset(properties?: Record<string, unknown>) {
  const offset = properties?.[offsetProperty];
  return typeof offset === "number" ? offset : undefined;
}

/** 复用 react-markdown 的同步解析管道，历史比较只收集清单节点。 */
export function noteChecklistMarkers(source: string) {
  const markers: NoteChecklistMarker[] = [];
  Markdown({ children: source, remarkPlugins: [remarkGfm, [remarkNoteChecklist, (marker: NoteChecklistMarker) => markers.push(marker)]], allowedElements: [] });
  return markers;
}

export function toggleNoteChecklist(content: string, offset: number, checked: boolean) {
  const marker = markerSyntax.exec(content.slice(offset));
  if (!marker || /[xX]/.test(marker[1]) === checked) return content;
  return content.slice(0, offset + 1) + (checked ? "x" : " ") + content.slice(offset + marker[0].length - 1);
}
