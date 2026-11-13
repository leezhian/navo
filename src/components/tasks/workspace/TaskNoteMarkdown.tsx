import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { parseTaskLink } from "@/shared/taskLinks";
import "./task-note-markdown.css";

const ChecklistLine = createContext<number | undefined>(undefined);
export interface NoteLineSelection { startLine: number; endLine: number; quote: string }
interface TaskNoteMarkdownProps {
  /** 始终渲染 Markdown 原文，不执行其中的 HTML 或脚本。 */
  content: string;
  /** 未提供时为只读预览；回调按源码行更新清单并提交版本检查。 */
  onChecklist?: (line: number, checked: boolean) => void;
  /** 选中文本或章节评论均锚定保存版本的源码范围。 */
  onComment?: (selection: NoteLineSelection) => void;
}

export function TaskNoteMarkdown({ content, onChecklist, onComment }: TaskNoteMarkdownProps) {
  const { t } = useTranslation(["tasks"]);
  const root = useRef<HTMLDivElement>(null);
  const [selected, setSelected] = useState<NoteLineSelection | null>(null);
  const [menuSelection, setMenuSelection] = useState<NoteLineSelection | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);
  const lines = content.split("\n");
  function comment(startLine: number, endLine: number) {
    onComment?.({ startLine, endLine, quote: lines.slice(startLine - 1, endLine).join("\n") });
  }
  function readSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;
    const range = selection.getRangeAt(0);
    if (!root.current?.contains(range.commonAncestorContainer)) return null;
    const block = (node: Node) => (node instanceof Element ? node : node.parentElement)?.closest<HTMLElement>("[data-note-start]");
    const start = block(range.startContainer), end = block(range.endContainer);
    if (!start || !end) return null;
    const startLine = Number(start.dataset.noteStart), endLine = Number(end.dataset.noteEnd);
    return { startLine, endLine, quote: lines.slice(startLine - 1, endLine).join("\n") };
  }
  useEffect(() => {
    const changed = () => setSelected(readSelection());
    document.addEventListener("selectionchange", changed);
    return () => document.removeEventListener("selectionchange", changed);
  }, [content]);
  function commentSection(line: number) {
    const headings = [...(root.current?.querySelectorAll<HTMLElement>("h1,h2,h3,h4,h5,h6") ?? [])];
    const current = headings.find((element) => Number(element.dataset.noteStart) === line);
    const next = current && headings.find((element) => Number(element.dataset.noteStart) > line && element.tagName <= current.tagName);
    comment(line, next ? Number(next.dataset.noteStart) - 1 : lines.length);
  }
  // 选择文本只更新操作入口，不更换 Markdown 节点类型，避免丢失浏览器选区。
  const components = useMemo<Components>(() => ({
      a: ({ href, title, children }) => <a href={href} title={title} target="_blank" rel="noreferrer noopener">{children}</a>,
      img: ({ src, alt, title }) => <img src={src} title={title} loading="lazy" referrerPolicy="no-referrer" alt={alt ?? ""} />,
      p: ({ node, ...props }) => <p {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
      pre: ({ node, ...props }) => <pre {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
      table: ({ node, ...props }) => <table {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
      tr: ({ node, ...props }) => <tr {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
      li: ({ node, ...props }) => <ChecklistLine.Provider value={node?.position?.start.line}><li {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} /></ChecklistLine.Provider>,
      input: ({ checked }) => <NoteCheckbox checked={Boolean(checked)} onToggle={onChecklist} />,
      h1: ({ node, children }) => <h1 data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line}>{children}<SectionComment line={node?.position?.start.line} onComment={onComment ? commentSection : undefined} /></h1>,
      h2: ({ node, children }) => <h2 data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line}>{children}<SectionComment line={node?.position?.start.line} onComment={onComment ? commentSection : undefined} /></h2>,
      h3: ({ node, children }) => <h3 data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line}>{children}<SectionComment line={node?.position?.start.line} onComment={onComment ? commentSection : undefined} /></h3>,
      h4: ({ node, children }) => <h4 data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line}>{children}<SectionComment line={node?.position?.start.line} onComment={onComment ? commentSection : undefined} /></h4>,
      h5: ({ node, children }) => <h5 data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line}>{children}<SectionComment line={node?.position?.start.line} onComment={onComment ? commentSection : undefined} /></h5>,
      h6: ({ node, children }) => <h6 data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line}>{children}<SectionComment line={node?.position?.start.line} onComment={onComment ? commentSection : undefined} /></h6>,
    }), [content, onChecklist, onComment]);
  return <ContextMenu onOpenChange={(open) => { if (open) setMenuSelection(readSelection()); }}>
    <ContextMenuTrigger asChild><div ref={root} className="task-note-markdown">
      {onComment && <Button variant="ghost" size="sm" className="mb-2 text-xs" disabled={!selected} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (selected) onComment(selected); }}>
        <MessageSquarePlus />{t("tasks:notes.commentSelection")}
      </Button>}
      {copyFailed && <p role="alert" className="text-xs text-destructive">{t("tasks:notes.copyFailed")}</p>}
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={(url, key) => key === "href" && parseTaskLink(url) ? url : defaultUrlTransform(url)} components={components}>{content}</ReactMarkdown>
    </div></ContextMenuTrigger>
    <ContextMenuContent><ContextMenuItem disabled={!menuSelection || !onComment} onSelect={() => { if (menuSelection) onComment?.(menuSelection); }}>{t("tasks:notes.commentSelection")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => { setCopyFailed(false); void navigator.clipboard.writeText(menuSelection?.quote ?? content).catch(() => setCopyFailed(true)); }}>{t("tasks:notes.copy")}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

function NoteCheckbox({ checked, onToggle }: { /** 当前清单保存值。 */ checked: boolean; /** 可写时按所属条目源码行回传。 */ onToggle?: (line: number, checked: boolean) => void }) {
  const { t } = useTranslation(["tasks"]);
  const line = useContext(ChecklistLine);
  return <input type="checkbox" aria-label={t("tasks:notes.checklist")} checked={checked} disabled={!onToggle || !line} onChange={(event) => { if (line) onToggle?.(line, event.target.checked); }} />;
}

function SectionComment({ line, onComment }: { /** Markdown 标题所在行。 */ line?: number; /** 章节评论入口，仅可写笔记提供。 */ onComment?: (start: number, end: number) => void }) {
  const { t } = useTranslation(["tasks"]);
  if (!line || !onComment) return null;
  return <button type="button" className="note-section-comment" aria-label={t("tasks:notes.commentSection")} onClick={() => onComment(line, line)}><MessageSquarePlus className="size-3.5" /></button>;
}
