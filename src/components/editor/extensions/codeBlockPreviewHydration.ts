const CODE_BLOCK_PREVIEW_ROOT_MARGIN = "640px 0px";

const hydrationCallbacks = new WeakMap<Element, () => void>();
const lazyWidgetDestroyCallbacks = new WeakMap<HTMLElement, () => void>();
let hydrationObserver: IntersectionObserver | null = null;

function ensureHydrationObserver() {
	if (hydrationObserver || typeof IntersectionObserver === "undefined") {
		return hydrationObserver;
	}

	hydrationObserver = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const callback = hydrationCallbacks.get(entry.target);
				hydrationObserver?.unobserve(entry.target);
				hydrationCallbacks.delete(entry.target);
				callback?.();
			}
		},
		{ rootMargin: CODE_BLOCK_PREVIEW_ROOT_MARGIN },
	);
	return hydrationObserver;
}

export function observeCodeBlockPreviewHydration(
	element: HTMLElement,
	hydrate: () => void,
): boolean {
	const observer = ensureHydrationObserver();
	if (!observer) return false;

	hydrationCallbacks.set(element, hydrate);
	observer.observe(element);
	return true;
}

export function unobserveCodeBlockPreviewHydration(element: HTMLElement) {
	hydrationObserver?.unobserve(element);
	hydrationCallbacks.delete(element);
}

export function createLazyCodeBlockPreviewWidget({
	placeholderClassName,
	frameClassName,
	hydrate,
}: {
	placeholderClassName: string;
	frameClassName: string;
	hydrate: () => { element: HTMLElement; destroy?: () => void };
}): HTMLElement {
	const placeholder = document.createElement("div");
	placeholder.className = placeholderClassName;
	placeholder.setAttribute("aria-busy", "true");

	const frame = document.createElement("div");
	frame.className = frameClassName;
	frame.setAttribute("aria-hidden", "true");
	placeholder.append(frame);

	let hydrated = false;
	let destroyed = false;
	let destroyHydrated: (() => void) | null = null;

	const runHydrate = () => {
		if (destroyed || hydrated) return;
		hydrated = true;
		unobserveCodeBlockPreviewHydration(placeholder);

		const rendered = hydrate();
		destroyHydrated = rendered.destroy ?? null;
		for (const attribute of Array.from(rendered.element.attributes)) {
			placeholder.setAttribute(attribute.name, attribute.value);
		}
		placeholder.removeAttribute("aria-busy");
		placeholder.replaceChildren(...Array.from(rendered.element.childNodes));
	};

	if (!observeCodeBlockPreviewHydration(placeholder, runHydrate)) {
		runHydrate();
	}

	lazyWidgetDestroyCallbacks.set(placeholder, () => {
		destroyed = true;
		unobserveCodeBlockPreviewHydration(placeholder);
		destroyHydrated?.();
		destroyHydrated = null;
	});

	return placeholder;
}

export function destroyLazyCodeBlockPreviewWidget(element: HTMLElement) {
	lazyWidgetDestroyCallbacks.get(element)?.();
	lazyWidgetDestroyCallbacks.delete(element);
}
