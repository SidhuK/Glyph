export const loadDatabasesPane = () =>
	import("../databases/DatabasesPane").then((module) => ({
		default: module.DatabasesPane,
	}));

export const loadCalendarPane = () =>
	import("../calendar/CalendarPane").then((module) => ({
		default: module.CalendarPane,
	}));

export const loadAllDocsPane = () =>
	import("./AllDocsPane").then((module) => ({
		default: module.AllDocsPane,
	}));

export const loadTasksPane = () =>
	import("../tasks/TasksPane").then((module) => ({
		default: module.TasksPane,
	}));
