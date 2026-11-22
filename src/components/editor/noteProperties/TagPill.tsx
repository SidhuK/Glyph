import { useTranslation } from "react-i18next";
import { X } from "../../Icons";
import { splitTagPath, tagColorFromName } from "./utils";

function TagPathLabel({ tag }: { tag: string }) {
	const { parent, leaf } = splitTagPath(tag);
	if (!parent) return <span className="tagPathLeaf">{leaf}</span>;
	const [root, ...middle] = parent.slice(0, -1).split("/");
	return (
		<>
			<span className="tagPathFolder">{root}</span>
			<span className="tagPathSlash">/</span>
			{middle.length > 0 ? (
				<>
					<span className="tagPathFolder tagPathMiddle">{middle.join("/")}</span>
					<span className="tagPathSlash">/</span>
				</>
			) : null}
			<span className="tagPathLeaf">{leaf}</span>
		</>
	);
}

interface TagPillProps {
	tag: string;
	onRemove?: () => void;
}

export function TagPill({ tag, onRemove }: TagPillProps) {
	const { t } = useTranslation("editor");
	const name = tag.replace(/^#+/, "");
	return (
		<span
			className="notePropertyPill"
			data-chip-tone={tagColorFromName(tag)}
			data-removable={onRemove ? "" : undefined}
			title={name.includes("/") ? name : undefined}
		>
			<TagPathLabel tag={name} />
			{onRemove ? (
				<button
					type="button"
					className="notePropertyPillRemove"
					aria-label={t("properties.removeTag", { tag: name })}
					onClick={onRemove}
				>
					<X size="var(--icon-xs)" aria-hidden="true" />
				</button>
			) : null}
		</span>
	);
}
