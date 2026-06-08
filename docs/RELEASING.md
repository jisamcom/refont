# Releasing Refont

Day-to-day work happens on **branches**. Releasing is a separate, deliberate
step that batches everything merged into `master` since the last tag and ships
it to both stores automatically.

```
feature branch ──PR──▶ master ──(when ready)──▶ release.mjs ──▶ DRAFT GitHub Release
                                                                       │
                                              you click "Publish" ◀────┘  (manual gate)
                                                       │
                                       on: release published
                                                       ▼
                                   GitHub Actions builds + tests + uploads
                                                ├─▶ Chrome Web Store  (auto-publish)
                                                └─▶ Firefox Add-ons    (auto-publish)
```

Committing/pushing a branch never publishes anything. `release.mjs` only creates
a **draft** release — nothing reaches the stores until you click **Publish
release** on GitHub. That deliberate manual gate is your last look before
shipping.

---

## 1. Day-to-day: branch → merge

```bash
git switch -c feat/some-thing          # branch off master
# ...work, commit (Conventional Commits: feat: / fix: / chore: ...)
git push -u origin feat/some-thing
gh pr create --fill                     # open PR
gh pr merge --squash                    # merge into master when reviewed
```

Use `feat:` / `fix:` commit subjects — the changelog generator surfaces those
and drops `chore:`/`docs:`/`test:` as noise. Patches accumulate on `master`
across as many merges as you like before you cut a release.

## 2. Cut a release (one command)

When `master` has enough merged work:

```bash
export GITHUB_TOKEN=$(gh auth token)          # once per shell
bun scripts/release.mjs 0.2.4 --push          # or: node scripts/release.mjs ...
```

This bumps the version in 4 places, builds, packages, generates the changelog
(everything since the previous tag), commits `release: v0.2.4`, tags it, pushes,
and **creates a draft GitHub Release** (with the notes + zips attached).

Nothing has shipped yet. Open the draft on GitHub, give it a final look, and
click **Publish release**. *That* fires `.github/workflows/release-publish.yml`,
which rebuilds from the tag in CI, runs the tests, and uploads to both stores.

```bash
gh release view v0.2.4 --web     # open the draft to review
# happy? → click "Publish release"  (or: gh release edit v0.2.4 --draft=false)
```

## 3. Watch the deploy

```bash
gh run watch                 # live progress of the publish workflow
gh run view --log-failed     # if a step fails
```

Chrome review is typically minutes–hours; AMO listed-version review can take
longer. Both are submitted with auto-publish, so they go live once each store's
review passes — no further clicks.

---

## One-time setup: GitHub Actions secrets

Add these under **repo → Settings → Secrets and variables → Actions** (or with
`gh secret set NAME`). The Firefox add-on GUID (`refont@jisam`) is public and is
hardcoded in the workflow, so it is **not** a secret.

| Secret | Used for |
| --- | --- |
| `CHROME_EXTENSION_ID` | Which CWS item to update |
| `CHROME_CLIENT_ID` | Google OAuth client |
| `CHROME_CLIENT_SECRET` | Google OAuth client |
| `CHROME_REFRESH_TOKEN` | Google OAuth offline token |
| `FIREFOX_JWT_ISSUER` | AMO API key (issuer) |
| `FIREFOX_JWT_SECRET` | AMO API key (secret) |

### Chrome Web Store credentials

1. **Extension ID** — from the [CWS Developer Dashboard](https://chrome.google.com/webstore/devconsole);
   it's the long id in the item URL.
2. **Enable the API** — [Google Cloud Console](https://console.cloud.google.com/):
   new project → APIs & Services → enable **Chrome Web Store API**.
3. **OAuth client** — APIs & Services → Credentials → Create credentials →
   OAuth client ID → **Desktop app**. Copy the **client ID** and **client secret**.
   (On the OAuth consent screen, add your own Google account as a *test user* so
   the refresh token doesn't expire after 7 days.)
4. **Refresh token** — easiest path:
   ```bash
   npx chrome-webstore-upload-keys
   ```
   It walks you through the OAuth flow and prints the refresh token.
5. `gh secret set CHROME_EXTENSION_ID` … and the three OAuth values.

### Firefox AMO credentials

1. Go to <https://addons.mozilla.org/developers/addon/api/key/> →
   **Generate new credentials**.
2. Copy the **JWT issuer** and **JWT secret** (the secret is shown once).
3. ```bash
   gh secret set FIREFOX_JWT_ISSUER
   gh secret set FIREFOX_JWT_SECRET
   ```

### Quick set via CLI

```bash
gh secret set CHROME_EXTENSION_ID   --body "abcdef...."
gh secret set CHROME_CLIENT_ID      --body "....apps.googleusercontent.com"
gh secret set CHROME_CLIENT_SECRET  --body "GOCSPX-...."
gh secret set CHROME_REFRESH_TOKEN  --body "1//0...."
gh secret set FIREFOX_JWT_ISSUER    --body "user:12345:67"
gh secret set FIREFOX_JWT_SECRET    --body "...."
gh secret list                      # verify all six are present
```

---

## Notes

- **First submission must be manual.** These APIs only *update* an existing,
  already-listed item. Refont is listed on both stores, so updates are automated.
- **CI is the source of truth for what ships.** The workflow rebuilds from the
  tagged source rather than trusting the zips attached to the release, so the
  store binary always matches the tagged commit.
- **Optional hardening:** pin the third-party actions to a full commit SHA
  (`mnao305/chrome-extension-upload@<sha>`, `wdzeng/firefox-addon@<sha>`) instead
  of a moving version tag.
