import { extractErrorMessage } from "./errorUtils";

export function isMissingFileError(error: unknown): boolean {
	return /no such file|cannot find the file|path not found|os error 2/i.test(
		extractErrorMessage(error),
	);
}
