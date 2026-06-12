import { LibraryIcon, NoteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useMemo, useRef } from "react";
import type { UseDatabasesPaneReturn } from "../../hooks/database/useDatabasesPane";
import { buildCollectionMenuItems } from "../../lib/database/viewMenuItems";
import { isNativeContextMenuAvailable } from "../../lib/nativeContextMenu";
import { ChevronDown, ChevronRight, Trash2 } from "../Icons";
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
		| "commitDatabaseRename"
		| "handleDeleteDatabase"
	>;
	selection: Pick<
		UseDatabasesPaneReturn["selection"],
		| "summaries"
		| "selectedDatabaseId"
		| "setSelectedDatabaseId"
		| "openCreateCollectionDialog"
	>;
	views: Pick<UseDatabasesPaneReturn["views"], "activeConfig">;
	actions: Pick<UseDatabasesPaneReturn["actions"], "handleCreateRow">;
}

export function CollectionTopBar({
	document: doc,
	selection,
	views,
	actions,
}: CollectionTopBarProps) {
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

	const collectionMenuLabel = doc.document
		? "Switch collection"
		: "Select collection";

	return (
		<div className="databasesTopBar">
			<div className="databasesTopBarLeft">
				<div className="databasesCollectionHeader">
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
					) : (
						<h1 className="databasesCollectionHeading">Collections</h1>
					)}

					{doc.collectionFolderBreadcrumb.length > 0 ? (
						<nav
							className="databasesCollectionBreadcrumb"
							aria-label="Collection folder"
						>
							{doc.collectionFolderBreadcrumb.map((part, index) => {
								const isCurrent =
									index === doc.collectionFolderBreadcrumb.length - 1;
								return (
									<span
										key={part.path || "space"}
										className="databasesCollectionBreadcrumbItem"
									>
										{index > 0 ? (
											<ChevronRight
												size="var(--icon-xs)"
												className="databasesCollectionBreadcrumbSep"
												aria-hidden
											/>
										) : null}
										<span
											className="databasesCollectionBreadcrumbLabel"
											data-current={isCurrent ? "true" : undefined}
											title={part.path || "Space"}
										>
											{part.label}
										</span>
									</span>
								);
							})}
						</nav>
					) : null}
				</div>

				<ActionMenuTrigger
					nativeActionMenusEnabled={isNativeContextMenuAvailable()}
					items={collectionMenuItems}
					triggerClassName="databasesCollectionSwitcher"
					triggerTitle={collectionMenuLabel}
					triggerAriaLabel={collectionMenuLabel}
					contentClassName="databasesDropdownContent databasesCollectionMenu"
					itemClassName="databasesDropdownItem databasesCollectionMenuItem"
				>
					<HugeiconsIcon
						icon={LibraryIcon}
						size="var(--icon-sm)"
						strokeWidth={0.9}
					/>
					<span className="databasesCollectionSwitcherLabel">
						{collectionMenuLabel}
					</span>
					<ChevronDown size="var(--icon-sm)" />
				</ActionMenuTrigger>
			</div>

			{doc.document ? (
				<div className="databasesTopBarRight">
					<Button
						type="button"
						variant="ghost"
						size="icon-sm"
						className="databasesTopActionButton databasesTopActionButtonDanger"
						onClick={() => void doc.handleDeleteDatabase()}
						title="Delete collection"
						aria-label="Delete collection"
					>
						<Trash2 size="var(--icon-md)" />
					</Button>
					<button
						type="button"
						className="databaseToolbarChip is-accent"
						onClick={() => void actions.handleCreateRow()}
						title="New note"
					>
						<HugeiconsIcon
							icon={NoteIcon}
							size="var(--icon-md)"
							strokeWidth={0.9}
						/>
						New Note
					</button>
				</div>
			) : null}
		</div>
	);
}
