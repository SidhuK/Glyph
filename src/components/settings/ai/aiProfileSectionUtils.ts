export function toneForSecretConfigured(
	secretConfigured: boolean | null,
): "settingsPillOk" | "settingsPillWarn" | "settingsPillError" {
	if (secretConfigured === true) return "settingsPillOk";
	if (secretConfigured === false) return "settingsPillError";
	return "settingsPillWarn";
}
