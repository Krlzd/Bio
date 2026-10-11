# Sae Itoshi Manga Scrapbook — Design Notes

## Reference review

The page is built around the monochrome manga imagery in `Sae/`: tight expressions, halftone close-ups, motion lines, a stadium profile, a jersey view, and a selectively colored eye panel. Eleven additional, distinct images have been added to the same visual vocabulary. The originals remain untouched, and the complete source-to-placement map is in [`assets/ASSET_MANIFEST.md`](assets/ASSET_MANIFEST.md).

## Composition

- Keep the cover anchored by one transparent foreground portrait and oversized condensed typography.
- Preserve the player dossier, but let its photos and margin annotation lead into the next section.
- Replace the former dense manga gallery with a single featured panel, editorial interleaves, and chapter-specific image notes distributed down the page.
- Use each distinct pose once. The hero cutout is the only derived image and appears only in the hero.
- Use CSS for hard ink rules, halftone paper, field lines, captions, speed lines, and restrained interaction.
- Keep responsive navigation, the light/dark ink toggle, quote-copy action, soundtrack links, and locally saved guestbook notes.

## Scrambled text

The short chapter annotation uses a small vanilla-JavaScript pointer scramble inspired by the supplied React Bits ScrambledText component. It keeps an accessible unanimated text equivalent, runs only for fine pointers, and respects reduced-motion preferences. The supplied WebGL effects were not integrated: they require substantially heavier rendering/dependencies and do not fit the paper-and-ink design.

## Implementation and publishing

The project is static HTML, CSS, and JavaScript with relative asset paths, so it remains compatible with GitHub Pages from the repository root. No deployment or push was performed. See [`README.md`](README.md) for deployment steps and the image-rights reminder.
