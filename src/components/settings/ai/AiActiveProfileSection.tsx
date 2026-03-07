import type { AiProfile } from "../../../lib/tauri";
import { Button } from "../../ui/shadcn/button";
import { SettingsRow, SettingsSection } from "../SettingsScaffold";

interface AiActiveProfileSectionProps {
	profiles: AiProfile[];
	activeProfileId: string | null;
	onActiveProfileChange: (id: string | null) => Promise<void>;
	onCreateProfile: () => void;
}

export function AiActiveProfileSection({
	profiles,
	activeProfileId,
	onActiveProfileChange,
	onCreateProfile,
}: AiActiveProfileSectionProps) {
	if (profiles.length > 1) {
		return (
			<SettingsSection
				title="Profiles"
				description="Choose which AI profile Glyph should use right now."
			>
				<SettingsRow
					label="Active profile"
					description="Switching profiles updates the provider, model, and auth settings below."
				>
					<select
						id="aiProfileSel"
						aria-label="Active profile"
						value={activeProfileId ?? ""}
						onChange={(event) =>
							void onActiveProfileChange(event.target.value || null)
						}
					>
						{profiles.map((profile) => (
							<option key={profile.id} value={profile.id}>
								{profile.name}
							</option>
						))}
					</select>
				</SettingsRow>
			</SettingsSection>
		);
	}

	if (profiles.length === 0) {
		return (
			<SettingsSection
				title="Profiles"
				description="Create your first provider profile to enable model configuration."
			>
				<SettingsRow
					label="Get started"
					description="Profiles let you save provider credentials and model choices."
				>
					<Button type="button" size="sm" onClick={onCreateProfile}>
						Create Profile
					</Button>
				</SettingsRow>
			</SettingsSection>
		);
	}

	return null;
}
