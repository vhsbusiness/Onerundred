"use client";

import { useLayoutEffect, useImperativeHandle, useState, type CSSProperties, type Ref, type RefObject, type KeyboardEvent } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Extension, Mark, Node as EditorNode, type Editor, type JSONContent } from "@tiptap/core";
import { Plugin } from "@tiptap/pm/state";
import { history, undo, redo } from "@tiptap/pm/history";
import type { Node as DocumentNode } from "@tiptap/pm/model";
import { inlineStyle, textRuns, encodeTextSpans, sliceMindText, type InlineStyle, type MindTextValue, type TextSpan } from "@/lib/mind-rich-text";
import { readMindText, writeMindText } from "@/lib/mind-text-clipboard";
import { MIND_TITLE_MAX_LENGTH, MIND_TITLE_LIMIT_MESSAGE } from "@/lib/mind-title";
import { MIND_CLIPBOARD_MIME, readMindClipboard } from "@/lib/mind-clipboard";
import { notify } from "@/components/ui/ConfirmProvider";
import type { MindNodeDTO } from "@/lib/types";

const Doc = EditorNode.create({ name: "doc", topNode: true, content: "inline*" });
const Text = EditorNode.create({ name: "text", group: "inline" });
const Break = EditorNode.create({ name: "hardBreak", group: "inline", inline: true, selectable: false,
  parseHTML: () => [{ tag: "br" }], renderHTML: () => ["br"],
  addKeyboardShortcuts() { return { "Shift-Enter": () => this.editor.commands.insertContent({ type: "hardBreak" }) }; },
});
const Style = Mark.create({
  name: "mindStyle",
  addAttributes: () => ({ bold: { default: null, rendered: false }, textColor: { default: null, rendered: false }, highlight: { default: null, rendered: false } }),
  parseHTML: () => [{ tag: "span" }],
  renderHTML({ mark }) {
    const style = inlineStyle(mark.attrs);
    return ["span", { style: `${style.bold === undefined ? "" : `font-weight:${style.bold ? 700 : 500};-webkit-text-stroke:${style.bold ? ".18px" : "0"} currentColor;`}${style.textColor !== undefined ? `color:${style.textColor || "var(--color-ink)"};` : ""}${style.highlight !== undefined ? `background-color:${style.highlight || "transparent"};` : ""}` }, 0];
  },
});
const History = Extension.create({ name: "mindHistory", addProseMirrorPlugins: () => [history()],
  addKeyboardShortcuts() { return {
    "Mod-z": () => undo(this.editor.state, this.editor.view.dispatch),
    "Mod-Shift-z": () => redo(this.editor.state, this.editor.view.dispatch),
    "Mod-y": () => redo(this.editor.state, this.editor.view.dispatch),
  }; },
});
const Limit = Extension.create({ name: "mindLimit", addProseMirrorPlugins: () => [new Plugin({
  filterTransaction(transaction) { return !transaction.docChanged || transaction.doc.content.size <= MIND_TITLE_MAX_LENGTH; },
})] });

