# Release Process

This document describes how to publish a new version of AgentLink.

---

## Pre-release checklist

Before creating a release tag, verify:

- [ ] All intended changes are merged to `main`
- [ ] `package.json` version is bumped to the new version
- [ ] `manifest.json` version matches `package.json`
- [ ] `versions.json` updated **only if** `minAppVersion` changed
- [ ] Changelog / commit history is ready
- [ ] Run `npm run build` locally to confirm a clean build
- [ ] Run `npm run test` to confirm all tests pass

---

## Version numbering

AgentLink uses **`x.y.z`** (SemVer, no `v` prefix):

| Change | Bump |
|--------|------|
| Backwards-incompatible change | Major (`x`) |
| New feature, backwards-compatible | Minor (`y`) |
| Bug fix or patch | Patch (`z`) |

---

## Release steps

### 1. Bump versions

Edit both files to set the new version (e.g. `1.2.0`):

```jsonc
// package.json
{ "version": "1.2.0" }

// manifest.json
{ "version": "1.2.0" }
```

If the minimum required Obsidian version changed, also add to `versions.json`:

```jsonc
// versions.json
{ "1.2.0": "1.5.0" }
```

Commit and push to `main` via a PR:

```bash
git add package.json manifest.json versions.json
git commit -m "chore: bump version to 1.2.0"
# open PR → merge
```

### 2. (Optional) Validate with Build Check

Run the **Build Check** workflow manually in GitHub Actions:

> Actions → Build Check (Manual) → Run workflow → enter `1.2.0`

This validates version consistency, runs the full build, and uploads a preview artifact — **without publishing anything**.

### 3. Create and push the release tag

```bash
git checkout main
git pull origin main
git tag 1.2.0
git push origin 1.2.0
```

The **Tag Release** workflow will automatically:
1. Verify `manifest.json` and `package.json` both match the tag
2. Run lint, tests, and build
3. Create a GitHub Release with:
   - `main.js`
   - `manifest.json`
   - `styles.css` (if present)
   - Auto-generated release notes from commit history

> ⚠️ If any step fails, the release is not created. Fix the issue and push a corrected tag on a new patch version.

---

## Release failure policy

| Situation | Action |
|-----------|--------|
| Tag Release workflow fails mid-way, no release published | Fix the issue; delete the failed tag (`git tag -d x.y.z && git push origin :refs/tags/x.y.z`); fix; re-tag |
| Release published but broken | **Do not overwrite.** Publish a new patch release (e.g. `1.2.1`) with the fix |
| Serious mis-publish (wrong code, security issue) | Manually delete the release and tag in GitHub UI; notify users; publish corrected patch |

---

## Rollback

We do **not** reuse tags or overwrite existing releases. The correct remediation path is always a new patch version.

---

## Obsidian community plugin submission

After a release is published, the Obsidian plugin store will pick up the new `manifest.json` from the latest release automatically if the plugin is listed. See the [Obsidian plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) for submission details.
