import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { LoaderCircle, Refresh01Icon } from "@hugeicons/core-free-icons";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/shadcn/button";

export function ConnectionsLoadingState({ arranging }: { arranging: boolean }) {
	const { t } = useTranslation("shell");
	return (
		<div className="absolute inset-0 flex items-center justify-center">
			<div className="flex items-center gap-2 text-sm text-muted-foreground">
				<HugeiconsIcon icon={LoaderCircle} className="animate-spin" size="var(--icon-sm)" />
				{arranging ? t("connections.arranging") : t("connections.loading")}
			</div>
		</div>
	);
}

export function ConnectionsErrorState({ error, onRetry }: { error: string; onRetry: () => void }) {
	const { t } = useTranslation("shell");
	return (
		<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
			<div className="flex max-w-md flex-col items-center gap-3 text-center">
				<p className="text-sm text-muted-foreground">{t("connections.loadFailed", { error })}</p>
				<Button type="button" size="sm" onClick={onRetry}>
					<HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" size="var(--icon-md)" />
					{t("connections.retry")}
				</Button>
			</div>
		</div>
	);
}

export function ConnectionsEmptyState() {
	const { t } = useTranslation("shell");
	return (
		<div className="flex h-full min-h-0 flex-1 items-center justify-center p-6">
			<p className="text-sm text-muted-foreground">{t("connections.empty")}</p>
		</div>
	);
}

export function ConnectionsNoConnectedState() {
	const { t } = useTranslation("shell");
	return (
		<p className="relative z-1 flex h-full items-center justify-center text-sm text-muted-foreground">
			{t("connections.noConnected")}
		</p>
	);
}
