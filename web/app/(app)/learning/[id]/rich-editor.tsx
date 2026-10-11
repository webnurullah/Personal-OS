"use client";

import { useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Placeholder } from "@tiptap/extensions";
import { webAddress } from "@/lib/web-address";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Quote, Redo2, Underline as UnderlineIcon, Undo2 } from "lucide-react";

const NONE = { bold: false, italic: false, underline: false, h2: false, h3: false, bullet: false, ordered: false, quote: false, link: false, undo: false, redo: false };

/**
 * A small text editor: bold, italic, underline, headings, lists, a quote and links, with undo and redo. It holds and gives back HTML,
 * which is only ever shown through the editor itself (anything it does not know is dropped when it is opened). `value` is the text it
 * starts with: to load other text, give it a new `key` (a fresh editor, with a fresh undo history).
 */
export default function RichEditor({ value, onChange, label, placeholder }: { value: string; onChange: (html: string) => void; label: string; placeholder: string }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [linkProblem, setLinkProblem] = useState(false);

  const editor = useEditor({
    immediatelyRender: false, // the page is drawn on the server first
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        strike: false,
        horizontalRule: false,
        trailingNode: false, // (an empty paragraph is not added after a heading or a list: a toggle on everything would pile them up)
        link: false, // set up below
      }),
      // A link keeps only its address: class, title, target and rel of a pasted link are not kept, so they are always the ones given here.
      Link.extend({ addAttributes: () => ({ href: { default: null, parseHTML: (element: HTMLElement) => element.getAttribute("href") } }) }).configure({
        openOnClick: false,
        autolink: true,
        // Only real addresses become links by themselves (not file names such as main.py or README.md).
        shouldAutoLink: (url: string) => /^(https?:\/\/|www\.)/i.test(url),
        defaultProtocol: "https",
        protocols: ["http", "https"],
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: "_blank" },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: value,
    parseOptions: { preserveWhitespace: true }, // runs of spaces and indents are kept when the notes are opened again
    editorProps: {
      attributes: { class: "rich-text", role: "textbox", "aria-multiline": "true", "aria-label": label },
      // Ctrl or Cmd and a click opens a link (a plain click only puts the cursor there, as in any editor).
      handleClick: (_view, _position, event) => {
        if (!(event.ctrlKey || event.metaKey)) return false;
        const link = (event.target as HTMLElement | null)?.closest("a");
        if (!link) return false;
        window.open(link.href, "_blank", "noopener,noreferrer");
        return true;
      },
    },
    onUpdate: ({ editor: e }) => {
      onChange(e.isEmpty ? "" : e.getHTML());
    },
  });

  const on = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e?.isActive("bold") ?? false,
      italic: e?.isActive("italic") ?? false,
      underline: e?.isActive("underline") ?? false,
      h2: e?.isActive("heading", { level: 2 }) ?? false,
      h3: e?.isActive("heading", { level: 3 }) ?? false,
      bullet: e?.isActive("bulletList") ?? false,
      ordered: e?.isActive("orderedList") ?? false,
      quote: e?.isActive("blockquote") ?? false,
      link: e?.isActive("link") ?? false,
      undo: e?.can().undo() ?? false,
      redo: e?.can().redo() ?? false,
    }),
  }) ?? NONE;

  if (!editor) return <div className="skeleton h-52 rounded-xl" aria-busy="true" aria-label="Loading the editor" />;

  const button = (name: string, icon: ReactNode, active: boolean, run: () => void, disabled = false, toggle = true) => (
    <button
      key={name}
      type="button"
      className={`btn btn-ghost btn-sm btn-icon ${active ? "bg-blue-50 text-blue-700" : "text-slate-600"}`}
      aria-label={name}
      title={name}
      aria-pressed={toggle ? active : undefined}
      disabled={disabled}
      // The editor keeps its cursor and selection when a button is pressed.
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
    >
      {icon}
    </button>
  );

  const openLink = () => {
    setAddress(editor.getAttributes("link").href ?? "");
    setLinkProblem(false);
    setLinkOpen(true);
  };
  const applyLink = () => {
    if (!address.trim()) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    const href = webAddress(address);
    if (!href) return setLinkProblem(true);
    if (editor.state.selection.empty && !on.link) {
      // Nothing is selected: the address itself is written as the link.
      editor.chain().focus().insertContent({ type: "text", text: address.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  return (
    <div className="notes-editor">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-100 px-1.5 py-1" role="toolbar" aria-label="Text formatting">
        {button("Bold", <Bold className="size-4" />, on.bold, () => editor.chain().focus().toggleBold().run())}
        {button("Italic", <Italic className="size-4" />, on.italic, () => editor.chain().focus().toggleItalic().run())}
        {button("Underline", <UnderlineIcon className="size-4" />, on.underline, () => editor.chain().focus().toggleUnderline().run())}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        {button("Heading", <Heading2 className="size-4" />, on.h2, () => editor.chain().focus().toggleHeading({ level: 2 }).run())}
        {button("Subheading", <Heading3 className="size-4" />, on.h3, () => editor.chain().focus().toggleHeading({ level: 3 }).run())}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        {button("Bullet list", <List className="size-4" />, on.bullet, () => editor.chain().focus().toggleBulletList().run())}
        {button("Numbered list", <ListOrdered className="size-4" />, on.ordered, () => editor.chain().focus().toggleOrderedList().run())}
        {button("Quote", <Quote className="size-4" />, on.quote, () => editor.chain().focus().toggleBlockquote().run())}
        {button("Link", <Link2 className="size-4" />, on.link, openLink, false, false)}
        <span className="mx-1 h-5 w-px bg-slate-200" aria-hidden />
        {button("Undo", <Undo2 className="size-4" />, false, () => editor.chain().focus().undo().run(), !on.undo, false)}
        {button("Redo", <Redo2 className="size-4" />, false, () => editor.chain().focus().redo().run(), !on.redo, false)}
      </div>
      {linkOpen && (
        <form
          className="flex flex-col gap-2 border-b border-slate-100 bg-slate-50 px-2.5 py-2 sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            applyLink();
          }}
        >
          <input
            className="input min-w-0 flex-1"
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              setLinkProblem(false);
            }}
            placeholder="Link address, e.g. example.com"
            aria-label="Link address"
            aria-invalid={linkProblem}
            inputMode="url"
            autoComplete="off"
            autoFocus
          />
          <span className="flex flex-wrap gap-2">
            <button type="submit" className="btn btn-primary btn-sm">{on.link ? "Update link" : "Add link"}</button>
            {on.link && webAddress(address) && (
              <a href={webAddress(address) ?? undefined} target="_blank" rel="noopener noreferrer nofollow" className="btn btn-secondary btn-sm">Open link</a>
            )}
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLinkOpen(false); editor.commands.focus(); }}>Cancel</button>
          </span>
          {linkProblem && <p role="alert" className="text-xs text-rose-600">That does not look like a web address.</p>}
        </form>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
