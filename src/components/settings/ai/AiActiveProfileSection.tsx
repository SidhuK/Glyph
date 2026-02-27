import type { AiProfile } from "../../../lib/tauri";

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
			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">Active Profile</div>
						<div className="settingsCardHint">
							Switch between saved provider profiles.
						</div>
					</div>
				</div>
				<div className="settingsField">
					<div>
						<label className="settingsLabel" htmlFor="aiProfileSel">
							Active profile
						</label>
					</div>
					<select
						id="aiProfileSel"
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
				</div>
			</section>
		);
	}

	if (profiles.length === 0) {
		return (
			<section className="settingsCard">
				<div className="settingsCardHeader">
					<div>
						<div className="settingsCardTitle">Get Started</div>
						<div className="settingsCardHint">
							Create your first provider profile.
						</div>
					</div>
				</div>
				<div className="settingsRow">
					<button type="button" onClick={onCreateProfile}>
						Create Profile
					</button>
				</div>
			</section>
		);
	}

	return null;
}
