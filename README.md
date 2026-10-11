# SAE / 10 — A manga scrapbook

A responsive, static Sae Itoshi fan scrapbook built around the manga-style images in the local `Sae/` folder. It uses scattered editorial image placements rather than a dense gallery, with ink-heavy borders, halftone textures, speed lines, sharp teal/blue annotations, and a transparent foreground portrait used only in the hero. The source image folder is left untouched; copies used by the site are organized in `assets/images/sae/`. There is no framework, build step, or server-side code.

## Run locally

Open `index.html` in a browser. Google Fonts are an optional external enhancement; system font fallbacks are included. The site remains usable if those fonts do not load.

## Publish with GitHub Pages

This repository is configured to deploy through GitHub Actions. On each push to `main`, the workflow stages only `index.html`, `css/`, `js/`, and `assets/`, then publishes them to GitHub Pages. The `.nojekyll` marker keeps GitHub from trying to build the static site with Jekyll. There is no framework, build dependency, secret, or environment variable to configure.

For the `Krlzd/Bio` repository, the expected project-site address is `https://krlzd.github.io/Bio/`.

### First deployment

1. Create the initial commit locally and push it to the repository's `main` branch. This project does **not** commit or push anything automatically.
2. On GitHub, open **Settings → Pages** and set **Build and deployment → Source** to **GitHub Actions** if it is not already selected.
3. Open the repository's **Actions** tab and wait for **Deploy static site to GitHub Pages** to finish. The deployment job will report the published URL.

The workflow runs on pushes to `main` and can also be started manually from the Actions tab using **Run workflow**. If you use a different default branch, update the branch filter in `.github/workflows/pages.yml` before pushing.

## Personalize

See [`assets/user/README.md`](assets/user/README.md) for replacing artwork and the transparent portrait. The image inventory and placements are listed in [`assets/ASSET_MANIFEST.md`](assets/ASSET_MANIFEST.md). The chapter sentence has a small pointer-triggered scramble effect built with the site's JavaScript and CSS; no React, GSAP, or additional packages are required. Notes entered in the guestbook and the chosen color mode are saved in that browser's local storage only; they are not sent to GitHub or shared with other visitors.

The soundtrack entries open Spotify searches in new tabs; they are links, not embedded audio.

## Attribution

This is an independent personal fan website created for non-commercial appreciation. Sae Itoshi and “Blue Lock” (ブルーロック) are intellectual property of Muneyuki Kaneshiro, Yusuke Nomura, and Kodansha Ltd. This site is not affiliated with or endorsed by the creators or production committee.
