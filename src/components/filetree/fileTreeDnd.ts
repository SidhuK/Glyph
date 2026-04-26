import { PointerActivationConstraints } from "@dnd-kit/dom";
import { KeyboardSensor, PointerSensor } from "@dnd-kit/react";

export const FILE_TREE_ENTRY_TYPE = "file-tree-entry";

export const FILE_TREE_ENTRY_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [
			new PointerActivationConstraints.Distance({ value: 5 }),
		],
	}),
	KeyboardSensor,
];

export function fileTreeEntryDragId(
	kind: "dir" | "file",
	path: string,
): string {
	return `${kind}:${path}`;
}
