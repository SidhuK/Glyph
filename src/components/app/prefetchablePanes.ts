export const loadDatabasesPane = () =>
	import("../databases/DatabasesPane").then((module) => ({
		default: module.DatabasesPane,
	}));

export const loadActivityTimelinePane = () =>
	import("./ActivityTimelinePane").then((module) => ({
		default: module.ActivityTimelinePane,
	}));

export const loadTasksPane = () =>
	import("../tasks/TasksPane").then((module) => ({
		default: module.TasksPane,
	}));
