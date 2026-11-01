import { type Editor, Extension } from "@tiptap/core";

interface ImagePickerOptions {
	/** Opens the open panel and inserts the picked images. Unset where the editor can't store attachments. */
	onPickImages?: (editor: Editor) => void;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		imagePicker: {
			pickImages: () => ReturnType;
		};
	}
}

/** One `pickImages` command for the format bar, slash menu, command palette and menu bar. */
export const ImagePicker = Extension.create<ImagePickerOptions>({
	name: "imagePicker",

	addCommands() {
		return {
			pickImages:
				() =>
				({ editor, dispatch }) => {
					const { onPickImages } = this.options;
					if (!onPickImages) return false;
					if (dispatch) onPickImages(editor);
					return true;
				},
		};
	},
});
