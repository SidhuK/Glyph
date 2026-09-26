import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { StarIcon } from "@hugeicons/core-free-icons";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { nextCollectionName } from "../../lib/database/collection";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invalidateDatabaseSummariesPrefetch } from "../../lib/navigationPrefetch";
import { invoke, type WorkspaceDatabaseSummary } from "../../lib/tauri";
import { toast } from "../../lib/toast";

interface SearchSaveButtonProps {
	query: string;
	summaries: WorkspaceDatabaseSummary[] | undefined;
	disabled: boolean;
}

export function SearchSaveButton({ query, summaries, disabled }: SearchSaveButtonProps) {
	const { t } = useTranslation("shell");
	const [name, setName] = useState("");
	const trimmed = query.trim();
	const saved = summaries?.find(
		(collection) => collection.source.kind === "search" && collection.source.value === trimmed,
	);
	const save = useMutation({
		mutationFn: async () => {
			if (!summaries) throw new Error(t("commandPalette.saveSearchFailed"));
			// Existing searches can be pinned again after being unpinned from the sidebar.
			if (saved) return invoke("databases_set_pinned", { database_id: saved.id, pinned: true });
			const baseName = name.trim() || (trimmed.length > 56 ? `${trimmed.slice(0, 53)}…` : trimmed);
			return invoke("databases_create", {
				name: nextCollectionName(summaries, baseName),
				folder: null,
				source: { kind: "search", value: trimmed, recursive: false },
				pinned: true,
			});
		},
		onSuccess: () => {
			invalidateDatabaseSummariesPrefetch();
			setName("");
			toast.success(t("commandPalette.searchSaved"));
		},
		onError: (cause) => {
			toast.error(t("commandPalette.saveSearchFailed"), {
				description: extractErrorMessage(cause),
			});
		},
	});
	const label = t(saved?.pinned ? "commandPalette.searchSaved" : "commandPalette.saveSearch");
	return (
		<div className="commandSearchActions">
			{!saved ? (
				<input
					className="commandSearchName"
					aria-label={t("commandPalette.searchName")}
					placeholder={t("commandPalette.searchName")}
					value={name}
					disabled={save.isPending}
					onChange={(event) => setName(event.target.value)}
				/>
			) : null}
			<button
				type="button"
				className="commandSearchSaveButton"
				data-saved={saved?.pinned ? "true" : "false"}
				disabled={disabled || !summaries || save.isPending || saved?.pinned}
				onClick={() => save.mutate()}
				title={label}
				aria-label={label}
			>
				<HugeiconsIcon icon={StarIcon} size="var(--icon-md)" />
			</button>
		</div>
	);
}
