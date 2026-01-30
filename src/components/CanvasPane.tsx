import "@xyflow/react/dist/style.css";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";

export type CanvasNode = Node<Record<string, unknown>, string>;
export type CanvasEdge = Edge<Record<string, unknown>>;

export interface CanvasDocLike {
  version: number;
  id: string;
  title: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

interface CanvasPaneProps {
  doc: CanvasDocLike | null;
  onSave: (doc: CanvasDocLike) => Promise<void>;
  onOpenNote: (noteId: string) => void;
  activeNoteId: string | null;
  activeNoteTitle: string | null;
}

const NoteNode = memo(function NoteNode({ data }: { data: Record<string, unknown> }) {
  const title = typeof data.title === "string" ? data.title : "Note";
  const noteId = typeof data.noteId === "string" ? data.noteId : "";
  return (
    <div className="rfNode rfNodeNote" title={noteId}>
      <div className="rfNodeTitle">{title}</div>
      <div className="rfNodeSub mono">{noteId ? `${noteId.slice(0, 8)}…` : ""}</div>
    </div>
  );
});

const TextNode = memo(function TextNode({ data }: { data: Record<string, unknown> }) {
  const text = typeof data.text === "string" ? data.text : "";
  return (
    <div className="rfNode rfNodeText">
      <div className="rfNodeTitle">Text</div>
      <div className="rfNodeBody">{text}</div>
    </div>
  );
});

const LinkNode = memo(function LinkNode({ data }: { data: Record<string, unknown> }) {
  const url = typeof data.url === "string" ? data.url : "";
  return (
    <div className="rfNode rfNodeLink">
      <div className="rfNodeTitle">Link</div>
      <div className="rfNodeBody mono">{url}</div>
    </div>
  );
});

export default function CanvasPane({ doc, onSave, onOpenNote, activeNoteId, activeNoteTitle }: CanvasPaneProps) {
  const saveTimerRef = useRef<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string>("");

  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>(doc?.nodes ?? []);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CanvasEdge>(doc?.edges ?? []);

  useEffect(() => {
    setSaveError("");
    if (!doc) {
      setNodes([]);
      setEdges([]);
      return;
    }
    setNodes(doc.nodes ?? []);
    setEdges(doc.edges ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc?.id]);

  const nodeTypes = useMemo(
    () => ({
      note: NoteNode,
      text: TextNode,
      link: LinkNode,
    }),
    [],
  );

  const scheduleSave = useCallback(
    (nextNodes: CanvasNode[], nextEdges: CanvasEdge[]) => {
      if (!doc) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(async () => {
        setIsSaving(true);
        setSaveError("");
        try {
          await onSave({
            version: doc.version,
            id: doc.id,
            title: doc.title,
            nodes: nextNodes,
            edges: nextEdges,
          });
        } catch (e) {
          setSaveError(e instanceof Error ? e.message : String(e));
        } finally {
          setIsSaving(false);
        }
      }, 400);
    },
    [doc, onSave],
  );

  useEffect(() => {
    if (!doc) return;
    scheduleSave(nodes, edges);
  }, [doc, edges, nodes, scheduleSave]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds));
    },
    [setEdges],
  );

  const onAddText = useCallback(() => {
    const text = window.prompt("Text node:", "Hello");
    if (text == null) return;
    setNodes((prev) => {
      const pos = prev[prev.length - 1]?.position ?? { x: 0, y: 0 };
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "text",
          position: { x: pos.x + 40, y: pos.y + 40 },
          data: { text },
        },
      ];
    });
  }, [setNodes]);

  const onAddLink = useCallback(() => {
    const url = window.prompt("Link URL:", "https://");
    if (!url) return;
    setNodes((prev) => {
      const pos = prev[prev.length - 1]?.position ?? { x: 0, y: 0 };
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "link",
          position: { x: pos.x + 40, y: pos.y + 40 },
          data: { url },
        },
      ];
    });
  }, [setNodes]);

  const onAddNote = useCallback(() => {
    if (!activeNoteId) return;
    setNodes((prev) => {
      const pos = prev[prev.length - 1]?.position ?? { x: 0, y: 0 };
      return [
        ...prev,
        {
          id: crypto.randomUUID(),
          type: "note",
          position: { x: pos.x + 40, y: pos.y + 40 },
          data: { noteId: activeNoteId, title: activeNoteTitle ?? "Note" },
        },
      ];
    });
  }, [activeNoteId, activeNoteTitle, setNodes]);

  const onNodeDoubleClick: NodeMouseHandler = useCallback(
    (_evt, node) => {
      if (node.type === "note") {
        const noteId = (node.data as Record<string, unknown>)?.noteId;
        if (typeof noteId === "string") onOpenNote(noteId);
        return;
      }
      if (node.type === "text") {
        const current =
          typeof (node.data as Record<string, unknown>)?.text === "string"
            ? ((node.data as Record<string, unknown>).text as string)
            : "";
        const next = window.prompt("Edit text:", current);
        if (next == null) return;
        setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, data: { ...(n.data ?? {}), text: next } } : n)));
      }
      if (node.type === "link") {
        const current =
          typeof (node.data as Record<string, unknown>)?.url === "string"
            ? ((node.data as Record<string, unknown>).url as string)
            : "";
        const next = window.prompt("Edit URL:", current);
        if (!next) return;
        setNodes((prev) => prev.map((n) => (n.id === node.id ? { ...n, data: { ...(n.data ?? {}), url: next } } : n)));
      }
    },
    [onOpenNote, setNodes],
  );

  if (!doc) {
    return <div className="canvasEmpty">Open/create a vault and select a canvas.</div>;
  }

  return (
    <div className="canvasPane">
      <div className="canvasToolbar">
        <div className="canvasToolbarLeft">
          <div className="canvasTitle">{doc.title}</div>
          {isSaving ? <div className="canvasStatus">Saving…</div> : <div className="canvasStatus">Saved</div>}
        </div>
        <div className="canvasToolbarRight">
          <button type="button" onClick={onAddText}>
            Add text
          </button>
          <button type="button" onClick={onAddLink}>
            Add link
          </button>
          <button type="button" onClick={onAddNote} disabled={!activeNoteId}>
            Add note
          </button>
        </div>
      </div>

      <div className="canvasBody">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeDoubleClick={onNodeDoubleClick}
          nodeTypes={nodeTypes}
          fitView
        >
          <Background />
          <MiniMap />
          <Controls />
        </ReactFlow>
      </div>

      {saveError ? <div className="canvasError">{saveError}</div> : null}
    </div>
  );
}
