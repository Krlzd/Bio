# Manga Scrapbook Asset Manifest

The site uses all 21 distinct artworks currently in `Sae/`. The 11 recently added files are copied byte-for-byte into `images/sae/` with their original filenames; their source files remain untouched. Each artwork appears once in the page. The original ten artworks are also assigned one placement each; the hero cutout is a transparent derivative of its source image, not a second pose.

| Page placement | Site asset | Original in `Sae/` |
|---|---|---|
| Hero foreground cutout | `cutouts/sae-frontal-portrait.png` (derived from `images/sae/portrait-front.jpg`) | `345dc870a193b407bc6a6c3317fb0c03.jpg` |
| Player dossier, side profile | `images/sae/stadium-profile.jpg` | `images (3).jpg` |
| Dossier inset, rear view | `images/sae/jersey-back.jpg` | `641182149a7b80cc5af3f8a02f6475f0.jpg` |
| Dossier margin note, oblique close-up | `images/sae/11cf7ab166a3d5eb45a2da4af2a7f77b.jpg` | `11cf7ab166a3d5eb45a2da4af2a7f77b.jpg` |
| Interleaf, focused gaze | `images/sae/189625971c8f7e2c515a9948c563bbc3.jpg` | `189625971c8f7e2c515a9948c563bbc3.jpg` |
| Interleaf, halftone eyes | `images/sae/close-up-halftone.jpeg` | `r4o45k2iwyge1.jpeg` |
| Chapter 02 feature, passing pose | `images/sae/panel-pass.jpg` | `images (2).jpg` |
| Chapter 02 inset, angled gaze | `images/sae/1f7f36b48f299523ad6d3d7a2267b99b.jpg` | `1f7f36b48f299523ad6d3d7a2267b99b.jpg` |
| Field theory, forward stare | `images/sae/panel-stare.jpg` | `images (1).jpg` |
| Field theory margin note, composed expression | `images/sae/5b04d2edb6e390cf0f8314eee1436dde.jpg` | `5b04d2edb6e390cf0f8314eee1436dde.jpg` |
| Chapter 04 feature, sprint pose | `images/sae/panel-sprint.jpg` | `images (5).jpg` |
| Chapter 04 inset, movement panel | `images/sae/68a0dc09755d9dc26f2d3ecc3bfa82e9.jpg` | `68a0dc09755d9dc26f2d3ecc3bfa82e9.jpg` |
| Chapter 04 margin, angled pose | `images/sae/panel-angle.jpg` | `images (4).jpg` |
| Chapter 04 lower still, speed-line portrait | `images/sae/7825e5b2e0c4266114c277df0aa54cb4.jpg` | `7825e5b2e0c4266114c277df0aa54cb4.jpg` |
| Side B heading, selective-color eyes | `images/sae/color-break.jpg` | `images.jpg` |
| Side B margin, profile | `images/sae/7aa94707c5f6bf75497df8607b7bb189.jpg` | `7aa94707c5f6bf75497df8607b7bb189.jpg` |
| Side B after-note, reflective close-up | `images/sae/80232d5d1f8e35005194328a45718feb.jpg` | `80232d5d1f8e35005194328a45718feb.jpg` |
| Back matter, Sae beside another player | `images/sae/panel-rival.webp` | `GHj3myEb0AACZd0.webp` |
| Back matter detail, close-up | `images/sae/83b7b7628e3a448b37351342fb6b2b79.jpg` | `83b7b7628e3a448b37351342fb6b2b79.jpg` |
| Colophon, focused eyes | `images/sae/b39be7f36de7cb86a160398ba9d0963f.jpg` | `b39be7f36de7cb86a160398ba9d0963f.jpg` |
| Colophon, full-length jersey pose | `images/sae/fd0c0e2d4535f1f3bf0499ea4e85ead9.jpg` | `fd0c0e2d4535f1f3bf0499ea4e85ead9.jpg` |

## Transparent cutout

`cutouts/sae-frontal-portrait.png` is a transparent foreground cut from `images/sae/portrait-front.jpg`; it is used only in the hero. The source image remains unchanged in both `Sae/` and `images/sae/`. All other page images use separate poses and appear once.

The former dense gallery has been removed. Artwork now sits in independent editorial notes and chapter features throughout the page. Tactical markings, panel borders, screentones, captions, and speed lines are made with HTML/CSS; no image build step or external image host is needed.

Before making the repository public, make sure you have permission to redistribute every image it contains.
