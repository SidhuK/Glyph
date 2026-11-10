import { QueryObserver, type QueryObserverOptions, keepPreviousData } from "@tanstack/react-query";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { queryClient } from "../../../lib/queryClient";
import { registerPreviewInvalidator } from "../../../lib/spaceChange";
import { invoke } from "../../../lib/tauri";
import { basename, fileExtension, isMarkdownPath } from "../../../utils/path";

const wikiLinkResolutionKey = new PluginKey<DecorationSet>("wiki-link-resolution");
const MISSING_QUERY_ROOT = ["navigation", "wiki-link-missing"] as const;
const UNRESOLVED_ATTRS = { "data-unresolved": "true" };

function linkTarget(node: ProseMirrorNode): string | null {
	// Embeds mark themselves from their own load (wikiEmbedView).
	if (node.type.name !== "wikiLink" || node.attrs.embed) return null;
	const target = typeof node.attrs.target === "string" ? node.attrs.target.trim() : "";
	return target || null;
}

/** Only note targets can be missing notes: `[[report.pdf]]` names an attachment. A dotted
 * name such as "Standup 2024.01.05" has no letters in its "extension", so it is still a note. */
function isNoteTarget(target: string): boolean {
	const ext = fileExtension(target);
	return !ext || /\s/.test(ext) || !/[a-z]/i.test(ext) || isMarkdownPath(target);
}

function noteLinkTargets(doc: ProseMirrorNode): string[] {
	const targets = new Set<string>();
	doc.descendants((node) => {
		const target = linkTarget(node);
		if (target && isNoteTarget(target)) targets.add(target);
	});
	return [...targets].sort();
}

function noteName(path: string): string {
	return basename(path)
		.replace(/\.(md|markdown)$/i, "")
		.toLowerCase();
}

type MissingQueryKey = readonly ["navigation", "wiki-link-missing", readonly string[]];

function missingQueryKey(targets: readonly string[]): MissingQueryKey {
	return [...MISSING_QUERY_ROOT, targets];
}

// One batch call per set of link targets; the embed batch resolves each target the same way
// the click handler does and reports the ones with no note.
function missingQuery(
	targets: readonly string[],
): QueryObserverOptions<string[], Error, string[], string[], MissingQueryKey> {
	return {
		queryKey: missingQueryKey(targets),
		queryFn: async (): Promise<string[]> => {
			const documents = await invoke("space_read_wiki_embeds_batch", { targets: [...targets] });
			return documents.flatMap((doc) => (doc.kind === "missing" ? [doc.target] : []));
		},
		enabled: targets.length > 0,
		retry: false,
		placeholderData: keepPreviousData,
	};
}

function missingDecorations(doc: ProseMirrorNode, missing: ReadonlySet<string>): DecorationSet {
	if (missing.size === 0) return DecorationSet.empty;
	const decorations: Decoration[] = [];
	doc.descendants((node, pos) => {
		const target = linkTarget(node);
		if (target && missing.has(target)) {
			decorations.push(Decoration.node(pos, pos + node.nodeSize, UNRESOLVED_ATTRS));
		}
	});
	return DecorationSet.create(doc, decorations);
}

function sameMembers(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
	return a.size === b.size && [...a].every((value) => b.has(value));
}

/** Marks wiki links whose note doesn't exist with `data-unresolved="true"`. */
export function createWikiLinkResolutionPlugin(): Plugin<DecorationSet> {
	let missing: ReadonlySet<string> = new Set();

	return new Plugin<DecorationSet>({
		key: wikiLinkResolutionKey,
		state: {
			init: (_config, state) => {
				const cached = queryClient.getQueryData<string[]>(
					missingQueryKey(noteLinkTargets(state.doc)),
				);
				missing = new Set(cached ?? []);
				return missingDecorations(state.doc, missing);
			},
			apply: (tr, decorations, _oldState, newState) => {
				if (tr.getMeta(wikiLinkResolutionKey) === true || (tr.docChanged && missing.size > 0)) {
					return missingDecorations(newState.doc, missing);
				}
				return decorations.map(tr.mapping, tr.doc);
			},
		},
		props: {
			decorations: (state) => wikiLinkResolutionKey.getState(state),
		},
		view: (view) => {
			let targets = noteLinkTargets(view.state.doc);
			const observer = new QueryObserver(queryClient, missingQuery(targets));
			const unsubscribe = observer.subscribe(({ data }) => {
				const next = new Set(data ?? []);
				if (sameMembers(next, missing)) return;
				missing = next;
				view.dispatch(view.state.tr.setMeta(wikiLinkResolutionKey, true));
			});
			// A link only changes state when a note with its name appears or one it found goes away.
			const unregister = registerPreviewInvalidator((path, removed) => {
				if (!isMarkdownPath(path)) return;
				const name = noteName(path);
				const affected = targets.some(
					(target) => noteName(target) === name && missing.has(target) !== removed,
				);
				if (affected) void queryClient.invalidateQueries({ queryKey: MISSING_QUERY_ROOT });
			});
			return {
				update: (nextView, prevState) => {
					if (nextView.state.doc === prevState.doc) return;
					const nextTargets = noteLinkTargets(nextView.state.doc);
					if (nextTargets.join("\n") === targets.join("\n")) return;
					targets = nextTargets;
					observer.setOptions(missingQuery(targets));
				},
				destroy: () => {
					unsubscribe();
					unregister();
				},
			};
		},
	});
}
