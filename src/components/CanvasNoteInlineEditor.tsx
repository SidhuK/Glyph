import Link from "@tiptap/extension-link";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { memo, useCallback, useEffect, useMemo, useRef } from "react";
import {
	Bold,
	Italic,
	Link2,
	List,
	ListChecks,
	Quote,
	Strikethrough,
} from "./Icons";

export type CanvasInlineEditorMode = "rich" | "raw";

interface CanvasNoteInlineEditorProps {
	markdown: string;
	mode: CanvasInlineEditorMode;
	roundTripSafe: boolean | null;
	onRoundTripSafeChange?: (safe: boolean) => void;
	onModeChange: (mode: CanvasInlineEditorMode) => void;
	onChange: (nextMarkdown: string) => void;
}

function normalizeForCompare(markdown: string): string {
	return markdown
		.replace(/\r\n/g, "\n")
		.replace(/[ \t]+$/gm, "")
		.replace(/\n+$/, "\n");
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	mode,
	roundTripSafe,
	onRoundTripSafeChange,
	onModeChange,
	onChange,
}: CanvasNoteInlineEditorProps) {
	const applyingContentRef = useRef(false);
	const onChangeRef = useRef(onChange);
	const modeRef = useRef<CanvasInlineEditorMode>(mode);

	useEffect(() => {
		modeRef.current = mode;
	}, [mode]);

	useEffect(() => {
		onChangeRef.current = onChange;
	}, [onChange]);

	const extensions = useMemo(
		() => [
			StarterKit,
			Link.configure({ openOnClick: false }),
			TaskList,
			TaskItem.configure({ nested: true }),
			Markdown,
		],
		[],
	);

	const editor = useEditor({
		extensions,
		content: "",
		editorProps: {
			attributes: {
				class: "tiptapContent tiptapContentInline",
				spellcheck: "false",
			},
		},
		onUpdate: ({ editor }) => {
			if (applyingContentRef.current) return;
			if (modeRef.current !== "rich") return;
			onChangeRef.current(editor.getMarkdown());
		},
	});

	useEffect(() => {
		if (!editor) return;
		editor.setEditable(mode === "rich");
	}, [editor, mode]);

	useEffect(() => {
		if (!editor) return;
		if (mode !== "rich") return;
		applyingContentRef.current = true;
		try {
			editor.commands.setContent(markdown ?? "", { contentType: "markdown" });
		} finally {
			applyingContentRef.current = false;
		}

		queueMicrotask(() => {
			try {
				const rt = editor.getMarkdown();
				const safe =
					normalizeForCompare(rt) === normalizeForCompare(markdown ?? "");
				onRoundTripSafeChange?.(safe);
				if (!safe && modeRef.current === "rich") onModeChange("raw");
			} catch {
				onRoundTripSafeChange?.(false);
				if (modeRef.current === "rich") onModeChange("raw");
			}
		});
	}, [editor, markdown, mode, onModeChange, onRoundTripSafeChange]);

	const toggleLink = useCallback(() => {
		if (!editor) return;
		const isActive = editor.isActive("link");
		if (isActive) {
			editor.chain().focus().unsetLink().run();
			return;
		}
		const url = window.prompt("Link URL:", "https://");
		if (!url) return;
		editor.chain().focus().setLink({ href: url }).run();
	}, [editor]);

	return (
		<div className="rfNodeNoteEditor nodrag nopan">
			<div className="rfNodeNoteEditorRibbon nodrag nopan">
				<button
					type="button"
					className={mode === "rich" ? "segBtn active" : "segBtn"}
					onClick={() => {
						if (roundTripSafe === false) {
							const ok = window.confirm(
								"Rich editing may rewrite some Markdown in this note. Continue?",
							);
							if (!ok) return;
						}
						onModeChange("rich");
					}}
					title={
						roundTripSafe === false
							? "Rich editor may rewrite some Markdown"
							: "Rich editor"
					}
				>
					Rich
				</button>
				<button
					type="button"
					className={mode === "raw" ? "segBtn active" : "segBtn"}
					onClick={() => onModeChange("raw")}
					title="Raw Markdown"
				>
					Raw
				</button>

				<span className="toolbarDivider" />

				<button
					type="button"
					className="iconBtn sm"
					onClick={() => editor?.chain().focus().toggleBold().run()}
					disabled={!editor || mode !== "rich"}
					title="Bold"
				>
					<Bold size={14} />
				</button>
				<button
					type="button"
					className="iconBtn sm"
					onClick={() => editor?.chain().focus().toggleItalic().run()}
					disabled={!editor || mode !== "rich"}
					title="Italic"
				>
					<Italic size={14} />
				</button>
				<button
					type="button"
					className="iconBtn sm"
					onClick={() => editor?.chain().focus().toggleStrike().run()}
					disabled={!editor || mode !== "rich"}
					title="Strikethrough"
				>
					<Strikethrough size={14} />
				</button>
				<button
					type="button"
					className="iconBtn sm"
					onClick={toggleLink}
					disabled={!editor || mode !== "rich"}
					title="Link"
				>
					<Link2 size={14} />
				</button>
				<button
					type="button"
					className="iconBtn sm"
					onClick={() => editor?.chain().focus().toggleBulletList().run()}
					disabled={!editor || mode !== "rich"}
					title="Bullet list"
				>
					<List size={14} />
				</button>
				<button
					type="button"
					className="iconBtn sm"
					onClick={() => editor?.chain().focus().toggleTaskList().run()}
					disabled={!editor || mode !== "rich"}
					title="Task list"
				>
					<ListChecks size={14} />
				</button>
				<button
					type="button"
					className="iconBtn sm"
					onClick={() => editor?.chain().focus().toggleBlockquote().run()}
					disabled={!editor || mode !== "rich"}
					title="Quote"
				>
					<Quote size={14} />
				</button>
			</div>

			<div className="rfNodeNoteEditorBody nodrag nopan">
				{mode === "raw" ? (
					<textarea
						className="rfNodeNoteEditorRaw mono nodrag nopan"
						value={markdown}
						onChange={(e) => onChange(e.target.value)}
						spellCheck={false}
					/>
				) : (
					<EditorContent editor={editor} />
				)}
			</div>
		</div>
	);
});
