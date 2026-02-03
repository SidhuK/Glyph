import { memo } from "react";

export type CanvasInlineEditorMode = "rich" | "raw";

interface CanvasNoteInlineEditorProps {
	markdown: string;
	mode: CanvasInlineEditorMode;
	roundTripSafe: boolean | null;
	onRoundTripSafeChange?: (safe: boolean) => void;
	onModeChange: (mode: CanvasInlineEditorMode) => void;
	onChange: (nextMarkdown: string) => void;
}

export const CanvasNoteInlineEditor = memo(function CanvasNoteInlineEditor({
	markdown,
	mode: _mode,
	roundTripSafe: _roundTripSafe,
	onRoundTripSafeChange: _onRoundTripSafeChange,
	onModeChange: _onModeChange,
	onChange,
}: CanvasNoteInlineEditorProps) {
	return (
		<div className="rfNodeNoteEditor nodrag nopan">
			<div className="rfNodeNoteEditorBody nodrag nopan">
				<textarea
					className="rfNodeNoteEditorRaw mono nodrag nopan"
					value={markdown}
					onChange={(e) => onChange(e.target.value)}
					spellCheck={false}
				/>
			</div>
		</div>
	);
});
