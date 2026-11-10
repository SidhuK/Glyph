import { useMutation, useQuery } from "@tanstack/react-query";
import { Fragment, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useGitSyncContext } from "../../contexts";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type GitCommitDiff, type GitHistoryCommit, invoke } from "../../lib/tauri";
import { GitChangeStats, useGitHistoryDates } from "./gitHistoryShared";

/** Commit subject Glyph writes for automatic syncs; those rows read quieter than named saves. */
const AUTO_SYNC_SUBJECT = "Glyph sync";

interface GitHistorySidebarProps {
	open: boolean;
	relPath: string | null;
	selectedCommitHash?: string | null;
	/** The version the current note was just restored from, if any. */
	restoredCommit?: GitHistoryCommit | null;
	onSelectDiff: (diff: GitCommitDiff | null) => void;
}

export function GitHistorySidebar({
	open,
	relPath,
	selectedCommitHash = null,
	restoredCommit = null,
	onSelectDiff,
}: GitHistorySidebarProps) {
	const { t } = useTranslation("editor");
	const dates = useGitHistoryDates();
	const { status } = useGitSyncContext();
	const latestDiffRequestId = useRef(0);
	useEffect(
		() => () => {
			latestDiffRequestId.current += 1;
		},
		[],
	);
	const historyQuery = useQuery({
		queryKey: ["git", "history", relPath],
		queryFn: () => (relPath ? invoke("git_history_list", { path: relPath, limit: 40 }) : []),
		enabled: open && Boolean(relPath),
		staleTime: 0,
	});
	const diffMutation = useMutation({
		mutationFn: async (commit: GitHistoryCommit) => {
			if (!relPath) throw new Error("No note is selected.");
			const requestId = latestDiffRequestId.current + 1;
			latestDiffRequestId.current = requestId;
			const diff = await invoke("git_history_diff", { path: relPath, commit });
			return { diff, requestId };
		},
		onSuccess: ({ diff, requestId }) => {
			if (latestDiffRequestId.current === requestId) onSelectDiff(diff);
		},
	});
	const commits = historyQuery.data ?? [];
	const error = historyQuery.error ?? diffMutation.error;
	const lastSyncedAt = status?.last_success_at_ms ?? null;
	const currentNoteMeta = restoredCommit
		? t("infoSidebar.history.restoredFrom", {
				when: dates.dayAndTime(restoredCommit.timestamp_ms),
			})
		: lastSyncedAt
			? t("infoSidebar.history.lastSynced", { when: dates.relative(lastSyncedAt) })
			: "";
	const showCurrentNote = () => {
		latestDiffRequestId.current += 1;
		diffMutation.reset();
		onSelectDiff(null);
	};

	return (
		<section className="markdownEditorInfoSection gitHistoryPanel">
			{error ? <div className="markdownEditorInfoEmpty">{extractErrorMessage(error)}</div> : null}
			<div className="gitHistoryTimeline">
				<button
					type="button"
					className="gitHistoryRow"
					data-current="true"
					aria-pressed={selectedCommitHash === null}
					onClick={showCurrentNote}
				>
					<span className="gitHistorySubject">{t("infoSidebar.history.currentNote")}</span>
					{currentNoteMeta ? <span className="gitHistoryMeta">{currentNoteMeta}</span> : null}
				</button>
				{commits.map((commit, index) => {
					const day = dates.day(commit.timestamp_ms);
					const startsDay = index === 0 || day !== dates.day(commits[index - 1].timestamp_ms);
					const isOpening = diffMutation.isPending && diffMutation.variables?.hash === commit.hash;
					return (
						<Fragment key={commit.hash}>
							{startsDay && day ? <div className="gitHistoryDay">{day}</div> : null}
							<button
								type="button"
								className="gitHistoryRow"
								data-quiet={commit.subject === AUTO_SYNC_SUBJECT ? "true" : undefined}
								aria-pressed={selectedCommitHash === commit.hash}
								title={dates.full(commit.timestamp_ms)}
								onClick={() => diffMutation.mutate(commit)}
							>
								<span className="gitHistorySubject">
									{commit.subject || t("infoSidebar.history.untitled")}
								</span>
								<span className="gitHistoryMeta">
									<span>
										{isOpening ? t("infoSidebar.history.opening") : dates.time(commit.timestamp_ms)}
									</span>
									<GitChangeStats commit={commit} />
								</span>
							</button>
						</Fragment>
					);
				})}
			</div>
			{historyQuery.isLoading ? (
				<div className="markdownEditorInfoEmpty">{t("infoSidebar.history.loading")}</div>
			) : null}
			{!historyQuery.isLoading && !error && commits.length === 0 ? (
				<div className="markdownEditorInfoEmpty">{t("infoSidebar.history.empty")}</div>
			) : null}
		</section>
	);
}
