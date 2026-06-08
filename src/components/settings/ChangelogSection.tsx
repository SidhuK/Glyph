import { NewReleasesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { VersionReleaseNotes } from "../../data/releaseNotes";

interface ChangelogSectionProps {
	version: VersionReleaseNotes | null;
}

function countVersionItems(version: VersionReleaseNotes): number {
	return version.sections.reduce((total, section) => {
		if (!Array.isArray(section.items)) return total;
		return total + section.items.length;
	}, 0);
}

function ReleaseNotesVersion({
	version,
}: {
	version: VersionReleaseNotes;
}) {
	const sections = version.sections.filter(
		(section) => Array.isArray(section.items) && section.items.length > 0,
	);

	return (
		<div className="settingsChangelogVersion">
			{sections.length > 0 ? (
				<div className="settingsChangelogVersionContent">
					{sections.map((section) => (
						<div key={section.category} className="settingsChangelogCategory">
							<div
								className="settingsChangelogCategoryLabel"
								data-category={section.category}
							>
								{section.category}
							</div>
							<ul className="settingsChangelogItemList">
								{section.items.map((item, index) => (
									<li
										key={`${section.category}-${index}`}
										className="settingsChangelogItem"
									>
										{item}
									</li>
								))}
							</ul>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}

export function ChangelogSection({ version }: ChangelogSectionProps) {
	if (!version) {
		return (
			<div className="settingsChangelogEmpty">
				<p>No release notes available.</p>
			</div>
		);
	}

	return (
		<div className="settingsChangelog">
			<div className="settingsChangelogSummary">
				<div className="settingsChangelogSummaryIcon" aria-hidden="true">
					<HugeiconsIcon
						icon={NewReleasesIcon}
						size="var(--icon-xl)"
						strokeWidth={0.9}
					/>
				</div>
				<div className="settingsChangelogSummaryCopy">
					<div className="settingsChangelogSummaryEyebrow">Latest release</div>
					<div className="settingsChangelogSummaryTitle">
						v{version.version}
					</div>
				</div>
				<div className="settingsChangelogSummaryMeta">
					<span>{countVersionItems(version)} changes</span>
				</div>
			</div>
			<div className="settingsChangelogList">
				<ReleaseNotesVersion version={version} />
			</div>
		</div>
	);
}
