import type { ReactNode } from "react";
import { type SileoOptions, type SileoPosition, sileo } from "sileo";

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

interface GlyphSileoOptions extends Omit<SileoOptions, "title"> {
	id: string;
	title: ReactNode;
}

let toastId = 0;

function nextToastId() {
	toastId += 1;
	return `glyph-toast-${toastId}`;
}

function stylesForClassName(className: string | undefined) {
	if (!className) return undefined;
	return {
		title: `glyphToastTitle ${className}Title`,
		description: `glyphToastDescription ${className}Description`,
		button: `glyphToastButton ${className}Button`,
	} satisfies SileoOptions["styles"];
}

function titleWithDismiss(id: string, title: string) {
	return (
		<span className="glyphToastTitleRow">
			{title}
			{/* Not a <button>: sileo renders the whole toast as a <button>, and
			    buttons cannot nest. data-sileo-button opts out of swipe-to-dismiss. */}
			<input
				type="button"
				value="✕"
				data-sileo-button
				className="glyphToastClose"
				aria-label="Dismiss notification"
				onClick={(event) => {
					event.preventDefault();
					event.stopPropagation();
					sileo.dismiss(id);
				}}
			/>
		</span>
	);
}

function toSileoOptions(
	title: string,
	options: ToastOptions = {},
): SileoOptions {
	const id = options.id ?? nextToastId();
	const sileoOptions: GlyphSileoOptions = {
		id,
		title: titleWithDismiss(id, title),
	};

	if (options.description !== undefined) {
		sileoOptions.description = options.description;
	}
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

	return sileoOptions as SileoOptions;
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
