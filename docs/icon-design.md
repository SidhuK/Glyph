# Glyph icon artwork

The editable source is `Glyph.icon`. Its five transparent 1024 × 1024 PNG layers, from back to front, are the blue page, coral page, violet page, ivory asterisk, and indigo pocket. The document supplies separate default and dark background fills. Native glass is enabled on all five layers, with group translucency at 50% and a neutral shadow at 35%. Each layer can be selected independently in Icon Composer.

Run `bash scripts/compile-icon.sh` on macOS with Xcode installed to regenerate `Assets.car`, both ICNS files, the development PNG, PNG sizes, and `public/glyph-app-icon.png`. The script uses Apple's compiled ICNS rendition so exported previews retain the same Dock margins.

The artwork was generated with the built-in image generation tool from the approved folded-page mockup. Individual cutouts were placed on a shared canvas. The rear sheet is cyan-blue; the opaque checkerboard versions were discarded.

## Generation prompts

The coral, violet, glyph, and pocket prompts use the approved complete mockup as their reference. The final blue prompt uses the isolated coral page.

### Blue page

Make this single page teal-blue instead of orange, hue azure turquoise with moderate saturation and pale cyan fold and lines. Isolated object on transparent background. Preserve the input alpha channel. Output actual RGBA transparency. No checkerboard. Same shape, size, placement.

### Coral page

Extract/reconstruct ONLY the coral orange middle document page as an editable layer. Remove ALL other objects including blue and purple pages, asterisk, pocket, and background. Complete occluded lower part of coral page as solid coral coated paper with rounded bottom. Preserve two pale writing strokes and folded upper-right corner, material and lighting. Square canvas with genuinely TRANSPARENT alpha background (not a drawn checkerboard). Exact placement relative to canvas: left 19%, right 82%, top 23%, bottom 84%. Preserve placement, do not center or enlarge. No external cast shadow. Only coral page.

### Violet page

Extract/reconstruct ONLY the violet front document page as editable icon layer. Remove ivory asterisk completely and reconstruct uninterrupted violet paper beneath it. Remove all other pages, holder and background. Preserve folded upper-right corner and soft coated paper texture, violet lighting. Reconstruct lower rounded corners where hidden. Square canvas genuinely transparent alpha background, not checkerboard. Exact original placement: left 21%, right 81%, top 36%, bottom 84%. Do not recenter or enlarge. No text, no symbols, no external shadow. Only blank violet page with folded corner.

### Ivory asterisk

Extract ONLY the warm ivory six-spoke asterisk from this reference as an isolated editable layer on genuinely transparent alpha background, NOT a painted checkerboard. Remove every page, pocket, all background. Keep the same rounded spoke shapes and cream ceramic soft bevel lighting. Square canvas preserve exact location and size: symbol bounds x35% to65%, y46% to78%. Do not recenter or enlarge. Only the ivory glyph, clean edges, no external shadow.

### Indigo pocket

Extract ONLY the indigo document pocket/holder from this icon, remove all three colored pages and ivory asterisk and background. Keep its exact visible shape: low sweeping U-shaped curved front lip and short upright sides, the opening between arms MUST be transparent, not filled. Preserve dark indigo soft material and highlights. Full square canvas with genuine transparent alpha background, NOT painted checkerboard. Exact reference placement x13% to87%, y50% to90%, do not center or enlarge. Do not fill in opening. Only the U-shaped indigo pocket on transparency, no outside drop shadow.
