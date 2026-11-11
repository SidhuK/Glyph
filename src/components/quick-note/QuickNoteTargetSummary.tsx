import { ToggleGroup, ToggleGroupItem } from "@/components/ui/shadcn/toggle-group";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { isMissingFileError } from "../../lib/fsErrors";
import { invoke } from "../../lib/tauri";
import { parentDir } from "../../utils/path";
import type { QuickNoteMode } from "./quickNoteSave";

export const QUICK_NOTE_TARGET_SUMMARY_KEY = "quick-note-target-summary";

async function targetExists(path: string): Promise<boolean> {
	try {
		await invoke("space_read_text", { path });
		return true;
	} catch (cause) {
		if (isMissingFileError(cause)) return false;
		throw cause;
	}
}

/** Append to the chosen note, or write the draft to a note of its own. */
export function QuickNoteModeControl({
	mode,
	onChange,
}: {
	mode: QuickNoteMode;
	onChange: (mode: QuickNoteMode) => void;
}) {
	const { t } = useTranslation("shell");
	return (
		<ToggleGroup
			className="quickNoteModes"
			aria-label={t("quickNoteWindow.modeLabel")}
			value={mode}
			onValueChange={onChange}
		>
			<ToggleGroupItem value="append">{t("quickNoteWindow.append")}</ToggleGroupItem>
			<ToggleGroupItem value="new">{t("quickNoteWindow.newNote")}</ToggleGroupItem>
		</ToggleGroup>
	);
}

/** Tells the user where the next save goes before they start typing. */
export function QuickNoteDestination({ path, mode }: { path: string; mode: QuickNoteMode }) {
	const { t } = useTranslation("shell");
	const exists = useQuery({
		queryKey: [QUICK_NOTE_TARGET_SUMMARY_KEY, path],
		queryFn: () => targetExists(path),
		enabled: Boolean(path) && mode === "append",
	});
	if (mode === "new") {
		const folder = parentDir(path);
		return (
			<span title={folder}>
				{t("quickNoteWindow.createsIn", { folder: folder || t("commandPalette.spaceRoot") })}
			</span>
		);
	}
	return (
		<span title={path}>
			{exists.data === false
				? t("quickNoteWindow.createsFile", { path })
				: t("quickNoteWindow.appendsTo", { path })}
		</span>
	);
}
