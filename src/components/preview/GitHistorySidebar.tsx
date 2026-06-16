import { GitCommitHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	type GitCommitDiff,
	type GitHistoryCommit,
	invoke,
} from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { ChevronDown, ChevronRight } from "../Icons";

interface GitHistorySidebarProps {
	open: boolean;
	relPath: string | null;
	selectedCommitHash?: string | null;
	onSelectDiff: (diff: GitCommitDiff) => void;
}

interface GitHistoryGroup {
	key: string;
	label: string;
	commits: GitHistoryCommit[];
}

function startOfDayMs(date: Date): number {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function formatGroupLabel(timestampMs: number, nowMs: number): string {
	if (!timestampMs) return "Earlier";
	const date = new Date(timestampMs);
	const dayMs = startOfDayMs(date);
	const todayMs = startOfDayMs(new Date(nowMs));
	const dayDelta = Math.round((todayMs - dayMs) / 86_400_000);
	if (dayDelta === 0) return "Today";
	if (dayDelta === 1) return "Yesterday";
	return new Intl.DateTimeFormat(undefined, {
		weekday: "long",
		year: "numeric",
		month: "long",
		day: "numeric",
	}).format(date);
}

function formatCommitDate(timestampMs: number, nowMs: number): string {
	if (!timestampMs) return "";
	const elapsedMs = Math.max(0, nowMs - timestampMs);
	const dayCount = Math.floor(elapsedMs / 86_400_000);
	if (dayCount === 0) return "Today";
	if (dayCount === 1) return "1d ago";
	if (dayCount < 7) return `${dayCount}d ago`;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
	}).format(new Date(timestampMs));
}

function groupHistoryCommits(
	commits: GitHistoryCommit[],
	nowMs: number,
): GitHistoryGroup[] {
	const groups = new Map<string, GitHistoryGroup>();
	for (const commit of commits) {
		const key = commit.timestamp_ms
			? startOfDayMs(new Date(commit.timestamp_ms)).toString()
			: "unknown";
		const group = groups.get(key);
		if (group) {
			group.commits.push(commit);
			continue;
		}
		groups.set(key, {
			key,
			label: formatGroupLabel(commit.timestamp_ms, nowMs),
			commits: [commit],
		});
	}
	return [...groups.values()];
}

function commitCountLabel(count: number): string {
	return `${count} ${count === 1 ? "commit" : "commits"}`;
}

