import { useCallback, useEffect } from "react";
import type { UseFileTreeResult } from "../../hooks/useFileTree";
import { invoke } from "../../lib/tauri";
import {
	isImagePath,
	isMarkdownCreatablePath,
	isMarkdownPath,
	isPdfPath,
	normalizeRelPath,
	parentDir,
} from "../../utils/path";
import {
	MARKDOWN_LINK_CLICK_EVENT,
	type MarkdownLinkClickDetail,
	PERSON_CLICK_EVENT,
	type PersonClickDetail,
	TAG_CLICK_EVENT,
	type TagClickDetail,
	WIKI_LINK_CLICK_EVENT,
	type WikiLinkClickDetail,
} from "../editor/markdown/editorEvents";

interface UseWorkspaceLinkEventsArgs {
	activeMarkdownTabPath: string | null;
	fileTree: UseFileTreeResult;
	openPalette: (tab: "commands" | "search", query?: string) => void;
	openWorkspaceFile: (path: string) => Promise<void>;
	setError: (error: string) => void;
}

export function useWorkspaceLinkEvents({
	activeMarkdownTabPath,
	fileTree,
	openPalette,
	openWorkspaceFile,
	setError,
}: UseWorkspaceLinkEventsArgs) {
	const openOrCreateWikiLinkTarget = useCallback(
		async (rawTarget: string) => {
			const targetWithoutAnchor = rawTarget.split("#", 1)[0] ?? rawTarget;
			const normalizedTarget = normalizeRelPath(targetWithoutAnchor);
			if (!normalizedTarget) return;
			if (isPdfPath(normalizedTarget)) {
				const resolved = await invoke("space_resolve_wikilink", {
					target: normalizedTarget,
				});
				if (resolved) {
					await openWorkspaceFile(resolved);
					return;
				}
				setError(`Could not resolve PDF wikilink: ${rawTarget}`);
				return;
			}
			if (!isMarkdownCreatablePath(normalizedTarget)) {
				setError(`Only markdown notes are creatable via [[...]]: ${rawTarget}`);
				return;
			}

			const resolved = await invoke("space_resolve_wikilink", {
				target: normalizedTarget,
			});
			if (resolved) {
				await openWorkspaceFile(resolved);
				return;
			}

			const sourceDir = activeMarkdownTabPath
				? parentDir(activeMarkdownTabPath)
				: "";
			const hasExplicitPath = normalizedTarget.includes("/");
			const nextRelPathBase =
				hasExplicitPath || !sourceDir
					? normalizedTarget
					: `${sourceDir}/${normalizedTarget}`;
			const nextRelPath = isMarkdownPath(nextRelPathBase)
				? nextRelPathBase
				: `${nextRelPathBase}.md`;
			const createdPath = await fileTree.createMarkdownFileAtPath({
				path: nextRelPath,
				text: "",
				openParentDir: parentDir(nextRelPath),
			});
			if (createdPath) {
				await openWorkspaceFile(createdPath);
				return;
			}

			setError("");
			const fallbackResolved = await invoke("space_resolve_wikilink", {
				target: normalizedTarget,
			});
			if (fallbackResolved) {
				await openWorkspaceFile(fallbackResolved);
				return;
			}

			setError(`Could not resolve wikilink: ${rawTarget}`);
		},
		[activeMarkdownTabPath, fileTree, openWorkspaceFile, setError],
	);

	useEffect(() => {
		const onWikiLinkClick = (event: Event) => {
			const detail = (event as CustomEvent<WikiLinkClickDetail>).detail;
			if (!detail?.target) return;
			void (async () => {
				try {
					const targetWithoutAnchor =
						detail.target.split("#", 1)[0] ?? detail.target;
					const normalizedTarget = normalizeRelPath(targetWithoutAnchor);
					if (!normalizedTarget) return;

					if (detail.embed || isImagePath(normalizedTarget)) {
						const resolvedImage = await invoke("space_resolve_image_wikilink", {
							target: normalizedTarget,
						});
						if (resolvedImage) {
							await openWorkspaceFile(resolvedImage);
							return;
						}
						setError(`Could not resolve image wikilink: ${detail.target}`);
						return;
					}

					if (isPdfPath(normalizedTarget)) {
						await openOrCreateWikiLinkTarget(detail.target);
						return;
					}

					if (!isMarkdownCreatablePath(normalizedTarget)) {
						setError(
							`Unsupported non-markdown wikilink target: ${detail.target}`,
						);
						return;
					}
					await openOrCreateWikiLinkTarget(detail.target);
				} catch (e) {
					setError(
						`Failed to open wikilink: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			})();
		};
		const onMarkdownLinkClick = (event: Event) => {
			const detail = (event as CustomEvent<MarkdownLinkClickDetail>).detail;
			if (!detail?.href) return;
			void (async () => {
				try {
					const resolved = await invoke("space_resolve_markdown_link", {
						href: detail.href,
						sourcePath: detail.sourcePath,
					});
					if (resolved) {
						await openWorkspaceFile(resolved);
						return;
					}
					const wikiFallback = await invoke("space_resolve_wikilink", {
						target: detail.href,
					});
					if (wikiFallback) {
						await openWorkspaceFile(wikiFallback);
						return;
					}
					setError(`Could not resolve markdown link: ${detail.href}`);
				} catch (e) {
					setError(
						`Failed to open markdown link: ${e instanceof Error ? e.message : String(e)}`,
					);
				}
			})();
		};
		const onTagClick = (event: Event) => {
			const detail = (event as CustomEvent<TagClickDetail>).detail;
			if (!detail?.tag) return;
			const tag = detail.tag.startsWith("#") ? detail.tag : `#${detail.tag}`;
			openPalette("search", detail.tagOnly ? `${tag} tag:only` : tag);
		};
		const onPersonClick = (event: Event) => {
			const detail = (event as CustomEvent<PersonClickDetail>).detail;
			if (!detail?.handle) return;
			openPalette(
				"search",
				detail.handle.startsWith("@") ? detail.handle : `@${detail.handle}`,
			);
		};
		window.addEventListener(WIKI_LINK_CLICK_EVENT, onWikiLinkClick);
		window.addEventListener(MARKDOWN_LINK_CLICK_EVENT, onMarkdownLinkClick);
		window.addEventListener(TAG_CLICK_EVENT, onTagClick);
		window.addEventListener(PERSON_CLICK_EVENT, onPersonClick);
		return () => {
			window.removeEventListener(WIKI_LINK_CLICK_EVENT, onWikiLinkClick);
			window.removeEventListener(
				MARKDOWN_LINK_CLICK_EVENT,
				onMarkdownLinkClick,
			);
			window.removeEventListener(TAG_CLICK_EVENT, onTagClick);
			window.removeEventListener(PERSON_CLICK_EVENT, onPersonClick);
		};
	}, [openOrCreateWikiLinkTarget, openPalette, openWorkspaceFile, setError]);
}
