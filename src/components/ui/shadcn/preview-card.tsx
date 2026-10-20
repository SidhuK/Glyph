import { PreviewCard as PreviewCardPrimitive } from "@animate-ui/react/primitives/base-ui/preview-card";

function PreviewCard(props: PreviewCardPrimitive.Root.Props) {
	return <PreviewCardPrimitive.Root data-slot="preview-card" {...props} />;
}

type PreviewCardPositioningProps = Pick<
	PreviewCardPrimitive.Positioner.Props,
	"anchor" | "side" | "sideOffset" | "collisionPadding" | "collisionAvoidance"
>;

/**
 * Animated preview card surface. `anchor` positions it against an element or a virtual
 * rect, so it can open for content that isn't a React trigger (such as editor DOM).
 */
function PreviewCardContent({
	positionerClassName,
	anchor,
	side,
	sideOffset,
	collisionPadding,
	collisionAvoidance,
	...props
}: PreviewCardPrimitive.Popup.Props &
	PreviewCardPositioningProps & { positionerClassName?: string }) {
	return (
		<PreviewCardPrimitive.Portal>
			<PreviewCardPrimitive.Positioner
				className={positionerClassName}
				anchor={anchor}
				side={side}
				sideOffset={sideOffset}
				collisionPadding={collisionPadding}
				collisionAvoidance={collisionAvoidance}
			>
				<PreviewCardPrimitive.Popup data-slot="preview-card-content" {...props} />
			</PreviewCardPrimitive.Positioner>
		</PreviewCardPrimitive.Portal>
	);
}

export { PreviewCard, PreviewCardContent };
