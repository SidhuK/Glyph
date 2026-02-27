import type { AiProfile } from "./tauri";

export function resolveActiveProfileId(
	profiles: AiProfile[],
	activeProfileId: string | null,
): string | null {
	const hasActive =
		!!activeProfileId &&
		profiles.some((profile) => profile.id === activeProfileId);
	return hasActive ? activeProfileId : (profiles[0]?.id ?? null);
}
