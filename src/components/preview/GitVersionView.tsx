import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSpace } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { parseNoteDiff } from "../../lib/noteDiff";
import { type GitCommitDiff, invoke } from "../../lib/tauri";
import { NoteInlineEditor } from "../editor/NoteInlineEditor";
import { GitVersionChanges } from "./GitVersionChanges";
import { GitChangeStats, useGitHistoryDates } from "./gitHistoryShared";
import type { GitVersionRestore } from "./useGitVersionRestore";

type VersionMode = "changes" | "version";

interface GitVersionViewProps {
	diff: GitCommitDiff;
	relPath: string;
	restore: GitVersionRestore;
	onClose: () => void;
}

/** A saved version of the note: what it changed, how the note read then, and Restore. */
export function GitVersionView({ diff, relPath, restore, onClose }: GitVersionViewProps) {
	const { t } = useTranslation("editor");
	const dates = useGitHistoryDates();
	const [mode, setMode] = useState<VersionMode>("changes");
	const { commit } = diff;
	const { spacePath } = useSpace();
	const versionQuery = useQuery({
		queryKey: ["git", "history", "text", spacePath, relPath, commit.rel_path, commit.hash],
		queryFn: () => invoke("git_history_note_text", { path: relPath, commit }),
		enabled: mode === "version",
		staleTime: Number.POSITIVE_INFINITY,
	});
	const noteDiff = useMemo(() => parseNoteDiff(diff.diff), [diff.diff]);
	const isRestored = restore.restoredCommit?.hash === commit.hash;

	return (
		<div className="gitVersionView">
			<header className="gitVersionHeader">
				<div className="gitVersionTitle">
					<strong>{commit.subject || t("infoSidebar.history.untitled")}</strong>
					<button
						type="button"
						className="markdownEditorInfoClose"
						onClick={onClose}
						aria-label={t("infoSidebar.history.backToEditor")}
						title={t("infoSidebar.history.backToEditor")}
					>
						<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-lg)" />
					</button>
				</div>
				<div className="gitVersionTools">
					<span className="gitVersionWhen" title={dates.full(commit.timestamp_ms)}>
						<span>{dates.dayAndTime(commit.timestamp_ms)}</span>
						<GitChangeStats commit={commit} />
					</span>
					<ToggleGroup
						className="gitVersionModes"
						aria-label={t("infoSidebar.history.viewLabel")}
						value={mode}
						onValueChange={setMode}
					>
						<ToggleGroupItem value="changes">{t("infoSidebar.history.changes")}</ToggleGroupItem>
						<ToggleGroupItem value="version">
							{t("infoSidebar.history.thisVersion")}
						</ToggleGroupItem>
					</ToggleGroup>
					{isRestored ? (
						<span className="gitVersionActions">
							<span className="gitVersionRestored" role="status">
								{t("infoSidebar.history.restored")}
							</span>
							<button
								type="button"
								className="gitVersionButton"
								disabled={restore.pending}
								onClick={restore.undo}
							>
								{t("infoSidebar.history.undo")}
							</button>
						</span>
					) : (
						<button
							type="button"
							className="gitVersionButton"
							disabled={restore.pending}
							onClick={() => restore.restore(commit)}
						>
							{t("infoSidebar.history.restore")}
						</button>
					)}
				</div>
			</header>
			{mode === "changes" ? (
				<section className="gitVersionBody" aria-label={t("infoSidebar.history.changes")}>
					<GitVersionChanges diff={noteDiff} />
				</section>
			) : (
				<section className="gitVersionNote" aria-label={t("infoSidebar.history.thisVersion")}>
					{versionQuery.error ? (
						<div className="gitVersionNotice">{extractErrorMessage(versionQuery.error)}</div>
					) : versionQuery.data === undefined ? (
						<div className="gitVersionNotice">{t("infoSidebar.history.loadingVersion")}</div>
					) : (
						<NoteInlineEditor
							key={commit.hash}
							markdown={versionQuery.data}
							relPath={relPath}
							mode="preview"
							onChange={() => {}}
							interactive={false}
							acceptSearchJumps={false}
						/>
					)}
				</section>
			)}
		</div>
	);
}
