import { PointerActivationConstraints } from "@dnd-kit/dom";
import { PointerSensor, type UseDraggableInput, useDraggable } from "@dnd-kit/react";
import { useCallback } from "react";

const TASK_DRAG_SENSORS = [
	PointerSensor.configure({
		activationConstraints: [new PointerActivationConstraints.Distance({ value: 5 })],
	}),
];

export function useTaskDraggable(input: Omit<UseDraggableInput, "sensors">) {
	const { ref, handleRef, isDragging } = useDraggable({ ...input, sensors: TASK_DRAG_SENSORS });
	const dragRef = useCallback(
		(element: HTMLDivElement | null) => {
			ref(element);
			handleRef(element);
		},
		[ref, handleRef],
	);
	return { dragRef, isDragging };
}
