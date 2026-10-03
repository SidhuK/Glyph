import { skipToken, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSpace } from "../../../contexts/SpaceContext";
import { i18n } from "../../../i18n";
import {
	type AiEditFile,
	type AiEditOperation,
	type AiEditResolution,
	type AiNoteEditId,
	type AiOperationId,
	TauriInvokeError,
	invoke,
} from "../../../lib/tauri";
import { useAiPanelSession } from "../aiPanelSession";
import { useAIConversation } from "./useRigChat";

const REVIEW_REFRESH_MS = 1500;
const REVIEW_QUERY_KEY = ["ai", "edits"] as const;
const UUID_PATTERN = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOperationId(value: unknown): value is AiOperationId {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

function isNoteEditId(value: unknown): value is AiNoteEditId {
	return typeof value === "string" && UUID_PATTERN.test(value);
}

function isFileEdit(value: unknown): value is AiEditFile {
	return (
		isRecord(value) &&
		(value.before === null || typeof value.before === "string") &&
		(value.after === null || typeof value.after === "string")
	);
}

function isNoteEdit(value: unknown): value is AiEditOperation["edits"][number] {
	return (
		isRecord(value) &&
		isNoteEditId(value.id) &&
		(value.status === "pending" ||
			value.status === "accepted" ||
			value.status === "rejected" ||
			value.status === "undone") &&
		isRecord(value.files) &&
		Object.values(value.files).every(isFileEdit)
	);
}

function isOperation(value: unknown): value is AiEditOperation {
	return (
		isRecord(value) &&
		isOperationId(value.job_id) &&
		typeof value.created_at_ms === "number" &&
		Number.isSafeInteger(value.created_at_ms) &&
		value.created_at_ms >= 0 &&
		typeof value.finished === "boolean" &&
		typeof value.recovery_required === "boolean" &&
		Array.isArray(value.edits) &&
		value.edits.every(isNoteEdit)
	);
}

export function reviewErrorMessage(error: unknown): string {
	const raw = error instanceof TauriInvokeError ? error.raw : error;
	if (isRecord(raw)) {
		switch (raw.kind) {
			case "conflict":
				return i18n.t("aiEdits.errors.conflict", {
					ns: "editor",
					path: typeof raw.path === "string" ? raw.path : "",
				});
			case "busy":
			case "recovery_required":
			case "invalid_operation":
			case "already_reviewed":
			case "invalid_path":
			case "unsupported_file":
			case "file_exists":
			case "file_not_found":
			case "patch_mismatch":
			case "cancelled":
				return i18n.t(`aiEdits.errors.${raw.kind}`, { ns: "editor" });
			case "failed":
				return i18n.t("aiEdits.errors.failed", {
					ns: "editor",
					detail: typeof raw.message === "string" ? raw.message : "",
				});
		}
	}
	if (error instanceof Error && !(error instanceof TauriInvokeError)) return error.message;
	return i18n.t("aiEdits.errors.failed", { ns: "editor", detail: "" });
}

export function useAiEditReview() {
	const { spacePath } = useSpace();
	const { jobId } = useAiPanelSession();
	const { chat } = useAIConversation();
	const client = useQueryClient();
	const busy = chat.status === "submitted" || chat.status === "streaming";
	const queryKey = [...REVIEW_QUERY_KEY, spacePath, jobId] as const;
	const review = useQuery({
		queryKey,
		queryFn:
			spacePath && jobId
				? async () => {
						const data: unknown = await invoke("ai_edits_list", { thread_id: jobId });
						if (!Array.isArray(data) || !data.every(isOperation)) {
							throw new Error(i18n.t("aiEdits.errors.invalid_response", { ns: "editor" }));
						}
						return data;
					}
				: skipToken,
		// Refresh unfinished reviews, including work finishing after cancellation.
		refetchInterval: (query) =>
			busy ||
			query.state.data?.some(
				(operation) =>
					!operation.finished ||
					operation.recovery_required ||
					operation.edits.some((edit) => edit.status === "pending"),
			)
				? REVIEW_REFRESH_MS
				: false,
	});
	const resolve = useMutation({
		mutationFn: (args: AiEditResolution) => invoke("ai_edits_resolve", args),
		onSettled: () => client.invalidateQueries({ queryKey: REVIEW_QUERY_KEY }),
	});
	return { review, resolve, chat, busy };
}
