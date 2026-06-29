export const loadDatabasesPane = () =>
	import("../databases/DatabasesPane").then((module) => ({
		default: module.DatabasesPane,
	}));

export const loadAllDocsPane = () =>
	import("./AllDocsPane").then((module) => ({
		default: module.AllDocsPane,
	}));

export const loadActivityTimelinePane = () =>
	import("./ActivityTimelinePane").then((module) => ({
		default: module.ActivityTimelinePane,
	}));
