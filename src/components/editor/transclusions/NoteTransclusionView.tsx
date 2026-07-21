import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { dispatchWikiLinkClick } from "../markdown/editorEvents";
import type { WikiLinkAttrs } from "../markdown/wikiLinkTypes";
import { TransclusionBranch, useTransclusion } from "./TransclusionContext";

const NoteInlineEditor = lazy(() =>
	import("../NoteInlineEditor").then((module) => ({
		default: module.NoteInlineEditor,
	})),
);

const TRANSCLUSION_ERROR_KEYS = {
	unresolved: "transclusion.unresolved",
	missing_heading: "transclusion.missingHeading",
	unsupported_block: "transclusion.unsupportedBlock",
	read_error: "transclusion.readError",
} as const;

const ignoreEmbeddedChanges = () => {};

export function NoteTransclusionView({ node }: ReactNodeViewProps) {
	const attrs: WikiLinkAttrs = {
		raw: typeof node.attrs.raw === "string" ? node.attrs.raw : "",
		target: typeof node.attrs.target === "string" ? node.attrs.target : "",
		alias: typeof node.attrs.alias === "string" ? node.attrs.alias : null,
		embed: true,
		anchorKind: node.attrs.anchorKind ?? "none",
		anchor: typeof node.attrs.anchor === "string" ? node.attrs.anchor : null,
		unresolved: Boolean(node.attrs.unresolved),
	};
	const { t } = useTranslation("editor");
	const { depthExceeded, isLoading, recursive, result } =
		useTransclusion(attrs.target, attrs.anchorKind, attrs.anchor);
	const title = attrs.alias || attrs.target.replace(/\.md$/i, "");
	const resultError = result?.error_kind
		? t(TRANSCLUSION_ERROR_KEYS[result.error_kind])
		: null;
	const error = depthExceeded
		? t("transclusion.depthExceeded")
		: recursive
			? t("transclusion.recursive")
			: resultError;

	return (
		<NodeViewWrapper className="noteTransclusion" contentEditable={false}>
			<header className="noteTransclusionHeader">
				<button
					type="button"
					className="noteTransclusionTitle"
					onClick={() => dispatchWikiLinkClick({ ...attrs, embed: false })}
					title={t("transclusion.openSource")}
				>
					{title}
					{attrs.anchor ? ` · ${attrs.anchor}` : ""}
				</button>
			</header>
			<div className="noteTransclusionBody">
				{isLoading ? (
					<div className="noteTransclusionMessage">
						{t("transclusion.loading")}
					</div>
				) : error ? (
					<div className="noteTransclusionMessage is-error">{error}</div>
				) : result?.markdown !== null &&
					result?.markdown !== undefined &&
					result.resolved_path ? (
					<TransclusionBranch resolvedPath={result.resolved_path}>
						<Suspense
							fallback={
								<div className="noteTransclusionMessage">
									{t("transclusion.loading")}
								</div>
							}
						>
							<NoteInlineEditor
								markdown={result.markdown}
								relPath={result.resolved_path}
								mode="preview"
								interactive={false}
								deferHeavyFeatures
								chrome="minimal"
								onChange={ignoreEmbeddedChanges}
							/>
						</Suspense>
					</TransclusionBranch>
				) : (
					<div className="noteTransclusionMessage">
						{t("transclusion.unavailable")}
					</div>
				)}
			</div>
		</NodeViewWrapper>
	);
}
