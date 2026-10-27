import folderLayer from "../../../Glyph.icon/Assets/2-folder.svg";
import asteriskLayer from "../../../Glyph.icon/Assets/3-asterisk.svg";
import wordmarkLayer from "../../../Glyph.icon/Assets/4-wordmark.svg";
import smallAsterisksLayer from "../../../Glyph.icon/Assets/5-asterisks-small.svg";

// Bottom-to-top layer order and offsets mirror Glyph.icon/icon.json.
const LAYERS = [
	{ name: "backSheet", src: folderLayer },
	{ name: "folder", src: folderLayer },
	{ name: "asterisk", src: asteriskLayer },
	{ name: "wordmark", src: wordmarkLayer },
	{ name: "smallAsterisks", src: smallAsterisksLayer },
] as const;

export function EmptyStateWatermark() {
	return (
		<div aria-hidden="true" className="mainEmptyWatermark">
			{LAYERS.map((layer) => (
				<div
					key={layer.name}
					className="mainEmptyWatermarkLayer"
					data-layer={layer.name}
					style={{ maskImage: `url("${layer.src}")` }}
				/>
			))}
		</div>
	);
}
