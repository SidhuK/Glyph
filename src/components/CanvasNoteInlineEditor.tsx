import { markdown as cmMarkdown } from "@codemirror/lang-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import CodeMirror from "@uiw/react-codemirror";
import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { splitYamlFrontmatter } from "../lib/notePreview";

export type CanvasInlineEditorMode = "raw" | "preview";

interface CanvasNoteInlineEditorProps {
	markdown: string;
	mode: CanvasInlineEditorMode;
	onModeChange: (mode: CanvasInlineEditorMode) => void;
	onChange: (nextMarkdown: string) => void;
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	mode,
	onModeChange,
	onChange,
}: CanvasNoteInlineEditorProps) {
	const bodyMarkdown = useMemo(
		() => splitYamlFrontmatter(markdown).body,
		[markdown],
	);

	return (
		<div className="rfNodeNoteEditor nodrag nopan">
			<div className="rfNodeNoteEditorRibbon nodrag nopan nowheel">
				<button
					type="button"
					className={mode === "preview" ? "segBtn active" : "segBtn"}
					onClick={() => onModeChange("preview")}
					title="Preview"
				>
					Preview
				</button>
				<button
					type="button"
					className={mode === "raw" ? "segBtn active" : "segBtn"}
					onClick={() => onModeChange("raw")}
					title="Raw Markdown"
				>
					Raw
				</button>
				<div style={{ flex: 1 }} />
			</div>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{mode === "raw" ? (
					<div className="rfNodeNoteEditorRaw mono nodrag nopan nowheel">
						<CodeMirror
							value={markdown}
							extensions={[cmMarkdown()]}
							basicSetup={{
								lineNumbers: false,
								foldGutter: false,
							}}
							height="100%"
							onChange={(next) => onChange(next)}
						/>
					</div>
				) : (
					<div className="tiptapContentInline nodrag nopan nowheel">
						<ReactMarkdown
							remarkPlugins={[remarkGfm]}
							components={{
								a: ({ href, children }) => (
									<a
										href={href}
										onClick={(e) => {
											const url = href ?? "";
											if (!url) return;
											if (
												!url.startsWith("http://") &&
												!url.startsWith("https://")
											)
												return;
											e.preventDefault();
											void openUrl(url);
										}}
									>
										{children}
									</a>
								),
							}}
						>
							{bodyMarkdown}
						</ReactMarkdown>
					</div>
				)}
			</div>
		</div>
	);
});
