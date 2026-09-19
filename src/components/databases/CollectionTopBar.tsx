import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { LibraryIcon, MoreVerticalIcon, StarIcon } from "@hugeicons/core-free-icons";
import { useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { UseDatabasesPaneReturn } from "../../hooks/database/useDatabasesPane";
import type { ActionMenuItem } from "../../lib/database/actionMenuItems";
import { buildCollectionMenuItems } from "../../lib/database/viewMenuItems";
import { isNativeContextMenuAvailable } from "../../lib/nativeContextMenu";
import { ChevronDown, ChevronRight } from "../Icons";
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
				selection.summaries,
				selection.selectedDatabaseId,
				selection.setSelectedDatabaseId,
				selection.openCreateCollectionDialog,
			),
		[
			selection.openCreateCollectionDialog,
			selection.selectedDatabaseId,
			selection.setSelectedDatabaseId,
			selection.summaries,
		],
	);

	const collectionMenuLabel = doc.document ? "Switch collection" : "Select collection";
	const collectionOptionsLabel = t("collections.options");
	const breadcrumbRoot = doc.collectionFolderBreadcrumb[0]?.label ?? t("sidebar.collections");
	const isPinned = doc.document?.database.pinned ?? false;
	const collectionActionMenuItems = useMemo<ActionMenuItem[]>(
		() => [
			{
				type: "item",
				label: "Delete collection",
				destructive: true,
				iconKey: "trash",
				onSelect: () => void doc.handleDeleteDatabase(),
			},
		],
		[doc.handleDeleteDatabase],
	);

	return (
		<div className="databasesTopBar">
			<div className="databasesTopBarLeft">
				<div className="databasesCollectionHeader">
					<ActionMenuTrigger
						nativeActionMenusEnabled={isNativeContextMenuAvailable()}
						items={collectionMenuItems}
						triggerClassName="databasesCollectionSwitcher"
						triggerTitle={collectionMenuLabel}
						triggerAriaLabel={collectionMenuLabel}
						contentClassName="databasesDropdownContent databasesCollectionMenu"
						itemClassName="databasesDropdownItem databasesCollectionMenuItem"
					>
						<HugeiconsIcon icon={LibraryIcon} size="var(--icon-sm)" />
						<span className="databasesCollectionSwitcherLabel">{breadcrumbRoot}</span>
						<ChevronDown size="var(--icon-xs)" />
					</ActionMenuTrigger>

					{doc.document ? (
						<ChevronRight
							size="var(--icon-xs)"
							className="databasesCollectionBreadcrumbSep"
							aria-hidden
						/>
					) : null}

					{doc.collectionFolderBreadcrumb.length > 1 ? (
						<nav className="databasesCollectionBreadcrumb" aria-label="Collection folder">
							{doc.collectionFolderBreadcrumb.slice(1).map((part) => (
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
						nativeActionMenusEnabled={isNativeContextMenuAvailable()}
						items={collectionActionMenuItems}
						triggerClassName="databasesTopActionButton databaseCollectionActionsButton"
						triggerTitle={collectionOptionsLabel}
						triggerAriaLabel={collectionOptionsLabel}
						contentClassName="databasesDropdownContent databasesCollectionMenu"
						itemClassName="databasesDropdownItem databasesCollectionMenuItem"
					>
						<HugeiconsIcon icon={MoreVerticalIcon} size="var(--icon-md)" />
					</ActionMenuTrigger>
				</div>
			) : null}
		</div>
	);
}
