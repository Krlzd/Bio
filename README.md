HI 
visit my bio here: https://krlzd.github.io/Bio/

## Profile Studio

The existing editor is available at `/Bio/admin/` after signing in with the authorized Supabase owner account. It edits the profile JSON draft; changes become public only after saving and publishing through the existing Supabase workflow.

Sections can be reordered, hidden, and customized with width and height presets, alignment, spacing, backgrounds, borders, image fitting, and grid, row, strip, or scrapbook arrangements. Public wording, labels, and visibility are editable individually in the studio. Optional effects respect the browser's reduced-motion preference.

Favorite Games and Favorite Shows & Anime are stored in the same profile JSON. Game entries are manual and can use an uploaded cover. Anime search uses AniList's public GraphQL API without a private key; rate limits or network errors leave manual entry available. No game or TMDB credentials are used in the browser.

Spotify sections show the embedded player automatically when a valid track URL is saved. Playback remains controlled by Spotify and the visitor.

To check the production bundle locally, run `npm run build`. No database migration is needed for these profile JSON additions.
