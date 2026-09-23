import { useQuery } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../lib/errorUtils";
import { loadSettings } from "../../lib/settings";
import { DURABLE_SETTINGS, writeSidebarLayout } from "../../lib/settings/definitions";
import {
	DEFAULT_SIDEBAR_ORDER,
	DEFAULT_SIDEBAR_VISIBILITY,
	type SidebarOrder,
	type SidebarVisibility,
	type SidebarVisibilityKey,
} from "../../lib/settings/model";
import { useTauriEvent } from "../../lib/tauriEvents";
import { RefreshCw } from "../Icons";
import { Button } from "../ui/shadcn/button";
import { SidebarItems } from "./SidebarItems";
import { SettingsSection } from "./SettingsScaffold";
import { useSettingsValue } from "./useSettingsValue";

export function SidebarSettingsPane() {
	const settingsQuery = useQuery({
		queryKey: ["sidebar-settings"],
		queryFn: () => loadSettings(),
		refetchOnWindowFocus: false,
	});

	if (settingsQuery.error) {
		return (
			<div className="settingsPane settingsError">{extractErrorMessage(settingsQuery.error)}</div>
		);
	}
	if (!settingsQuery.data) return null;

	return (
		<SidebarSettingsContent
			key={settingsQuery.dataUpdatedAt}
			initialVisibility={settingsQuery.data.ui.sidebarVisibility}
			initialOrder={settingsQuery.data.ui.sidebarOrder}
		/>
	);
}

function SidebarSettingsContent({
	initialVisibility,
	initialOrder,
}: {
	initialVisibility: SidebarVisibility;
	initialOrder: SidebarOrder;
}) {
	const { t } = useTranslation("settings.sidebar");
	const [error, setError] = useState("");
	const [isResetting, setIsResetting] = useState(false);
	const visibility = useSettingsValue(
		initialVisibility,
		DURABLE_SETTINGS.sidebarVisibility.write,
		setError,
	);
	const order = useSettingsValue(initialOrder, DURABLE_SETTINGS.sidebarOrder.write, setError);

	useTauriEvent("settings:updated", (payload) => {
		if (payload.ui?.sidebarVisibility) visibility.setValue(payload.ui.sidebarVisibility);
		if (payload.ui?.sidebarOrder) order.setValue(payload.ui.sidebarOrder);
	});

	const onVisibilityChange = useCallback(
		(key: SidebarVisibilityKey, visible: boolean) => {
			visibility.onChange({
				...visibility.value,
				[key]: visible,
				...(key === "newNote" ? { newCanvas: visible } : {}),
			});
		},
		[visibility.onChange, visibility.value],
	);

	const onReset = useCallback(() => {
		setError("");
		setIsResetting(true);
		void writeSidebarLayout({
			visibility: DEFAULT_SIDEBAR_VISIBILITY,
			order: DEFAULT_SIDEBAR_ORDER,
		})
			.then(() => {
				visibility.setValue(DEFAULT_SIDEBAR_VISIBILITY);
				order.setValue(DEFAULT_SIDEBAR_ORDER);
			})
			.catch((cause) => {
				setError(cause instanceof Error ? cause.message : t("resetError"));
			})
			.finally(() => setIsResetting(false));
	}, [order.setValue, visibility.setValue, t]);

	const disabled = visibility.isSaving || order.isSaving || isResetting;

	return (
		<div className="settingsPane">
			{error ? <div className="settingsError">{error}</div> : null}
			<div className="settingsGrid">
				<SettingsSection
					title={t("sectionTitle")}
					description={t("sectionDescription")}
					aside={
						<Button
							type="button"
							variant="outline"
							size="icon-sm"
							aria-label={t("resetToDefaults")}
							title={t("resetToDefaults")}
							disabled={disabled}
							onClick={onReset}
						>
							<RefreshCw size="var(--icon-md)" aria-hidden="true" />
						</Button>
					}
				>
					<SidebarItems
						order={order.value}
						visibility={visibility.value}
						disabled={disabled}
						onReorder={order.onChange}
						onVisibilityChange={onVisibilityChange}
					/>
				</SettingsSection>
			</div>
		</div>
	);
}
