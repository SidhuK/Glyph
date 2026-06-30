import { Folder03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { join } from "@tauri-apps/api/path";
import type { TFunction } from "i18next";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { invoke } from "../../lib/tauri";
import { cn } from "../../lib/utils";
import { Button } from "../ui/shadcn/button";

interface DatabaseFolderPickerProps {
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	triggerClassName?: string;
}

function folderParts(path: string): string[] {
	return path.split("/").filter(Boolean);
}

function folderName(path: string, t: TFunction<"ui">): string {
	if (!path) return t("database.picker.spaceRoot");
	const parts = folderParts(path);
	return parts[parts.length - 1] ?? path;
}

function folderBreadcrumb(path: string, t: TFunction<"ui">): string {
	if (!path) return t("database.picker.topLevel");
	const parts = folderParts(path);
	return parts.slice(0, -1).join(" / ") || t("database.picker.topLevel");
}

function normalizeRelativeFolder(path: string): string {
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

export function DatabaseFolderPicker({
	value,
	onChange,
	placeholder = "Choose a folder",
	triggerClassName,
}: DatabaseFolderPickerProps) {
	const { t } = useTranslation("ui");
	const [isPicking, setIsPicking] = useState(false);
	const [error, setError] = useState("");
	const hasError = Boolean(error);
	const resolvedPlaceholder = placeholder || t("database.chooseFolder");
	const selectedLabel = value ? folderName(value, t) : resolvedPlaceholder;
	const selectedMeta = error || folderBreadcrumb(value, t);

	const handlePickFolder = async () => {
		setError("");
		setIsPicking(true);
		try {
			const currentSpace = await invoke("space_get_current");
			if (!currentSpace) {
				throw new Error("No space is currently open.");
			}

			const defaultPath = value
				? await join(currentSpace, value)
				: currentSpace;
			const { open } = await import("@tauri-apps/plugin-dialog");
			const selected = await open({
				directory: true,
				multiple: false,
				defaultPath,
			});
			if (!selected || typeof selected !== "string") return;

			const relativePath = await invoke("space_relativize_path", {
				abs_path: selected,
			});
			onChange(normalizeRelativeFolder(relativePath));
		} catch (cause) {
			setError(extractErrorMessage(cause));
		} finally {
			setIsPicking(false);
		}
	};

	return (
		<Button
			type="button"
			variant="outline"
			className={cn(
				"databasePickerTrigger",
				hasError && "databasePickerTriggerError",
				triggerClassName,
			)}
			disabled={isPicking}
			aria-invalid={hasError || undefined}
			title={error || value || resolvedPlaceholder}
			onClick={() => {
				void handlePickFolder();
			}}
		>
			<span className="databasePickerTriggerIcon">
				<HugeiconsIcon
					icon={Folder03Icon}
					size="var(--icon-md)"
					strokeWidth={0.9}
				/>
			</span>
			<span className="databasePickerTriggerText">
				<span className="databasePickerTriggerLabel">{selectedLabel}</span>
				<span className="databasePickerTriggerMeta">{selectedMeta}</span>
			</span>
		</Button>
	);
}
