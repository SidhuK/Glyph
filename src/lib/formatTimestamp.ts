export function formatTimestamp(timestamp: number | null): string {
	if (!timestamp) return "Never";
	try {
		return new Date(timestamp).toLocaleString();
	} catch {
		return "Unknown";
	}
}
