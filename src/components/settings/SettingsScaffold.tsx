import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
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
				<div className="settingsCardTitle">{title}</div>
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

	return (
		<div
			className={cn(
				"settingsField",
				interactive && "settingsFieldInteractive",
				stacked && "settingsFieldStacked",
				className,
			)}
			data-settings-row-title={rowTitle}
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
