import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Cancel01Icon, SearchIcon } from "@hugeicons/core-free-icons";
import { type KeyboardEvent, type RefObject, memo } from "react";
import { useTranslation } from "react-i18next";
import { formatShortcutForPlatform } from "../../lib/shortcuts/platform";
import type { Shortcut } from "../../lib/shortcuts/types";
import { keepKeysOutOfFolioList } from "./folioListKeys";

const FOLIO_FILTER_SHORTCUT = { key: "f", meta: true } as const satisfies Shortcut;
const FOLIO_FILTER_SHORTCUT_LABEL = formatShortcutForPlatform(FOLIO_FILTER_SHORTCUT);

export function isFolioFilterShortcut(event: KeyboardEvent): boolean {
	return (
		event.metaKey &&
		!event.ctrlKey &&
		!event.altKey &&
		!event.shiftKey &&
		event.key.toLowerCase() === FOLIO_FILTER_SHORTCUT.key
	);
}

interface FolioFilterFieldProps {
	inputRef: RefObject<HTMLInputElement | null>;
	query: string;
	onQueryChange: (query: string) => void;
}

export const FolioFilterField = memo(function FolioFilterField({
	inputRef,
	query,
	onQueryChange,
}: FolioFilterFieldProps) {
	const { t } = useTranslation("shell");

	return (
		<label className="folioNotesSearch">
			<HugeiconsIcon icon={SearchIcon} size="var(--icon-sm)" />
			<input
				ref={inputRef}
				type="text"
				inputMode="search"
				value={query}
				placeholder={t("folio.filter")}
				aria-label={t("folio.filter")}
				aria-keyshortcuts="Meta+F"
				spellCheck={false}
				autoComplete="off"
				onKeyDown={(event) => {
					if (event.nativeEvent.isComposing || event.key !== "Escape" || !query) return;
					event.preventDefault();
					onQueryChange("");
				}}
				onChange={(event) => onQueryChange(event.currentTarget.value)}
			/>
			{query ? (
				<button
					type="button"
					className="folioNotesSearchClear"
					onMouseDown={(event) => event.preventDefault()}
					onKeyDown={keepKeysOutOfFolioList}
					onClick={() => {
						inputRef.current?.focus();
						onQueryChange("");
					}}
					title={t("folio.clearFilter")}
					aria-label={t("folio.clearFilter")}
				>
					<HugeiconsIcon icon={Cancel01Icon} size="var(--icon-xs)" />
				</button>
			) : (
				<kbd className="commandPaletteKeycap folioNotesSearchKeycap" aria-hidden="true">
					{FOLIO_FILTER_SHORTCUT_LABEL}
				</kbd>
			)}
		</label>
	);
});
