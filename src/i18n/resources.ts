import appDe from "./locales/de/app.json";
import commandsDe from "./locales/de/commands.json";
import commonDe from "./locales/de/common.json";
import nativeMenuDe from "./locales/de/nativeMenu.json";
import settingsDe from "./locales/de/settings.json";
import translationDe from "./locales/de/translation.json";
import uiDe from "./locales/de/ui.json";
import appEn from "./locales/en/app.json";
import commandsEn from "./locales/en/commands.json";
import commonEn from "./locales/en/common.json";
import nativeMenuEn from "./locales/en/nativeMenu.json";
import settingsEn from "./locales/en/settings.json";
import translationEn from "./locales/en/translation.json";
import uiEn from "./locales/en/ui.json";
import appEs from "./locales/es/app.json";
import commandsEs from "./locales/es/commands.json";
import commonEs from "./locales/es/common.json";
import nativeMenuEs from "./locales/es/nativeMenu.json";
import settingsEs from "./locales/es/settings.json";
import translationEs from "./locales/es/translation.json";
import uiEs from "./locales/es/ui.json";
import appFr from "./locales/fr/app.json";
import commandsFr from "./locales/fr/commands.json";
import commonFr from "./locales/fr/common.json";
import nativeMenuFr from "./locales/fr/nativeMenu.json";
import settingsFr from "./locales/fr/settings.json";
import translationFr from "./locales/fr/translation.json";
import uiFr from "./locales/fr/ui.json";
import appJa from "./locales/ja/app.json";
import commandsJa from "./locales/ja/commands.json";
import commonJa from "./locales/ja/common.json";
import nativeMenuJa from "./locales/ja/nativeMenu.json";
import settingsJa from "./locales/ja/settings.json";
import translationJa from "./locales/ja/translation.json";
import uiJa from "./locales/ja/ui.json";
import appKo from "./locales/ko/app.json";
import commandsKo from "./locales/ko/commands.json";
import commonKo from "./locales/ko/common.json";
import nativeMenuKo from "./locales/ko/nativeMenu.json";
import settingsKo from "./locales/ko/settings.json";
import translationKo from "./locales/ko/translation.json";
import uiKo from "./locales/ko/ui.json";
import appPtBr from "./locales/pt-BR/app.json";
import commandsPtBr from "./locales/pt-BR/commands.json";
import commonPtBr from "./locales/pt-BR/common.json";
import nativeMenuPtBr from "./locales/pt-BR/nativeMenu.json";
import settingsPtBr from "./locales/pt-BR/settings.json";
import translationPtBr from "./locales/pt-BR/translation.json";
import uiPtBr from "./locales/pt-BR/ui.json";

export const defaultNS = "common";

export const resources = {
	en: {
		app: appEn,
		commands: commandsEn,
		common: commonEn,
		nativeMenu: nativeMenuEn,
		settings: settingsEn,
		ui: uiEn,
		translation: translationEn,
	},
	es: {
		app: appEs,
		commands: commandsEs,
		common: commonEs,
		nativeMenu: nativeMenuEs,
		settings: settingsEs,
		ui: uiEs,
		translation: translationEs,
	},
	de: {
		app: appDe,
		commands: commandsDe,
		common: commonDe,
		nativeMenu: nativeMenuDe,
		settings: settingsDe,
		ui: uiDe,
		translation: translationDe,
	},
	fr: {
		app: appFr,
		commands: commandsFr,
		common: commonFr,
		nativeMenu: nativeMenuFr,
		settings: settingsFr,
		ui: uiFr,
		translation: translationFr,
	},
	"pt-BR": {
		app: appPtBr,
		commands: commandsPtBr,
		common: commonPtBr,
		nativeMenu: nativeMenuPtBr,
		settings: settingsPtBr,
		ui: uiPtBr,
		translation: translationPtBr,
	},
	ja: {
		app: appJa,
		commands: commandsJa,
		common: commonJa,
		nativeMenu: nativeMenuJa,
		settings: settingsJa,
		ui: uiJa,
		translation: translationJa,
	},
	ko: {
		app: appKo,
		commands: commandsKo,
		common: commonKo,
		nativeMenu: nativeMenuKo,
		settings: settingsKo,
		ui: uiKo,
		translation: translationKo,
	},
} as const;

export const namespaces = Object.keys(resources.en);
