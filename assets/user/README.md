# Personal image replacements

The current manga scrapbook uses images copied from the project-level `Sae/` folder into `assets/images/sae/`. The originals are left unchanged. The 11 newest additions keep their original filenames in the site library; the full source-to-placement inventory is in [`../ASSET_MANIFEST.md`](../ASSET_MANIFEST.md).

The photographs are distributed as separate editorial notes and chapter features rather than collected in a gallery. To replace one, place your replacement image in `assets/images/sae/` and update the matching image `src`, descriptive `alt` text, and manifest row. Keep the original file proportions where possible; the CSS uses `object-fit: cover` to frame each panel without distorting it.

The hero's foreground portrait is `assets/cutouts/sae-frontal-portrait.png`. It is a transparent PNG derived from `assets/images/sae/portrait-front.jpg`; the original image remains unchanged. This cutout appears in the hero only. Every other pose has its own image path and one page placement. To replace the hero portrait, save a genuine transparent PNG in `assets/cutouts/` and update its image path in `index.html`. A regular image with a white background is not a drop-in replacement for this layered asset.

Before making the repository public, make sure you have permission to redistribute every image it contains.
