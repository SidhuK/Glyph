class TestResizeObserver implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = TestResizeObserver;
}
