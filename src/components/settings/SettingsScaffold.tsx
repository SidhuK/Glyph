import { HugeiconsIcon } from "@/components/HugeiconsIcon";
import { cn } from "@/lib/utils";
import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Toggle } from "../base/toggle/toggle";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/shadcn/popover";

interface SettingsSectionProps {
	title: string;
	description?: ReactNode;
	children: ReactNode;
	className?: string;
	id?: string;
	aside?: ReactNode;
}

interface SettingsRowProps {
	label: ReactNode;
	/** String used for settings search targeting when `label` is not a plain string. */
	title?: string;
	htmlFor?: string;
	description?: ReactNode;
	children: ReactNode;
	className?: string;
	stacked?: boolean;
	interactive?: boolean;
	searchId?: string;
}

interface SettingsToggleProps {
	checked: boolean;
	onCheckedChange: (checked: boolean) => void;
	ariaLabel: string;
	disabled?: boolean;
}

export function SettingsSection({
	title,
	description,
	children,
	className,
	id,
	aside,
}: SettingsSectionProps) {
	return (
		<section
			id={id}
			className={cn("settingsSection", className)}
			data-settings-section-title={title}
		>
			<div className="settingsSectionHeader">
				<div className="settingsSectionHeaderCopy">
					<div className="settingsCardTitle">{title}</div>
					{description ? (
						<div className="settingsCardDescription">{description}</div>
					) : null}
				</div>
				{aside ? <div className="settingsCardActions">{aside}</div> : null}
			</div>
			<div className="settingsCard">
				<div className="settingsSectionBody">{children}</div>
			</div>
		</section>
	);
}

export function SettingsRow({
	label,
	title,
	htmlFor,
	description,
	children,
	className,
	stacked = false,
	interactive = true,
	searchId,
}: SettingsRowProps) {
	const CopyTag = htmlFor ? "label" : "div";
	const rowTitle = title ?? (typeof label === "string" ? label : undefined);

	const tryToggleRowCheckbox = (
		target: EventTarget | null,
		currentTarget: HTMLDivElement,
	) => {
		const el = target as HTMLElement | null;
		if (!el) return false;
		// Portaled content (popovers, dialogs) still bubbles through React's tree.
		if (!currentTarget.contains(el)) return false;
		if (el.closest(".uiToggle")) return false;
		if (el.closest("button, a, input, select, textarea")) return false;
		if (el.closest("label")) return false;
		const input = currentTarget.querySelector<HTMLInputElement>(
			'input[type="checkbox"]',
		);
		if (input && !input.disabled) {
			input.click();
			return true;
		}
		return false;
	};

	const handleRowClick = (event: MouseEvent<HTMLDivElement>) => {
		if (!interactive) return;
		tryToggleRowCheckbox(event.target, event.currentTarget);
	};

	const handleRowKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
		if (!interactive) return;
		if (event.key !== "Enter" && event.key !== " ") return;
		if (tryToggleRowCheckbox(event.target, event.currentTarget)) {
			event.preventDefault();
		}
	};

	return (
		<div
			className={cn(
				"settingsField",
				interactive && "settingsFieldInteractive",
				stacked && "settingsFieldStacked",
				className,
			)}
			data-settings-row-title={rowTitle}
			data-settings-search-id={searchId}
			onClick={handleRowClick}
			onKeyDown={handleRowKeyDown}
			role={interactive ? "button" : undefined}
			tabIndex={interactive ? 0 : undefined}
		>
			<CopyTag className="settingsFieldCopy" htmlFor={htmlFor}>
				<div className="settingsLabel">{label}</div>
				{description ? <div className="settingsHelp">{description}</div> : null}
			</CopyTag>
			<div
				className={cn(
					"settingsFieldControl",
					stacked && "settingsFieldControlStacked",
				)}
			>
				{children}
			</div>
		</div>
	);
}

/** Small "i" button that reveals longer guidance without crowding the row. */
export function SettingsInfoHint({
	ariaLabel,
	children,
}: {
	ariaLabel: string;
	children: ReactNode;
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="settingsInfoButton"
					aria-label={ariaLabel}
				>
					<HugeiconsIcon icon={InformationCircleIcon} size="var(--icon-md)" />
				</button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				side="right"
				sideOffset={8}
				className="settingsInfoPopover"
			>
				{children}
			</PopoverContent>
		</Popover>
	);
}

export function SettingsToggle({
	checked,
	onCheckedChange,
	ariaLabel,
	disabled,
}: SettingsToggleProps) {
	return (
		<Toggle
			slim
			size="sm"
			checked={checked}
			onCheckedChange={onCheckedChange}
			ariaLabel={ariaLabel}
			disabled={disabled}
		/>
	);
}

interface SettingsValueCardProps {
	icon: ReactNode;
	value: string;
	mono?: boolean;
}

export function SettingsValueCard({
	icon,
	value,
	mono = false,
}: SettingsValueCardProps) {
	return (
		<div className="settingsValueCard">
			<div className="settingsValueIcon" aria-hidden="true">
				{icon}
			</div>
			<div className={cn("settingsValueText", { mono })}>{value}</div>
		</div>
	);
}
