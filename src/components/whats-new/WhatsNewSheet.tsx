import { MotionConfig, m } from "motion/react";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogTitle,
} from "@/components/ui/shadcn/dialog";
import { useWhatsNew } from "./useWhatsNew";

const SHEET_TRANSITION = { duration: 0.2, ease: [0.2, 0, 0, 1] } as const;
const SHEET_DROP_PX = -8;
const FEATURE_ICON_SIZE = 28;

export function WhatsNewSheet() {
	const { t } = useTranslation("shell");
	const { open, release, close } = useWhatsNew();
	const continueRef = useRef<HTMLButtonElement>(null);

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) close();
			}}
		>
			<DialogContent showCloseButton={false} initialFocus={continueRef} className="whatsNewPopup">
				{/* reducedMotion="user" drops the transform and keeps the fade. */}
				<MotionConfig reducedMotion="user" transition={SHEET_TRANSITION}>
					<m.div
						className="whatsNewSheet obNative"
						initial={{ opacity: 0, y: SHEET_DROP_PX }}
						animate={{ opacity: 1, y: 0 }}
					>
						<div className="whatsNewBody">
							<DialogTitle className="whatsNewTitle">{t("whatsNew.title")}</DialogTitle>
							<DialogDescription className="whatsNewVersion">
								{t("whatsNew.version", { version: release.version })}
							</DialogDescription>
							<ul className="obFeatureList">
								{release.features.map((feature) => (
									<li key={feature.titleKey} className="obFeatureRow">
										<span className="obFeatureIcon" aria-hidden="true">
											<HugeiconsIcon icon={feature.icon} size={FEATURE_ICON_SIZE} />
										</span>
										<span className="obFeatureText">
											<span className="obFeatureTitle">{t(feature.titleKey)}</span>
											<span className="obFeatureBody">{t(feature.bodyKey)}</span>
										</span>
									</li>
								))}
							</ul>
						</div>
						<div className="whatsNewFooter">
							<button
								ref={continueRef}
								type="button"
								className="obButton"
								data-variant="primary"
								onClick={close}
							>
								{t("whatsNew.continue")}
							</button>
						</div>
					</m.div>
				</MotionConfig>
			</DialogContent>
		</Dialog>
	);
}
