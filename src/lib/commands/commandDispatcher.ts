type CommandHandlerMap = Partial<Record<string, () => void | Promise<void>>>;

export async function dispatchAppCommand(
	commandId: string,
	handlers: CommandHandlerMap,
): Promise<boolean> {
	const handler = handlers[commandId];
	if (!handler) return false;
	await handler();
	return true;
}
