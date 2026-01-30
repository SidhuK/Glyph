import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import type { EditorView } from "@codemirror/view";
import type { NoteDoc } from "../lib/tauri";

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

interface NoteEditorProps {
  doc: NoteDoc | null;
  onChangeMarkdown: (markdown: string) => void;
  onSave: (markdown: string) => Promise<void>;
  onAttachFile: () => Promise<string | null>;
}

export const NoteEditor = memo(function NoteEditor({
  doc,
  onChangeMarkdown,
  onSave,
  onAttachFile,
}: NoteEditorProps) {
  const viewRef = useRef<EditorView | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [error, setError] = useState<string>("");
  const saveTimerRef = useRef<number | null>(null);

  const extensions = useMemo(() => [markdown()], []);

  useEffect(() => {
    setError("");
    setSaveState("idle");
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }, [doc?.meta.id]);

  const scheduleSave = useCallback(
    (next: string) => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      setSaveState("dirty");
      saveTimerRef.current = window.setTimeout(async () => {
        setSaveState("saving");
        setError("");
        try {
          await onSave(next);
          setSaveState("saved");
        } catch (e) {
          setSaveState("error");
          setError(e instanceof Error ? e.message : String(e));
        }
      }, 500);
    },
    [onSave],
  );

  const onChange = useCallback(
    (next: string) => {
      onChangeMarkdown(next);
      scheduleSave(next);
    },
    [onChangeMarkdown, scheduleSave],
  );

  const attach = useCallback(async () => {
    try {
      const snippet = await onAttachFile();
      if (!snippet) return;
      const view = viewRef.current;
      if (!view) return;

      const insertion = `\n${snippet}\n`;
      const from = view.state.selection.main.from;
      view.dispatch({
        changes: { from, to: from, insert: insertion },
        selection: { anchor: from + insertion.length },
        scrollIntoView: true,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [onAttachFile]);

  const statusLabel = useMemo(() => {
    if (!doc) return "";
    switch (saveState) {
      case "idle":
        return "";
      case "dirty":
        return "Unsaved changes…";
      case "saving":
        return "Saving…";
      case "saved":
        return "Saved";
      case "error":
        return "Save failed";
    }
  }, [doc, saveState]);

  if (!doc) {
    return (
      <section className="editorPane">
        <div className="editorEmpty">Select a note to start editing.</div>
      </section>
    );
  }

  return (
    <section className="editorPane">
      <div className="editorHeader">
        <div className="editorTitle">{doc.meta.title || "Untitled"}</div>
        <div className="editorActions">
          <button type="button" onClick={attach}>
            Attach file
          </button>
          <div className="editorStatus">{statusLabel}</div>
        </div>
      </div>
      <div className="editorBody">
        <CodeMirror
          value={doc.markdown}
          height="100%"
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
          }}
          extensions={extensions}
          onChange={onChange}
          onCreateEditor={(view) => {
            viewRef.current = view;
          }}
        />
      </div>
      {error ? <div className="editorError">{error}</div> : null}
    </section>
  );
});
