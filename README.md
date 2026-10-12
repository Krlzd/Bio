HI 
visit my bio here: https://krlzd.github.io/Bio/

## Profile Studio

The existing editor is available at `/Bio/admin/` after signing in with the authorized Supabase owner account. It edits the profile JSON draft; changes become public only after saving and publishing through the existing Supabase workflow.

Sections can be reordered, hidden, and customized with width and height presets, alignment, spacing, backgrounds, borders, image fitting, and grid, row, strip, or scrapbook arrangements. Public wording, labels, and visibility are editable individually in the studio. Optional effects respect the browser's reduced-motion preference.

Favorite Games and Favorite Shows & Anime are stored in the same profile JSON. Games can be entered manually or searched through an owner-authenticated Supabase Edge Function that keeps Twitch credentials server-side. Select IGDB gameplay screenshots or upload your own; chosen metadata and image URLs are saved in the draft, so the public profile makes no IGDB API calls. Pages showing IGDB data include a clickable attribution link. Previously saved RAWG game entries remain readable and editable. Anime search uses AniList's public GraphQL API without a private key; rate limits or network errors leave manual entry available.

### Enable IGDB game search

IGDB API access is free for non-commercial usage, with a documented limit of 4 requests per second and up to 8 open requests. It requires a free Twitch account with two-factor authentication and a **Confidential** developer application. Steam Store metadata is not used because the Store app-details endpoint is undocumented; Steam's documented Web API does not provide a general game search and screenshot service. Manual game entry and image uploads always work without an API.

1. Create a Twitch account, enable two-factor authentication, and register a **Confidential** application in the [Twitch Developer Console](https://dev.twitch.tv/console/apps). IGDB's setup docs say the redirect URL is unused and can be `localhost`.
2. Add the app's `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` under **Supabase Dashboard → Project Settings → Edge Functions → Secrets**. Never add either value to this repository, a `VITE_` variable, or the profile content.
3. Install the Supabase CLI if needed. Replace the placeholder `project_id` in `supabase/config.toml` with the project reference from your Supabase dashboard, then link this local project:

   ```powershell
   npx supabase link --project-ref YOUR_PROJECT_REF
   ```

4. Deploy only this function when you are ready:

   ```powershell
   npx supabase functions deploy igdb-games --project-ref YOUR_PROJECT_REF
   ```

The function requires a signed-in owner and the existing `is_profile_owner()` RPC. It does not add tables or run migrations. Requests are paced to stay below IGDB's documented limit and have an additional best-effort per-instance cap; the pacing is not a durable global limiter across Edge Function instances. No Twitch credentials, function deployment, or live Supabase change is included in local development by default.

Spotify sections show the embedded player automatically when a valid track URL is saved. Playback remains controlled by Spotify and the visitor.

To check the production bundle locally, run `npm run build`. No database migration is needed for these profile JSON additions.
