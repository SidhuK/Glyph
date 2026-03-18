import { TauriInvokeError } from "./tauri";

export function isMissingFileError(error: unknown): boolean {
	const message =
		error instanceof TauriInvokeError || error instanceof Error
			? error.message
			: String(error);
	return /no such file|cannot find the file|path not found|os error 2/i.test(
		message,
	);
}
