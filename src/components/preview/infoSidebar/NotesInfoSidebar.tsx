import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Cancel01Icon } from "@hugeicons/core-free-icons";
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

const INFO_SUB_TABS = ["stats", "contents", "backlinks"] as const;

type InfoSubTab = (typeof INFO_SUB_TABS)[number];

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
		<aside className="notesInfoSidebarPanel" aria-label={t("infoSidebar.panelLabel")}>
			<div
				className="markdownEditorInfoHeader drag"
				data-tauri-drag-region
				onMouseDown={onWindowDragMouseDown}
			>
				<div
					className="markdownEditorInfoTabs"
					role="tablist"
					aria-label={t("infoSidebar.sidebarTabsLabel")}
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
						{t("infoSidebar.infoTab")}
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
							{t("infoSidebar.historyTab")}
						</button>
					) : null}
				</div>
				<button
					type="button"
					className="markdownEditorInfoClose"
					onClick={onClose}
					aria-label={t("infoSidebar.close")}
					title={t("infoSidebar.close")}
				>
					<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-md)" />
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
									key={tab}
									type="button"
									className="markdownEditorInfoSubTab"
									role="tab"
									aria-selected={activeSubTab === tab}
									data-active={activeSubTab === tab ? "true" : undefined}
									onClick={() => setActiveSubTab(tab)}
								>
									{t(`infoSidebar.tabs.${tab}`)}
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
