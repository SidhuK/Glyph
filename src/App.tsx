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
  const [vaultSchemaVersion, setVaultSchemaVersion] = useState<number | null>(null);
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

        if (settings.currentVaultPath) {
          try {
            const opened = await invoke("vault_open", { path: settings.currentVaultPath });
            if (!cancelled) setVaultSchemaVersion(opened.schema_version);
          } catch {
            if (!cancelled) setVaultSchemaVersion(null);
          }
        }
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

  const pickDirectory = useCallback(async (): Promise<string | null> => {
    const selection = await open({
      title: "Select a vault folder",
      directory: true,
      multiple: false,
    });
    if (!selection) return null;
    if (Array.isArray(selection)) return selection[0] ?? null;
    return selection;
  }, []);

  const applyVaultSelection = useCallback(async (path: string, mode: "open" | "create") => {
    setError("");
    try {
      const info =
        mode === "create" ? await invoke("vault_create", { path }) : await invoke("vault_open", { path });
      await setCurrentVaultPath(info.root);
      setVaultPath(info.root);
      setVaultSchemaVersion(info.schema_version);
      setRecentVaults((prev) => [info.root, ...prev.filter((p) => p !== info.root)].slice(0, 20));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    }
  }, []);

  const onCreateVault = useCallback(async () => {
    const path = await pickDirectory();
    if (!path) return;
    await applyVaultSelection(path, "create");
  }, [applyVaultSelection, pickDirectory]);

  const onOpenVault = useCallback(async () => {
    const path = await pickDirectory();
    if (!path) return;
    await applyVaultSelection(path, "open");
  }, [applyVaultSelection, pickDirectory]);

  return (
    <main className="container">
      <h1>Tether</h1>
      <p>{versionLabel}</p>

      <div className="row">
        <button type="button" onClick={onPing}>
          Ping backend
        </button>
        <button type="button" onClick={onCreateVault}>
          Create vault
        </button>
        <button type="button" onClick={onOpenVault}>
          Open vault
        </button>
      </div>

      {ping ? <p>{ping}</p> : null}
      <div className="card">
        <h2>Vault</h2>
        <p className="mono">{vaultPath ?? "No vault selected"}</p>
        <p>{vaultSchemaVersion ? `Schema v${vaultSchemaVersion}` : "Not initialized"}</p>
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
