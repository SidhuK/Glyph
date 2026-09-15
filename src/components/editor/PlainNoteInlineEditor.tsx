import { Suspense, lazy, useCallback, useRef } from "react";
import { NoteFindBar } from "./NoteFindBar";
import { useNoteFind } from "./hooks/useNoteFind";
import type { RawMarkdownEditorHandle } from "./raw/types";
import type { NoteInlineEditorProps } from "./types";

const RawMarkdownEditor = lazy(() =>
	import("./raw/RawMarkdownEditor").then((module) => ({ default: module.RawMarkdownEditor })),
);

/** Raw mode owns CodeMirror only. Unmounting rich mode flushes its pending edits. */
export function PlainNoteInlineEditor({
	markdown,
	relPath,
	onChange,
	onRawEditorReady,
	acceptSearchJumps = true,
}: NoteInlineEditorProps) {
	const hostRef = useRef<HTMLDivElement | null>(null);
	const tiptapHostRef = useRef<HTMLDivElement | null>(null);
	const rawEditorRef = useRef<RawMarkdownEditorHandle | null>(null);
	const registerEditor = useCallback(
		(editor: RawMarkdownEditorHandle | null) => {
			rawEditorRef.current = editor;
			onRawEditorReady?.(editor);
		},
		[onRawEditorReady],
	);
	const find = useNoteFind({
		editor: null,
		markdown,
		mode: "plain",
		relPath,
		acceptSearchJumps,
		hostRef,
		rawEditorRef,
		tiptapHostRef,
	});
	return (
		<div
			ref={hostRef}
			className="rfNodeNoteEditor rfNodeNoteEditorFlatEdges nodrag nopan"
			onKeyDownCapture={find.handleEditorKeyDownCapture}
		>
			<div className="rfNodeNoteEditorBody nodrag nopan nowheel">
				{find.findOpen ? (
					<NoteFindBar
						countLabel={find.findCountLabel}
						inputRef={find.findInputRef}
						matchCount={find.findMatchCount}
						query={find.findQuery}
						onClose={find.closeFind}
						onInputKeyDown={find.handleFindInputKeyDown}
						onNext={() => find.moveFindMatch(1)}
						onPrevious={() => find.moveFindMatch(-1)}
						onQueryChange={find.updateFindQuery}
					/>
				) : null}
				<Suspense fallback={<div className="rfNodeNoteEditorLoading" />}>
					<RawMarkdownEditor
						key={relPath}
						ref={registerEditor}
						markdown={markdown}
						relPath={relPath}
						onChange={onChange}
					/>
				</Suspense>
			</div>
		</div>
	);
}
