import { PointerActivationConstraints } from "@dnd-kit/dom";
import { KeyboardSensor, PointerSensor, useDroppable } from "@dnd-kit/react";

export const FILE_TREE_ENTRY_TYPE = "file-tree-entry";

/** Matches `CollisionPriority.Highest` in @dnd-kit/abstract. */
const FILE_TREE_DIR_ROW_COLLISION_PRIORITY = 4;
/** Matches `CollisionPriority.Normal` in @dnd-kit/abstract. */
const FILE_TREE_DIR_CHILDREN_COLLISION_PRIORITY = 2;
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

export function fileTreeDirChildrenDropId(relPath: string): string {
	return `file-tree-dir-children:${relPath}`;
}

export function fileTreeDirDropData(relPath: string): {
	targetDirPath: string;
} {
	return { targetDirPath: relPath };
}

function fileTreeDirChildrenCollisionPriority(relPath: string): number {
	const depth = relPath.split("/").filter(Boolean).length;
	return FILE_TREE_DIR_CHILDREN_COLLISION_PRIORITY + depth / (depth + 1);
}

export function useFileTreeDirDropTargets({
	relPath,
	isExpanded,
}: {
	relPath: string;
	isExpanded: boolean;
}) {
	const { ref: rowDroppableRef, isDropTarget: isRowDropTarget } = useDroppable({
		id: fileTreeDirRowDropId(relPath),
		data: fileTreeDirDropData(relPath),
		accept: FILE_TREE_ENTRY_TYPE,
		collisionPriority: FILE_TREE_DIR_ROW_COLLISION_PRIORITY,
	});
	const { ref: childrenDroppableRef, isDropTarget: isChildrenDropTarget } =
		useDroppable({
			id: fileTreeDirChildrenDropId(relPath),
			data: fileTreeDirDropData(relPath),
			accept: FILE_TREE_ENTRY_TYPE,
			collisionPriority: fileTreeDirChildrenCollisionPriority(relPath),
			disabled: !isExpanded,
		});

	return {
		rowDroppableRef,
		isRowDropTarget,
		childrenDroppableRef,
		isChildrenDropTarget,
	};
}
