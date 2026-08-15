import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";
import { type Root, createRoot } from "react-dom/client";
import { isImageTarget } from "../../../lib/linkSuggestions";
import { wikiLinkChipLabel } from "../markdown/wikiLinkCodec";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";
import { renderWikiLinkEmbed, wikiEmbedDomAttributes } from "./wikiLinkEmbed";

export function isLiveWikiEmbed(
	attrs: Pick<WikiLinkAttrs, "embed" | "target">,
	liveEmbeds: boolean,
): boolean {
	if (!liveEmbeds || !attrs.embed) return false;
	const target = typeof attrs.target === "string" ? attrs.target.trim() : "";
	if (!target) return false;
	return !isImageTarget(target);
}

function attrsFromNode(node: ProseMirrorNode): WikiLinkAttrs {
	return {
		raw: typeof node.attrs.raw === "string" ? node.attrs.raw : "",
		target: typeof node.attrs.target === "string" ? node.attrs.target : "",
		alias: typeof node.attrs.alias === "string" ? node.attrs.alias : null,
		embed: Boolean(node.attrs.embed),
		anchorKind:
			node.attrs.anchorKind === "heading" || node.attrs.anchorKind === "block"
				? node.attrs.anchorKind
				: "none",
		anchor: typeof node.attrs.anchor === "string" ? node.attrs.anchor : null,
		unresolved: Boolean(node.attrs.unresolved),
	};
}

export function createWikiLinkImageNodeView(node: ProseMirrorNode): NodeView {
	const attrs = attrsFromNode(node);
	const dom = document.createElement("img");
	const render = (next: WikiLinkAttrs) => {
		const fallbackName = next.target.split("/").pop() ?? next.target;
		dom.src = next.target;
		dom.alt = next.alias?.trim() || fallbackName;
		dom.className = "markdownImage wikiLinkEmbedImage";
		dom.setAttribute("data-wikilink", "true");
		dom.setAttribute("data-wikilink-embed", "true");
		dom.setAttribute("data-target", next.target);
		dom.setAttribute("data-alias", next.alias ?? "");
		dom.setAttribute("data-raw", next.raw);
	};
	render(attrs);
	return {
		dom,
		update(updatedNode) {
			if (updatedNode.type.name !== "wikiLink") return false;
			const next = attrsFromNode(updatedNode);
			if (!next.embed || !isImageTarget(next.target)) return false;
			render(next);
			return true;
		},
		ignoreMutation: () => true,
	};
}

export function createWikiLinkChipNodeView(node: ProseMirrorNode): NodeView {
	const attrs = attrsFromNode(node);
	const dom = document.createElement("span");
	const render = (next: WikiLinkAttrs) => {
		dom.className = next.embed ? "wikiLink wikiLinkEmbedChip" : "wikiLink";
		dom.setAttribute("data-wikilink", "true");
		dom.setAttribute("data-wikilink-embed", next.embed ? "true" : "false");
		dom.setAttribute("data-target", next.target);
		dom.setAttribute("data-anchor-kind", next.anchorKind);
		dom.setAttribute("data-anchor", next.anchor ?? "");
		dom.setAttribute("data-alias", next.alias ?? "");
		dom.setAttribute("data-raw", next.raw);
		dom.setAttribute("data-unresolved", String(Boolean(next.unresolved)));
		dom.replaceChildren();
		const icon = document.createElement("span");
		icon.className = "wikiLinkIcon";
		icon.setAttribute("aria-hidden", "true");
		const label = document.createElement("span");
		label.className = "wikiLinkLabel";
		label.textContent = wikiLinkChipLabel(next);
		dom.append(icon, label);
	};
	render(attrs);
	return {
		dom,
		update(updatedNode) {
			if (updatedNode.type.name !== "wikiLink") return false;
			const next = attrsFromNode(updatedNode);
			if (isLiveWikiEmbed(next, true)) return false;
			render(next);
			return true;
		},
		ignoreMutation: () => true,
	};
}

export function createWikiLinkEmbedNodeView(node: ProseMirrorNode): NodeView {
	const dom = document.createElement("div");
	dom.className = "wikiLinkEmbed";
	const applyDomAttrs = (attrs: WikiLinkAttrs) => {
		const next = wikiEmbedDomAttributes(attrs);
		for (const [key, value] of Object.entries(next)) {
			dom.setAttribute(key, value);
		}
	};

	let root: Root | null = createRoot(dom);
	const render = (attrs: WikiLinkAttrs) => {
		if (!root) return;
		applyDomAttrs(attrs);
		renderWikiLinkEmbed(root, attrs);
	};

	render(attrsFromNode(node));

	return {
		dom,
		update(updatedNode) {
			if (updatedNode.type.name !== "wikiLink") return false;
			const attrs = attrsFromNode(updatedNode);
			if (!isLiveWikiEmbed(attrs, true)) return false;
			render(attrs);
			return true;
		},
		selectNode() {
			dom.classList.add("is-selected");
		},
		deselectNode() {
			dom.classList.remove("is-selected");
		},
		destroy() {
			queueMicrotask(() => {
				root?.unmount();
				root = null;
			});
		},
		ignoreMutation: () => true,
		stopEvent: (event) => {
			const target = event.target;
			return (
				target instanceof Element &&
				Boolean(target.closest(".wikiLinkEmbedHit"))
			);
		},
	};
}
