import { Fragment } from "react";
import { splitTagPath, tagColorFromName } from "../editor/noteProperties/utils";

const TAG_DOT_STACK_LIMIT = 3;

export function TagDotStack({ tags }: { tags: string[] }) {
	return (
		<span className="tagDotStack">
			<span className="tagDotStackDots" aria-hidden="true">
				{tags.slice(0, TAG_DOT_STACK_LIMIT).map((tag) => (
					<span key={tag} className="tagDotStackDot" data-chip-tone={tagColorFromName(tag)} />
				))}
			</span>
			<span className="tagDotStackNames">
				{tags.map((tag, index) => {
					const { parent, leaf } = splitTagPath(tag);
					return (
						<Fragment key={tag}>
							{index > 0 ? ", " : null}
							{parent ? <span className="tagDotStackParent">{parent}</span> : null}
							{leaf}
						</Fragment>
					);
				})}
			</span>
		</span>
	);
}
