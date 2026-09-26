import { QueryObserver } from "@tanstack/react-query";
import type { NodeView } from "@tiptap/pm/view";
import { i18n } from "../../../i18n";
import { queryClient } from "../../../lib/queryClient";
import { invoke } from "../../../lib/tauri";
import { dispatchWikiLinkClick } from "../markdown/editorEvents";
import { wikiEmbedContent } from "../markdown/wikiEmbedContent";
import { wikiLinkDisplayName } from "../markdown/wikiLinkCodec";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";

type EmbedDocument = Extract<
	Awaited<ReturnType<typeof invoke<"space_read_wiki_embeds_batch">>>[number],
	{ kind: "ready" }
>;
interface PendingRead {
	target: string;
	signal: AbortSignal;
	resolve: (document: EmbedDocument) => void;
	reject: (error: unknown) => void;
}
let pending: PendingRead[] = [];

// Coalesce mounted embeds into one IPC call; Rust resolves and reads under one space root.
function readEmbed({
	target,
	signal,
}: Pick<PendingRead, "target" | "signal">): Promise<EmbedDocument> {
	return new Promise((resolve, reject) => {
		signal.throwIfAborted();
		const abort = () => reject(signal.reason);
		signal.addEventListener("abort", abort, { once: true });
		pending.push({
			target,
			signal,
			resolve: (document) => {
				signal.removeEventListener("abort", abort);
				resolve(document);
			},
			reject: (error) => {
				signal.removeEventListener("abort", abort);
				reject(error);
			},
		});
		if (pending.length !== 1) return;
		queueMicrotask(() => {
			const requests = pending.filter((request) => !request.signal.aborted);
			pending = [];
			if (!requests.length) return;
			void invoke("space_read_wiki_embeds_batch", {
				targets: [...new Set(requests.map((request) => request.target))],
			})
				.then((documents) => {
					const byTarget = new Map(documents.map((doc) => [doc.target, doc]));
					for (const request of requests) {
						const doc = byTarget.get(request.target);
						if (request.signal.aborted) {
							request.reject(request.signal.reason);
						} else if (doc?.kind === "ready") {
							request.resolve(doc);
						} else {
							request.reject(new Error(doc?.message ?? "Source unavailable"));
						}
					}
				})
				.catch((error: unknown) => {
					for (const request of requests) request.reject(error);
				});
		});
	});
}

// ProseMirror owns this DOM; the source body is rendered only through the sanitizer.
export function createWikiEmbedView(attrs: WikiLinkAttrs): NodeView {
	const dom = document.createElement("span");
	dom.className = "wikiNoteEmbed";
	dom.contentEditable = "false";
	const header = document.createElement("span");
	header.className = "wikiNoteEmbedHeader";
	const title = document.createElement("span");
	title.textContent = wikiLinkDisplayName(attrs);
	const open = document.createElement("button");
	open.type = "button";
	const content = document.createElement("span");
	content.className = "wikiNoteEmbedContent";
	header.append(title, open);
	dom.append(header, content);
	const observer = new QueryObserver(queryClient, {
		queryKey: ["navigation", "wiki-embed", attrs.target],
		queryFn: ({ signal }) => readEmbed({ target: attrs.target, signal }),
		select: (document) => ({
			...document,
			html: wikiEmbedContent(document.text, attrs),
		}),
		notifyOnChangeProps: ["data", "error", "status"],
		retry: false,
		staleTime: 0,
		gcTime: 60_000,
	});
	const render = () => {
		open.textContent = i18n.t("editor:embed.openSource");
		const result = observer.getCurrentResult();
		open.disabled = !result.data || result.isError;
		if (result.isError || !result.data) {
			content.textContent = i18n.t(
				result.isError ? "editor:embed.unavailable" : "editor:embed.loading",
			);
			return;
		}
		const { html } = result.data;
		if (html === null || !html.trim()) {
			content.textContent = i18n.t(
				html === null ? "editor:embed.passageMissing" : "editor:embed.empty",
			);
		} else if (content.innerHTML !== html) {
			content.innerHTML = html;
		}
	};
	open.onclick = (event) => {
		event.preventDefault();
		event.stopPropagation();
		const source = observer.getCurrentResult().data;
		if (source) dispatchWikiLinkClick({ ...attrs, target: source.path, embed: false });
	};
	// Embedded Markdown is a read-only snapshot; navigation uses the explicit source action.
	content.onclick = (event) => event.preventDefault();
	const unsubscribe = observer.subscribe(render);
	i18n.on("languageChanged", render);
	render();
	return {
		dom,
		stopEvent: (event) =>
			event.type === "click" ||
			(event.target instanceof globalThis.Node && open.contains(event.target)),
		ignoreMutation: () => true,
		destroy() {
			unsubscribe();
			i18n.off("languageChanged", render);
		},
	};
}
