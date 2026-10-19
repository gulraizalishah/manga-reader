# Panel — Manga Reader

A responsive, static manga discovery and reading app powered by the public [MangaDex API](https://api.mangadex.org/docs/). It is designed to be uploaded directly to GitHub and deployed on Netlify without a build step.

## Features

- Browse popular manga and latest updates
- Search the MangaDex catalogue by title
- View series details, genres, status, and descriptions
- Browse English-translated chapters and load more
- Read chapter pages in a simple vertical reader
- Save manga to a local shelf (stored in this browser)
- Responsive layout for mobile and desktop
- No API key or server-side environment variables required

## Deploy to GitHub + Netlify

1. Download and unzip this project.
2. Create a new repository on GitHub.
3. Upload **the contents** of this folder (make sure `index.html` is in the repository root) and commit.
4. In Netlify, choose **Add new project → Import an existing project**.
5. Connect GitHub and select your repository.
6. Use the included `netlify.toml`. If Netlify asks for settings, leave **Build command** blank and set **Publish directory** to `.`.
7. Deploy. Future pushes to the connected GitHub branch trigger redeploys.

Official guide: https://docs.netlify.com/start/quickstarts/deploy-from-repository/

## Run locally

Because this is a static site, you can open `index.html` in a browser. For a more reliable local test, serve the folder with any static server, e.g.:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Important notes

- This app requests data and chapter images directly from MangaDex in the visitor's browser. It depends on MangaDex being reachable and allowing the request from the current network/browser. Some networks, browser extensions, or API-side limits may block requests.
- Saved manga are stored in `localStorage` on that browser/device; they do not sync between devices.
- The reader prefers data-saver images when available. Use the quality button to switch between data-saver and full-quality pages.
- Manga availability, translations, chapter ordering, and images are provided by MangaDex and may vary by series.
- Respect MangaDex's terms and the rights of the original creators and publishers. This project does not host or redistribute manga files itself.
- This is a starter app, not a production backend. It has no user accounts, cloud sync, reading history sync, or offline chapter downloads.
