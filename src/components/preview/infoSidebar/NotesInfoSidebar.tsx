import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Analytics01Icon,
	BadgeInfoIcon,
	GitBranchIcon,
	LeftToRightListBulletIcon,
	LinkBackwardIcon,
} from "@hugeicons/core-free-icons";
import { memo, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { canShowGitHistory } from "../../../lib/gitSyncUi";
import type { RelationshipGroup } from "../../../lib/relationships";
import type {
	GitCommitDiff,
	GitSyncStatus,
	NoteTaskSummary,
	WorkspaceDatabasePreviewContext,
} from "../../../lib/tauri";
import { onWindowDragMouseDown } from "../../../utils/window";
import { NotePropertiesPanel } from "../../editor/NotePropertiesPanel";
import type { TOCHeading } from "../../editor/hooks/useTableOfContents";
import { GitHistorySidebar } from "../GitHistorySidebar";
import {
	InfoBacklinksTab,
	type LinkedNoteItem,
	type SidebarBacklinkItem,
} from "./InfoBacklinksTab";
import { InfoContentsTab } from "./InfoContentsTab";
import { InfoStatsTab } from "./InfoStatsTab";
import type { UnlinkedMentionsSectionProps } from "./UnlinkedMentionsSection";

type InfoSidebarTab = "info" | "history";

const INFO_SUB_TABS = [
	{ id: "stats", icon: Analytics01Icon },
	{ id: "contents", icon: LeftToRightListBulletIcon },
	{ id: "backlinks", icon: LinkBackwardIcon },
] as const;

type InfoSubTab = (typeof INFO_SUB_TABS)[number]["id"];

interface NotesInfoSidebarProps {
	open: boolean;
	hasError: boolean;
	relPath: string;
	frontmatter: string | null;
	onFrontmatterChange: (nextFrontmatter: string | null) => void;
	stats: {
		words: number;
		characters: number;
		readingTime: string;
	};
	taskSummary: NoteTaskSummary;
	tocHeadings: TOCHeading[];
	tocActiveId: string | null;
	onSelectHeading: (heading: TOCHeading) => void;
	backlinks: SidebarBacklinkItem[];
	unlinkedMentions: UnlinkedMentionsSectionProps;
	linkedNotes: LinkedNoteItem[];
	relationshipGroups: RelationshipGroup[];
	previewContext: WorkspaceDatabasePreviewContext | null;
	lastSavedMtimeMs: number | null;
	lineCount: number;
	utf8SizeBytes: number;
	saveLabel: string;
	gitSyncStatus?: GitSyncStatus | null;
	selectedGitCommitHash?: string | null;
	onSelectGitDiff?: (diff: GitCommitDiff) => void;
	onClose: () => void;
}

export const NotesInfoSidebar = memo(function NotesInfoSidebar({
	open,
	hasError,
	relPath,
	frontmatter,
	onFrontmatterChange,
	stats,
	taskSummary,
	tocHeadings,
	tocActiveId,
	onSelectHeading,
	backlinks,
	unlinkedMentions,
	linkedNotes,
	relationshipGroups,
	previewContext,
	lastSavedMtimeMs,
	lineCount,
	utf8SizeBytes,
	saveLabel,
	gitSyncStatus = null,
	selectedGitCommitHash = null,
	onSelectGitDiff,
	onClose,
}: NotesInfoSidebarProps) {
	const { t } = useTranslation("editor");
	const [host, setHost] = useState<HTMLElement | null>(null);
	const [activeTab, setActiveTab] = useState<InfoSidebarTab>("info");
	const [activeSubTab, setActiveSubTab] = useState<InfoSubTab>("stats");
	const hasGitHistoryTab = canShowGitHistory(gitSyncStatus) && Boolean(onSelectGitDiff);

	useEffect(() => {
		if (typeof document === "undefined") return;
		setHost(document.getElementById("notes-info-sidebar-root"));
	}, []);

	useEffect(() => {
		setActiveTab("info");
	}, [relPath]);

	useEffect(() => {
		if (!open) {
			setActiveTab("info");
			return;
		}
		if (!hasGitHistoryTab && activeTab === "history") {
			setActiveTab("info");
		}
	}, [activeTab, hasGitHistoryTab, open]);

	if (!open || hasError) return null;

	const sidebar = (
		<aside className="notesInfoSidebarPanel" aria-label="Note info panel">
			<div
				className="markdownEditorInfoHeader drag"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div
					className="markdownEditorInfoTabs"
					role="tablist"
					aria-label="Note sidebar"
					data-window-drag-ignore
				>
					<button
						type="button"
						className="markdownEditorInfoTab"
						role="tab"
						aria-selected={activeTab === "info"}
						data-active={activeTab === "info" ? "true" : undefined}
						onClick={() => setActiveTab("info")}
					>
						<HugeiconsIcon icon={BadgeInfoIcon} size="var(--icon-sm)" />
						Info
					</button>
					{hasGitHistoryTab ? (
						<button
							type="button"
							className="markdownEditorInfoTab"
							role="tab"
							aria-selected={activeTab === "history"}
							data-active={activeTab === "history" ? "true" : undefined}
							onClick={() => setActiveTab("history")}
						>
							<HugeiconsIcon icon={GitBranchIcon} size="var(--icon-sm)" />
							Version history
						</button>
					) : null}
				</div>
				<button
					type="button"
					className="markdownEditorInfoClose"
					onClick={onClose}
					aria-label="Close info panel"
					title="Close info panel"
				>
					<span aria-hidden>×</span>
				</button>
			</div>
			<div className="markdownEditorInfoBody">
				{activeTab === "info" ? (
					<>
						<section className="markdownEditorInfoSection markdownEditorInfoSectionFrontmatter">
							<NotePropertiesPanel
								frontmatter={frontmatter}
								sourcePath={relPath}
								onChange={onFrontmatterChange}
							/>
						</section>
						<div
							className="markdownEditorInfoSubTabs"
							role="tablist"
							aria-label={t("infoSidebar.tabsLabel")}
						>
							{INFO_SUB_TABS.map((tab) => (
								<button
									key={tab.id}
									type="button"
									className="markdownEditorInfoSubTab"
									role="tab"
									aria-selected={activeSubTab === tab.id}
									data-active={activeSubTab === tab.id ? "true" : undefined}
									onClick={() => setActiveSubTab(tab.id)}
									title={t(`infoSidebar.tabs.${tab.id}`)}
								>
									<HugeiconsIcon icon={tab.icon} size="var(--icon-sm)" aria-hidden="true" />
									<span>{t(`infoSidebar.tabs.${tab.id}`)}</span>
								</button>
							))}
						</div>
					</>
				) : null}

				{activeTab === "info" && activeSubTab === "stats" ? (
					<InfoStatsTab
						relPath={relPath}
						stats={stats}
						taskSummary={taskSummary}
						previewContext={previewContext}
						lastSavedMtimeMs={lastSavedMtimeMs}
						lineCount={lineCount}
						utf8SizeBytes={utf8SizeBytes}
						saveLabel={saveLabel}
					/>
				) : null}

				{activeTab === "info" && activeSubTab === "contents" ? (
					<InfoContentsTab
						tocHeadings={tocHeadings}
						tocActiveId={tocActiveId}
						onSelectHeading={onSelectHeading}
					/>
				) : null}

				{activeTab === "info" && activeSubTab === "backlinks" ? (
					<InfoBacklinksTab
						relPath={relPath}
						backlinks={backlinks}
						unlinkedMentions={unlinkedMentions}
						linkedNotes={linkedNotes}
						relationshipGroups={relationshipGroups}
					/>
				) : null}

				{activeTab === "history" && hasGitHistoryTab && onSelectGitDiff ? (
					<GitHistorySidebar
						key={relPath}
						open={open}
						relPath={relPath}
						selectedCommitHash={selectedGitCommitHash}
						onSelectDiff={onSelectGitDiff}
					/>
				) : null}
			</div>
		</aside>
	);

	return host ? createPortal(sidebar, host) : sidebar;
});
