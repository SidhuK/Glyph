import { TauriInvokeError } from "./tauri";

export function extractErrorMessage(error: unknown): string {
	if (error instanceof TauriInvokeError) return error.message;
	if (error instanceof Error) return error.message;
	return String(error);
}
