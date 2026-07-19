# Releasing

Pushing a `vX.Y.Z` tag triggers [`release.yml`](../.github/workflows/release.yml),
which builds installers for Windows, Linux, and macOS (Apple Silicon + Intel) and
attaches them to a **draft** GitHub Release. Nothing is published until you click
Publish.

## Cutting a release

1. On `dev`, bump the version in **all three** files (they must match):
   - `package.json`
   - `src-tauri/tauri.conf.json`
   - `src-tauri/Cargo.toml`

   Then refresh the lockfile so `--locked` CI passes:

   ```bash
   cd src-tauri && cargo check
   ```

2. Commit, push to `dev`, and wait for CI to go green.
3. Merge `dev` → `main`. The tag must point at a commit that **contains**
   `release.yml`, since the workflow that runs is the one at the tagged commit.
4. Tag and push:

   ```bash
   git checkout main && git pull
   git tag vX.Y.Z
   git push origin vX.Y.Z
   ```

5. Watch the **Release** workflow under the Actions tab. All 4 matrix jobs upload
   into one draft release. Cold builds can take 30–45 min per platform — long
   quiet periods during the llama.cpp CMake build and the ONNX Runtime download
   are normal, not hangs.
6. Go to **Releases** → the draft → verify the assets (~9 files):

   | Platform | Assets |
   | --- | --- |
   | Windows | `resume-builder_X.Y.Z_x64_en-US.msi`, `resume-builder_X.Y.Z_x64-setup.exe` |
   | Linux | `.AppImage`, `.deb`, `.rpm` |
   | macOS | `_aarch64.dmg`, `_x64.dmg`, plus two `.app.tar.gz` bundles |

   (Exact names may differ slightly — correct this table after the first real run.)

7. Edit the release notes if needed, then **Publish**.

## If the tag was wrong

```bash
git push --delete origin vX.Y.Z
git tag -d vX.Y.Z
```

Delete the draft release in the GitHub UI, fix the problem, and re-tag.

The workflow has a guard step that fails every job if the tag does not equal
`v{version}` from `tauri.conf.json`, so a mismatched tag fails fast instead of
producing a mislabeled release.

## Known caveats

- **Builds are unsigned** — Windows SmartScreen warns on first run; macOS
  requires "Open Anyway" in System Settings → Privacy & Security (or
  `xattr -cr`). Future work: a code-signing certificate, Apple notarization, and
  `tauri-plugin-updater` for in-app updates (tauri-action supports updater
  artifacts via `TAURI_SIGNING_PRIVATE_KEY`).
- **llama-cpp-2** is the most likely build failure. If the Linux job fails with
  "unable to find libclang", add `llvm-dev libclang-dev clang` to the apt step.
  The macOS x86_64 cross-compile leg is the riskiest; if it breaks, build it
  natively on an Intel runner instead — do not drop the `local-llm` feature for
  one platform.
- **Actions billing**: free and unlimited only if the repo is public. On a
  private repo one release costs ~660+ billed minutes (macOS counts 10×) against
  the 2000/month free tier.
- **Cache budget**: 5 Rust caches (4 release legs + CI) can exceed the 10 GB
  per-repo cache cap and evict each other. If release builds stop hitting cache,
  remove `swatinem/rust-cache` from `release.yml` only — releases are rare; keep
  CI warm.
