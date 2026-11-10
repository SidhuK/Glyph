import type { TFunction } from "i18next";
import { priorityOptionFromValue } from "../../lib/priorityProperties";
import { statusOptionFromValue } from "../../lib/statusProperties";

/**
 * Display labels for status and priority values. Built-in options are translated; custom values
 * show as typed. Stored values stay the English option labels (see statusLabel/priorityLabel).
 */
export function statusDisplayLabel(
	value: string | null | undefined,
	t: TFunction<"shell">,
): string {
	const option = statusOptionFromValue(value);
	return option ? t(`collections.status.${option.id}`) : (value ?? "").trim();
}

export function priorityDisplayLabel(
	value: string | null | undefined,
	t: TFunction<"shell">,
): string {
	const option = priorityOptionFromValue(value);
	return option ? t(`collections.priority.${option.id}`) : (value ?? "").trim();
}
