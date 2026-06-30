import {
	Details,
	DetailsContent,
	DetailsSummary,
} from "@tiptap/extension-details";

const DetailsWithPersistedFirstToggle = Details.extend({
	addNodeView() {
		const renderDetails = this.parent?.();
		if (!renderDetails) return null;
		return (props) => {
			const view = renderDetails(props);
			const dom = view.dom;
			if (!(dom instanceof HTMLElement)) return view;
			const toggle = dom.querySelector(":scope > button");
			if (!(toggle instanceof HTMLButtonElement)) return view;

			toggle.addEventListener("click", () => {
				if (!this.options.persist || !props.editor.isEditable) return;
				if (typeof props.getPos !== "function") return;
				const pos = props.getPos();
				if (pos !== 0) return;
				const node = props.editor.state.doc.nodeAt(pos);
				if (node?.type !== this.type) return;
				const open = !node.attrs.open;
				props.editor
					.chain()
					.command(({ tr }) => {
						tr.setNodeMarkup(pos, undefined, { ...node.attrs, open });
						return true;
					})
					.run();
			});

			return view;
		};
	},
});

export const GlyphDetails = DetailsWithPersistedFirstToggle.configure({
	persist: true,
	openClassName: "is-open",
	HTMLAttributes: {
		class: "detailsBlock",
	},
});

export const GlyphDetailsSummary = DetailsSummary.configure({
	HTMLAttributes: {
		class: "detailsSummary",
	},
});

export const GlyphDetailsContent = DetailsContent.configure({
	HTMLAttributes: {
		class: "detailsContent",
	},
});

export const glyphDetailsExtensions = [
	GlyphDetails,
	GlyphDetailsSummary,
	GlyphDetailsContent,
];

export function createDetailsBlockContent(summary = "Toggle title") {
	return {
		type: "details",
		attrs: { open: true },
		content: [
			{
				type: "detailsSummary",
				content: summary ? [{ type: "text", text: summary }] : undefined,
			},
			{
				type: "detailsContent",
				content: [{ type: "paragraph" }],
			},
		],
	};
}
