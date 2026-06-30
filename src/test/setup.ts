class TestResizeObserver implements ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
}

if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = TestResizeObserver;
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

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { defaultNS, namespaces, resources } from "../i18n/resources";

if (!i18n.isInitialized) {
	void i18n.use(initReactI18next).init({
		resources,
		lng: "en",
		fallbackLng: "en",
		defaultNS,
		ns: namespaces,
		interpolation: {
			escapeValue: false,
		},
		returnNull: false,
		initAsync: false,
	});
}
