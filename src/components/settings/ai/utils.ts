import { extractErrorMessage } from "../../../lib/errorUtils";

export function errMessage(err: unknown): string {
	return extractErrorMessage(err);
}
