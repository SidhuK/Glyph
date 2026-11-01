import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Copy01Icon, DiscordIcon, GlobeIcon } from "@hugeicons/core-free-icons";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../../lib/errorUtils";
import { GLYPH_LINKS } from "../../../lib/helpMenu";
import type { AppInfo } from "../../../lib/tauri";
import { toast } from "../../../lib/toast";
import { AboutDeveloperCard } from "./AboutDeveloperCard";

const DEV_NAME_SUFFIX = " Dev";
const DEVELOPER_CARD_ID = "about-developer-card";

/** Icon, name, version and tagline on a card, with credits and links along its foot. */
export function AboutHero({ appInfo }: { appInfo: AppInfo | null }) {
	const { t } = useTranslation("settings.general");
	const [showDeveloper, setShowDeveloper] = useState(false);
	const fullName = appInfo?.name ?? "Glyph";
	// Dev builds ship as "Glyph Dev"; show the brand name and say "dev" with a badge instead.
	const isDevBuild = fullName.endsWith(DEV_NAME_SUFFIX);
	const name = isDevBuild ? fullName.slice(0, -DEV_NAME_SUFFIX.length) : fullName;
	const version = appInfo?.version ?? "";

	const copyVersion = () => {
		navigator.clipboard.writeText(version).then(
			() => toast.success(t("about.versionCopied")),
			(error: unknown) =>
				toast.error(t("about.copyVersionFailed"), { description: extractErrorMessage(error) }),
		);
	};

	return (
		<>
			<section className="aboutHero" aria-labelledby="about-title">
				<div className="aboutHeroBody">
					<img
						src={`/glyph-app-icon.png?v=${version || "dev"}`}
						alt=""
						className="aboutLogo"
						aria-hidden="true"
					/>
					<h2 id="about-title" className="aboutAppName">
						{name}
						{isDevBuild ? <span className="aboutDevBadge">{t("about.devBadge")}</span> : null}
					</h2>
					{version ? (
						<button
							type="button"
							className="aboutVersionChip"
							title={t("about.copyVersion")}
							aria-label={`${t("about.copyVersion")}: ${version}`}
							onClick={copyVersion}
						>
							{version}
							<HugeiconsIcon icon={Copy01Icon} size="var(--icon-sm)" aria-hidden="true" />
						</button>
					) : null}
					<p className="aboutTagline">
						{t("about.tagline.first")}
						<br />
						{t("about.tagline.second")}
					</p>
				</div>
				<footer className="aboutHeroFooter">
					<button
						type="button"
						className="aboutCredit"
						aria-expanded={showDeveloper}
						aria-controls={DEVELOPER_CARD_ID}
						onClick={() => setShowDeveloper((open) => !open)}
					>
						{t("about.developer.madeBy")} <span className="aboutCreditName">Karat Sidhu</span>
					</button>
					<nav className="aboutLinks" aria-label={t("about.links.ariaLabel")}>
						<button
							type="button"
							className="aboutLink"
							onClick={() => void openUrl(GLYPH_LINKS.website)}
						>
							<HugeiconsIcon icon={GlobeIcon} size="var(--icon-md)" aria-hidden="true" />
							{t("about.links.website")}
						</button>
						<button
							type="button"
							className="aboutLink"
							onClick={() => void openUrl(GLYPH_LINKS.discord)}
						>
							<HugeiconsIcon icon={DiscordIcon} size="var(--icon-md)" aria-hidden="true" />
							Discord
						</button>
						<span className="aboutLinksDivider" aria-hidden="true" />
						<button
							type="button"
							className="aboutLink aboutLinkQuiet"
							onClick={() => void openUrl(GLYPH_LINKS.terms)}
						>
							{t("about.links.terms")}
						</button>
						<button
							type="button"
							className="aboutLink aboutLinkQuiet"
							onClick={() => void openUrl(GLYPH_LINKS.privacy)}
						>
							{t("about.links.privacy")}
						</button>
					</nav>
				</footer>
			</section>
			{showDeveloper ? <AboutDeveloperCard id={DEVELOPER_CARD_ID} /> : null}
		</>
	);
}
