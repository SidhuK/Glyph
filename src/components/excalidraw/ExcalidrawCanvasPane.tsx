import { type DragEndEvent, useDragDropMonitor, useDroppable } from "@dnd-kit/react";
import {
	CaptureUpdateAction,
	Excalidraw,
	convertToExcalidrawElements,
	serializeAsJSON,
	viewportCoordsToSceneCoords,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useCallback, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useIsDarkTheme } from "../../hooks/useIsDarkTheme";
import { extractErrorMessage } from "../../lib/errorUtils";
import {
	InvalidAgentCanvasError,
	noteCardSkeleton,
	notePathFromExcalidrawElement,
} from "../../lib/excalidrawDocument";
import { isMarkdownPath } from "../../utils/path";
import { FILE_TREE_ENTRY_TYPE } from "../filetree/fileTreeDnd";
import { CanvasSaveQueue } from "./CanvasSaveQueue";
import styles from "./ExcalidrawCanvasPane.module.css";
import { useCanvasPanningHint } from "./useCanvasPanningHint";
import {
	type LoadedCanvasDocument,
	useCanvasSaveMutation,
	useExcalidrawDocumentQuery,
} from "./useExcalidrawDocument";

const CANVAS_DROP_COLLISION_PRIORITY = 3;

interface ExcalidrawCanvasPaneProps {
	relPath: string;
	active: boolean;
	onOpenNote: (path: string) => Promise<void>;
	onDirtyChange: (dirty: boolean) => void;
}

export function ExcalidrawCanvasPane(props: ExcalidrawCanvasPaneProps) {
	const documentQuery = useExcalidrawDocumentQuery(props.relPath);

	if (documentQuery.isPending) {
		return <div className={styles.root} aria-busy="true" />;
	}
	if (documentQuery.isError) {
		return <CanvasLoadError error={documentQuery.error} />;
	}
	return (
		<LoadedExcalidrawCanvas
			key={documentQuery.data.revision}
			{...props}
			loaded={documentQuery.data}
		/>
	);
}

function CanvasLoadError({ error }: { error: unknown }) {
	const { t } = useTranslation("shell");
	const message =
		error instanceof InvalidAgentCanvasError
			? t("canvas.invalidAgentCanvas")
			: extractErrorMessage(error);
	return (
		<div className={styles.root} role="alert">
			<div className={styles.error}>{t("canvas.loadError", { message })}</div>
		</div>
	);
}

function LoadedExcalidrawCanvas({
	relPath,
	active,
	onOpenNote,
	onDirtyChange,
	loaded,
}: ExcalidrawCanvasPaneProps & { loaded: LoadedCanvasDocument }) {
	const { t } = useTranslation("shell");
	const dark = useIsDarkTheme();
	const [saveError, setSaveError] = useState<string | null>(null);
	const { panningHintHidden, onSceneChange } = useCanvasPanningHint();
	const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
	const saveMutation = useCanvasSaveMutation(relPath);
	const mutationRef = useRef(saveMutation);
	mutationRef.current = saveMutation;
	const saveQueue = useMemo(
		() =>
			new CanvasSaveQueue({
				initialText: loaded.document.text,
				initialMtimeMs: loaded.document.mtime_ms,
				readCurrentText: () => {
					const api = apiRef.current;
					return api
						? serializeAsJSON(api.getSceneElements(), api.getAppState(), api.getFiles(), "local")
						: null;
				},
				write: async (text, baseMtimeMs) => {
					const result = await mutationRef.current.mutateAsync({ text, baseMtimeMs });
					return result.mtime_ms;
				},
				onDirtyChange,
				onError: (error) => setSaveError(extractErrorMessage(error)),
			}),
		[loaded.document.mtime_ms, loaded.document.text, onDirtyChange],
	);
	const { ref: dropRef, isDropTarget } = useDroppable({
		id: `excalidraw-canvas:${relPath}`,
		data: { excalidrawCanvasPath: relPath },
		accept: (source) =>
			source.type === FILE_TREE_ENTRY_TYPE &&
			source.data.kind === "file" &&
			typeof source.data.path === "string" &&
			isMarkdownPath(source.data.path),
		collisionPriority: CANVAS_DROP_COLLISION_PRIORITY,
	});
	const setRootRef = useCallback(
		(node: HTMLDivElement | null) => {
			dropRef(node);
			if (node === null) {
				void saveQueue.flush();
				return;
			}
			if (!active) {
				const focusedElement = node.ownerDocument.activeElement;
				if (focusedElement instanceof HTMLElement && node.contains(focusedElement)) {
					focusedElement.blur();
				}
			}
		},
		[active, dropRef, saveQueue],
	);
	const addNoteCard = useCallback((path: string, clientX: number, clientY: number) => {
		const api = apiRef.current;
		if (!api) return;
		const point = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
		const card = convertToExcalidrawElements([noteCardSkeleton(path, point.x - 140, point.y - 56)]);
		api.updateScene({
			elements: [...api.getSceneElements(), ...card],
			captureUpdate: CaptureUpdateAction.IMMEDIATELY,
		});
	}, []);
	const dragDropHandlers = useMemo(
		() => ({
			onDragEnd(event: DragEndEvent) {
				if (event.canceled) return;
				const source = event.operation.source?.data;
				const target = event.operation.target?.data;
				if (target?.excalidrawCanvasPath !== relPath) return;
				const path =
					source?.kind === "file" && typeof source.path === "string" ? source.path : null;
				if (!path || !isMarkdownPath(path)) return;
				const { x, y } = event.operation.position.current;
				addNoteCard(path, x, y);
			},
		}),
		[addNoteCard, relPath],
	);
	useDragDropMonitor(dragDropHandlers);

	return (
		<div
			ref={setRootRef}
			className={styles.root}
			data-panning-hint-hidden={panningHintHidden || undefined}
		>
			<Excalidraw
				initialData={loaded.scene}
				excalidrawAPI={(api) => {
					apiRef.current = api;
				}}
				theme={dark ? "dark" : "light"}
				autoFocus={active}
				handleKeyboardGlobally={active}
				name={relPath}
				UIOptions={{
					canvasActions: { loadScene: false, saveToActiveFile: false },
				}}
				onChange={(elements, appState) => {
					onSceneChange(elements, appState);
					setSaveError(null);
					saveQueue.enqueue();
				}}
				onLinkOpen={(element, event) => {
					const path = notePathFromExcalidrawElement(element);
					if (!path) return;
					event.preventDefault();
					void onOpenNote(path);
				}}
			/>
			{isDropTarget ? <div className={styles.dropHint}>{t("canvas.dropNote")}</div> : null}
			{saveError ? (
				<div className={styles.error} role="alert">
					{t("canvas.saveError", { message: saveError })}
				</div>
			) : null}
		</div>
	);
}
