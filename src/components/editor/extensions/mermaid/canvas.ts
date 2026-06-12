const MERMAID_CANVAS_HEIGHT = 480;
const MERMAID_CANVAS_DEFAULT_WIDTH = 800;
const MERMAID_CANVAS_DEFAULT_HEIGHT = 480;
const MERMAID_CANVAS_MIN_ZOOM = 0.25;
const MERMAID_CANVAS_MAX_ZOOM = 4;
const MERMAID_CANVAS_ZOOM_STEP = 1.2;
const MERMAID_CANVAS_FIT_INSET = 24;
const MERMAID_CANVAS_KEYBOARD_PAN_STEP = 32;

interface MermaidCanvasSize {
	width: number;
	height: number;
}

interface MermaidCanvasPoint {
	x: number;
	y: number;
}

interface MermaidCanvasState {
	zoom: number;
	panX: number;
	panY: number;
	hasUserTransform: boolean;
	lastViewportSize: MermaidCanvasSize | null;
}

interface MermaidCanvasOptions {
	svgHtml: string;
	editMode: boolean;
	onEditCode: () => void;
}

interface MermaidCanvasMount {
	element: HTMLElement;
	destroy: () => void;
}

type ListenerTarget = HTMLElement | Window;

function clamp(value: number, min: number, max: number) {
	return Math.min(Math.max(value, min), max);
}

