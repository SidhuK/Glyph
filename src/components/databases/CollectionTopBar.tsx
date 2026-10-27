import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Database01Icon, MoreHorizontalIcon, StarIcon } from "@hugeicons/core-free-icons";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UseDatabasesPaneReturn } from "../../hooks/database/useDatabasesPane";
import type { ActionMenuItem } from "../../lib/database/actionMenuItems";
import { buildCollectionMenuItems } from "../../lib/database/viewMenuItems";
import { onWindowDragMouseDown } from "../../utils/window";
import { ChevronRight } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { Input } from "../ui/shadcn/input";
import { ActionMenuTrigger } from "./ActionMenuTrigger";

interface CollectionTopBarProps {
	document: Pick<
		UseDatabasesPaneReturn["document"],
		| "document"
		| "nameDraft"
		| "setNameDraft"
		| "collectionFolderBreadcrumb"
		| "setDatabasePinned"
		| "commitDatabaseRename"
		| "handleDeleteDatabase"
	>;
	selection: Pick<
		UseDatabasesPaneReturn["selection"],
		"summaries" | "selectedDatabaseId" | "setSelectedDatabaseId" | "openCreateCollectionDialog"
	>;
	views: Pick<UseDatabasesPaneReturn["views"], "activeConfig">;
}

export function CollectionTopBar({ document: doc, selection, views }: CollectionTopBarProps) {
	const { t } = useTranslation("shell");
	const skipNextBlurCommitRef = useRef(false);
	const collectionMenuItems = useMemo(
		() =>
			buildCollectionMenuItems(
				t,
				selection.summaries,
				selection.selectedDatabaseId,
				selection.setSelectedDatabaseId,
				selection.openCreateCollectionDialog,
			),
		[
			t,
			selection.openCreateCollectionDialog,
			selection.selectedDatabaseId,
			selection.setSelectedDatabaseId,
			selection.summaries,
		],
	);

	const collectionMenuLabel = t(doc.document ? "collections.switch" : "collections.select");
	const collectionOptionsLabel = t("collections.options");
	const isPinned = doc.document?.database.pinned ?? false;
	const collectionName = (doc.document?.database.name ?? "").trim().toLowerCase();
	const folderCrumbs = doc.collectionFolderBreadcrumb.slice(1);
	// A collection named after its source folder would otherwise read "Glyph > Glyph".
	const visibleFolderCrumbs =
		collectionName &&
		folderCrumbs[folderCrumbs.length - 1]?.label.trim().toLowerCase() === collectionName
			? folderCrumbs.slice(0, -1)
			: folderCrumbs;
	const collectionActionMenuItems = useMemo<ActionMenuItem[]>(
		() => [
			{
				type: "item",
				label: t("collections.delete"),
				destructive: true,
				iconKey: "trash",
				onClick: () => void doc.handleDeleteDatabase(),
			},
		],
		[doc.handleDeleteDatabase, t],
	);

	return (
		<div className="databasesTopBar" data-tauri-drag-region="" onMouseDown={onWindowDragMouseDown}>
			<div className="databasesTopBarLeft">
				<div className="databasesCollectionHeader">
					{/* The space root says nothing here, so the switcher is just the collection glyph. */}
					<ActionMenuTrigger
						items={collectionMenuItems}
						triggerClassName="databasesCollectionSwitcher"
						triggerTitle={collectionMenuLabel}
						triggerAriaLabel={collectionMenuLabel}
					>
						<HugeiconsIcon icon={Database01Icon} size="var(--icon-md)" />
					</ActionMenuTrigger>

					{visibleFolderCrumbs.length > 0 ? (
						<nav className="databasesCollectionBreadcrumb" aria-label="Collection folder">
							{visibleFolderCrumbs.map((part) => (
								<span key={part.path} className="databasesCollectionBreadcrumbItem">
									<span className="databasesCollectionBreadcrumbLabel" title={part.path}>
										{part.label}
									</span>
									<ChevronRight
										size="var(--icon-xs)"
										className="databasesCollectionBreadcrumbSep"
										aria-hidden
									/>
								</span>
							))}
						</nav>
					) : null}

					{doc.document && views.activeConfig ? (
						<Input
							value={doc.nameDraft}
							className="plainTextInput databasesCollectionTitleInput"
							aria-label="Collection name"
							style={{
								width: `${Math.min(Math.max(doc.nameDraft.trim().length + 1, 10), 36)}ch`,
							}}
							onChange={(event) => doc.setNameDraft(event.target.value)}
							onBlur={() => {
								if (skipNextBlurCommitRef.current) {
									skipNextBlurCommitRef.current = false;
									return;
								}
								doc.commitDatabaseRename();
							}}
							onKeyDown={(event) => {
								if (event.key === "Enter") {
									event.preventDefault();
									skipNextBlurCommitRef.current = true;
									doc.commitDatabaseRename();
									(event.target as HTMLInputElement).blur();
								}
							}}
						/>
					) : null}
				</div>
			</div>

			{doc.document ? (
				<div className="databasesTopBarRight">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="databasesTopActionButton databasePinButton"
						data-pinned={isPinned ? "true" : "false"}
						onClick={() => void doc.setDatabasePinned(!isPinned)}
						title={t(isPinned ? "collections.unpin" : "collections.pin")}
						aria-label={t(isPinned ? "collections.unpin" : "collections.pin")}
						aria-pressed={isPinned}
					>
						<HugeiconsIcon icon={StarIcon} size="var(--icon-md)" />
					</Button>
					<ActionMenuTrigger
						items={collectionActionMenuItems}
						triggerClassName="databasesTopActionButton databaseCollectionActionsButton"
						triggerTitle={collectionOptionsLabel}
						triggerAriaLabel={collectionOptionsLabel}
					>
						<HugeiconsIcon icon={MoreHorizontalIcon} size="var(--icon-md)" />
					</ActionMenuTrigger>
				</div>
			) : null}
		</div>
	);
}
