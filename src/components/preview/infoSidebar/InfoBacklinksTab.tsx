import { useTranslation } from "react-i18next";
import { type RelationshipGroup, relationshipTargetLabel } from "../../../lib/relationships";
import {
	dispatchMarkdownLinkClick,
	dispatchWikiLinkClick,
} from "../../editor/markdown/editorEvents";
import {
	UnlinkedMentionsSection,
	type UnlinkedMentionsSectionProps,
} from "./UnlinkedMentionsSection";

export interface SidebarBacklinkItem {
	id: string;
	label: string;
}

export interface LinkedNoteItem {
	id: string;
	label: string;
	kind: "wiki" | "markdown";
}

interface InfoBacklinksTabProps {
	relPath: string;
	backlinks: SidebarBacklinkItem[];
	unlinkedMentions: UnlinkedMentionsSectionProps;
	linkedNotes: LinkedNoteItem[];
	relationshipGroups: RelationshipGroup[];
}

function openWikiTarget(target: string, unresolved = false) {
	dispatchWikiLinkClick({
		raw: `[[${target}]]`,
		target,
		alias: null,
		anchorKind: "none",
		anchor: null,
		unresolved,
	});
}

function LinkChip({
	label,
	title,
	target,
	onClick,
}: {
	label: string;
	title: string;
	target?: string;
	onClick: () => void;
}) {
	return (
		<button type="button" className="wikiLink" data-target={target} onClick={onClick} title={title}>
			<span className="wikiLinkIcon" aria-hidden="true" />
			<span className="wikiLinkLabel">{label}</span>
		</button>
	);
}

export function InfoBacklinksTab({
	relPath,
	backlinks,
	unlinkedMentions,
	linkedNotes,
	relationshipGroups,
}: InfoBacklinksTabProps) {
	const { t } = useTranslation("editor");

	return (
		<>
			<section className="markdownEditorInfoSection">
				<h3 className="markdownEditorInfoSectionLabel">{t("infoSidebar.backlinks.heading")}</h3>
				{backlinks.length > 0 ? (
					<div className="markdownEditorInfoLinkList">
						{backlinks.map((item) => (
							<LinkChip
								key={item.id}
								label={item.label}
								title={item.id}
								target={item.id}
								onClick={() => openWikiTarget(item.id)}
							/>
						))}
					</div>
				) : (
					<div className="markdownEditorInfoEmpty">{t("infoSidebar.backlinks.empty")}</div>
				)}
			</section>

			<UnlinkedMentionsSection {...unlinkedMentions} />

			{relationshipGroups.length > 0 ? (
				<section className="markdownEditorInfoSection">
					<h3 className="markdownEditorInfoSectionLabel">
						{t("infoSidebar.backlinks.relationships")}
					</h3>
					<div className="markdownEditorInfoRows">
						{relationshipGroups.map((group) => (
							<div key={group.field_key} className="markdownEditorInfoRelationshipGroup">
								<span>{group.field_key}</span>
								<div className="markdownEditorInfoLinkList">
									{group.items.map((item) => {
										const target = item.to_id ?? item.target_title;
										if (!target) return null;
										return (
											<LinkChip
												key={`${group.field_key}:${item.ordinal}:${target}`}
												label={relationshipTargetLabel(item)}
												title={target}
												target={target}
												onClick={() => openWikiTarget(target, item.to_id === null)}
											/>
										);
									})}
								</div>
							</div>
						))}
					</div>
				</section>
			) : null}

			<section className="markdownEditorInfoSection">
				<h3 className="markdownEditorInfoSectionLabel">{t("infoSidebar.backlinks.linkedNotes")}</h3>
				{linkedNotes.length > 0 ? (
					<div className="markdownEditorInfoLinkList">
						{linkedNotes.map((item) => (
							<LinkChip
								key={`${item.kind}:${item.id}`}
								label={item.label}
								title={item.id}
								target={item.kind === "wiki" ? item.id : undefined}
								onClick={() =>
									item.kind === "wiki"
										? openWikiTarget(item.id)
										: dispatchMarkdownLinkClick({ href: item.id, sourcePath: relPath })
								}
							/>
						))}
					</div>
				) : (
					<div className="markdownEditorInfoEmpty">{t("infoSidebar.backlinks.noLinkedNotes")}</div>
				)}
			</section>
		</>
	);
}
