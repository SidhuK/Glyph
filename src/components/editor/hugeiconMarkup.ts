import type { IconSvgElement } from "@hugeicons/react";

// Mirrors the markup <HugeiconsIcon strokeWidth={1.5} /> renders so editor DOM widgets
// can use icons without bundling react-dom/server.
const STROKE_WIDTH = 1.5;
const ATTR_NAMES: Record<string, string> = {
	className: "class",
	clipRule: "clip-rule",
	fillRule: "fill-rule",
	strokeLinecap: "stroke-linecap",
	strokeLinejoin: "stroke-linejoin",
	strokeWidth: "stroke-width",
};
const ESCAPES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#x27;",
};

function attributes(props: Record<string, string | number | undefined>): string {
	let out = "";
	for (const [name, value] of Object.entries(props)) {
		if (name === "key" || value === undefined) continue;
		out += ` ${ATTR_NAMES[name] ?? name}="${String(value).replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch)}"`;
	}
	return out;
}

export function hugeiconMarkup(icon: IconSvgElement, size: string | number): string {
	const stroke = { strokeWidth: STROKE_WIDTH, stroke: "currentColor" };
	const children = [...icon]
		.sort(([, a], [, b]) => (b.opacity !== undefined ? 1 : a.opacity !== undefined ? -1 : 0))
		.map(
			([tag, attrs]) =>
				`<${tag}${attributes({ ...attrs, ...stroke, opacity: attrs.opacity })}></${tag}>`,
		)
		.join("");
	const svg = attributes({
		xmlns: "http://www.w3.org/2000/svg",
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		color: "currentColor",
		className: "",
		...stroke,
	});
	return `<svg${svg}>${children}</svg>`;
}
