import { useCallback, useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import "./App.css";
import { type AppInfo, TauriInvokeError, invoke } from "./lib/tauri";
import { loadSettings, setCurrentVaultPath } from "./lib/settings";

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [ping, setPing] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [recentVaults, setRecentVaults] = useState<string[]>([]);

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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const settings = await loadSettings();
        if (cancelled) return;
        setVaultPath(settings.currentVaultPath);
        setRecentVaults(settings.recentVaultPaths);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!cancelled) setError(message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onPing = useCallback(async () => {
    setError("");
    setPing("");
    try {
      setPing(await invoke("ping"));
    } catch (err) {
      const message = err instanceof TauriInvokeError ? err.message : err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  const onPickVault = useCallback(async () => {
    setError("");
    try {
      const selection = await open({
        title: "Select a vault folder",
        directory: true,
        multiple: false,
      });
      if (!selection) return;
      if (Array.isArray(selection)) {
        if (!selection[0]) return;
        await setCurrentVaultPath(selection[0]);
        setVaultPath(selection[0]);
        setRecentVaults((prev) => [selection[0], ...prev.filter((p) => p !== selection[0])].slice(0, 20));
      } else {
        await setCurrentVaultPath(selection);
        setVaultPath(selection);
        setRecentVaults((prev) => [selection, ...prev.filter((p) => p !== selection)].slice(0, 20));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  return (
    <main className="container">
      <h1>Tether</h1>
      <p>{versionLabel}</p>

      <div className="row">
        <button type="button" onClick={onPing}>
          Ping backend
        </button>
        <button type="button" onClick={onPickVault}>
          Pick vault folder
        </button>
      </div>

      {ping ? <p>{ping}</p> : null}
      <div className="card">
        <h2>Vault</h2>
        <p className="mono">{vaultPath ?? "No vault selected"}</p>
        {recentVaults.length ? (
          <>
            <h3>Recent</h3>
            <ul className="list">
              {recentVaults.map((p) => (
                <li key={p} className="mono">
                  {p}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
      {error ? <p className="error">{error}</p> : null}
    </main>
  );
}

export default App;
