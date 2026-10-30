"use client";

import { Bold, Italic, List, Strikethrough } from "lucide-react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useState } from "react";

function safeLink(url: string) {
  try { return ["http:", "https:"].includes(new URL(url).protocol); }
  catch { return false; }
}

export function DescriptionEditor({ value, onChange, onSave }: {
  value: string;
  onChange: (value: string) => void;
  onSave: (value: string) => void;
}) {
  // CardModal is keyed by card id. Never replace the document during an API refresh:
  // doing so would reset the selection, undo history and unsaved typing.
  const [initialContent] = useState(() => value.replace(/</g, "&lt;").replace(/>/g, "&gt;"));
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: false, codeBlock: false, horizontalRule: false, underline: false,
        link: {
          openOnClick: true, autolink: true, linkOnPaste: true, defaultProtocol: "https",
          isAllowedUri: safeLink,
          HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
        },
      }),
      Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
    ],
    content: initialContent,
    contentType: "markdown",
    editorProps: {
      attributes: {
        role: "textbox", "aria-label": "Descrição", "aria-multiline": "true",
        class: "description-content min-h-32 px-3 py-3 text-base sm:text-sm text-ink outline-none leading-relaxed [overflow-wrap:anywhere] [&_a]:text-blue [&_a]:underline [&_a]:cursor-pointer [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:min-h-[1.5em] [&_blockquote]:border-l-2 [&_blockquote]:border-line-2 [&_blockquote]:pl-3",
      },

    },
    onUpdate: ({ editor }) => onChange(editor.getMarkdown()),
    onBlur: ({ editor }) => onSave(editor.getMarkdown()),
  });
  const active = useEditorState({ editor, selector: ({ editor }) => ({
    bold: editor?.isActive("bold"), italic: editor?.isActive("italic"),
    strike: editor?.isActive("strike"), bulletList: editor?.isActive("bulletList"),
  }) });

  function format(kind: string) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (kind === "bold") chain.toggleBold().run();
    if (kind === "italic") chain.toggleItalic().run();
    if (kind === "strike") chain.toggleStrike().run();
    if (kind === "bulletList") chain.toggleBulletList().run();
  }

  return <div className="min-w-0 overflow-hidden rounded-xl border border-line-2 bg-well">
    <div className="flex flex-wrap items-center gap-1 border-b border-line px-2 py-1.5" role="group" aria-label="Formatação da descrição">
      {[
        { Icon: Bold, label: "Negrito", kind: "bold" as const },
        { Icon: Italic, label: "Itálico", kind: "italic" as const },
        { Icon: Strikethrough, label: "Riscado", kind: "strike" as const },
        { Icon: List, label: "Lista", kind: "bulletList" as const },
      ].map(({ Icon, label, kind }) => <button key={kind} type="button" disabled={!editor}
        aria-label={label} title={label} aria-pressed={Boolean(active?.[kind])}
        onMouseDown={(event) => event.preventDefault()} onClick={() => format(kind)}
        className={`btn btn-ghost h-10 w-10 p-0 ${active?.[kind] ? "bg-fill-2 text-orange" : "text-ink-2"}`}>
        <Icon size={16} />
      </button>)}
    </div>
    <EditorContent editor={editor} />
  </div>;
}
