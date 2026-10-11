# SAE / 10 — A manga scrapbook

The deployed site is a responsive static Sae Itoshi fan scrapbook built around the manga-style images in the local `Sae/` folder. It uses scattered editorial image placements rather than a dense gallery, with ink-heavy borders, halftone textures, speed lines, sharp teal/blue annotations, and a transparent foreground portrait used only in the hero. The source image folder is left untouched; copies used by the site are organized in `assets/images/sae/`.

The configurable profile and visual editor in `studio/` uses Vite and React while preserving the manga-scrapbook visual direction. It keeps a local browser safety copy and connects to Supabase for owner-authenticated drafts, explicit publishing, and public profile images. GitHub Pages is configured to build and deploy this frontend at the `/Bio/` base path; no deployment has been run from these changes.

## Run locally

Open the root `index.html` in a browser to view the current site. Google Fonts are an optional external enhancement; system font fallbacks are included. The site remains usable if those fonts do not load.

### Run the editor prototype

Node.js 20.19+ and npm are required for the Vite prototype.

```sh
npm install
npm run dev
```

Open `/Bio/admin/` on the local Vite server for the authenticated editor, or `/Bio/` for the public profile preview. The editor keeps a browser-local safety copy and can separately load/save an owner-only Supabase draft and publish it. The public page reads only the published snapshot, with a last-published browser cache as an outage fallback. Drafts do not sync between browsers unless explicitly saved to Supabase. Do not rerun the existing database migration; it was prepared for first-time setup, not for updating an initialized project.

### Configure Supabase locally

1. Your existing owner account and its authorization have already been configured; do not create another user or change the owner record.
2. `.env.local` in the project root contains the local project URL and **publishable** key. It is ignored by Git. Never use a secret or service-role key in this frontend project, and do not send keys or passwords in chat.
3. The existing Supabase project is initialized. Do not run the first-time SQL migration in `supabase/migrations/` again; it is retained for reference and will stop if its objects already exist.
4. The browser client uses only the project URL and publishable key. Owner-only database authorization and Storage permissions are enforced by the existing Supabase policies, not by a hidden route or a frontend password check. This frontend build does not independently retest those live controls.
5. Before a future GitHub Pages build, add repository **Actions variables** named `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` under **Settings → Secrets and variables → Actions → Variables**. These are the public project URL and publishable key; never configure a service-role or secret key in the frontend build.

The editor can upload PNG, JPEG, WebP, GIF, and AVIF images up to 8 MiB into the public `bio-media` bucket under `sae/`. Public bucket assets are retrievable by anyone with their URL. Uploaded image references are local until you save the cloud draft; publication is a separate step. Deletion checks that the current draft and published profile no longer reference the image before removing it from Storage. Keep a local JSON backup before replacing cloud drafts.

The client-side publish button is not a security boundary; the database policies and publish function enforce access. The live policies are assumed to have been verified as you reported, but were not retested by this frontend build.

The editor's Spotify section accepts one Spotify track link at a time. Spotify's public oEmbed endpoint can provide a track title and cover image, but may not provide an artist name. The public preview opens Spotify's official player only after a visitor activates the listen button. Track duration and playback progress are not shown because Spotify does not document reliable track-level values for those in its embed API. The preview requires an internet connection to load Spotify metadata and playback.

## Publish with GitHub Pages

The GitHub Actions workflow builds the Vite public profile and editor, then deploys the contents of `dist/` on each push to `main`. The configured `/Bio/` Vite base produces the public page at `/Bio/` and the editor at `/Bio/admin/`. The workflow is configured but has not been run from these local changes.

For the `Krlzd/Bio` repository, the expected project-site address is `https://krlzd.github.io/Bio/`.

### First deployment

1. Before publishing the new frontend, use `/Bio/admin/` locally to sign in, save a cloud draft, and publish a profile. Without a published row the public page intentionally displays a no-publication message rather than exposing a local draft.
2. Review and commit the changes locally, then push to the repository's `main` branch only when you are ready. This project does **not** commit or push anything automatically.
3. On GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions** if it is not already selected.
4. Open the repository's **Actions** tab and wait for the Pages workflow to finish. The deployment job will report the published URL.

The workflow runs on pushes to `main` and can also be started manually from the Actions tab using **Run workflow**. If you use a different default branch, update the branch filter in `.github/workflows/pages.yml` before pushing.

## Personalize

See [`assets/user/README.md`](assets/user/README.md) for replacing artwork and the transparent portrait. The image inventory and placements are listed in [`assets/ASSET_MANIFEST.md`](assets/ASSET_MANIFEST.md). The chapter sentence has a small pointer-triggered scramble effect built with the site's JavaScript and CSS; no React, GSAP, or additional packages are required. Notes entered in the guestbook and the chosen color mode are saved in that browser's local storage only; they are not sent to GitHub or shared with other visitors.

The profile editor can store a Spotify track URL and the available oEmbed metadata in the profile JSON. Spotify playback is provided by its official embed; no track duration or progress is simulated.

## Attribution

This is an independent personal fan website created for non-commercial appreciation. Sae Itoshi and “Blue Lock” (ブルーロック) are intellectual property of Muneyuki Kaneshiro, Yusuke Nomura, and Kodansha Ltd. This site is not affiliated with or endorsed by the creators or production committee.
