# Development workflow

This repo uses **Git branches** plus **Vercel Preview Deployments** so you can try UI/UX and AI changes on a real URL before they reach [whatimado.com](https://whatimado.com).

## Branch map

| Branch | Purpose | Deploys to |
|--------|---------|------------|
| `main` | Production-ready code | **Production** → whatimado.com |
| `develop` | Stable integration / pre-release testing | Preview URL |
| `playground` | Long-lived UX & AI experiments | Preview URL |
| `feature/*` | Single features (e.g. `feature/roadmap-v2`) | Preview URL |

**Rule of thumb:** Only merge to `main` when you are ready for real users to see it.

## How Vercel fits in

With the GitHub ↔ Vercel integration:

- **`main`** → production deployment (whatimado.com).
- **Every other branch** → automatic **Preview Deployment** with its own URL.

After you push a branch, open the Vercel dashboard or the GitHub commit/checks to copy the preview link. Compare it side-by-side with production.

### One-time Vercel checklist

In [Vercel](https://vercel.com) → your project → **Settings → Git**:

1. **Production Branch:** `main`
2. **Preview Deployments:** enabled (default)
3. Environment variables (`ANTHROPIC_API_KEY`, Supabase keys, etc.) are set for **Production** and **Preview** as needed.

No extra config is required for preview URLs on `develop`, `playground`, or `feature/*` branches.

## Daily commands

### Start a new feature

```bash
git checkout develop
git pull origin develop
git checkout -b feature/my-idea
# …edit files…
git add -A
git commit -m "Describe the change."
git push -u origin feature/my-idea
```

Open the preview URL from Vercel or GitHub, test on desktop and mobile, then open a PR.

### Merge feature → develop (integration test)

```bash
git checkout develop
git pull origin develop
git merge feature/my-idea
git push origin develop
```

Test the `develop` preview URL. When stable, merge `develop` → `main` (see below).

### Ship to production

```bash
git checkout main
git pull origin main
git merge develop
git push origin main
```

Vercel deploys production automatically. Hard-refresh whatimado.com and confirm the `whatimado-build` meta tag in page source if needed.

### Playground experiments

For throwaway or long-running trials (new layouts, AI prompts, etc.):

```bash
git checkout playground
git pull origin playground
# …experiment…
git add -A && git commit -m "Try X"
git push origin playground
```

Cherry-pick or branch off `playground` into `feature/*` when something is worth keeping.

### Delete a finished feature branch

```bash
git branch -d feature/my-idea
git push origin --delete feature/my-idea
```

## Local preview (no deploy)

For quick layout checks without pushing:

```bash
cd /path/to/WhatimaDo.com
python3 -m http.server 8080
```

Open `http://localhost:8080`. API routes and auth may behave differently than on Vercel; use preview URLs for full integration tests.

## Suggested flow

```
feature/sidebar-redesign ──► develop ──► main ──► whatimado.com
         ▲
    playground (optional sandbox)
```

1. Branch from `develop` (or `playground` for risky experiments).
2. Push → get preview URL → compare with production.
3. Merge to `develop` → test integration preview.
4. Merge `develop` → `main` → production.

## Pull requests (recommended)

Use GitHub PRs for `feature/*` → `develop` and `develop` → `main`. Vercel comments on the PR with the preview link.

```bash
gh pr create --base develop --title "Sidebar redesign" --body "Preview tested on mobile."
```

## Build tag

Production and preview builds include a `whatimado-build` meta tag in `index.html`. Use it to confirm which version you are viewing (View Source or DevTools).