export function GitHistorySidebar({
	open,
	relPath,
	selectedCommitHash = null,
	onSelectDiff,
}: GitHistorySidebarProps) {
	const [commits, setCommits] = useState<GitHistoryCommit[]>([]);
	const [expandedGroupKeys, setExpandedGroupKeys] = useState<Set<string>>(
		() => new Set(),
	);
	const [loading, setLoading] = useState(false);
	const [loadingCommit, setLoadingCommit] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const diffRequestIdRef = useRef(0);
	const nowMs = useMemo(() => Date.now(), [commits]);
	const groups = useMemo(
		() => groupHistoryCommits(commits, nowMs),
		[commits, nowMs],
	);

	useEffect(() => {
		return () => {
			diffRequestIdRef.current += 1;
		};
	}, []);

	useEffect(() => {
		diffRequestIdRef.current += 1;
		setCommits([]);
		setExpandedGroupKeys(new Set());
		setError(null);
	}, [relPath]);

	useEffect(() => {
		setExpandedGroupKeys(new Set(groups.map((group) => group.key)));
	}, [groups]);

	useEffect(() => {
		if (!open || !relPath) return;
		let cancelled = false;
		setLoading(true);
		setError(null);
		void invoke("git_history_list", { path: relPath, limit: 40 })
			.then((items) => {
				if (cancelled) return;
				setCommits(items);
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setCommits([]);
				setError(extractErrorMessage(cause));
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [open, relPath]);

	const noteName = useMemo(() => {
		if (!relPath) return "Current note";
		const segments = relPath.split("/").filter(Boolean);
		return segments[segments.length - 1] ?? "Current note";
	}, [relPath]);

	const handleSelectCommit = useCallback(
		async (commit: GitHistoryCommit) => {
			if (!relPath) return;
			const requestId = diffRequestIdRef.current + 1;
			diffRequestIdRef.current = requestId;
			setLoadingCommit(commit.hash);
			setError(null);
			try {
				const diff = await invoke("git_history_diff", {
					path: relPath,
					commit,
				});
				if (diffRequestIdRef.current !== requestId) return;
				onSelectDiff(diff);
			} catch (cause) {
				if (diffRequestIdRef.current !== requestId) return;
				setError(extractErrorMessage(cause));
			} finally {
				if (diffRequestIdRef.current === requestId) {
					setLoadingCommit(null);
				}
			}
		},
		[onSelectDiff, relPath],
	);

	const toggleGroup = useCallback((key: string) => {
		setExpandedGroupKeys((prev) => {
			const next = new Set(prev);
			if (next.has(key)) {
				next.delete(key);
			} else {
				next.add(key);
			}
			return next;
		});
	}, []);

	return (
		<section className="markdownEditorInfoSection gitHistoryPanel">
			<header className="gitHistoryHeader">
				<strong>Version history</strong>
				<span>{noteName}</span>
			</header>
			<div className="gitHistoryBody">
				{loading ? (
					<div className="markdownEditorInfoEmpty">Loading history</div>
				) : null}
				{error ? <div className="markdownEditorInfoEmpty">{error}</div> : null}
				{!loading && !error && commits.length === 0 ? (
					<div className="markdownEditorInfoEmpty">No saved versions yet.</div>
				) : null}
				{groups.length ? (
					<div className="gitHistoryList">
						{groups.map((group) => {
							const isExpanded = expandedGroupKeys.has(group.key);
							return (
								<div className="gitHistoryGroup" key={group.key}>
									<button
										type="button"
										className="gitHistoryGroupHeader"
										onClick={() => toggleGroup(group.key)}
										aria-expanded={isExpanded}
									>
										{isExpanded ? (
											<ChevronDown size="var(--icon-sm)" />
										) : (
											<ChevronRight size="var(--icon-sm)" />
										)}
										<span>{group.label}</span>
										<em>({commitCountLabel(group.commits.length)})</em>
									</button>
									{isExpanded ? (
										<div className="gitHistoryGroupItems">
											{group.commits.map((commit) => {
												const isSelected = selectedCommitHash === commit.hash;
												const isLoading = loadingCommit === commit.hash;
												return (
													<button
														type="button"
														key={commit.hash}
														className={cn(
															"gitHistoryItem",
															isSelected && "gitHistoryItemSelected",
														)}
														onClick={() => void handleSelectCommit(commit)}
														aria-pressed={isSelected}
													>
														<span
															className="gitHistoryMarker"
															aria-hidden="true"
														>
															<HugeiconsIcon
																icon={GitCommitHorizontalIcon}
																size="var(--icon-sm)"
																strokeWidth={1.1}
															/>
														</span>
														<span className="gitHistoryContent">
															<span className="gitHistoryTopLine">
																<span className="gitHistorySubject">
																	{commit.subject || "Untitled version"}
																</span>
																<span className="gitHistoryHash">
																	{commit.short_hash}
																</span>
																<ChevronRight
																	size="var(--icon-sm)"
																	className="gitHistoryOpenIcon"
																/>
															</span>
															<span className="gitHistoryMeta">
																<span>
																	{formatCommitDate(
																		commit.timestamp_ms,
																		nowMs,
																	)}
																</span>
																{commit.added_count > 0 ? (
																	<span className="gitHistoryStat gitHistoryStatAdd">
																		+{commit.added_count.toLocaleString()}
																	</span>
																) : null}
																{commit.modified_count > 0 ? (
																	<span className="gitHistoryStat gitHistoryStatModify">
																		~
																		{commit.modified_count.toLocaleString()}
																	</span>
																) : null}
																{commit.deleted_count > 0 ? (
																	<span className="gitHistoryStat gitHistoryStatDelete">
																		-{commit.deleted_count.toLocaleString()}
																	</span>
																) : null}
															</span>
														</span>
														{isLoading ? (
															<span className="gitHistoryLoading">
																Opening diff
															</span>
														) : null}
													</button>
												);
											})}
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				) : null}
			</div>
		</section>
	);
}
