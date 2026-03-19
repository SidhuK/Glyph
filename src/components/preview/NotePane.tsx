import { useEffect, useRef, useState } from "react";
import { useSpace } from "../../contexts";
import { isDatabaseNote } from "../../lib/database/isDatabaseNote";
import { extractErrorMessage } from "../../lib/errorUtils";
import { type TextFileDoc, invoke } from "../../lib/tauri";
import { DatabasePane } from "../database/DatabasePane";
import { MarkdownEditorPane } from "./MarkdownEditorPane";

interface NotePaneProps {
	relPath: string;
	onOpenFile: (relPath: string) => Promise<void>;
	onDirtyChange?: (dirty: boolean) => void;
}

interface CachedNoteRoute {
	kind: "markdown" | "database";
	doc: TextFileDoc | null;
}

const noteRouteCache = new Map<string, CachedNoteRoute>();

function cacheKey(spacePath: string | null, relPath: string): string {
	return `${spacePath ?? "__no-space__"}::${relPath}`;
}

function setCachedRoute(key: string, route: CachedNoteRoute) {
	noteRouteCache.set(key, route);
}

export function NotePane({
	relPath,
	onOpenFile,
	onDirtyChange,
}: NotePaneProps) {
	const { spacePath } = useSpace();
	const requestIdRef = useRef(0);
	const routeKey = cacheKey(spacePath, relPath);
	const cached = noteRouteCache.get(routeKey);
	const [noteKind, setNoteKind] = useState<"loading" | "markdown" | "database">(
		cached?.kind ?? "loading",
	);
	const [doc, setDoc] = useState<TextFileDoc | null>(cached?.doc ?? null);
	const [error, setError] = useState("");

	useEffect(() => {
		const cachedRoute = noteRouteCache.get(routeKey);
		setNoteKind(cachedRoute?.kind ?? "loading");
		setDoc(cachedRoute?.doc ?? null);
		setError("");

		const requestId = requestIdRef.current + 1;
		requestIdRef.current = requestId;

		void invoke("space_read_text", { path: relPath })
			.then((nextDoc: TextFileDoc) => {
				if (requestIdRef.current !== requestId) return;
				const kind = isDatabaseNote(nextDoc.text) ? "database" : "markdown";
				setCachedRoute(routeKey, { kind, doc: nextDoc });
				setDoc(nextDoc);
				setNoteKind(kind);
			})
			.catch((nextError) => {
				if (requestIdRef.current !== requestId) return;
				setError(extractErrorMessage(nextError));
				setNoteKind("markdown");
				setDoc(null);
			});
	}, [relPath, routeKey]);

	if (noteKind === "loading") {
		return <div className="mainEmptyState">Loading note…</div>;
	}

	if (noteKind === "database") {
		return (
			<DatabasePane
				relPath={relPath}
				onOpenFile={onOpenFile}
				onDirtyChange={onDirtyChange}
			/>
		);
	}

	return (
		<MarkdownEditorPane
			relPath={relPath}
			onDirtyChange={onDirtyChange}
			initialDoc={doc}
			initialError={error}
		/>
	);
}
