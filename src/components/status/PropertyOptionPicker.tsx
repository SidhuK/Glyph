import type { MouseEvent } from "react";
import {
	priorityColorKey,
	priorityOptionsWithCustomValues,
} from "../../lib/priorityProperties";
import {
	statusColorKey,
	statusOptionsWithCustomValues,
} from "../../lib/statusProperties";
import { EDITOR_TEXT_COLORS, type EditorTextColor } from "../editor/textColors";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "../ui/shadcn/dropdown-menu";
import { PriorityPropertyPill } from "./PriorityPropertyPill";
import { StatusPropertyPill } from "./StatusPropertyPill";

interface PropertyPickerBaseProps {
	value: string;
	valueOptions?: readonly string[];
	triggerClassName: string;
	triggerTitle?: string;
	triggerAriaLabel?: string;
	onTriggerFocus?: () => void;
	onTriggerClick?: () => void;
	stopTriggerClickPropagation?: boolean;
	onChange: (value: string) => void | Promise<void>;
	onError?: (error: unknown) => void;
}

interface StatusPropertyPickerProps extends PropertyPickerBaseProps {
	kind: "status";
	colors?: Record<string, EditorTextColor>;
	onColorChange?: (value: string, color: EditorTextColor | null) => void;
}

interface PriorityPropertyPickerProps extends PropertyPickerBaseProps {
	kind: "priority";
}

export type PropertyOptionPickerProps =
	| StatusPropertyPickerProps
	| PriorityPropertyPickerProps;

function handleTriggerClick(
	event: MouseEvent<HTMLButtonElement>,
	onClick: (() => void) | undefined,
	stopPropagation: boolean | undefined,
): void {
	onClick?.();
	if (stopPropagation) event.stopPropagation();
}

export function PropertyOptionPicker(props: PropertyOptionPickerProps) {
	const values = [props.value, ...(props.valueOptions ?? [])];
	const isStatus = props.kind === "status";
	const selectedId = isStatus
		? statusColorKey(props.value)
		: priorityColorKey(props.value);
	const options = isStatus
		? statusOptionsWithCustomValues(values)
		: priorityOptionsWithCustomValues(values);

	const selectValue = async (value: string) => {
		try {
			await props.onChange(value);
		} catch (error) {
			props.onError?.(error);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={props.triggerClassName}
					title={props.triggerTitle}
					aria-label={props.triggerAriaLabel}
					onFocus={props.onTriggerFocus}
					onClick={(event) =>
						handleTriggerClick(
							event,
							props.onTriggerClick,
							props.stopTriggerClickPropagation,
						)
					}
				>
					{isStatus ? (
						<StatusPropertyPill
							value={props.value || "not_started"}
							colors={props.colors}
						/>
					) : (
						<PriorityPropertyPill value={props.value || "no"} />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				sideOffset={6}
				className="databasePickerMenu notePropertyStatusMenu"
			>
				<div className="notePropertyStatusOptions">
					{options.map((option) => (
						<DropdownMenuItem
							key={option.id}
							className="notePropertyStatusOption"
							data-selected={
								(isStatus
									? statusColorKey(option.label)
									: priorityColorKey(option.label)) === selectedId
									? "true"
									: "false"
							}
							onClick={() => void selectValue(option.label)}
						>
							{isStatus ? (
								<StatusPropertyPill
									value={option.label}
									colors={props.colors}
								/>
							) : (
								<PriorityPropertyPill value={option.label} />
							)}
						</DropdownMenuItem>
					))}
				</div>
				{isStatus && selectedId && props.onColorChange ? (
					<>
						<DropdownMenuSeparator className="databaseBoardContextMenuSeparator" />
						<div className="notePropertyStatusColorRibbon">
							{EDITOR_TEXT_COLORS.map((color) => (
								<button
									key={color.id}
									type="button"
									className="databaseBoardColorRibbonSwatch"
									style={{ background: `var(${color.cssVar})` }}
									onClick={() => props.onColorChange?.(props.value, color.id)}
									title={color.label}
									aria-label={`Set ${props.value} color to ${color.label}`}
								/>
							))}
							<button
								type="button"
								className="databaseBoardColorRibbonClear"
								onClick={() => props.onColorChange?.(props.value, null)}
								title="Clear color"
								aria-label={`Clear color for ${props.value}`}
							>
								<span />
							</button>
						</div>
					</>
				) : null}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
