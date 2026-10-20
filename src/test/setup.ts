class TestResizeObserver implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = TestResizeObserver;
}

// jsdom has no SVGGeometryElement; Animate UI's menu check indicator tests `instanceof` it.
if (
	typeof globalThis.SVGGraphicsElement !== "undefined" &&
	typeof globalThis.SVGGeometryElement === "undefined"
) {
	Object.defineProperty(globalThis, "SVGGeometryElement", {
		value: class TestSVGGeometryElement extends SVGGraphicsElement {},
		configurable: true,
		writable: true,
	});
}

// jsdom has no Web Animations API; Animate UI's menu highlight calls element.animate().
if (typeof Element !== "undefined" && typeof Element.prototype.animate !== "function") {
	Object.defineProperty(Element.prototype, "animate", {
		value: () => ({
			finished: Promise.resolve(),
			cancel() {},
			finish() {},
			play() {},
			pause() {},
			addEventListener() {},
			removeEventListener() {},
		}),
		configurable: true,
		writable: true,
	});
}

if (typeof globalThis.matchMedia === "undefined") {
	globalThis.matchMedia = (query) => ({
		matches: false,
		media: query,
		onchange: null,
		addListener() {},
		removeListener() {},
		addEventListener() {},
		removeEventListener() {},
		dispatchEvent: () => false,
	});
}
