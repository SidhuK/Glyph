import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useState } from "react";
import { type AiProfile, invoke } from "../../../lib/tauri";
import {
	CODEX_RATE_LIMIT_REFRESH_MS,
	CODEX_RESET_TIME_TICK_MS,
	clampPercent,
	formatRateLimitWindow,
} from "./aiProfileSectionUtils";
import { errMessage } from "./utils";

interface CodexRateLimitItem {
	key: string;
	label: string;
	usedPercent: number;
	windowMinutes: number | null;
	resetsAt: number | null;
}

interface CodexState {
	status: string;
	email: string | null;
	displayName: string | null;
	authMode: string | null;
	rateLimits: CodexRateLimitItem[];
	error: string;
	loading: boolean;
}

const disconnectedState: CodexState = {
	status: "disconnected",
	email: null,
	displayName: null,
	authMode: null,
	rateLimits: [],
	error: "",
	loading: false,
};

const codexAccountQueryKey = ["ai", "codex", "account"] as const;

function dedupeRateLimits(
	rateLimits: CodexRateLimitItem[],
): CodexRateLimitItem[] {
	const deduped = new Map<string, CodexRateLimitItem>();
	for (const item of rateLimits) {
		const dedupeKey =
			typeof item.windowMinutes === "number"
				? `window:${item.windowMinutes}`
				: item.label.toLowerCase();
		const nextItem = { ...item, usedPercent: clampPercent(item.usedPercent) };
		const existing = deduped.get(dedupeKey);
		if (!existing || nextItem.usedPercent > existing.usedPercent) {
			deduped.set(dedupeKey, nextItem);
		}
	}
	return Array.from(deduped.values()).sort((a, b) => {
		const aMinutes = a.windowMinutes ?? Number.MAX_SAFE_INTEGER;
		const bMinutes = b.windowMinutes ?? Number.MAX_SAFE_INTEGER;
		return aMinutes - bMinutes;
	});
}

async function readCodexAccount(): Promise<
	Omit<CodexState, "error" | "loading">
> {
	const info = await invoke("codex_account_read");
	let rateLimits: CodexRateLimitItem[] = [];
	try {
		const limits = await invoke("codex_rate_limits_read");
		rateLimits = dedupeRateLimits(
			(limits.buckets ?? []).flatMap((bucket, bucketIndex) => {
				const bucketName =
					bucket.limit_name || bucket.limit_id || `limit-${bucketIndex + 1}`;
				const windows: CodexRateLimitItem[] = [];
				const pushWindow = (
					kind: "primary" | "secondary",
					window:
						| {
								used_percent: number;
								window_duration_mins?: number | null;
								resets_at?: number | null;
						  }
						| null
						| undefined,
				) => {
					if (!window || !Number.isFinite(window.used_percent)) return;
					const windowMinutes =
						typeof window.window_duration_mins === "number"
							? window.window_duration_mins
							: null;
					windows.push({
						key: `${bucketName}:${kind}`,
						label: formatRateLimitWindow(windowMinutes),
						usedPercent: window.used_percent,
						windowMinutes,
						resetsAt:
							typeof window.resets_at === "number" ? window.resets_at : null,
					});
				};
				pushWindow("primary", bucket.primary);
				pushWindow("secondary", bucket.secondary);
				return windows;
			}),
		);
	} catch {
		// Non-fatal for account status.
	}
	return {
		status: info.status,
		email: info.email ?? null,
		displayName: info.display_name ?? null,
		authMode: info.auth_mode ?? null,
		rateLimits,
	};
}

export function useCodexAccount(provider: AiProfile["provider"] | undefined) {
	const [nowMs, setNowMs] = useState(() => Date.now());
	const isCodexProvider = provider === "codex_chatgpt";
	const queryClient = useQueryClient();
	const accountQuery = useQuery({
		queryKey: codexAccountQueryKey,
		queryFn: readCodexAccount,
		enabled: isCodexProvider,
		refetchInterval: CODEX_RATE_LIMIT_REFRESH_MS,
	});

	useEffect(() => {
		if (!isCodexProvider) return;
		const timer = window.setInterval(() => {
			setNowMs(Date.now());
		}, CODEX_RESET_TIME_TICK_MS);
		return () => window.clearInterval(timer);
	}, [isCodexProvider]);

	const connectMutation = useMutation({
		mutationFn: async () => {
			const started = await invoke("codex_login_start");
			await openUrl(started.auth_url);
			try {
				await invoke("codex_login_complete", { flow_id: started.flow_id });
			} catch (error) {
				if (!/pending/i.test(errMessage(error))) {
					throw error;
				}
			}
		},
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: codexAccountQueryKey });
		},
	});

	const disconnectMutation = useMutation({
		mutationFn: () => invoke("codex_logout"),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: codexAccountQueryKey });
		},
	});

	const handleCodexConnect = useCallback(async () => {
		await connectMutation.mutateAsync();
	}, [connectMutation]);

	const handleCodexDisconnect = useCallback(async () => {
		await disconnectMutation.mutateAsync();
	}, [disconnectMutation]);

	const error =
		(accountQuery.error && errMessage(accountQuery.error)) ||
		(connectMutation.error && errMessage(connectMutation.error)) ||
		(disconnectMutation.error && errMessage(disconnectMutation.error)) ||
		"";
	const codexState = useMemo<CodexState>(() => {
		if (!isCodexProvider) return disconnectedState;
		return {
			...(accountQuery.data ?? disconnectedState),
			error,
			loading:
				accountQuery.isFetching ||
				connectMutation.isPending ||
				disconnectMutation.isPending,
		};
	}, [
		accountQuery.data,
		accountQuery.isFetching,
		connectMutation.isPending,
		disconnectMutation.isPending,
		error,
		isCodexProvider,
	]);

	return {
		codexState,
		nowMs,
		handleCodexConnect,
		handleCodexDisconnect,
	};
}
