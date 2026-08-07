# Byte of AI

Personal site for publishing AI/Cloud/Coding/Algorithms write-ups, built with [Jekyll](https://jekyllrb.com/) and hosted free on GitHub Pages. No build step required on your end — GitHub builds and deploys the site automatically every time you push.

## 1. One-time setup

This site is served from the custom domain in `CNAME` (`byteofai.dev`), which sits at the domain root — so `baseurl` in `_config.yml` must stay `""`. Only set a `baseurl` if you ever remove `CNAME` and fall back to `https://<username>.github.io/byteofai`.

1. **Push this folder's contents to the repo** (already done for you if you're reading this after the initial publish):

   ```bash
   cd byteofai
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/malaiarasu/byteofai.git
   git push -u origin main
   ```

2. **Enable GitHub Pages:** on GitHub, go to the repo → **Settings** → **Pages** → under "Build and deployment", set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
3. **Custom domain:** under the same Pages settings, set the custom domain to `byteofai.dev` (should auto-detect from the `CNAME` file) and enable "Enforce HTTPS" once the certificate is issued.
4. Wait a minute or two, then visit `https://byteofai.dev`.

That's it — no CI config, no Gemfile required. GitHub Pages runs Jekyll for you automatically.

### Deploying to Cloudflare Workers instead

This repo also includes `wrangler.jsonc`, which deploys the site as a Cloudflare Worker with static assets instead of (or in addition to) GitHub Pages:

```jsonc
{
  "name": "byteofai",
  "build": { "command": "bundle exec jekyll build" },
  "assets": { "directory": "./_site" }
}
```

In the Cloudflare dashboard, connect this repo under **Workers & Pages** and make sure the **Build command** field is exactly `bundle exec jekyll build` — do **not** prefix it with `npx` (that's for Node packages; `bundle` is Ruby's Bundler and isn't an npm package). If a build ever fails with an `Invalid US-ASCII character` / `Sass::SyntaxError`, add these Build environment variables in the dashboard (Cloudflare's build image doesn't default to a UTF-8 locale):

| Variable | Value |
| --- | --- |
| `LANG` | `en_US.UTF-8` |
| `LC_ALL` | `C.UTF-8` |
| `LANGUAGE` | `en_US.UTF-8` |

## 2. Site structure & navigation

The site is organized around four topics, surfaced as tabs in the left sidebar: **AI**, **Cloud**, **Coding**, **Algorithms**, plus **About**. Each topic has its own page (`ai.md`, `cloud.md`, `coding.md`, `algorithms.md`) that automatically lists every post tagged with that topic.

## 3. Publishing a new article

1. Copy `templates/new-post-template.md` into the `_posts/` folder.
2. Rename it to `YYYY-MM-DD-a-short-slug.md` (the date controls sort order and must match the `date:` field inside).
3. Fill in the title, date, `topic` (`ai`, `cloud`, `coding`, or `algorithms` — controls the colored badge and which sidebar tab/topic page it appears under), tags, and excerpt in the front matter, then write your content in Markdown below it.
4. If you have a file to attach (PDF, Word doc, slides, etc.), drop it in `assets/files/` and point the `download:` field at it, e.g. `/assets/files/my-file.pdf`. Delete the `download:` line if there's nothing to attach.
5. Commit and push:

   ```bash
   git add .
   git commit -m "Add: <post title>"
   git push
   ```

6. GitHub rebuilds automatically — refresh the site in a minute to see it live.

The home page (`index.html`) and each topic page (`/ai/`, `/cloud/`, `/coding/`, `/algorithms/`) list matching posts automatically, newest first — you never need to edit them by hand.

## 4. Editing the About page

Edit `about.md` directly — it's plain Markdown with a bit of HTML for the contact list. Update the bio, links, or title any time.

## 5. Site structure

```
_config.yml            Site title, description, author info, social links
_layouts/default.html  Base page template (sidebar nav, footer)
_layouts/post.html     Template used for every post in _posts/
_layouts/topic.html    Template used for ai.md / cloud.md / coding.md / algorithms.md
_includes/post-card.html  Shared article-card markup (home + topic pages)
_posts/                One Markdown file per article
ai.md, cloud.md, coding.md, algorithms.md  Topic pages — auto-list posts by topic
about.md               The About page
index.html             Home page — hero, topic explorer, all posts
assets/css/style.css   All styling
assets/js/theme.js     Light/dark theme toggle
assets/files/          Downloadable attachments (docs, PDFs, etc.)
templates/             Copy-paste template for new posts (not published)
```

## 6. Previewing locally (optional)

The `Gemfile` in this repo uses plain `jekyll` (4.3.x) plus `jekyll-feed` and `jekyll-seo-tag` — no need for the `github-pages` meta-gem since this site isn't hosted on GitHub Pages. If you have a modern Ruby installed (3.1+):

```bash
gem install bundler jekyll
bundle install
bundle exec jekyll serve --livereload
```

**If your system Ruby is older** (e.g. macOS's bundled Ruby 2.6), the Gemfile's Jekyll 4.3 requirement won't install. Use a standalone Jekyll instead:

```bash
export GEM_HOME="$(ruby -e 'puts Gem.user_dir')"
export PATH="$GEM_HOME/bin:$PATH"
export JEKYLL_NO_BUNDLER_REQUIRE=true

# one-time install of versions compatible with old Ruby:
gem install jekyll -v 4.2.2 rouge -v 3.30.0 i18n -v 1.14.8 \
  public_suffix -v 4.0.7 ffi -v 1.15.5 jekyll-feed jekyll-seo-tag \
  --user-install --no-document

jekyll serve --livereload
```

Then open `http://localhost:4000`. This step is optional — pushing to GitHub is enough to see changes live.
