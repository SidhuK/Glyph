import { useTranslation } from "react-i18next";
import type { TOCHeading } from "../../editor/hooks/useTableOfContents";

interface InfoContentsTabProps {
	tocHeadings: TOCHeading[];
	tocActiveId: string | null;
	onSelectHeading: (heading: TOCHeading) => void;
}

export function InfoContentsTab({
	tocHeadings,
	tocActiveId,
	onSelectHeading,
}: InfoContentsTabProps) {
	const { t } = useTranslation("editor");

	return (
		<section className="markdownEditorInfoSection">
			{tocHeadings.length > 0 ? (
				<div className="markdownEditorInfoOutline">
					{tocHeadings.map((heading) => (
						<button
							key={heading.id}
							type="button"
							className="markdownEditorInfoOutlineItem"
							data-active={tocActiveId === heading.id ? "true" : undefined}
							data-level={heading.level}
							onClick={() => onSelectHeading(heading)}
							title={heading.text}
						>
							{heading.text}
						</button>
					))}
				</div>
			) : (
				<div className="markdownEditorInfoEmpty">{t("infoSidebar.contents.empty")}</div>
			)}
		</section>
	);
}