function parseSvgLength(value: string | null): number | null {
	if (!value) return null;
	if (value.includes("%")) return null;
	const parsed = Number.parseFloat(value);
	return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function getSvgNaturalSize(svg: SVGSVGElement): MermaidCanvasSize {
	const viewBox = svg.getAttribute("viewBox")?.trim();
	if (viewBox) {
		const parts = viewBox
			.split(/[\s,]+/)
			.map((part) => Number.parseFloat(part));
		const width = parts[2];
		const height = parts[3];
		if (
			parts.length === 4 &&
			parts.every(Number.isFinite) &&
			width > 0 &&
			height > 0
		) {
			return { width, height };
		}
	}

	const width = parseSvgLength(svg.getAttribute("width"));
	const height = parseSvgLength(svg.getAttribute("height"));
	if (width && height) {
		return { width, height };
	}

	return {
		width: MERMAID_CANVAS_DEFAULT_WIDTH,
		height: MERMAID_CANVAS_DEFAULT_HEIGHT,
	};
}

function importSvg(svgHtml: string): SVGSVGElement | null {
	const doc = new DOMParser().parseFromString(svgHtml, "image/svg+xml");
	const parserError = doc.querySelector("parsererror");
	const svg = doc.documentElement;
	if (parserError || svg.tagName.toLowerCase() !== "svg") return null;
	return document.importNode(svg, true) as unknown as SVGSVGElement;
}

function getViewportSize(viewport: HTMLElement): MermaidCanvasSize {
	const rect = viewport.getBoundingClientRect();
	return {
		width: rect.width,
		height: rect.height || MERMAID_CANVAS_HEIGHT,
	};
}

function getViewportPoint(
	viewport: HTMLElement,
	event: MouseEvent | PointerEvent,
) {
	const rect = viewport.getBoundingClientRect();
	return {
		x: event.clientX - rect.left,
		y: event.clientY - rect.top,
	};
}

function createControlButton(className: string, label: string, title: string) {
	const button = document.createElement("button");
	button.type = "button";
	button.className = className;
	button.textContent = label;
	button.title = title;
	button.setAttribute("aria-label", title);
	return button;
}

export function createMermaidErrorCanvas(message: string): HTMLElement {
	const root = document.createElement("div");
	root.className = "mermaidCanvasWidget";
	root.dataset.state = "error";

	const frame = document.createElement("div");
	frame.className = "mermaidCanvasFrame";

	const error = document.createElement("div");
	error.className = "mermaidCanvasError";
	error.setAttribute("role", "alert");
	error.textContent = message;

	frame.append(error);
	root.append(frame);

	return root;
}

export function createMermaidCanvas(
	options: MermaidCanvasOptions,
): MermaidCanvasMount {
	const svg = importSvg(options.svgHtml);
	if (!svg) {
		return {
			element: createMermaidErrorCanvas("Unable to render Mermaid diagram."),
			destroy: () => {},
		};
	}

	const diagramSvg = svg;
	const naturalSize = getSvgNaturalSize(diagramSvg);
	const state: MermaidCanvasState = {
		zoom: 1,
		panX: 0,
		panY: 0,
		hasUserTransform: false,
		lastViewportSize: null,
	};
	const cleanup: Array<() => void> = [];

	const root = document.createElement("div");
	root.className = "mermaidCanvasWidget";
	root.dataset.state = "ready";

	const frame = document.createElement("div");
	frame.className = "mermaidCanvasFrame";

	const viewport = document.createElement("div");
	viewport.className = "mermaidCanvasViewport";
	viewport.tabIndex = 0;
	viewport.role = "group";
	viewport.setAttribute("aria-label", "Mermaid diagram");

	const stage = document.createElement("div");
	stage.className = "mermaidCanvasStage";
	stage.append(diagramSvg);

	const controls = document.createElement("div");
	controls.className = "mermaidCanvasControls";

	const editButton = createControlButton(
		"mermaidCanvasEditBtn",
		"Edit code",
		"Edit Mermaid code",
	);
	editButton.hidden = !options.editMode;

	controls.append(editButton);
	viewport.append(stage);
	frame.append(viewport, controls);
	root.append(frame);

	function render() {
		const width = naturalSize.width * state.zoom;
		const height = naturalSize.height * state.zoom;
		diagramSvg.setAttribute("width", `${width}`);
		diagramSvg.setAttribute("height", `${height}`);
		diagramSvg.style.width = `${width}px`;
		diagramSvg.style.height = `${height}px`;
		stage.style.transform = `translate(${state.panX}px, ${state.panY}px)`;
	}

	function fitToView() {
		const viewportSize = getViewportSize(viewport);
		if (viewportSize.width <= 0) return;

		const fitWidth =
			(viewportSize.width - MERMAID_CANVAS_FIT_INSET * 2) / naturalSize.width;
		const fitHeight =
			(viewportSize.height - MERMAID_CANVAS_FIT_INSET * 2) / naturalSize.height;
		state.zoom = clamp(
			Math.min(fitWidth, fitHeight),
			MERMAID_CANVAS_MIN_ZOOM,
			MERMAID_CANVAS_MAX_ZOOM,
		);
		state.panX = (viewportSize.width - naturalSize.width * state.zoom) / 2;
		state.panY = (viewportSize.height - naturalSize.height * state.zoom) / 2;
		state.lastViewportSize = viewportSize;
		render();
	}

	function resetToFit() {
		state.hasUserTransform = false;
		fitToView();
	}

	function zoomAt(point: MermaidCanvasPoint, factor: number) {
		const nextZoom = clamp(
			state.zoom * factor,
			MERMAID_CANVAS_MIN_ZOOM,
			MERMAID_CANVAS_MAX_ZOOM,
		);
		if (nextZoom === state.zoom) return;

		const diagramX = (point.x - state.panX) / state.zoom;
		const diagramY = (point.y - state.panY) / state.zoom;
		state.zoom = nextZoom;
		state.panX = point.x - diagramX * state.zoom;
		state.panY = point.y - diagramY * state.zoom;
		state.hasUserTransform = true;
		render();
	}

	function zoomFromCenter(factor: number) {
		const size = getViewportSize(viewport);
		zoomAt({ x: size.width / 2, y: size.height / 2 }, factor);
	}

	function preserveCenterOnResize(nextSize: MermaidCanvasSize) {
		const previousSize = state.lastViewportSize;
		if (!previousSize) {
			fitToView();
			return;
		}

		const diagramCenterX = (previousSize.width / 2 - state.panX) / state.zoom;
		const diagramCenterY = (previousSize.height / 2 - state.panY) / state.zoom;
		state.panX = nextSize.width / 2 - diagramCenterX * state.zoom;
		state.panY = nextSize.height / 2 - diagramCenterY * state.zoom;
		state.lastViewportSize = nextSize;
		render();
	}

	let animationFrame = window.requestAnimationFrame(() => {
		fitToView();
	});

	const resizeObserver = new ResizeObserver(() => {
		if (animationFrame) window.cancelAnimationFrame(animationFrame);
		animationFrame = window.requestAnimationFrame(() => {
			const nextSize = getViewportSize(viewport);
			if (!state.hasUserTransform) {
				fitToView();
			} else {
				preserveCenterOnResize(nextSize);
			}
		});
	});
	resizeObserver.observe(viewport);
	cleanup.push(() => resizeObserver.disconnect());
	cleanup.push(() => window.cancelAnimationFrame(animationFrame));

	function addListener<K extends keyof HTMLElementEventMap>(
		target: HTMLElement,
		type: K,
		listener: (event: HTMLElementEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void;
	function addListener<K extends keyof WindowEventMap>(
		target: Window,
		type: K,
		listener: (event: WindowEventMap[K]) => void,
		options?: AddEventListenerOptions,
	): void;
	function addListener(
		target: ListenerTarget,
		type: string,
		listener: EventListener,
		options?: AddEventListenerOptions,
	) {
		target.addEventListener(type, listener, options);
		cleanup.push(() => target.removeEventListener(type, listener, options));
	}

	let dragPointerId: number | null = null;
	let previousPointer: MermaidCanvasPoint | null = null;

	addListener(viewport, "pointerdown", (event) => {
		if (event.button !== 0) return;
		if (event.target instanceof Element && event.target.closest("button")) {
			return;
		}

		dragPointerId = event.pointerId;
		previousPointer = { x: event.clientX, y: event.clientY };
		viewport.dataset.dragging = "true";
		viewport.setPointerCapture(event.pointerId);
		viewport.focus({ preventScroll: true });
		event.preventDefault();
	});

	addListener(viewport, "pointermove", (event) => {
		if (dragPointerId !== event.pointerId || !previousPointer) return;

		state.panX += event.clientX - previousPointer.x;
		state.panY += event.clientY - previousPointer.y;
		state.hasUserTransform = true;
		previousPointer = { x: event.clientX, y: event.clientY };
		render();
	});

	function stopDragging(event: PointerEvent) {
		if (dragPointerId !== event.pointerId) return;

		if (viewport.hasPointerCapture(event.pointerId)) {
			viewport.releasePointerCapture(event.pointerId);
		}
		dragPointerId = null;
		previousPointer = null;
		delete viewport.dataset.dragging;
	}

	addListener(viewport, "pointerup", stopDragging);
	addListener(viewport, "pointercancel", stopDragging);

	addListener(
		viewport,
		"wheel",
		(event) => {
			if (!event.metaKey && !event.ctrlKey) return;

			event.preventDefault();
			const factor =
				event.deltaY < 0
					? MERMAID_CANVAS_ZOOM_STEP
					: 1 / MERMAID_CANVAS_ZOOM_STEP;
			zoomAt(getViewportPoint(viewport, event), factor);
		},
		{ passive: false },
	);

	addListener(viewport, "keydown", (event) => {
		switch (event.key) {
			case "ArrowUp":
				state.panY += MERMAID_CANVAS_KEYBOARD_PAN_STEP;
				break;
			case "ArrowDown":
				state.panY -= MERMAID_CANVAS_KEYBOARD_PAN_STEP;
				break;
			case "ArrowLeft":
				state.panX += MERMAID_CANVAS_KEYBOARD_PAN_STEP;
				break;
			case "ArrowRight":
				state.panX -= MERMAID_CANVAS_KEYBOARD_PAN_STEP;
				break;
			case "+":
			case "=":
				zoomFromCenter(MERMAID_CANVAS_ZOOM_STEP);
				event.preventDefault();
				return;
			case "-":
			case "_":
				zoomFromCenter(1 / MERMAID_CANVAS_ZOOM_STEP);
				event.preventDefault();
				return;
			case "0":
				resetToFit();
				event.preventDefault();
				return;
			case "Enter":
				options.onEditCode();
				event.preventDefault();
				return;
			default:
				return;
		}

		state.hasUserTransform = true;
		render();
		event.preventDefault();
	});

	addListener(editButton, "mousedown", (event) => {
		event.preventDefault();
		event.stopPropagation();
	});
	addListener(editButton, "click", (event) => {
		event.preventDefault();
		event.stopPropagation();
		options.onEditCode();
	});

	render();

	return {
		element: root,
		destroy: () => {
			if (dragPointerId != null && viewport.hasPointerCapture(dragPointerId)) {
				viewport.releasePointerCapture(dragPointerId);
			}
			for (const dispose of cleanup.splice(0)) {
				dispose();
			}
		},
	};
}
