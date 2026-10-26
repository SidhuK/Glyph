import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
	DatabaseColumn,
	DatabaseConfig,
	DatabasePropertyOption,
} from "../../lib/database/types";
import { Search, X } from "../Icons";
import { Input } from "../ui/shadcn/input";
import { DatabaseViewOptionsPopover } from "./DatabaseViewOptionsPopover";

interface DatabaseToolbarProps {
	databaseView: "table" | "board";
	groupColumns: DatabaseColumn[];
	groupColumnId: string | null;
	config: DatabaseConfig;
	availableProperties: DatabasePropertyOption[];
	onGroupColumnIdChange: (groupColumnId: string | null) => void;
	onChangeConfig: (config: DatabaseConfig) => Promise<void>;
	viewOptionsOpen?: boolean;
	onViewOptionsOpenChange?: (open: boolean) => void;
	className?: string;
}

const DATABASE_SEARCH_DEBOUNCE_MS = 300;

export function DatabaseToolbar({
	databaseView,
	groupColumns,
	groupColumnId,
	config,
	availableProperties,
	onGroupColumnIdChange,
	onChangeConfig,
	viewOptionsOpen,
	onViewOptionsOpenChange,
	className,
}: DatabaseToolbarProps) {
	const { t } = useTranslation("shell");
	const searchValue = config.view.search ?? "";
	const searchInputId = useId();
	const configRef = useRef(config);
	const [searchState, setSearchState] = useState({
		draft: searchValue,
		source: searchValue,
	});
	if (searchState.source !== searchValue) {
		setSearchState({ draft: searchValue, source: searchValue });
	}
	const searchDraft = searchState.source === searchValue ? searchState.draft : searchValue;
	const setSearchDraft = (draft: string) => {
		setSearchState({ draft, source: searchValue });
	};
	configRef.current = config;
	const selectedGroupColumn =
		groupColumns.find((column) => column.id === groupColumnId) ??
		(databaseView === "board" ? groupColumns[0] : null) ??
		null;

	useEffect(() => {
		if (searchDraft === searchValue) return;
		// Search is durable view configuration, so avoid saving the database on every keystroke.
		const timer = window.setTimeout(() => {
			const latestConfig = configRef.current;
			void onChangeConfig({
				...latestConfig,
				view: {
					...latestConfig.view,
					search: searchDraft,
				},
			});
		}, DATABASE_SEARCH_DEBOUNCE_MS);
		return () => window.clearTimeout(timer);
	}, [onChangeConfig, searchDraft, searchValue]);

	return (
		<div className={["databaseToolbar", className].filter(Boolean).join(" ")}>
			<div className="databaseToolbarActions">
				<label className="databaseToolbarSearch" htmlFor={searchInputId}>
					<Search size="var(--icon-sm)" aria-hidden="true" />
					<Input
						id={searchInputId}
						className="databaseToolbarSearchInput"
						value={searchDraft}
						placeholder={t("collections.searchView")}
						aria-label={t("collections.searchView")}
						onKeyDown={(event) => {
							if (event.key !== "Escape") return;
							event.preventDefault();
							setSearchDraft("");
						}}
						onChange={(event) => setSearchDraft(event.target.value)}
					/>
					{searchDraft ? (
						<button
							type="button"
							className="databaseToolbarSearchClear"
							onMouseDown={(event) => event.preventDefault()}
							onClick={() => setSearchDraft("")}
							title={t("collections.clearSearch")}
							aria-label={t("collections.clearSearch")}
						>
							<X size="var(--icon-sm)" />
						</button>
					) : null}
				</label>
				<DatabaseViewOptionsPopover
					open={viewOptionsOpen}
					onOpenChange={onViewOptionsOpenChange}
					config={config}
					availableProperties={availableProperties}
					onChangeConfig={onChangeConfig}
					grouping={{
						columns: groupColumns,
						selectedColumn: selectedGroupColumn,
						allowNone: databaseView !== "board",
						onChange: onGroupColumnIdChange,
					}}
				/>
			</div>
		</div>
	);
}
