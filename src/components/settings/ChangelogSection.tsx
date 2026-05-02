import { ArrowRight01Icon, NewReleasesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import type { VersionReleaseNotes } from "../../data/releaseNotes";

interface ChangelogSectionProps {
	versions: VersionReleaseNotes[];
}

function countVersionItems(version: VersionReleaseNotes): number {
	return version.sections.reduce((total, section) => {
		if (!Array.isArray(section.items)) return total;
		return total + section.items.length;
	}, 0);
}

function VersionAccordion({
	version,
	isOpen,
	onToggle,
	isLatest,
}: {
	version: VersionReleaseNotes;
	isOpen: boolean;
	onToggle: () => void;
	isLatest: boolean;
}) {
	const hasContent = version.sections.some(
		(s) => Array.isArray(s.items) && s.items.length > 0,
	);

	return (
		<div className="settingsChangelogVersion">
			<button
				type="button"
				className="settingsChangelogVersionHeader"
				onClick={onToggle}
				aria-expanded={isOpen}
			>
				<div className="settingsChangelogVersionMeta">
					<span className="settingsChangelogVersionNumber">
						v{version.version}
					</span>
					{isLatest && (
						<span className="settingsChangelogVersionBadge">Latest</span>
					)}
				</div>
				<span className="settingsChangelogToggle">
					<HugeiconsIcon
						icon={ArrowRight01Icon}
						size={14}
						strokeWidth={0.9}
						className="settingsChangelogToggleIcon"
					/>
				</span>
			</button>

			{isOpen && hasContent && (
				<div className="settingsChangelogVersionContent">
					{version.sections
						.filter(
							(section) =>
								Array.isArray(section.items) && section.items.length > 0,
						)
						.map((section) => (
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
			)}
		</div>
	);
}

export function ChangelogSection({ versions }: ChangelogSectionProps) {
	const [openVersion, setOpenVersion] = useState<string | null>(
		() => versions[0]?.version ?? null,
	);
	const latestVersion = versions[0] ?? null;

	const toggleVersion = (version: string) => {
		setOpenVersion((prev) => (prev === version ? null : version));
	};

	if (versions.length === 0) {
		return (
			<div className="settingsChangelogEmpty">
				<p>No release notes available.</p>
			</div>
		);
	}

	return (
		<div className="settingsChangelog">
			{latestVersion ? (
				<div className="settingsChangelogSummary">
					<div className="settingsChangelogSummaryIcon" aria-hidden="true">
						<HugeiconsIcon icon={NewReleasesIcon} size={18} strokeWidth={0.9} />
					</div>
					<div className="settingsChangelogSummaryCopy">
						<div className="settingsChangelogSummaryEyebrow">
							Latest release
						</div>
						<div className="settingsChangelogSummaryTitle">
							v{latestVersion.version}
						</div>
					</div>
					<div className="settingsChangelogSummaryMeta">
						<span>{countVersionItems(latestVersion)} changes</span>
					</div>
				</div>
			) : null}
			<div className="settingsChangelogList">
				{versions.map((version, index) => (
					<VersionAccordion
						key={version.version}
						version={version}
						isOpen={openVersion === version.version}
						onToggle={() => toggleVersion(version.version)}
						isLatest={index === 0}
					/>
				))}
			</div>
		</div>
	);
}
