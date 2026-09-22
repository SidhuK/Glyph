const CANVAS_AUTOSAVE_DELAY_MS = 500;

interface CanvasSaveQueueOptions {
	initialText: string;
	initialMtimeMs: number;
	readCurrentText: () => string | null;
	write: (text: string, baseMtimeMs: number) => Promise<number>;
	onDirtyChange: (dirty: boolean) => void;
	onError: (error: unknown) => void;
}

export class CanvasSaveQueue {
	private lastSavedText: string;
	private mtimeMs: number;
	private pending = false;
	private timer: number | null = null;
	private saving: Promise<void> | null = null;

	constructor(private readonly options: CanvasSaveQueueOptions) {
		this.lastSavedText = options.initialText;
		this.mtimeMs = options.initialMtimeMs;
	}

	enqueue() {
		this.pending = true;
		this.options.onDirtyChange(true);
		if (this.timer !== null) window.clearTimeout(this.timer);
		this.timer = window.setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, CANVAS_AUTOSAVE_DELAY_MS);
	}

	async flush(): Promise<void> {
		if (this.saving) return this.saving;
		if (this.timer !== null) {
			window.clearTimeout(this.timer);
			this.timer = null;
		}
		if (!this.pending) return;
		const text = this.options.readCurrentText();
		if (text === null) return;
		this.pending = false;
		if (text === this.lastSavedText) {
			this.options.onDirtyChange(false);
			return;
		}
		let failed = false;
		this.saving = this.options
			.write(text, this.mtimeMs)
			.then((mtimeMs) => {
				this.mtimeMs = mtimeMs;
				this.lastSavedText = text;
				if (!this.pending) this.options.onDirtyChange(false);
			})
			.catch((error: unknown) => {
				failed = true;
				this.pending = true;
				this.options.onError(error);
			})
			.finally(() => {
				this.saving = null;
			});
		await this.saving;
		if (this.pending && !failed) await this.flush();
	}
}
