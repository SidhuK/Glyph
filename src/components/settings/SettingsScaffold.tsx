import { cn } from "@/lib/utils";
import type { KeyboardEvent, MouseEvent, ReactNode } from "react";
import { Toggle } from "../base/toggle/toggle";

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
	htmlFor?: string;
	description?: ReactNode;
	children: ReactNode;
	className?: string;
	stacked?: boolean;
	interactive?: boolean;
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
	htmlFor,
	description,
	children,
	className,
	stacked = false,
	interactive = true,
}: SettingsRowProps) {
	const CopyTag = htmlFor ? "label" : "div";
	const rowTitle = typeof label === "string" ? label : undefined;

	const tryToggleRowCheckbox = (
		target: EventTarget | null,
		currentTarget: HTMLDivElement,
	) => {
		const el = target as HTMLElement | null;
		if (!el) return false;
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
