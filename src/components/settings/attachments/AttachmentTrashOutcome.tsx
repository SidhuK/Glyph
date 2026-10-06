import { useTranslation } from "react-i18next";
import type { AttachmentTrashResult, AttachmentTrashSkip } from "../../../lib/tauri";

export function AttachmentTrashOutcome({ result }: { result: AttachmentTrashResult }) {
	const { t } = useTranslation("settings.general");
	const skipReason = (skip: AttachmentTrashSkip): string => {
		switch (skip.kind) {
			case "missing":
				return t("developer.attachments.result.missing");
			case "referenced":
				return t("developer.attachments.result.referenced");
			case "failed":
				return skip.message;
			default: {
				const _exhaustive: never = skip;
				return _exhaustive;
			}
		}
	};

	return (
		<div className="attachmentOutcome" role="status">
			{result.trashed.length > 0 ? (
				<div className="settingsKeySaved attachmentOutcomeSuccess">
					{t("developer.attachments.result.trashed", { count: result.trashed.length })}
				</div>
			) : null}
			{result.skipped.length > 0 ? (
				<div className="settingsError">
					<div>{t("developer.attachments.result.skipped", { count: result.skipped.length })}</div>
					<ul className="attachmentOutcomeList">
						{result.skipped.map((skip) => (
							<li key={skip.path}>
								{t("developer.attachments.result.skippedItem", {
									path: skip.path,
									reason: skipReason(skip),
								})}
							</li>
						))}
					</ul>
				</div>
			) : null}
		</div>
	);
}
