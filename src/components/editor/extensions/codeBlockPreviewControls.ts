export function appendEditCodeControls(
	frame: HTMLElement,
	{
		label,
		onEditCode,
	}: {
		label: string;
		onEditCode: () => void;
	},
): void {
	const controls = document.createElement("div");
	controls.className = "codeBlockPreviewControls";

	const editButton = document.createElement("button");
	editButton.type = "button";
	editButton.className = "codeBlockPreviewEditBtn";
	editButton.textContent = "Edit code";
	editButton.title = label;
	editButton.setAttribute("aria-label", label);
	editButton.addEventListener("mousedown", (event) => {
		event.preventDefault();
		event.stopPropagation();
	});
	editButton.addEventListener("click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		onEditCode();
	});

	controls.append(editButton);
	frame.append(controls);
}
