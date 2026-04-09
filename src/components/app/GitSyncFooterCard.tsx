import { GitBranchIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { AnimatePresence, m } from "motion/react";
import { useEffect, useRef } from "react";
import { type GitSyncTone, getGitSyncPresentation } from "../../lib/gitSyncUi";
import type { GitSyncStatus } from "../../lib/tauri";

interface GitSyncFooterCardProps {
	status: GitSyncStatus | null;
	expanded: boolean;
	onToggleExpanded: () => void;
}

function toneClassName(tone: GitSyncTone): string {
	return `gitSyncFooter-${tone}`;
}

export function GitSyncFooterCard({
	status,
	expanded,
	onToggleExpanded,
}: GitSyncFooterCardProps) {
	const panelRef = useRef<HTMLDivElement | null>(null);
	const presentation = getGitSyncPresentation(status);

	useEffect(() => {
		if (!expanded) return;

		const handlePointerDown = (event: PointerEvent) => {
			if (!(event.target instanceof Node)) return;
			if (panelRef.current?.contains(event.target)) return;
			onToggleExpanded();
		};

		window.addEventListener("pointerdown", handlePointerDown);
		return () => window.removeEventListener("pointerdown", handlePointerDown);
	}, [expanded, onToggleExpanded]);

	return (
		<div className="gitSyncFooterShell" ref={panelRef}>
			<AnimatePresence initial={false}>
				{expanded ? (
					<m.div
						key="git-sync-panel"
						className={`gitSyncFooterPanel ${toneClassName(presentation.tone)}`}
						initial={{ opacity: 0, y: 10, scale: 0.985 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 8, scale: 0.99 }}
						transition={{ duration: 0.16, ease: "easeOut" }}
					>
						<div className="gitSyncFooterPanelHeader">
							<div className="gitSyncFooterPanelTitle">
								<HugeiconsIcon
									icon={GitBranchIcon}
									size={13}
									strokeWidth={0.9}
								/>
								<div className="gitSyncFooterPanelTitleCopy">
									<div className="gitSyncFooterPanelEyebrow">Git Sync</div>
									<div className="gitSyncFooterPanelHeadline">
										{presentation.statusBadge}
									</div>
								</div>
							</div>
							<div className="gitSyncFooterPanelBadges">
								{presentation.branchLabel ? (
									<span className="gitSyncFooterBranchBadge">
										{presentation.branchLabel}
									</span>
								) : null}
							</div>
						</div>

						{presentation.issueText ? (
							<div className="gitSyncFooterIssue">{presentation.issueText}</div>
						) : null}
					</m.div>
				) : null}
			</AnimatePresence>

			<button
				type="button"
				className="sidebarQuickActionBtn sidebarFooterGitButton"
				data-window-drag-ignore
				aria-expanded={expanded}
				aria-label="Toggle Git Sync controls"
				title={presentation.headline}
				onClick={onToggleExpanded}
			>
				<HugeiconsIcon icon={GitBranchIcon} size={14} strokeWidth={0.9} />
				<span className="sidebarQuickActionLabel">Git</span>
			</button>
		</div>
	);
}
