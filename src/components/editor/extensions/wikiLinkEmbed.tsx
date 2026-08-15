import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Root } from "react-dom/client";
import { I18nextProvider, useTranslation } from "react-i18next";
import { i18n } from "../../../i18n";
import { queryClient } from "../../../lib/queryClient";
import { type SearchResult, invoke } from "../../../lib/tauri";
import { isMarkdownPath, normalizeRelPath } from "../../../utils/path";
import { NotePreviewContent } from "../../preview/NotePreviewContent";
import { dispatchWikiLinkClick } from "../markdown/editorEvents";
import {
	isSearchQueryWikiTarget,
	searchQueryFromWikiTarget,
	wikiLinkAttrsToMarkdown,
	wikiLinkChipLabel,
} from "../markdown/wikiLinkCodec";
import {
	extractBlockSlice,
	extractHeadingSlice,
	extractNoteBodySlice,
} from "../markdown/wikiLinkSlices";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";

const SEARCH_EMBED_LIMIT = 20;

function wikiEmbedQueryKey(attrs: WikiLinkAttrs): unknown[] {
	if (isSearchQueryWikiTarget(attrs.target)) {
		return ["wiki-search-embed", searchQueryFromWikiTarget(attrs.target)];
	}
	return ["wiki-embed", attrs.target, attrs.anchorKind, attrs.anchor];
}

export function WikiLinkEmbedCard({ attrs }: { attrs: WikiLinkAttrs }) {
	const { t } = useTranslation("editor");
	const title = wikiLinkChipLabel(attrs);

	const query = useQuery({
		queryKey: wikiEmbedQueryKey(attrs),
		queryFn: () => loadWikiEmbed(attrs),
	});

	if (query.isPending) {
		return (
			<div className="wikiLinkEmbedCard">
				<div className="wikiLinkEmbedHeader">
					<span className="wikiLinkEmbedTitle">{title}</span>
				</div>
				<div className="wikiLinkEmbedBody wikiLinkEmbedStatus">
					{t("wikiLink.embedLoading")}
				</div>
			</div>
		);
	}

	if (query.isError || !query.data) {
		return (
			<div className="wikiLinkEmbedCard">
				<div className="wikiLinkEmbedHeader">
					<span className="wikiLinkEmbedTitle">{title}</span>
				</div>
				<div className="wikiLinkEmbedBody wikiLinkEmbedStatus">
					{t("wikiLink.embedMissing")}
				</div>
			</div>
		);
	}

	if (query.data.kind === "search") {
		return (
			<div className="wikiLinkEmbedCard">
				<div className="wikiLinkEmbedHeader">
					<span className="wikiLinkEmbedTitle">
						{attrs.alias?.trim() || t("wikiLink.searchTitle")}
					</span>
					<span className="wikiLinkEmbedMeta">{query.data.query}</span>
				</div>
				{query.data.results.length === 0 ? (
					<div className="wikiLinkEmbedBody wikiLinkEmbedStatus">
						{t("wikiLink.searchNoResults")}
					</div>
				) : (
					<ul className="wikiLinkEmbedHits">
						{query.data.results.map((result) => (
							<li
								key={`${result.id}:${result.line ?? ""}:${result.match_index ?? ""}`}
							>
								<button
									type="button"
									className="wikiLinkEmbedHit"
									onClick={(event) => {
										event.preventDefault();
										event.stopPropagation();
										dispatchWikiLinkClick({
											raw: `[[${result.id}]]`,
											target: result.id,
											alias: result.title || null,
											anchorKind: "none",
											anchor: null,
											unresolved: false,
										});
									}}
								>
									<span className="wikiLinkEmbedHitTitle">
										{result.title || result.id}
									</span>
									{result.snippet ? (
										<span className="wikiLinkEmbedHitSnippet">
											{result.snippet}
										</span>
									) : null}
								</button>
							</li>
						))}
					</ul>
				)}
			</div>
		);
	}

	return (
		<div className="wikiLinkEmbedCard">
			<div className="wikiLinkEmbedHeader">
				<span className="wikiLinkEmbedTitle">{title}</span>
				<span className="wikiLinkEmbedMeta">{query.data.relPath}</span>
			</div>
			<div className="wikiLinkEmbedBody">
				{query.data.content.trim() ? (
					<NotePreviewContent
						status="ok"
						relPath={query.data.relPath}
						content={query.data.content}
						interactive
						chrome="minimal"
					/>
				) : (
					<div className="wikiLinkEmbedStatus">{t("wikiLink.embedEmpty")}</div>
				)}
			</div>
		</div>
	);
}

type WikiEmbedData =
	| { kind: "note"; relPath: string; content: string }
	| { kind: "search"; query: string; results: SearchResult[] };

async function loadWikiEmbed(attrs: WikiLinkAttrs): Promise<WikiEmbedData> {
	if (isSearchQueryWikiTarget(attrs.target)) {
		const query = searchQueryFromWikiTarget(attrs.target);
		const results = await invoke("search_parse_and_run", {
			raw_query: query,
			limit: SEARCH_EMBED_LIMIT,
		});
		return { kind: "search", query, results };
	}

	const resolved = await invoke("space_resolve_wikilink", {
		target: attrs.target,
	});
	if (!resolved || !isMarkdownPath(resolved)) {
		throw new Error("Note not found");
	}
	const relPath = normalizeRelPath(resolved);
	const doc = await invoke("space_read_text", { path: relPath });
	const content = sliceEmbeddedMarkdown(doc.text, attrs);
	if (!content.trim()) {
		return { kind: "note", relPath, content: "" };
	}
	return { kind: "note", relPath, content };
}

function sliceEmbeddedMarkdown(markdown: string, attrs: WikiLinkAttrs): string {
	if (attrs.anchorKind === "heading" && attrs.anchor) {
		return extractHeadingSlice(markdown, attrs.anchor) ?? "";
	}
	if (attrs.anchorKind === "block" && attrs.anchor) {
		return extractBlockSlice(markdown, attrs.anchor) ?? "";
	}
	return extractNoteBodySlice(markdown);
}

export function wikiEmbedDomAttributes(
	attrs: WikiLinkAttrs,
): Record<string, string> {
	return {
		"data-wikilink": "true",
		"data-wikilink-embed": "true",
		"data-target": attrs.target,
		"data-anchor-kind": attrs.anchorKind,
		"data-anchor": attrs.anchor ?? "",
		"data-alias": attrs.alias ?? "",
		"data-raw": attrs.raw || wikiLinkAttrsToMarkdown(attrs),
		"data-unresolved": String(Boolean(attrs.unresolved)),
	};
}

export function renderWikiLinkEmbed(root: Root, attrs: WikiLinkAttrs): void {
	root.render(
		<I18nextProvider i18n={i18n}>
			<QueryClientProvider client={queryClient}>
				<WikiLinkEmbedCard attrs={attrs} />
			</QueryClientProvider>
		</I18nextProvider>,
	);
}
