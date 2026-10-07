import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type KeyboardEvent, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { reloadFromDisk } from "../../lib/settings";
import { invoke } from "../../lib/tauri";
import { useTauriEvent } from "../../lib/tauriEvents";
import { QuickSearchPanel } from "./QuickSearchPanel";

function focusNode(node: HTMLElement | null) {
	node?.focus();
}

export function QuickSearchWindow() {
	const { t } = useTranslation("shell");
	const queryClient = useQueryClient();
	const [session, setSession] = useState(0);
	const space = useQuery({
		queryKey: ["quick-search", "space"],
		queryFn: () => invoke("space_get_current"),
	});
	const hideWindow = useMutation({
		mutationFn: () => invoke("hide_quick_search_window"),
	});

	useTauriEvent("quick-search:shown", () => {
		setSession((current) => current + 1);
		// The main window may have switched spaces or written notes and recents
		// while this window was hidden; a failed store reload still refetches.
		void reloadFromDisk()
			.catch(() => {})
			.then(() => queryClient.invalidateQueries());
	});

	const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
		event.preventDefault();
		hideWindow.mutate();
	};

	return (
		<div
			className="commandPalette quickSearchRoot"
			role="dialog"
			aria-label={t("quickSearch.title")}
			onKeyDown={handleKeyDown}
		>
			{space.data ? (
				<QuickSearchPanel key={session} spacePath={space.data} />
			) : space.isPending ? null : (
				// Focusable so Esc still reaches the root when there is no input.
				<div key={session} ref={focusNode} className="quickSearchEmpty" tabIndex={-1} role="status">
					{space.error ? extractErrorMessage(space.error) : t("quickSearch.noSpace")}
				</div>
			)}
			{hideWindow.error ? (
				<p className="quickSearchHideError" role="alert">
					{t("quickSearch.hideFailed", { message: extractErrorMessage(hideWindow.error) })}
				</p>
			) : null}
		</div>
	);
}
