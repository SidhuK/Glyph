import { useEffect, useMemo, useState } from "react";
import "./App.css";
import { type AppInfo, TauriInvokeError, invoke } from "./lib/tauri";

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ping, setPing] = useState<string>("");
  const [error, setError] = useState<string>("");

  const versionLabel = useMemo(() => {
    if (!info) return "";
    return `${info.name} • v${info.version}`;
  }, [info]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const appInfo = await invoke("app_info");
        if (!cancelled) setInfo(appInfo);
      } catch (err) {
        const message =
          err instanceof TauriInvokeError ? err.message : err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onPing() {
    setError("");
    setPing("");
    try {
      setPing(await invoke("ping"));
    } catch (err) {
      const message = err instanceof TauriInvokeError ? err.message : err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }

  return (
    <main className="container">
      <h1>Tether</h1>
      <p>{versionLabel}</p>

      <div className="row">
        <button type="button" onClick={onPing}>
          Ping backend
        </button>
      </div>

      {ping ? <p>{ping}</p> : null}
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

export default App;
