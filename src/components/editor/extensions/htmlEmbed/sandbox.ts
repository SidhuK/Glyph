import {
	type HtmlEmbedKind,
	isHtmlEmbedCodeBlockLanguage,
	wrapHtmlEmbedBody,
} from "../../../../lib/htmlEmbed";
import { appendEditCodeControls } from "../codeBlockPreviewControls";

export type { HtmlEmbedKind };

export { isHtmlEmbedCodeBlockLanguage };

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
const HTML_EMBED_MIN_HEIGHT = 80;
const HTML_EMBED_INITIAL_HEIGHT = 240;
const HTML_EMBED_MAX_HEIGHT = 960;

export function buildHtmlEmbedSrcDoc(
	source: string,
	kind: HtmlEmbedKind,
): string {
	const body = wrapHtmlEmbedBody(source, kind);
	const escapedCsp = HTML_EMBED_CSP.replace(/"/g, "&quot;");
	const postMessageOrigin = JSON.stringify(window.location.origin);

	return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${escapedCsp}">
<style>
  html, body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
  body { font: 14px system-ui, sans-serif; color: #171717; }
  main { display: block; }
  main svg { display: block; max-width: 100%; height: auto; }
</style>
<script>
(function () {
  var source = ${JSON.stringify(HTML_EMBED_MESSAGE_SOURCE)};
  var targetOrigin = ${postMessageOrigin};
  function measureHeight() {
    var body = document.body;
    var doc = document.documentElement;
    var height = 0;
    var nodes = [doc, body];
    var main = document.querySelector("main");
    if (main) nodes.push(main);
    for (var i = 0; i < nodes.length; i += 1) {
      var node = nodes[i];
      height = Math.max(height, node.scrollHeight, node.offsetHeight);
    }
    return height;
  }
  function reportSize() {
    parent.postMessage(
      { source: source, type: "size", height: measureHeight() },
      targetOrigin
    );
  }
  function reportError(message) {
    parent.postMessage({ source: source, type: "error", message: message }, targetOrigin);
  }
  function start() {
    window.addEventListener("error", function (event) {
      reportError(event.message || "Script error");
    });
    window.addEventListener("unhandledrejection", function (event) {
      var reason = event.reason;
      reportError(reason && reason.message ? reason.message : String(reason || "Unhandled rejection"));
    });
    if (typeof ResizeObserver !== "undefined") {
      var resizeObserver = new ResizeObserver(function () {
        reportSize();
      });
      resizeObserver.observe(document.documentElement);
      resizeObserver.observe(document.body);
      var main = document.querySelector("main");
      if (main) resizeObserver.observe(main);
    }
    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(reportSize).observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        characterData: true,
      });
    }
    reportSize();
    requestAnimationFrame(function () {
      reportSize();
      requestAnimationFrame(reportSize);
    });
    for (var index = 0; index < document.images.length; index += 1) {
      document.images[index].addEventListener("load", reportSize);
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
  window.addEventListener("load", reportSize);
})();
</script>
</head>
<body>${body}</body>
</html>`;
}

function clampEmbedHeight(height: number): number {
	if (!Number.isFinite(height) || height <= 0) {
		return HTML_EMBED_INITIAL_HEIGHT;
	}
	return Math.min(
		Math.max(Math.ceil(height), HTML_EMBED_MIN_HEIGHT),
		HTML_EMBED_MAX_HEIGHT,
	);
}

function isTrustedEmbedMessage(
	event: MessageEvent,
	iframe: HTMLIFrameElement,
): boolean {
	if (event.source !== iframe.contentWindow) return false;
	return event.origin === window.location.origin || event.origin === "null";
}

function applyEmbedHeight(
	frame: HTMLElement,
	iframe: HTMLIFrameElement,
	height: number,
): void {
	const clamped = clampEmbedHeight(height);
	iframe.style.height = `${clamped}px`;
	frame.style.height = `${clamped}px`;
	frame.style.overflowY = height > HTML_EMBED_MAX_HEIGHT ? "auto" : "hidden";
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
}): { element: HTMLElement; destroy: () => void } {
	const root = document.createElement("div");
	root.className = "htmlEmbedWidget";
	root.dataset.kind = kind;

	const frame = document.createElement("div");
	frame.className = "htmlEmbedFrame";

	const iframe = document.createElement("iframe");
	iframe.className = "htmlEmbedIframe";
	iframe.setAttribute("sandbox", "allow-scripts allow-downloads");
	iframe.setAttribute("referrerpolicy", "no-referrer");
	iframe.setAttribute(
		"title",
		kind === "svg" ? "SVG embed preview" : "HTML embed preview",
	);
	iframe.setAttribute("scrolling", "no");
	iframe.srcdoc = buildHtmlEmbedSrcDoc(source, kind);
	applyEmbedHeight(frame, iframe, HTML_EMBED_INITIAL_HEIGHT);

	const error = document.createElement("div");
	error.className = "htmlEmbedError";
	error.hidden = true;

	const onMessage = (event: MessageEvent) => {
		if (!isTrustedEmbedMessage(event, iframe)) return;
		const data = event.data;
		if (
			!data ||
			typeof data !== "object" ||
			data.source !== HTML_EMBED_MESSAGE_SOURCE
		) {
			return;
		}
		if (data.type === "size" && typeof data.height === "number") {
			root.classList.remove("htmlEmbedWidgetError");
			error.textContent = "";
			error.hidden = true;
			root.dataset.state = "ready";
			applyEmbedHeight(frame, iframe, data.height);
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
		appendEditCodeControls(frame, {
			label: `Edit ${kind.toUpperCase()} code`,
			onEditCode,
		});
	}

	window.addEventListener("message", onMessage);
	return {
		element: root,
		destroy: () => {
			window.removeEventListener("message", onMessage);
		},
	};
}
