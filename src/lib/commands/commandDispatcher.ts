export type CommandHandlerMap = Record<string, () => void | Promise<void>>;

export function dispatchAppCommand(
	commandId: string,
	handlers: CommandHandlerMap,
): boolean {
	const handler = handlers[commandId];
	if (!handler) return false;
	void handler();
	return true;
}
