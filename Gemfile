source "https://rubygems.org"

# Plain Jekyll + only the plugins this site actually uses, instead of the
# "github-pages" meta-gem. That gem pins ~15 old GitHub-Pages theme gems
# (jekyll-theme-primer, cayman, dinky, etc.) as dependencies even though
# none of them are used here, and their legacy Sass files can break builds
# on environments without a UTF-8 locale (e.g. Cloudflare's build image).
# We don't need GitHub Pages' exact toolchain since the site is hosted on
# Cloudflare, not GitHub Pages.
gem "jekyll", "~> 4.3"
gem "jekyll-feed"
gem "jekyll-seo-tag"
