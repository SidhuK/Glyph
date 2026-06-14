export const loadDatabasesPane = () =>
	import("../databases/DatabasesPane").then((module) => ({
		default: module.DatabasesPane,
	}));

export const loadAllDocsPane = () =>
	import("./AllDocsPane").then((module) => ({
		default: module.AllDocsPane,
	}));
