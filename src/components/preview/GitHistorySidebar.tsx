import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
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

function formatCommitDate(timestampMs: number): string {
	if (!timestampMs) return "";
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit",
	}).format(new Date(timestampMs));
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
											<span className="gitHistoryMeta">
												{isLoading
													? "Opening changes…"
													: formatCommitDate(commit.timestamp_ms)}
											</span>
											{changes.added > 0 || changes.deleted > 0 ? (
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
