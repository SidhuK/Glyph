export function appendEditCodeControls(
	frame: HTMLElement,
	{
		label,
		onEditCode,
		openPreviewLabel,
		onOpenFocusedPreview,
	}: {
		label: string;
		onEditCode: () => void;
		openPreviewLabel?: string;
		onOpenFocusedPreview?: () => void;
	},
): void {
	const controls = document.createElement("div");
	controls.className = "codeBlockPreviewControls";

	const editButton = document.createElement("button");
	editButton.type = "button";
	editButton.className = "codeBlockPreviewEditBtn";
	editButton.textContent = label;
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

	if (openPreviewLabel && onOpenFocusedPreview) {
		const openButton = document.createElement("button");
		openButton.type = "button";
		openButton.className = "codeBlockPreviewEditBtn codeBlockPreviewOpenBtn";
		openButton.textContent = openPreviewLabel;
		openButton.title = openPreviewLabel;
		openButton.setAttribute("aria-label", openPreviewLabel);
		openButton.addEventListener("mousedown", (event) => {
			event.preventDefault();
			event.stopPropagation();
		});
		openButton.addEventListener("click", (event) => {
			event.preventDefault();
			event.stopPropagation();
			onOpenFocusedPreview();
		});
		controls.append(openButton);
	}

	controls.append(editButton);
	frame.append(controls);
}
