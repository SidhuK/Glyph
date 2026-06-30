import { i18n } from "../i18n";
import type { GitSyncStatus } from "./tauri";
import { invoke } from "./tauri";

function redactRemoteUrl(remote: string): string {
	const removeQueryAndFragment = (value: string) =>
		value.replace(/[?#].*$/, "");
	try {
		if (remote.startsWith("git@")) {
			return removeQueryAndFragment(remote);
		}
		const url = new URL(remote);
		if (url.username || url.password) {
			url.username = "";
			url.password = "";
		}
		url.search = "";
		url.hash = "";
		return url.toString();
	} catch {
		return removeQueryAndFragment(
			remote.replace(/^([^:]+):\/\/[^@/]+@/, "$1://"),
		);
	}
}

export function shouldPromptForAutoSync(
	status: GitSyncStatus | null,
): status is GitSyncStatus {
	return (
		status?.configured === true &&
		status?.repo_mode === "adopted_existing_repo" &&
		status?.auto_sync_prompted === false
	);
}

export async function promptForAutoSync(
	status: GitSyncStatus,
): Promise<boolean> {
	const remote = status.remote_url ?? status.detected_remote_url;
	const branch = status.branch ?? status.detected_branch ?? "main";
	const remoteLabel = remote
		? `${redactRemoteUrl(remote)} (${branch})`
		: i18n.t("gitSync.autoSync.remoteFallback", { ns: "app" });

	const { confirm } = await import("@tauri-apps/plugin-dialog");
	return confirm(i18n.t("gitSync.autoSync.body", { ns: "app", remoteLabel }), {
		title: i18n.t("gitSync.autoSync.title", { ns: "app" }),
		okLabel: i18n.t("gitSync.autoSync.okLabel", { ns: "app" }),
		cancelLabel: i18n.t("gitSync.autoSync.cancelLabel", { ns: "app" }),
	});
}

export async function completeAutoSyncPrompt(enable: boolean): Promise<void> {
	await invoke("git_sync_config_update", {
		patch: {
			...(enable ? { enabled: true } : {}),
			auto_sync_prompted: true,
		},
	});
}
