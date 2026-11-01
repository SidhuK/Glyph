import { openUrl } from "@tauri-apps/plugin-opener";
import { useTranslation } from "react-i18next";
import karatPortrait from "../../../assets/karat-sidhu-blueprint.webp";
import { GLYPH_LINKS } from "../../../lib/helpMenu";

export function AboutDeveloperCard({ id }: { id: string }) {
	const { t } = useTranslation("settings.general");
	return (
		<article id={id} className="aboutDeveloperCard">
			<div className="aboutDeveloperPortrait">
				<span className="aboutDeveloperMark" aria-hidden="true">
					KS / 01
				</span>
				<img src={karatPortrait} alt="" />
			</div>
			<div className="aboutDeveloperStory">
				<p className="aboutDeveloperEyebrow">{t("about.developer.eyebrow")}</p>
				<h3>Karat Sidhu</h3>
				<p className="aboutDeveloperBio">{t("about.developer.bio")}</p>
				<div className="aboutDeveloperLinks">
					<button
						type="button"
						className="aboutDeveloperLink"
						onClick={() => void openUrl(GLYPH_LINKS.github)}
					>
						{t("about.developer.github")}
						<span aria-hidden="true">↗</span>
					</button>
					<button
						type="button"
						className="aboutDeveloperLink"
						onClick={() => void openUrl(GLYPH_LINKS.x)}
					>
						{t("about.developer.twitter")}
						<span aria-hidden="true">↗</span>
					</button>
				</div>
			</div>
		</article>
	);
}
