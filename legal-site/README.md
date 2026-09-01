# JobOps legal pages

This directory is a dependency-free static site for the JobOps Privacy Policy, Terms of Service, and SMS Consent documentation. It is deployed by `.github/workflows/deploy-legal-pages.yml`.

## GitHub Pages deployment

1. Commit and push `legal-site/` and `.github/workflows/deploy-legal-pages.yml` to the repository's `main` branch.
2. Open the GitHub repository and select **Settings > Pages**.
3. Under **Build and deployment**, set **Source** to **GitHub Actions**.
4. Open **Actions > Deploy JobOps legal pages** and run the workflow, or push a change under `legal-site/`.
5. Read the final URL from the workflow's `github-pages` deployment. The clean legal paths are that deployment URL followed by `privacy/`, `terms/`, and `sms-consent/`.

The monitored legal and SMS support address is `descodellc@gmail.com`.
