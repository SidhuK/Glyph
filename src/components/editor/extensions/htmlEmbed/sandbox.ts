import { wrapHtmlEmbedBody } from "../../markdown/htmlEmbedMarkdown";

export type HtmlEmbedKind = "html" | "svg";

export const HTML_EMBED_CSP = [
	"default-src 'none'",
	"script-src 'unsafe-inline'",
	"style-src 'unsafe-inline'",
	"img-src data: blob:",
	"font-src data:",
	"media-src data: blob:",
	"connect-src 'none'",
	"form-action 'none'",
].join("; ");

const HTML_EMBED_MESSAGE_SOURCE = "glyph-html-embed";
const HTML_EMBED_DEFAULT_HEIGHT = 240;
const HTML_EMBED_MAX_HEIGHT = 960;
const embedDestroyCallbacks = new WeakMap<HTMLElement, () => void>();

export function isHtmlEmbedCodeBlockLanguage(
	language: string | null | undefined,
): HtmlEmbedKind | null {
	const normalized = language?.trim().toLowerCase();
	if (normalized === "html") return "html";
	if (normalized === "svg") return "svg";
	return null;
}

export function buildHtmlEmbedSrcDoc(
	source: string,
	kind: HtmlEmbedKind,
): string {
	const body = wrapHtmlEmbedBody(source, kind);
	const escapedCsp = HTML_EMBED_CSP.replace(/"/g, "&quot;");

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapedCsp}">
<style>
  html, body { margin: 0; min-height: 100%; background: transparent; }
  body { font: 14px system-ui, sans-serif; color: #171717; }
  main { display: block; }
  main svg { display: block; max-width: 100%; height: auto; }
</style>
</head>
<body>${body}
<script>
(function () {
  var source = ${JSON.stringify(HTML_EMBED_MESSAGE_SOURCE)};
  function reportSize() {
    var doc = document.documentElement;
    var height = Math.max(
      doc.scrollHeight,
      doc.offsetHeight,
      document.body.scrollHeight,
      document.body.offsetHeight,
      ${HTML_EMBED_DEFAULT_HEIGHT}
    );
    parent.postMessage({ source: source, type: "size", height: height }, "*");
  }
  function reportError(message) {
    parent.postMessage({ source: source, type: "error", message: message }, "*");
  }
  window.addEventListener("error", function (event) {
    reportError(event.message || "Script error");
  });
  window.addEventListener("unhandledrejection", function (event) {
    var reason = event.reason;
    reportError(reason && reason.message ? reason.message : String(reason || "Unhandled rejection"));
  });
  if (typeof ResizeObserver !== "undefined") {
    new ResizeObserver(reportSize).observe(document.body);
  }
  window.addEventListener("load", reportSize);
  reportSize();
})();
</script>
</body>
</html>`;
}

function clampEmbedHeight(height: number): number {
	if (!Number.isFinite(height) || height <= 0) {
		return HTML_EMBED_DEFAULT_HEIGHT;
	}
	return Math.min(Math.max(Math.ceil(height), 80), HTML_EMBED_MAX_HEIGHT);
}

export function createHtmlEmbedWidget({
	source,
	kind,
	editable,
	onEditCode,
}: {
	source: string;
	kind: HtmlEmbedKind;
	editable: boolean;
	onEditCode: () => void;
}): HTMLElement {
	const root = document.createElement("div");
	root.className = "htmlEmbedWidget";
	root.dataset.kind = kind;

	const frame = document.createElement("div");
	frame.className = "htmlEmbedFrame";

	const iframe = document.createElement("iframe");
	iframe.className = "htmlEmbedIframe";
	iframe.setAttribute("sandbox", "allow-scripts");
	iframe.setAttribute("referrerpolicy", "no-referrer");
	iframe.setAttribute(
		"title",
		kind === "svg" ? "SVG embed preview" : "HTML embed preview",
	);
	iframe.srcdoc = buildHtmlEmbedSrcDoc(source, kind);
	iframe.style.height = `${HTML_EMBED_DEFAULT_HEIGHT}px`;

	const error = document.createElement("div");
	error.className = "htmlEmbedError";
	error.hidden = true;

	const onMessage = (event: MessageEvent) => {
		if (event.source !== iframe.contentWindow) return;
		const data = event.data;
		if (
			!data ||
			typeof data !== "object" ||
			data.source !== HTML_EMBED_MESSAGE_SOURCE
		) {
			return;
		}
		if (data.type === "size" && typeof data.height === "number") {
			root.dataset.state = "ready";
			iframe.style.height = `${clampEmbedHeight(data.height)}px`;
			return;
		}
		if (data.type === "error" && typeof data.message === "string") {
			root.classList.add("htmlEmbedWidgetError");
			error.textContent = data.message;
			error.hidden = false;
		}
	};

	frame.append(iframe, error);
	root.append(frame);

	if (editable) {
		const controls = document.createElement("div");
		controls.className = "mermaidCanvasControls";
		const editButton = document.createElement("button");
		editButton.type = "button";
		editButton.className = "mermaidCanvasEditBtn";
		editButton.textContent = "Edit code";
		editButton.title = `Edit ${kind.toUpperCase()} code`;
		editButton.setAttribute("aria-label", `Edit ${kind.toUpperCase()} code`);
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

	window.addEventListener("message", onMessage);
	embedDestroyCallbacks.set(root, () => {
		window.removeEventListener("message", onMessage);
	});

	return root;
}

export function destroyHtmlEmbedWidget(element: HTMLElement): void {
	embedDestroyCallbacks.get(element)?.();
	embedDestroyCallbacks.delete(element);
}
