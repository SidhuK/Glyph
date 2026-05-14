type DeleteKeyEvent = Pick<
	KeyboardEvent,
	"altKey" | "ctrlKey" | "key" | "metaKey"
>;

export function isDeleteKey(event: DeleteKeyEvent): boolean {
	return (
		(event.key === "Delete" || event.key === "Backspace") &&
		!event.altKey &&
		!event.ctrlKey &&
		!event.metaKey
	);
}
