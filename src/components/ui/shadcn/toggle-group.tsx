import { Toggle as TogglePrimitive } from "@animate-ui/react/primitives/base-ui/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@animate-ui/react/primitives/base-ui/toggle-group";
import { createContext, use } from "react";

const SelectedValueContext = createContext<string | null>(null);

type ToggleGroupProps<Value extends string> = Omit<
	ToggleGroupPrimitive.Props<Value>,
	"value" | "defaultValue" | "onValueChange" | "multiple" | "transition"
> & {
	value: Value;
	onValueChange: (value: Value) => void;
};

/**
 * Single-select segmented control. Animate UI slides one shared pill between items (and a
 * hover pill between hovered items), painted from each item's own computed background, so
 * CSS only styles `[aria-pressed="true"]` and `:hover`.
 *
 * Semantics stay Base UI's: a labelled `role="group"` of `aria-pressed` buttons with roving
 * focus. Radio roles can't be layered on, because the highlight tracks `aria-pressed`, which
 * ARIA doesn't allow on `role="radio"`. Pressing the selected item again is ignored, so the
 * value never becomes empty.
 */
function ToggleGroup<Value extends string>({
	value,
	onValueChange,
	...props
}: ToggleGroupProps<Value>) {
	return (
		<SelectedValueContext value={value}>
			<ToggleGroupPrimitive<Value>
				data-slot="toggle-group"
				{...props}
				value={[value]}
				onValueChange={(next) => {
					if (next.length > 0) onValueChange(next[0]);
				}}
			/>
		</SelectedValueContext>
	);
}

type ToggleGroupItemProps<Value extends string> = Omit<
	TogglePrimitive.Props<Value>,
	"value" | "render" | "pressed" | "defaultPressed" | "onPressedChange" | "transition"
> & {
	value: Value;
};

/** An item in a `ToggleGroup`. A custom `render` would drop the highlight hook, so it's omitted. */
function ToggleGroupItem<Value extends string>(props: ToggleGroupItemProps<Value>) {
	const selected = use(SelectedValueContext) === props.value;
	return (
		<TogglePrimitive<Value>
			data-slot="toggle-group-item"
			// Base UI's own marker (as on checked radios and selected tabs) for the roving focus
			// default, so Tab enters the group on the selected item rather than the first one.
			data-composite-item-active={selected ? "" : undefined}
			{...props}
		/>
	);
}

export { ToggleGroup, ToggleGroupItem };
