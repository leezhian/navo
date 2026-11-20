import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ComponentProps } from "react";
import ReactMarkdown, { defaultUrlTransform, type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import { MessageSquarePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import { parseTaskLink } from "@/shared/taskLinks";
import { noteChecklistOffset, remarkNoteChecklist, toggleNoteChecklist } from "@/utils/taskNoteChecklist";
import "./task-note-markdown.css";

const ChecklistOffset = createContext<number | undefined>(undefined);
export interface NoteLineSelection { startLine: number; endLine: number; quote: string }
interface TaskNoteMarkdownProps {
  /** 始终渲染 Markdown 原文，不执行其中的 HTML 或脚本。 */
  content: string;
  /** 未提供时为只读预览；回调接收勾选后的完整 Markdown。 */
  onChecklist?: (content: string) => void;
  /** 保存期间暂时禁用勾选，保留原控件和已有焦点。 */
  checklistPending?: boolean;
  /** 选中文本或章节评论均锚定保存版本的源码范围。 */
  onComment?: (selection: NoteLineSelection) => void;
  /** 保存期间保留评论入口的位置，但不能锚定尚未提交的内容。 */
  commentDisabled?: boolean;
}
const ToggleChecklist = createContext<{ toggle?: (offset: number, checked: boolean) => void; pending: boolean }>({ pending: false });
const HeadingComments = createContext<{ onComment?: (line: number) => void; disabled: boolean }>({ disabled: false });

function NoteParagraph({ node, ...props }: ComponentProps<"p"> & ExtraProps) {
  return <p {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />;
}

function NoteListItem({ node, ...props }: ComponentProps<"li"> & ExtraProps) {
  return <ChecklistOffset.Provider value={noteChecklistOffset(node?.properties)}>
    <li {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />
  </ChecklistOffset.Provider>;
}

function noteHeading(Tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6") {
  return function NoteHeading({ node, children }: ComponentProps<"h1"> & ExtraProps) {
    const line = node?.position?.start.line;
    const { onComment, disabled } = useContext(HeadingComments);
    return <Tag data-note-start={line} data-note-end={node?.position?.end.line}>
      {children}<SectionComment line={line} onComment={onComment} disabled={disabled} />
    </Tag>;
  };
}

// 节点类型不随保存状态或正文变化，避免重挂图片、标题和表格。
const noteComponents: Components = {
  a: ({ href, title, children }) => <a href={href} title={title} target="_blank" rel="noreferrer noopener">{children}</a>,
  img: ({ src, alt, title }) => <img src={src} title={title} loading="lazy" referrerPolicy="no-referrer" alt={alt ?? ""} />,
  p: NoteParagraph,
  pre: ({ node, ...props }) => <pre {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
  table: ({ node, ...props }) => <table {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
  tr: ({ node, ...props }) => <tr {...props} data-note-start={node?.position?.start.line} data-note-end={node?.position?.end.line} />,
  li: NoteListItem,
  input: NoteCheckbox,
  h1: noteHeading("h1"),
  h2: noteHeading("h2"),
  h3: noteHeading("h3"),
  h4: noteHeading("h4"),
  h5: noteHeading("h5"),
  h6: noteHeading("h6"),
};

export function TaskNoteMarkdown({ content, onChecklist, checklistPending = false, onComment, commentDisabled = false }: TaskNoteMarkdownProps) {
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
  function toggleChecklist(offset: number, checked: boolean) {
    const next = toggleNoteChecklist(content, offset, checked);
    if (next !== content) onChecklist?.(next);
  }
  const markdown = useMemo(() => <ReactMarkdown remarkPlugins={[remarkGfm, remarkNoteChecklist]} skipHtml
    urlTransform={(url, key) => key === "href" && parseTaskLink(url) ? url : defaultUrlTransform(url)} components={noteComponents}>{content}</ReactMarkdown>, [content]);
  return <ContextMenu onOpenChange={(open) => { if (open) setMenuSelection(readSelection()); }}>
    <ContextMenuTrigger asChild><div ref={root} className="task-note-markdown">
      {onComment && <Button variant="ghost" size="sm" className="mb-2 text-xs" disabled={commentDisabled || !selected} onMouseDown={(event) => event.preventDefault()} onClick={() => { if (selected) onComment(selected); }}>
        <MessageSquarePlus />{t("tasks:notes.commentSelection")}
      </Button>}
      {copyFailed && <p role="alert" className="text-xs text-destructive">{t("tasks:notes.copyFailed")}</p>}
      <ToggleChecklist.Provider value={{ toggle: onChecklist ? toggleChecklist : undefined, pending: checklistPending }}>
        <HeadingComments.Provider value={{ onComment: onComment ? commentSection : undefined, disabled: commentDisabled }}>
          {markdown}
        </HeadingComments.Provider>
      </ToggleChecklist.Provider>
    </div></ContextMenuTrigger>
    <ContextMenuContent><ContextMenuItem disabled={commentDisabled || !menuSelection || !onComment} onSelect={() => { if (menuSelection) onComment?.(menuSelection); }}>{t("tasks:notes.commentSelection")}</ContextMenuItem>
      <ContextMenuItem onSelect={() => { setCopyFailed(false); void navigator.clipboard.writeText(menuSelection?.quote ?? content).catch(() => setCopyFailed(true)); }}>{t("tasks:notes.copy")}</ContextMenuItem>
    </ContextMenuContent>
  </ContextMenu>;
}

function NoteCheckbox({ checked }: Pick<ComponentProps<"input">, "checked">) {
  const { t } = useTranslation(["tasks"]);
  const offset = useContext(ChecklistOffset);
  const { toggle, pending } = useContext(ToggleChecklist);
  // aria-disabled 阻止新的操作，同时避免浏览器在保存开始时移走当前焦点。
  return <label className="task-note-checkbox" onMouseDown={(event) => { if (pending) event.preventDefault(); }}>
    <input type="checkbox" aria-label={t("tasks:notes.checklist")} checked={Boolean(checked)} disabled={!toggle || offset === undefined}
      aria-disabled={pending || undefined} tabIndex={pending ? -1 : undefined}
      onClick={(event) => { if (pending) event.preventDefault(); }}
      onChange={(event) => { if (!pending && offset !== undefined) toggle?.(offset, event.target.checked); }} />
  </label>;
}

function SectionComment({ line, onComment, disabled }: { /** Markdown 标题所在行。 */ line?: number; /** 章节评论入口。 */ onComment?: (line: number) => void; /** 保存期间禁用。 */ disabled: boolean }) {
  const { t } = useTranslation(["tasks"]);
  if (!line || !onComment) return null;
  return <button type="button" className="note-section-comment" aria-label={t("tasks:notes.commentSection")} disabled={disabled} onClick={() => onComment(line)}><MessageSquarePlus className="size-3.5" /></button>;
}
