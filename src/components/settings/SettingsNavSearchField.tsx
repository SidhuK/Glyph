import { useTranslation } from "react-i18next";
import { formatShortcutPartsForPlatform } from "../../lib/shortcuts/platform";
import { Search, X } from "../Icons";
import { useSettingsSearch } from "./search/SettingsSearchContext";

const IME_PROCESS_KEY_CODE = 229;
const FIND_SHORTCUT_KEYS = formatShortcutPartsForPlatform({ key: "f", meta: true });

export function SettingsNavSearchField() {
	const { t } = useTranslation("settings.general");
	const { query, inputRef, changeQuery, clearQuery, revealFirstMatch } = useSettingsSearch();

	return (
		<div className="settingsSidebarSearch">
			<Search size="var(--icon-sm)" className="settingsSidebarSearchIcon" />
			<input
				ref={inputRef}
				type="search"
				className="settingsSidebarSearchInput"
				value={query}
				onChange={(event) => changeQuery(event.target.value)}
				onKeyDown={(event) => {
					if (event.nativeEvent.isComposing || event.keyCode === IME_PROCESS_KEY_CODE) return;
					if (event.key === "Enter") {
						event.preventDefault();
						revealFirstMatch();
					}
					if (event.key === "Escape" && query) {
						event.preventDefault();
						event.stopPropagation();
						clearQuery();
					}
				}}
				placeholder={t("nav.searchPlaceholder")}
				aria-label={t("nav.searchAriaLabel")}
			/>
			{query ? (
				<button
					type="button"
					className="settingsSidebarSearchClear"
					onClick={() => {
						clearQuery();
						inputRef.current?.focus();
					}}
					aria-label={t("nav.clearSearchAriaLabel")}
				>
					<X size="var(--icon-sm)" />
				</button>
			) : (
				<span className="settingsSidebarSearchKeys" aria-hidden="true">
					{FIND_SHORTCUT_KEYS.map((key) => (
						<kbd key={key} className="settingsSidebarSearchKey">
							{key}
						</kbd>
					))}
				</span>
			)}
		</div>
	);
}
