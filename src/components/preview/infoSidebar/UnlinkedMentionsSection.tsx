import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { Link04Icon } from "@hugeicons/core-free-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { extractErrorMessage } from "../../../lib/errorUtils";
import type { UnlinkedMention } from "../../../lib/tauri";
import { ChevronDown } from "../../Icons";
import { dispatchWikiLinkClick } from "../../editor/markdown/editorEvents";

export interface UnlinkedMentionsSectionProps {
	mentions: UnlinkedMention[];
	isLoading: boolean;
	isLinking: boolean;
	linkedCount: number;
	skippedCount: number;
	error: unknown;
	onLink: (mention: UnlinkedMention) => void;
	onLinkAll: () => void;
}

export function UnlinkedMentionsSection({
	mentions,
	isLoading,
	isLinking,
	linkedCount,
	skippedCount,
	error,
	onLink,
	onLinkAll,
}: UnlinkedMentionsSectionProps) {
	const { t } = useTranslation("editor");
	const [expanded, setExpanded] = useState(true);

	return (
		<section className="markdownEditorInfoSection">
			<div className="unlinkedMentionsHeader">
				<h3 className="markdownEditorInfoSectionLabel">
					<button
						type="button"
						className="unlinkedMentionsToggle"
						onClick={() => setExpanded((value) => !value)}
						aria-expanded={expanded}
						aria-controls="unlinked-mentions-content"
					>
						<span>{t("unlinkedMentions.heading", { count: mentions.length })}</span>
						<ChevronDown
							className={expanded ? undefined : "is-collapsed"}
							size="var(--icon-xs)"
							aria-hidden="true"
						/>
					</button>
				</h3>
				{expanded && mentions.length > 0 ? (
					<button
						type="button"
						className="unlinkedMentionsLinkAll"
						onClick={onLinkAll}
						disabled={isLinking}
					>
						{t("unlinkedMentions.linkAll")}
					</button>
				) : null}
			</div>
			{expanded ? (
				<div id="unlinked-mentions-content">
					{isLoading ? (
						<div className="markdownEditorInfoEmpty">{t("unlinkedMentions.loading")}</div>
					) : null}
					{error ? (
						<div className="markdownEditorInfoEmpty">{extractErrorMessage(error)}</div>
					) : null}
					{skippedCount > 0 ? (
						<div className="markdownEditorInfoEmpty">{t("unlinkedMentions.skipped")}</div>
					) : null}
					{linkedCount > 0 ? (
						<div className="markdownEditorInfoEmpty">
							{t("unlinkedMentions.linked", { count: linkedCount })}
						</div>
					) : null}
					{!isLoading && !error && mentions.length === 0 && skippedCount === 0 ? (
						<div className="markdownEditorInfoEmpty">{t("unlinkedMentions.empty")}</div>
					) : null}
					{mentions.length > 0 ? (
						<div className="unlinkedMentionsList">
							{mentions.map((mention) => (
								<div className="unlinkedMentionItem" key={`${mention.source_id}:${mention.start}`}>
									<button
										type="button"
										className="unlinkedMentionSource"
										onClick={() =>
											dispatchWikiLinkClick({
												raw: `[[${mention.source_id}]]`,
												target: mention.source_id,
												alias: null,
												anchorKind: "none",
												anchor: null,
												unresolved: false,
											})
										}
										title={mention.source_id}
									>
										{mention.source_title}
									</button>
									<button
										type="button"
										className="unlinkedMentionLink"
										onClick={() => onLink(mention)}
										disabled={isLinking}
										aria-label={t("unlinkedMentions.link")}
									>
										<HugeiconsIcon icon={Link04Icon} size="var(--icon-sm)" aria-hidden="true" />
									</button>
									<p className="unlinkedMentionContext">{mention.context}</p>
								</div>
							))}
						</div>
					) : null}
				</div>
			) : null}
		</section>
	);
}
