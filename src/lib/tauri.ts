import { invoke as tauriInvoke } from "@tauri-apps/api/core";

export interface AppInfo {
  name: string;
  version: string;
  identifier: string;
}

export interface VaultInfo {
  root: string;
  schema_version: number;
}

export interface NoteMeta {
  id: string;
  title: string;
  created: string;
  updated: string;
}

export interface NoteDoc {
  meta: NoteMeta;
  markdown: string;
}

export interface AttachmentResult {
  asset_rel_path: string;
  markdown: string;
}

type CommandDef<Args, Result> = { args: Args; result: Result };

interface TauriCommands {
  greet: CommandDef<{ name: string }, string>;
  ping: CommandDef<void, string>;
  app_info: CommandDef<void, AppInfo>;
  vault_create: CommandDef<{ path: string }, VaultInfo>;
  vault_open: CommandDef<{ path: string }, VaultInfo>;
  vault_get_current: CommandDef<void, string | null>;
  notes_list: CommandDef<void, NoteMeta[]>;
  note_create: CommandDef<{ title: string }, NoteMeta>;
  note_read: CommandDef<{ id: string }, NoteDoc>;
  note_write: CommandDef<{ id: string; markdown: string }, void>;
  note_delete: CommandDef<{ id: string }, void>;
  note_attach_file: CommandDef<{ note_id: string; source_path: string }, AttachmentResult>;
}

export class TauriInvokeError extends Error {
  raw: unknown;

  constructor(message: string, raw: unknown) {
    super(message);
    this.name = "TauriInvokeError";
    this.raw = raw;
  }
}

function errorMessage(raw: unknown): string {
  if (raw instanceof Error) return raw.message;
  if (typeof raw === "string") return raw;
  if (raw && typeof raw === "object") {
    const maybeMessage = (raw as Record<string, unknown>)["message"];
    if (typeof maybeMessage === "string") return maybeMessage;
    const maybeError = (raw as Record<string, unknown>)["error"];
    if (typeof maybeError === "string") return maybeError;
  }
  return "Unknown error";
}

type ArgsTuple<K extends keyof TauriCommands> =
  TauriCommands[K]["args"] extends void ? [] : [TauriCommands[K]["args"]];

export async function invoke<K extends keyof TauriCommands>(
  command: K,
  ...args: ArgsTuple<K>
): Promise<TauriCommands[K]["result"]> {
  try {
    const payload = (args[0] ?? {}) as Record<string, unknown>;
    return (await tauriInvoke(command as string, payload)) as TauriCommands[K]["result"];
  } catch (raw) {
    throw new TauriInvokeError(errorMessage(raw), raw);
  }
}
