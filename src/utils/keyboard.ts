type DeleteKeyEvent = Pick<KeyboardEvent, "altKey" | "ctrlKey" | "key" | "metaKey">;

export function isDeleteKey(event: DeleteKeyEvent): boolean {
	return (
		(event.key === "Delete" || event.key === "Backspace") &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey
	);
}

export function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		target instanceof HTMLSelectElement ||
		(target instanceof HTMLElement && target.isContentEditable)
	);
}
