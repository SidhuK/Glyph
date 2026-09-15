import { useQuery } from "@tanstack/react-query";
import {
	type Dispatch,
	type SetStateAction,
	memo,
	startTransition,
	useCallback,
	useDeferredValue,
	useLayoutEffect,
	useMemo,
	useState,
} from "react";
import { extractErrorMessage } from "../../lib/errorUtils";
import { noteDocumentQueryOptions } from "../../lib/navigationPrefetch";
import type { GitCommitDiff, TextFileDoc } from "../../lib/tauri";
import type { CreateMarkdownFileOptions, ExtractToNoteActions } from "../editor/types";
import { MarkdownEditorPane } from "../preview/MarkdownEditorPane";
import { NoteNavigationPreview } from "../preview/NoteNavigationPreview";
import { CanvasPaneAwait } from "./CanvasPaneAwait";

interface MarkdownPaneContentProps {
	viewerPath: string;
	focused: boolean;
	createMarkdownFileAtPath: (options: CreateMarkdownFileOptions) => Promise<string | null>;
	onOpenFile: (path: string) => Promise<void>;
	onOpenFileInNewTab: (path: string) => Promise<void>;
	setDirtyByPath: Dispatch<SetStateAction<Record<string, boolean>>>;
	onInfoSidebarOpenChange: (open: boolean) => void;
}

const NoteEditor = memo(MarkdownEditorPane);

export const MarkdownPaneContent = memo(function MarkdownPaneContent({
	viewerPath,
	focused,
	createMarkdownFileAtPath,
	onOpenFile,
	onOpenFileInNewTab,
	setDirtyByPath,
	onInfoSidebarOpenChange,
}: MarkdownPaneContentProps) {
	const query = useQuery({
		...noteDocumentQueryOptions(viewerPath),
		// The document session revalidates on open and handles filesystem events.
		refetchOnMount: false,
		refetchOnWindowFocus: false,
		refetchOnReconnect: false,
	});
	const deferredDoc = useDeferredValue<TextFileDoc | null>(query.data ?? null, null);
	const request = useMemo(() => ({ path: viewerPath }), [viewerPath]);
	const [paintedRequest, setPaintedRequest] = useState<typeof request | null>(null);
	const [readyRequest, setReadyRequest] = useState<typeof request | null>(null);
	const handleContentReady = useCallback(
		(path: string) => {
			if (path !== request.path) return;
			setReadyRequest(request);
		},
		[request],
	);
	const hasDocument = Boolean(query.data);
	useLayoutEffect(() => {
		if (!hasDocument) return;
		// Let the requested note's reading view paint before synchronous Tiptap
		// work starts. Cancel both frame callbacks when another note is selected.
		let frame = requestAnimationFrame(() => {
			frame = requestAnimationFrame(() => {
				startTransition(() => setPaintedRequest(request));
			});
		});
		return () => cancelAnimationFrame(frame);
	}, [hasDocument, request]);
	// This is the displayed document, independent of the requested path. A
	// response for a note skipped during navigation must never become visible.
	const [lastDocument, setLastDocument] = useState<TextFileDoc | null>(null);
	const readyDoc =
		paintedRequest === request && deferredDoc?.rel_path === viewerPath ? deferredDoc : undefined;
	if (readyDoc && readyDoc !== lastDocument) setLastDocument(readyDoc);
	const doc = query.isError && !query.data ? undefined : (readyDoc ?? lastDocument);
	const displayedPath = doc?.rel_path ?? viewerPath;
	const pending =
		!(query.isError && !query.data) &&
		(displayedPath !== viewerPath || readyRequest !== request || !readyDoc);
	const [gitSelection, setGitSelection] = useState<{
		request: typeof request;
		diff: GitCommitDiff | null;
	} | null>(null);
	const gitDiff = gitSelection?.request === request ? gitSelection.diff : null;
	const setGitDiff = useCallback(
		(diff: GitCommitDiff | null) => setGitSelection({ request, diff }),
		[request],
	);
	const extractToNoteActions = useMemo<ExtractToNoteActions>(
		() => ({
			createMarkdownFile: createMarkdownFileAtPath,
			openNote: onOpenFile,
			openNoteInNewTab: onOpenFileInNewTab,
		}),
		[createMarkdownFileAtPath, onOpenFile, onOpenFileInNewTab],
	);
	const handleDirtyChange = useCallback(
		(dirty: boolean) => {
			setDirtyByPath((previous) =>
				previous[displayedPath] === dirty ? previous : { ...previous, [displayedPath]: dirty },
			);
		},
		[displayedPath, setDirtyByPath],
	);

	if (!doc && !query.data && !query.isError) return <CanvasPaneAwait variant="home" />;

	return (
		<div className="noteNavigationContent" aria-busy={pending}>
			{pending ? (
				query.data ? (
					<NoteNavigationPreview markdown={query.data.text} />
				) : (
					<CanvasPaneAwait variant="home" />
				)
			) : null}
			<div
				className="noteNavigationEditor"
				data-pending={pending || undefined}
				inert={pending}
				aria-hidden={pending || undefined}
			>
				{doc || query.isError ? (
					<NoteEditor
						onContentReady={handleContentReady}
						relPath={displayedPath}
						initialDoc={doc ?? null}
						initialDocValidated={
							displayedPath !== viewerPath || (query.isSuccess && query.isFetchedAfterMount)
						}
						initialError={query.isError ? extractErrorMessage(query.error) : ""}
						extractToNoteActions={extractToNoteActions}
						active={focused}
						onInfoSidebarOpenChange={focused ? onInfoSidebarOpenChange : undefined}
						gitDiff={gitDiff}
						onGitDiffChange={setGitDiff}
						onDirtyChange={handleDirtyChange}
					/>
				) : null}
			</div>
		</div>
	);
});
