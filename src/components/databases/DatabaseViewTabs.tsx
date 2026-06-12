import { MoreVerticalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { m } from "motion/react";
import { useCallback, useRef } from "react";
import type { DatabaseView, SaveDatabase } from "../../hooks/database/types";
import { isNativeContextMenuAvailable } from "../../lib/nativeContextMenu";
import type {
	DatabaseConfig,
	WorkspaceDatabaseDocument,
} from "../../lib/tauri";
import { Kanban, Plus, Table } from "../Icons";
import { springPresets } from "../ui/animations";
import { ActionMenuTrigger } from "./ActionMenuTrigger";
import { useDatabaseViewTabs } from "./useDatabaseViewTabs";

interface DatabaseViewTabsProps {
	document: WorkspaceDatabaseDocument;
	selectedViewId: string;
	setSelectedViewId: (viewId: string | null) => void;
	saveDatabase: SaveDatabase;
	clearError: () => void;
	activeView: DatabaseView;
	patchActiveView: (viewPatch: Partial<DatabaseConfig["view"]>) => void;
	reduceMotion: boolean | null;
}

export function DatabaseViewTabs({
	document,
	selectedViewId,
	setSelectedViewId,
	saveDatabase,
	clearError,
	activeView,
	patchActiveView,
	reduceMotion,
}: DatabaseViewTabsProps) {
	const skipNextViewMenuAutoFocusRef = useRef(false);

	const {
		views,
		renamingViewId,
		viewNameDraft,
		viewNameInputRef,
		startViewRename,
		commitViewRename,
		setViewNameDraft,
		setRenamingViewId,
		handleViewTabKeyDown,
		handleCreateView,
		viewActionMenuItems,
	} = useDatabaseViewTabs({
		document,
		selectedViewId,
		setSelectedViewId,
		saveDatabase,
		clearError,
		activeView,
		patchActiveView,
		onBeginRenameFromMenu: () => {
			skipNextViewMenuAutoFocusRef.current = true;
		},
	});

	const beginViewRename = useCallback(
		(viewId: string) => {
			skipNextViewMenuAutoFocusRef.current = true;
			startViewRename(viewId);
		},
		[startViewRename],
	);

	const finishViewRename = useCallback(() => {
		skipNextViewMenuAutoFocusRef.current = false;
		commitViewRename();
	}, [commitViewRename]);

	return (
		<div className="databasesViewTabsCluster">
			<div
				className="databasesViewTabs"
				role="tablist"
				aria-label="Collection views"
			>
				{views.map((view) => {
					const isActive = view.id === activeView.id;
					if (renamingViewId === view.id) {
						return (
							<input
								key={view.id}
								ref={viewNameInputRef}
								type="text"
								className="plainTextInput databasesViewTabRenameInput"
								value={viewNameDraft}
								aria-label="View name"
								onChange={(event) => setViewNameDraft(event.target.value)}
								onBlur={finishViewRename}
								onKeyDown={(event) => {
									if (event.key === "Enter") {
										event.preventDefault();
										finishViewRename();
									}
									if (event.key === "Escape") {
										event.preventDefault();
										skipNextViewMenuAutoFocusRef.current = false;
										setRenamingViewId(null);
									}
								}}
							/>
						);
					}

					return (
						<m.button
							key={view.id}
							type="button"
							role="tab"
							layout
							className={`databasesViewTab${isActive ? " is-active" : ""}`}
							aria-selected={isActive}
							tabIndex={isActive ? 0 : -1}
							data-view-id={view.id}
							title={view.name}
							onClick={() => setSelectedViewId(view.id)}
							onDoubleClick={() => beginViewRename(view.id)}
							onKeyDown={(event) => handleViewTabKeyDown(event, view.id)}
							whileTap={reduceMotion ? undefined : { scale: 0.96 }}
							transition={springPresets.gentle}
						>
							{isActive ? (
								reduceMotion ? (
									<span className="databasesViewTabBg" aria-hidden />
								) : (
									<m.span
										className="databasesViewTabBg"
										layoutId="databasesViewTabActive"
										transition={springPresets.gentle}
										aria-hidden
									/>
								)
							) : null}
							{view.layout === "board" ? (
								<Kanban
									size="var(--icon-sm)"
									className="databasesViewTabIcon"
									aria-hidden
								/>
							) : (
								<Table
									size="var(--icon-sm)"
									className="databasesViewTabIcon"
									aria-hidden
								/>
							)}
							<span className="databasesViewTabLabel">{view.name}</span>
						</m.button>
					);
				})}
			</div>
			<div className="databasesViewTabsActions">
				<ActionMenuTrigger
					nativeActionMenusEnabled={isNativeContextMenuAvailable()}
					items={viewActionMenuItems}
					triggerClassName="databasesViewTabMenu databaseToolbarChip"
					triggerTitle="View options"
					triggerAriaLabel={`View options for ${activeView.name}`}
					contentClassName="databasesDropdownContent databasesViewTabMenuContent"
					itemClassName="databasesDropdownItem databasesViewTabMenuItem"
					separatorClassName="databasesViewTabMenuSeparator"
					labelClassName="databasesViewTabMenuLabel"
					onCloseAutoFocus={(event) => {
						if (skipNextViewMenuAutoFocusRef.current) {
							event.preventDefault();
							skipNextViewMenuAutoFocusRef.current = false;
						}
					}}
				>
					<HugeiconsIcon
						icon={MoreVerticalIcon}
						className="databasesViewTabMenuIcon"
						size="var(--icon-md)"
						strokeWidth={0.9}
						color="currentColor"
						aria-hidden
					/>
				</ActionMenuTrigger>
				<button
					type="button"
					className="databasesViewTabCreate databaseToolbarChip"
					onClick={() => void handleCreateView()}
					title="Add view"
					aria-label="Add view"
				>
					<Plus size="var(--icon-sm)" />
				</button>
			</div>
		</div>
	);
}
