import { Folder01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { UseFileTreeResult } from "../../hooks/useFileTree";
import type { Command } from "./commandPaletteHelpers";

interface BuildMovePickerCommandsOptions {
	fileTree: UseFileTreeResult;
	movePickerSourcePath: string | null;
	moveTargetDirs: string[];
	openWorkspaceFile: (path: string) => Promise<void>;
}

export function buildMovePickerCommands({
	fileTree,
	movePickerSourcePath,
	moveTargetDirs,
	openWorkspaceFile,
}: BuildMovePickerCommandsOptions): Command[] | null {
	if (!movePickerSourcePath) return null;
	const moveTo = async (directory: string) => {
		const nextPath = await fileTree.onMovePath(movePickerSourcePath, directory);
		if (nextPath) await openWorkspaceFile(nextPath);
	};
	return [
		{
			id: "move-picker-root",
			label: "/",
			icon: (
				<HugeiconsIcon
					icon={Folder01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "Move Destination",
			action: () => moveTo(""),
		},
		...moveTargetDirs.map((directory) => ({
			id: `move-picker:${directory}`,
			label: `/${directory}`,
			icon: (
				<HugeiconsIcon
					icon={Folder01Icon}
					size="var(--icon-lg)"
					strokeWidth={0.9}
				/>
			),
			category: "Move Destination",
			action: () => moveTo(directory),
		})),
	];
}
