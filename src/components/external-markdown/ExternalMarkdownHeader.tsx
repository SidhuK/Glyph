import type { EditorViewMode } from "../../lib/editorMode";
import { FolderOpen } from "../Icons";
import { EditorViewModeSwitch } from "../editor/EditorViewModeSwitch";

interface ExternalMarkdownHeaderProps {
	title: string;
	folderLabel: string;
	isInsideSpace: boolean;
	mode: EditorViewMode;
	onModeChange: (mode: EditorViewMode) => void;
	onReveal: () => void;
	onOpenInGlyph: () => void;
}

export function ExternalMarkdownHeader({
	title,
	folderLabel,
	isInsideSpace,
	mode,
	onModeChange,
	onReveal,
	onOpenInGlyph,
}: ExternalMarkdownHeaderProps) {
	return (
		<div className="externalMarkdownOverlayChrome">
			<div
				className="externalMarkdownDragRegion"
				data-tauri-drag-region
				aria-hidden="true"
			/>
			<div className="externalMarkdownTitleBlock">
				<h1 className="externalMarkdownTitle">{title}</h1>
				<div className="externalMarkdownMetaRow">
					{folderLabel ? (
						<button
							type="button"
							className="externalMarkdownMetaButton"
							title="Reveal in Finder"
							onClick={onReveal}
						>
							<FolderOpen size="var(--icon-xs)" aria-hidden="true" />
							<span className="externalMarkdownMetaLabel">{folderLabel}</span>
						</button>
					) : null}
					{isInsideSpace ? null : (
						<span className="externalMarkdownBadge">Outside your space</span>
					)}
				</div>
			</div>
			<div className="externalMarkdownHeaderActions">
				{isInsideSpace ? (
					<button
						type="button"
						className="externalMarkdownHeaderButton"
						title="Save and open this note in the main window"
						onClick={onOpenInGlyph}
					>
						Open in Glyph
					</button>
				) : null}
				<div className="externalMarkdownModeSwitch">
					<EditorViewModeSwitch mode={mode} onModeChange={onModeChange} />
				</div>
			</div>
		</div>
	);
}
