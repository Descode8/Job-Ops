# JobOps legal pages

This directory is a dependency-free static site for the JobOps Privacy Policy and Terms of Service. It is deployed by `.github/workflows/deploy-legal-pages.yml`.

Before publishing, replace every occurrence of:

```text
[REPLACE WITH DESCODE LLC SUPPORT EMAIL]
```

with a monitored Descode LLC support address in both the static pages and the matching Expo routes.

## GitHub Pages deployment

1. Commit and push `legal-site/` and `.github/workflows/deploy-legal-pages.yml` to the repository's `main` branch.
2. Open the GitHub repository and select **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions > Deploy JobOps legal pages** and run the workflow, or push a change under `legal-site/`.
5. Read the final URL from the workflow's `github-pages` deployment. The clean policy paths are that deployment URL followed by `privacy/` and `terms/`.

Do not submit the URLs for A2P review until the support-email placeholder has been replaced and the two pages return HTTP 200 publicly without authentication.
