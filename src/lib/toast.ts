import { createElement, type ReactNode } from "react";
import { sileo, type SileoOptions, type SileoPosition } from "sileo";

interface ToastAction {
	label: string;
	onClick: () => void;
}

interface ToastOptions {
	description?: ReactNode;
	duration?: number | null;
	position?: SileoPosition;
	action?: ToastAction;
	className?: string;
	id?: string;
}

interface SileoOptionsWithId extends SileoOptions {
	id: string;
}

let toastId = 0;

function nextToastId() {
	toastId += 1;
	return `glyph-toast-${toastId}`;
}

function toastDescription(id: string, description: ReactNode | undefined) {
	return createElement(
		"div",
		{ className: "glyphToastDescriptionBody" },
		description === undefined
			? null
			: createElement(
					"div",
					{ className: "glyphToastDescriptionText" },
					description,
				),
		createElement(
			"a",
			{
				href: "#",
				role: "button",
				"data-sileo-button": true,
				className: "glyphToastDismissButton",
				onClick: (event) => {
					event.preventDefault();
					event.stopPropagation();
					sileo.dismiss(id);
				},
			},
			"Dismiss",
		),
	);
}

function stylesForClassName(className: string | undefined) {
	if (!className) return undefined;
	return {
		title: `glyphToastTitle ${className}Title`,
		description: `glyphToastDescription ${className}Description`,
		button: `glyphToastButton ${className}Button`,
	} satisfies SileoOptions["styles"];
}

function toSileoOptions(
	title: string,
	options: ToastOptions = {},
): SileoOptionsWithId {
	const sileoOptions: SileoOptionsWithId = {
		id: options.id ?? nextToastId(),
		title,
	};

	sileoOptions.description = toastDescription(
		sileoOptions.id,
		options.description,
	);
	if (options.duration !== undefined) {
		sileoOptions.duration = options.duration;
	}
	if (options.position !== undefined) {
		sileoOptions.position = options.position;
	}
	if (options.action) {
		sileoOptions.button = {
			title: options.action.label,
			onClick: options.action.onClick,
		};
	}

	const styles = stylesForClassName(options.className);
	if (styles) {
		sileoOptions.styles = styles;
	}

	return sileoOptions;
}

export const toast = {
	success(title: string, options?: ToastOptions) {
		return sileo.success(toSileoOptions(title, options));
	},
	error(title: string, options?: ToastOptions) {
		return sileo.error(toSileoOptions(title, options));
	},
	info(title: string, options?: ToastOptions) {
		return sileo.info(toSileoOptions(title, options));
	},
	warning(title: string, options?: ToastOptions) {
		return sileo.warning(toSileoOptions(title, options));
	},
	dismiss(id: string) {
		sileo.dismiss(id);
	},
	clear(position?: SileoPosition) {
		sileo.clear(position);
	},
};
