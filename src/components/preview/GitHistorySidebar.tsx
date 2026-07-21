import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useDateDisplayFormat } from "../../contexts";
import {
	type DateDisplayFormat,
	formatDisplayDate,
	formatLocalClockTime,
	parseDisplayDateInput,
} from "../../lib/dateDisplayFormat";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type GitCommitDiff,
	type GitHistoryCommit,
	invoke,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";

interface GitHistorySidebarProps {
	open: boolean;
	relPath: string | null;
	selectedCommitHash?: string | null;
	onSelectDiff: (diff: GitCommitDiff) => void;
}

function formatCommitDate(
	timestampMs: number,
	dateFormat: DateDisplayFormat,
): string {
	if (!timestampMs) return "";
	const date = parseDisplayDateInput(timestampMs);
	if (!date) return "";
	return formatDisplayDate(date, dateFormat, {
		time: formatLocalClockTime(date),
	});
}

function formatCommitAge(timestampMs: number): string {
	if (!timestampMs) return "";
	const elapsedMinutes = Math.max(
		0,
		Math.floor((Date.now() - timestampMs) / 60_000),
	);
	if (elapsedMinutes < 1) return "now";
	if (elapsedMinutes < 60) return `${elapsedMinutes}m`;

	const elapsedHours = Math.floor(elapsedMinutes / 60);
	if (elapsedHours < 24) return `${elapsedHours}h`;

	const elapsedDays = Math.floor(elapsedHours / 24);
	if (elapsedDays < 7) return `${elapsedDays}d`;
	if (elapsedDays < 30) return `${Math.floor(elapsedDays / 7)}w`;
	if (elapsedDays < 365) return `${Math.floor(elapsedDays / 30)}mo`;
	return `${Math.floor(elapsedDays / 365)}y`;
}

function changeCounts(commit: GitHistoryCommit) {
	return {
		added: commit.added_count + commit.modified_count,
		deleted: commit.deleted_count + commit.modified_count,
	};
}

export function GitHistorySidebar({
	open,
	relPath,
	selectedCommitHash = null,
	onSelectDiff,
}: GitHistorySidebarProps) {
	const dateDisplayFormat = useDateDisplayFormat();
	const latestDiffRequestId = useRef(0);
	useEffect(
		() => () => {
			latestDiffRequestId.current += 1;
		},
		[],
	);
	const historyQuery = useQuery({
		queryKey: ["git", "history", relPath],
		queryFn: () =>
			relPath ? invoke("git_history_list", { path: relPath, limit: 40 }) : [],
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

	return (
		<section className="markdownEditorInfoSection gitHistoryPanel">
			<header className="gitHistoryHeader">
				<strong>Previous saves</strong>
				<span>Select a version to review its changes.</span>
			</header>
			<div className="gitHistoryBody">
				{historyQuery.isLoading ? (
					<div className="markdownEditorInfoEmpty">Loading versions</div>
				) : null}
				{error ? (
					<div className="markdownEditorInfoEmpty">
						{extractErrorMessage(error)}
					</div>
				) : null}
				{!historyQuery.isLoading && !error && commits.length === 0 ? (
					<div className="markdownEditorInfoEmpty">No saved versions yet.</div>
				) : null}
				{commits.length ? (
					<ol className="gitHistoryList">
						{commits.map((commit) => {
							const isSelected = selectedCommitHash === commit.hash;
							const isLoading =
								diffMutation.isPending &&
								diffMutation.variables?.hash === commit.hash;
							const changes = changeCounts(commit);
							return (
								<li className="gitHistoryEntry" key={commit.hash}>
									<button
										type="button"
										className={cn(
											"gitHistoryItem",
											isSelected && "gitHistoryItemSelected",
										)}
										onClick={() => diffMutation.mutate(commit)}
										aria-pressed={isSelected}
									>
										<span className="gitHistoryContent">
											<span className="gitHistorySubject">
												{commit.subject || "Untitled version"}
											</span>
											<span className="gitHistoryAside">
												{!isLoading &&
												(changes.added > 0 || changes.deleted > 0) ? (
													<span className="gitHistoryStats">
														{changes.added > 0 ? (
															<span className="gitHistoryStat gitHistoryStatAdd">
																+{changes.added.toLocaleString()}
															</span>
														) : null}
														{changes.deleted > 0 ? (
															<span className="gitHistoryStat gitHistoryStatDelete">
																-{changes.deleted.toLocaleString()}
															</span>
														) : null}
													</span>
												) : null}
												<span
													className="gitHistoryMeta"
													title={formatCommitDate(
														commit.timestamp_ms,
														dateDisplayFormat,
													)}
												>
													{isLoading
														? "Opening…"
														: formatCommitAge(commit.timestamp_ms)}
												</span>
											</span>
										</span>
									</button>
								</li>
							);
						})}
					</ol>
				) : null}
			</div>
		</section>
	);
}
