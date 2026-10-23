import { Calendar03Icon, PaintBoardIcon, PieChartIcon } from "@hugeicons/core-free-icons";

type ReleaseIcon = typeof PieChartIcon;

export interface ReleaseFeature {
	icon: ReleaseIcon;
	titleKey: string;
	bodyKey: string;
}

export interface Release {
	version: string;
	features: readonly [ReleaseFeature, ReleaseFeature, ReleaseFeature];
}

export const RELEASES = [
	{
		version: "0.9.3",
		features: [
			{
				icon: PieChartIcon,
				titleKey: "whatsNew.releases.0_9_3.progressRings.title",
				bodyKey: "whatsNew.releases.0_9_3.progressRings.body",
			},
			{
				icon: PaintBoardIcon,
				titleKey: "whatsNew.releases.0_9_3.appearance.title",
				bodyKey: "whatsNew.releases.0_9_3.appearance.body",
			},
			{
				icon: Calendar03Icon,
				titleKey: "whatsNew.releases.0_9_3.calendar.title",
				bodyKey: "whatsNew.releases.0_9_3.calendar.body",
			},
		],
	},
] as const satisfies readonly Release[];

export const LATEST_RELEASE: Release = RELEASES[0];

/** Prerelease builds (for example `0.9.3-alpha.5`) share their release's notes. */
export function releaseVersionOf(appVersion: string): string {
	return appVersion.split("-")[0] ?? appVersion;
}

export function findRelease(appVersion: string): Release | null {
	const version = releaseVersionOf(appVersion);
	return RELEASES.find((release) => release.version === version) ?? null;
}
