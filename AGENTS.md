# Autonomous Project Rules & Auto-Deployment Protocol

## Core Mandate: Full Automation
The owner of this project does not write code or run Git commands manually. The AI agent acts on their behalf and handles 100% of implementation, maintenance, and deployment tasks end-to-end.

---

### Autonomous Update Protocol

Whenever you edit, add, or update any code, styles, or configuration in this project:

1. **Verify Integrity**:
   - Run syntax and sanity checks on modified files (e.g. `node --check` for JavaScript, JSON validation for configs).
   - Ensure tags and paths are clean and valid.

2. **Auto-Commit & Push**:
   - **Never** leave changes uncommitted or unpushed at the end of a turn.
   - Stage all changes: `git add -A`
   - Commit with a clear, conventional commit message: `git commit -m "<type>(<scope>): <concise description>"`
   - Push immediately to GitHub: `git push origin main`

3. **Production Deployment Trigger**:
   - Pushing to `origin/main` automatically triggers GitHub Actions (`.github/workflows/deploy.yml`).
   - This workflow calls the Plesk Git webhook (`lin4.ethiotelecom.et`), pulling the latest commit directly to the live server.
   - Always report the commit hash and deployment status back to the user upon completion.
