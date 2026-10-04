import { QueryObserver } from "@tanstack/react-query";
import type { NodeView } from "@tiptap/pm/view";
import { i18n } from "../../../i18n";
import { queryClient } from "../../../lib/queryClient";
import { invoke } from "../../../lib/tauri";
import { wikiEmbedContent } from "../markdown/wikiEmbedContent";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";

type EmbedDocument = Awaited<ReturnType<typeof invoke<"space_read_wiki_embeds_batch">>>[number];
type LoadedEmbed = Exclude<EmbedDocument, { kind: "error" }>;
type EmbedView =
	| Extract<LoadedEmbed, { kind: "missing" }>
	| (Extract<LoadedEmbed, { kind: "ready" }> & { html: string | null });

let queued: { targets: Set<string>; documents: Promise<Map<string, EmbedDocument>> } | null = null;

// Coalesce embeds mounted in the same tick into one IPC call under the window's space root.
function readEmbed(target: string): Promise<LoadedEmbed> {
	if (!queued) {
		const targets = new Set<string>();
		const documents = Promise.resolve().then(async () => {
			queued = null;
			const results = await invoke("space_read_wiki_embeds_batch", { targets: [...targets] });
			return new Map(results.map((doc) => [doc.target, doc]));
		});
		queued = { targets, documents };
	}
	queued.targets.add(target);
	return queued.documents.then((documents) => {
		const doc = documents.get(target);
		if (!doc || doc.kind === "error") {
			throw new Error(doc?.message ?? `No embed result for ${target}`);
		}
		return doc;
	});
}

function statusText(isError: boolean, data: EmbedView | undefined): string {
	if (isError) return i18n.t("editor:embed.unavailable");
	if (!data) return i18n.t("editor:embed.loading");
	if (data.kind === "missing") return i18n.t("editor:embed.noteMissing");
	return i18n.t(data.html === null ? "editor:embed.passageMissing" : "editor:embed.empty");
}

// ProseMirror owns this DOM. The header is the regular wiki link markup, so the editor's
// click handler opens the source; the body is rendered only through the sanitizer.
export function createWikiEmbedView(attrs: WikiLinkAttrs, link: HTMLElement): NodeView {
	const dom = document.createElement("span");
	dom.className = "wikiNoteEmbed";
	dom.contentEditable = "false";
	const content = document.createElement("span");
	content.className = "wikiNoteEmbedContent";
	dom.append(link, content);
	const observer = new QueryObserver(queryClient, {
		queryKey: ["navigation", "wiki-embed", attrs.target],
		queryFn: () => readEmbed(attrs.target),
		select: (doc): EmbedView =>
			doc.kind === "ready" ? { ...doc, html: wikiEmbedContent(doc.text, attrs) } : doc,
		retry: false,
	});
	const render = () => {
		const { data, isError } = observer.getCurrentResult();
		link.dataset.unresolved = String(data?.kind === "missing");
		if (data?.kind === "ready" && data.html?.trim()) {
			delete content.dataset.status;
			if (content.innerHTML !== data.html) content.innerHTML = data.html;
			return;
		}
		content.dataset.status = "";
		content.textContent = statusText(isError, data);
	};
	const unsubscribe = observer.subscribe(render);
	i18n.on("languageChanged", render);
	render();
	return {
		dom,
		ignoreMutation: () => true,
		destroy() {
			unsubscribe();
			i18n.off("languageChanged", render);
		},
	};
}
