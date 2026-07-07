import { PointerActivationConstraints } from "@dnd-kit/dom";
import { KeyboardSensor, PointerSensor, useDroppable } from "@dnd-kit/react";

export const FILE_TREE_ENTRY_TYPE = "file-tree-entry";

/** Matches `CollisionPriority.Highest` in @dnd-kit/abstract. */
const FILE_TREE_DIR_ROW_COLLISION_PRIORITY = 4;
/** Matches `CollisionPriority.Low` in @dnd-kit/abstract. */
export const FILE_TREE_ROOT_DROP_COLLISION_PRIORITY = 1;

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

export function fileTreeDirRowDropId(relPath: string): string {
	return `file-tree-dir-row:${relPath}`;
}

export function fileTreeDirDropData(relPath: string): {
	targetDirPath: string;
} {
	return { targetDirPath: relPath };
}

export function useFileTreeDirDropTargets({
	relPath,
}: {
	relPath: string;
}) {
	const { ref: rowDroppableRef, isDropTarget: isRowDropTarget } = useDroppable({
		id: fileTreeDirRowDropId(relPath),
		data: fileTreeDirDropData(relPath),
		accept: FILE_TREE_ENTRY_TYPE,
		collisionPriority: FILE_TREE_DIR_ROW_COLLISION_PRIORITY,
	});

	return {
		rowDroppableRef,
		isRowDropTarget,
	};
}
