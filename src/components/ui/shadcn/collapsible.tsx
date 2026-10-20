import { Collapsible as CollapsiblePrimitive } from "@animate-ui/react/primitives/base-ui/collapsible";
import { createContext, use, useState } from "react";

const INSTANT_TRANSITION = { duration: 0 };

/** False until a panel that mounted open is first toggled. */
const PanelMotionContext = createContext(true);

/**
 * Animated disclosure. A panel that mounts open appears at full height with no reveal, so
 * restoring a saved expanded state doesn't push the content below it around. Motion starts
 * with the first toggle.
 */
function Collapsible({ onOpenChange, ...props }: CollapsiblePrimitive.Root.Props) {
	const [animated, setAnimated] = useState(!(props.open ?? props.defaultOpen));
	return (
		<PanelMotionContext.Provider value={animated}>
			<CollapsiblePrimitive.Root
				data-slot="collapsible"
				onOpenChange={(next, details) => {
					setAnimated(true);
					onOpenChange?.(next, details);
				}}
				{...props}
			/>
		</PanelMotionContext.Provider>
	);
}

function CollapsibleTrigger(props: CollapsiblePrimitive.Trigger.Props) {
	return <CollapsiblePrimitive.Trigger data-slot="collapsible-trigger" {...props} />;
}

/** Animates its height (and fades) open and closed; unmounted while closed. */
function CollapsibleContent({ transition, ...props }: CollapsiblePrimitive.Panel.Props) {
	const animated = use(PanelMotionContext);
	// The exit transition falls back to `transition`, so this also makes closing instant.
	return (
		<CollapsiblePrimitive.Panel
			data-slot="collapsible-content"
			transition={animated ? transition : INSTANT_TRANSITION}
			{...props}
		/>
	);
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
