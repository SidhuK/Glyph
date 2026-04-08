import {
	AddCircleIcon,
	ArrowDown01Icon,
	ArrowRight01Icon,
	Calendar03Icon,
	CheckmarkCircle02Icon,
	Delete02Icon,
	PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ComponentProps } from "react";
import { useState } from "react";
import type { VersionReleaseNotes } from "../../data/releaseNotes";
import { PUBLIC_CHANGELOG_URL } from "../../lib/releaseNotes";
import { Button } from "../ui/shadcn/button";

const CATEGORY_ICONS: Record<
	string,
	ComponentProps<typeof HugeiconsIcon>["icon"]
> = {
	Added: AddCircleIcon,
	Improved: PencilEdit02Icon,
	Fixed: CheckmarkCircle02Icon,
	Removed: Delete02Icon,
};

interface ChangelogSectionProps {
	versions: VersionReleaseNotes[];
}

function formatPublishedDate(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
	}).format(date);
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
	const publishedDate = formatPublishedDate(version.publishedAt);
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
				<div className="settingsChangelogVersionDate">
					<HugeiconsIcon icon={Calendar03Icon} size={12} strokeWidth={0.9} />
					<span>{publishedDate}</span>
				</div>
				<span className="settingsChangelogToggle">
					<HugeiconsIcon
						icon={ArrowDown01Icon}
						size={16}
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
									{CATEGORY_ICONS[section.category] && (
										<HugeiconsIcon
											icon={CATEGORY_ICONS[section.category]}
											size={12}
											strokeWidth={0.9}
										/>
									)}
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
	const [openVersion, setOpenVersion] = useState<string | null>(() => {
		// Open the latest version by default
		return versions[0]?.version ?? null;
	});

	const toggleVersion = (version: string) => {
		setOpenVersion((prev) => (prev === version ? null : version));
	};

	const handleOpenFullChangelog = () => {
		void openUrl(PUBLIC_CHANGELOG_URL).catch((error) => {
			console.error("Failed to open changelog URL", error);
		});
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
			<div className="settingsChangelogFooter">
				<Button
					type="button"
					variant="ghost"
					size="sm"
					onClick={handleOpenFullChangelog}
				>
					Full changelog
					<HugeiconsIcon icon={ArrowRight01Icon} size={14} strokeWidth={0.9} />
				</Button>
			</div>
		</div>
	);
}
