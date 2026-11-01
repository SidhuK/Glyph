import { type Editor, Extension } from "@tiptap/core";

interface ImagePickerOptions {
	onPickImages?: (editor: Editor) => void;
}

declare module "@tiptap/core" {
	interface Commands<ReturnType> {
		imagePicker: {
			pickImages: () => ReturnType;
		};
	}
}

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
