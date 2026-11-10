# Releasing webeditor

`main` only changes through pull requests, and merging to `main` **deploys the site**
(GitHub Pages, https://brailletools.org/). A release is a version tag on `main` that marks which
deployed state you consider a release.

## Making a change

1. Branch from an up-to-date `main`: `git switch main && git pull && git switch -c my-change`.
2. Open a pull request. CI must pass before it can merge: `lint`, `unit`, `a11y`, and `sync`.
   Run `pnpm test:a11y` yourself after any UI change.
3. Merge the PR — the **Deploy to GitHub Pages** workflow then builds and publishes `main`.
   Never push to `main` directly.

## Updating a pinned dependency

CI and the deploy clone the tags named in `braille-bridge.version`, `brailleocr.version` and
`dataset.version`, not your local sibling checkouts. To pick up a new release of one of them:

1. Make sure **that repo's tag exists first** (see its own `RELEASING.md`) — a pin to a tag that
   hasn't been pushed fails CI.
2. In a PR, change the version file to the new tag and merge it.

A weekly workflow opens an issue when the `braille-bridge` or `brailleocr` pin is behind the
latest tag; it never bumps the pin for you, so you can test the new release first.

## Cutting a release

1. In a PR, bump `version` in `package.json` (pre-1.0: bump the minor for features, the patch for
   fixes) and merge it.
2. Tag the merge commit — the tag **must equal `v` + the `package.json` version**:

   ```bash
   git switch main && git pull
   git log -1 --oneline            # confirm this is the merge commit you mean to release
   git tag v0.2.1
   git push origin v0.2.1
   ```

3. The **Release** workflow validates the tag (format `vX.Y.Z`; matches `package.json`; the commit
   is on `main`) and creates a GitHub Release with generated notes. Tagging doesn't redeploy
   anything — the site is already live from the merge.

Tags are protected: `v*` tags can be created but **never moved or deleted**. If a tag turns out to
be wrong, publish the next patch version instead. (If you truly must remove one, an admin has to
temporarily disable the tag ruleset in Settings → Rules.)