function content(value: { title: string; textSpans?: string }): JSONContent[] {
  const nodes: JSONContent[] = [];
  for (const run of textRuns(value.title, value.textSpans)) {
    const style = inlineStyle(run), marks = Object.keys(style).length ? [{ type: "mindStyle", attrs: style }] : [];
    run.text.split("\n").forEach((text, index) => {
      if (index) nodes.push({ type: "hardBreak", marks });
      if (text) nodes.push({ type: "text", text, marks });
    });
  }
  return nodes;
}
function read(doc: DocumentNode): MindTextValue {
  let title = ""; const spans: TextSpan[] = [];
  doc.forEach(node => {
    const from = title.length;
    title += node.isText ? node.text : "\n";
    const style = inlineStyle(node.marks.find(mark => mark.type.name === "mindStyle")?.attrs);
    if (Object.keys(style).length) spans.push({ from, to: title.length, ...style });
  });
  // Merge neighboring marks after typing; keep the persisted value small and stable.
  return { title, textSpans: encodeTextSpans(textRuns(title, encodeTextSpans(spans)).filter(run => Object.keys(inlineStyle(run)).length).map(({ from, to, ...run }) => ({ from, to, ...inlineStyle(run) }))) };
}
export type MindTextSelection = InlineStyle & { from: number; to: number; mixedBold?: boolean };
function selection(editor: Editor, node: MindNodeDTO): MindTextSelection {
  const { from, to } = editor.state.selection;
  const base = { bold: node.bold || (!node.parentId && !node.detached), textColor: node.textColor, highlight: node.highlight };
  const value = read(editor.state.doc);
  const styles = textRuns(value.title, value.textSpans).filter(run => run.to > from && run.from < to).map(run => ({ ...base, ...inlineStyle(run) }));
  return { from, to, ...base, ...(styles[0] ?? {}), bold: styles.length ? styles.every(s => s.bold) : base.bold,
    mixedBold: styles.some(s => s.bold) && styles.some(s => !s.bold) };
}
export type MindRichHandle = { format: (patch: InlineStyle) => MindTextValue | null; clearOverrides: (patch: InlineStyle) => MindTextValue | null; read: () => MindTextValue; selection: () => MindTextSelection };
export function MindRichEditor({ node, value, selectAll, fieldRef, ref, style, onChange, onSelection, onBlur, onKeyDown, onCopyItems }: {
  node: MindNodeDTO; value: MindTextValue; selectAll: boolean; fieldRef: RefObject<HTMLDivElement | null>; ref: Ref<MindRichHandle>;
  style: CSSProperties; onChange: (value: MindTextValue) => void; onSelection: (selection: MindTextSelection) => void;
  onBlur: () => void; onKeyDown: (event: KeyboardEvent) => void; onCopyItems: (event: ClipboardEvent) => void;
}) {
  const [initial] = useState(() => ({ type: "doc", content: content(value) }));
  const editor = useEditor({
    immediatelyRender: false, extensions: [Doc, Text, Break, Style, History, Limit], content: initial,
    editorProps: {
      attributes: { "data-mind-title": "", role: "textbox", "aria-label": "Texto do ramo", "aria-multiline": "true", class: "mind-rich-content" },
      handleScrollToSelection(view) {
        const field = fieldRef.current;
        if (!field) return true;
        const caret = view.coordsAtPos(view.state.selection.head), rect = field.getBoundingClientRect();
        const scale = rect.width / (field.offsetWidth || 1);
        if (caret.top < rect.top) field.scrollTop -= (rect.top - caret.top) / scale;
        else if (caret.bottom > rect.bottom) field.scrollTop += (caret.bottom - rect.bottom) / scale;
        return true;
      },
      handleDOMEvents: {
        copy(view, event) {
          if (!event.clipboardData || view.state.selection.empty) return false;
          const { from, to } = view.state.selection, value = read(view.state.doc), part = sliceMindText(value, from, to);
          if (from === 0 && to === value.title.length && value.title === node.title && value.textSpans === (node.textSpans ?? "")) onCopyItems(event);
          writeMindText(event.clipboardData, part.title, { ...node, bold: node.bold || (!node.parentId && !node.detached) }, part.textSpans);
          event.preventDefault(); event.stopPropagation(); return true;
        },
      },
      handlePaste(view, event) {
        const clipboard = event.clipboardData;
        if (!clipboard) return false;
        try {
          const data = readMindClipboard(clipboard.getData(MIND_CLIPBOARD_MIME) || clipboard.getData("text/plain"));
          if (data && data.nodes.length !== 1) { notify("Para colar vários itens, clique primeiro no fundo do mapa.", "info"); return true; }
          const single = data?.nodes[0];
          const phrase = readMindText(clipboard);
          const title = phrase?.text ?? single?.title ?? clipboard.getData("text/plain").replace(/\r\n?/g, "\n");
          if (!title) return false;
          if (view.state.doc.content.size - (view.state.selection.to - view.state.selection.from) + title.length > MIND_TITLE_MAX_LENGTH) { notify(MIND_TITLE_LIMIT_MESSAGE, "error"); return true; }
          let spans = phrase?.textSpans ?? single?.textSpans ?? "";
          if (phrase?.style || single) {
            const base = inlineStyle(phrase?.style ?? single);
            spans = encodeTextSpans(textRuns(title, spans).map(run => ({ from: run.from, to: run.to, ...base, ...inlineStyle(run) })));
          }
          editor?.commands.insertContent(content({ title, textSpans: spans }));
          return true;
        } catch { notify("Não foi possível colar esse texto.", "error"); return true; }
      },
    },
    onUpdate: ({ editor }) => { onChange(read(editor.state.doc)); onSelection(selection(editor, node)); },
    onSelectionUpdate: ({ editor }) => onSelection(selection(editor, node)),
    onBlur: ({ event }) => { if (!(event.relatedTarget as Element | null)?.closest?.(".mind-tools,.mind-context")) onBlur(); },
  });
  useLayoutEffect(() => {
    if (!editor) return;
    editor.commands.setTextSelection(selectAll ? { from: 0, to: editor.state.doc.content.size } : editor.state.doc.content.size);
    editor.view.dom.focus({ preventScroll: true });
    onChange(read(editor.state.doc));
    onSelection(selection(editor, node));
    // Initial focus only; subsequent parent updates must preserve selection and native undo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);
  useImperativeHandle(ref, () => ({
    read: () => editor ? read(editor.state.doc) : value,
    selection: () => editor ? selection(editor, node) : { from: 0, to: 0 },
    format(patch) {
      if (!editor || editor.state.selection.empty) return null;
      editor.commands.setMark("mindStyle", patch);
      editor.view.focus();
      return read(editor.state.doc);
    },
    clearOverrides(patch) {
      if (!editor || !Object.keys(patch).length) return null;
      const transaction = editor.state.tr, type = editor.schema.marks.mindStyle;
      editor.state.doc.forEach((node, offset) => {
        const existing = node.marks.find(mark => mark.type === type);
        if (!existing) return;
        const attrs = inlineStyle(existing.attrs);
        for (const key of Object.keys(patch) as (keyof InlineStyle)[]) delete attrs[key];
        transaction.removeMark(offset, offset + node.nodeSize, type);
        if (Object.keys(attrs).length) transaction.addMark(offset, offset + node.nodeSize, type.create(attrs));
      });
      editor.view.dispatch(transaction);
      return read(editor.state.doc);
    },
  }));
  return <div ref={fieldRef} data-mind-text-scroll className="mind-rich-editor w-full min-w-0 cursor-text select-text text-center" style={style} onKeyDown={onKeyDown}>
    <EditorContent editor={editor} />
  </div>;
}
