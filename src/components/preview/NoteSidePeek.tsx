import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	ArrowUpRight01Icon,
	Cancel01Icon,
	NoteIcon,
} from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { noteDocumentQueryOptions } from "../../lib/navigationPrefetch";
import { parseNotePreview } from "../../lib/notePreview";
import { basename, parentDir } from "../../utils/path";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";

function titleFromPath(relPath: string): string {
	const name = basename(relPath);
	return name.toLowerCase().endsWith(".md") ? name.slice(0, -3) : name;
}

interface NoteSidePeekProps {
	relPath: string;
	onClose: () => void;
	onOpen: () => void;
}

export function NoteSidePeek({ relPath, onClose, onOpen }: NoteSidePeekProps) {
	const { t } = useTranslation("editor");
	const noteQuery = useQuery({
		...noteDocumentQueryOptions(relPath),
		enabled: Boolean(relPath),
	});
	const markdown = noteQuery.data?.text ?? "";
	const title = noteQuery.data
		? parseNotePreview(relPath, noteQuery.data.text).title
		: titleFromPath(relPath);
	const folder = parentDir(relPath);
	const error = noteQuery.error ? extractErrorMessage(noteQuery.error) : "";
	const isPending = noteQuery.isPending;

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape" || event.defaultPrevented) return;
			event.preventDefault();
			onClose();
		};
		window.addEventListener("keydown", onKeyDown, true);
		return () => {
			window.removeEventListener("keydown", onKeyDown, true);
		};
	}, [onClose]);

	return (
		<aside
			className="noteSidePeek"
			aria-label={t("sidePeek.dialogLabel")}
			aria-busy={isPending}
			data-window-drag-ignore
		>
			<header className="noteSidePeekHeader">
				<div className="noteSidePeekIdentity">
					<span className="noteSidePeekGlyph" aria-hidden="true">
						<HugeiconsIcon icon={NoteIcon} size={16} />
					</span>
					<div className="noteSidePeekCopy">
						<h2 className="noteSidePeekTitle" title={title}>
							{title}
						</h2>
						{folder ? (
							<p className="noteSidePeekPath" title={folder}>
								{folder}
							</p>
						) : null}
					</div>
				</div>
				<div className="noteSidePeekActions">
					<button
						type="button"
						className="noteSidePeekIconBtn"
						onClick={onOpen}
						aria-label={t("sidePeek.open")}
						title={t("sidePeek.open")}
					>
						<HugeiconsIcon icon={ArrowUpRight01Icon} size={15} />
					</button>
					<button
						type="button"
						className="noteSidePeekIconBtn"
						onClick={onClose}
						aria-label={t("sidePeek.close")}
						title={t("sidePeek.close")}
					>
						<HugeiconsIcon icon={Cancel01Icon} size={15} />
					</button>
				</div>
			</header>
			<div className="noteSidePeekBody">
				{error ? (
					<div className="noteSidePeekStatus">{error}</div>
				) : isPending ? (
					<div className="noteSidePeekSkeleton" aria-hidden="true">
						<span className="noteSidePeekSkeletonLine is-wide" />
						<span className="noteSidePeekSkeletonLine" />
						<span className="noteSidePeekSkeletonLine is-short" />
					</div>
				) : !markdown.trim() ? (
					<div className="noteSidePeekStatus">{t("sidePeek.empty")}</div>
				) : (
					<div className="noteSidePeekDocument">
						<NoteInlineEditor
							markdown={markdown}
							relPath={relPath}
							mode="preview"
							chrome="minimal"
							onChange={() => {}}
							interactive
							acceptSearchJumps={false}
							deferHeavyFeatures
						/>
					</div>
				)}
			</div>
		</aside>
	);
}
