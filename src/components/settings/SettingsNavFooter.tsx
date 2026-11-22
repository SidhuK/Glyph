import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { ArrowUpRight01Icon } from "@hugeicons/core-free-icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import { GLYPH_LINKS } from "../../lib/helpMenu";
import { useLicenseStatus } from "../../lib/license";

export function SettingsNavFooter() {
	const { t } = useTranslation("settings.general");
	const { status } = useLicenseStatus(false);
	const isCommunityBuild = status?.mode === "community_build";

	return (
		<div className="settingsSidebarFooter">
			<button
				type="button"
				className="settingsFeedbackLink"
				onClick={() => void openUrl(isCommunityBuild ? status.purchase_url : GLYPH_LINKS.discord)}
			>
				{isCommunityBuild ? t("nav.buyLicense") : t("nav.sendFeedback")}
				<HugeiconsIcon icon={ArrowUpRight01Icon} size="var(--icon-sm)" />
			</button>
		</div>
	);
}
