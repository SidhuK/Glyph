import { Suspense, lazy } from "react";
import { AboutSettingsPane } from "./AboutSettingsPane";
import { AiSettingsPane } from "./AiSettingsPane";
import { AppearanceSettingsPane } from "./AppearanceSettingsPane";
import { DeveloperSettingsPane } from "./DeveloperSettingsPane";
import { EditorSettingsPane } from "./EditorSettingsPane";
import { ExperimentalSettingsPane } from "./ExperimentalSettingsPane";
import { GeneralSettingsPane } from "./GeneralSettingsPane";
import { GitSettingsPane } from "./GitSettingsPane";
import { SidebarSettingsPane } from "./SidebarSettingsPane";
import { SpaceSettingsPane } from "./SpaceSettingsPane";
import { TypographySettingsPane } from "./TypographySettingsPane";
import type { SettingsTab } from "./settingsConfig";

const ShortcutsSettingsPane = lazy(() =>
	import("./ShortcutsSettingsPane").then((module) => ({
		default: module.ShortcutsSettingsPane,
	})),
);

export function SettingsTabContent({ tab }: { tab: SettingsTab }) {
	switch (tab) {
		case "general":
			return <GeneralSettingsPane />;
		case "appearance":
			return <AppearanceSettingsPane />;
		case "typography":
			return <TypographySettingsPane />;
		case "sidebar":
			return <SidebarSettingsPane />;
		case "editor":
			return <EditorSettingsPane />;
		case "shortcuts":
			return (
				<Suspense fallback={null}>
					<ShortcutsSettingsPane />
				</Suspense>
			);
		case "ai":
			return <AiSettingsPane />;
		case "space":
			return <SpaceSettingsPane />;
		case "git":
			return <GitSettingsPane />;
		case "about":
			return <AboutSettingsPane />;
		case "developer":
			return <DeveloperSettingsPane />;
		case "experimental":
			return <ExperimentalSettingsPane />;
		default: {
			const _exhaustive: never = tab;
			return _exhaustive;
		}
	}
}
