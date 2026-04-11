# Contributing to AgentLink

Thank you for your interest in contributing to AgentLink!

## Ground rules

- **All changes to `main` must go through a Pull Request.** Direct pushes to `main` are not allowed.
- Keep PRs focused. One feature or fix per PR.
- Ensure all CI checks pass before requesting review.

---

## Development setup

```bash
git clone https://github.com/Run0812/AgentLink.git
cd AgentLink
npm install
```

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start esbuild watch mode (outputs to project root) |
| `npm run lint` | TypeScript typecheck (no-emit) |
| `npm run test` | Run Vitest unit tests |
| `npm run build:quick` | Production build → `build/` |
| `npm run build` | Lint + test + production build |

### Installing in Obsidian (dev)

Copy the output files into your vault's plugin directory:

```
<vault>/.obsidian/plugins/agentlink/
├── main.js
├── manifest.json
└── styles.css
```

Or use the provided `sync-dev.ps1` script on Windows.

---

## Branching strategy

```
main          ← protected, production-only
  └── your-feature-branch   (PR → main)
```

- Branch off from `main`.
- No restrictions on branch naming.
- Merge via PR only.

---

## Version numbers

AgentLink uses **`x.y.z`** (no `v` prefix) per the Obsidian community plugin convention.

Before opening a PR that bumps the version, ensure **all three files are updated together**:

| File | Field |
|------|-------|
| `package.json` | `"version"` |
| `manifest.json` | `"version"` |
| `versions.json` | add entry only if `minAppVersion` changes |

> The CI will fail if `package.json` and `manifest.json` versions differ.

---

## CI checks

Every PR against `main` runs:

1. **Typecheck / Lint** – `npm run lint`
2. **Tests** – `npm run test`
3. **Build** – `npm run build:quick`
4. **AI Code Review** – Claude reviews the diff and posts a comment.
   - Blocks only on: severe bugs, build failures, version inconsistencies, Obsidian guideline violations.
   - Style and refactoring suggestions are advisory only.

All checks must be green before a PR can be merged.

---

## Commit messages

Use a short, descriptive imperative sentence:

```
fix: handle null session in ACP adapter
feat: add HTTP streaming support for Kimi
chore: bump vitest to 4.2
```

---

## Releasing

See [RELEASE.md](RELEASE.md) for the full release process.

---

## Branch protection (recommended settings)

Ask the repo owner to enable the following in **Settings → Branches → Add rule for `main`**:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - Required checks: `Install / Lint / Test / Build`
- ✅ Require branches to be up to date before merging
- ✅ Do not allow bypassing the above settings

---

## Code of conduct

Be respectful. Constructive feedback only.
