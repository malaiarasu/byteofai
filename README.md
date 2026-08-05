# malaiarasu-site

Personal site for publishing ideas and write-ups, built with [Jekyll](https://jekyllrb.com/) and hosted free on GitHub Pages. No build step required on your end — GitHub builds and deploys the site automatically every time you push.

## 1. One-time setup

This site is published to the `byteofai` repo, so it's served at `https://malaiarasu.github.io/byteofai` (not the domain root). `baseurl: "/byteofai"` is already set in `_config.yml` to match — don't remove it, or internal links will break.

1. **Push this folder's contents to the repo** (already done for you if you're reading this after the initial publish):

   ```bash
   cd malaiarasu-site
   git init
   git add .
   git commit -m "Initial site"
   git branch -M main
   git remote add origin https://github.com/malaiarasu/byteofai.git
   git push -u origin main
   ```

2. **Enable GitHub Pages:** on GitHub, go to the repo → **Settings** → **Pages** → under "Build and deployment", set **Source** to "Deploy from a branch", branch `main`, folder `/ (root)`. Save.
3. Wait a minute or two, then visit `https://malaiarasu.github.io/byteofai`.

That's it — no CI config, no Gemfile required. GitHub Pages runs Jekyll for you automatically.

## 2. Publishing a new idea or write-up

1. Copy `templates/new-post-template.md` into the `_posts/` folder.
2. Rename it to `YYYY-MM-DD-a-short-slug.md` (the date controls sort order and must match the `date:` field inside).
3. Fill in the title, date, `category` (`idea` or `publication` — controls the badge color), tags, and excerpt in the front matter, then write your content in Markdown below it.
4. If you have a file to attach (PDF, Word doc, slides, etc.), drop it in `assets/files/` and point the `download:` field at it, e.g. `/assets/files/my-file.pdf`. Delete the `download:` line if there's nothing to attach.
5. Commit and push:

   ```bash
   git add .
   git commit -m "Add: <post title>"
   git push
   ```

6. GitHub rebuilds automatically — refresh the site in a minute to see it live.

The home page (`index.html`) lists every post automatically, newest first — you never need to edit it by hand.

## 3. Editing the About page

Edit `about.md` directly — it's plain Markdown with a bit of HTML for the contact list. Update the bio, links, or title any time.

## 4. Site structure

```
_config.yml           Site title, description, author info, social links
_layouts/default.html Base page template (header, nav, footer)
_layouts/post.html    Template used for every post in _posts/
_posts/                One Markdown file per idea/publication
about.md               The About page
index.html              Home page — auto-lists all posts
assets/css/style.css   All styling
assets/files/          Downloadable attachments (docs, PDFs, etc.)
templates/              Copy-paste template for new posts (not published)
```

## 5. Previewing locally (optional)

If you have Ruby installed:

```bash
gem install bundler jekyll
bundle init
echo 'gem "github-pages", group: :jekyll_plugins' >> Gemfile
bundle install
bundle exec jekyll serve
```

Then open `http://localhost:4000`. This step is optional — pushing to GitHub is enough to see changes live.

## Note on repo naming / `baseurl`

- This repo is named `byteofai` (not `malaiarasu.github.io`), so GitHub serves it under a subpath: `https://malaiarasu.github.io/byteofai`. `baseurl: "/byteofai"` in `_config.yml` handles that — keep it in sync if you ever rename the repo.
- If you later move this to a repo named exactly `malaiarasu.github.io`, set `baseurl: ""` and `url: "https://malaiarasu.github.io"` to serve from the domain root instead.
