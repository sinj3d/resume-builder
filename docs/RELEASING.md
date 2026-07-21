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

5. Watch the **Release** workflow under the Actions tab. All 3 matrix jobs upload
   into one draft release. Cold builds can take 30–45 min per platform — long
   quiet periods during the llama.cpp CMake build and the ONNX Runtime download
   are normal, not hangs.
6. Go to **Releases** → the draft → verify the assets (~7 files):

   | Platform | Assets |
   | --- | --- |
   | Windows | `resume-builder_X.Y.Z_x64_en-US.msi`, `resume-builder_X.Y.Z_x64-setup.exe` |
   | Linux | `.AppImage`, `.deb`, `.rpm` |
   | macOS | `_aarch64.dmg` plus an `.app.tar.gz` bundle (Apple Silicon only) |

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
  `xattr -cr`). Future work: a code-signing certificate and Apple notarization.
  This is orthogonal to the updater's minisign signature, which is already
  wired up — see [Auto-updates](#auto-updates) below.
- **Linux builds require glibc ≥ 2.38** (Ubuntu 24.04+, Debian 13+,
  Fedora 39+). The `ort` crate's prebuilt ONNX Runtime static libs reference
  `__isoc23_*` symbols that only exist in glibc 2.38+, which is also why the
  workflows build on `ubuntu-24.04` — linking fails on 22.04. Supporting older
  distros would require compiling ONNX Runtime from source.
- **macOS minimum version is 10.15** (`bundle.macOS.minimumSystemVersion` in
  `tauri.conf.json`). llama.cpp uses `std::filesystem`, which Apple's SDK
  rejects below a 10.15 deployment target; Tauri's default of 10.13 breaks the
  llama-cpp-sys-2 compile.
- **macOS builds are Apple Silicon only.** ort provides no prebuilt ONNX
  Runtime for `x86_64-apple-darwin` (as of 2.0.0-rc.12), so Intel builds fail
  in ort-sys. Revisit if ort restores Intel binaries, or ship Microsoft's
  onnxruntime dylib via ort's `load-dynamic` feature if Intel demand appears.
- **Changing build-environment settings can be defeated by stale caches.** The
  llama.cpp CMake tree in the Rust cache keeps its original configure settings
  (e.g. deployment target) — the cmake crate skips reconfiguration ("CMake
  project was already configured"). After changing such settings, delete the
  affected caches (repo Settings → Actions → Caches, or the API) before
  re-running.
- **llama-cpp-2** is otherwise the most likely build failure. If the Linux job
  fails with "unable to find libclang", add `llvm-dev libclang-dev clang` to
  the apt step — do not drop the `local-llm` feature for one platform.
- **Actions billing**: free and unlimited only if the repo is public. On a
  private repo one release costs ~660+ billed minutes (macOS counts 10×) against
  the 2000/month free tier.
- **Cache budget**: 5 Rust caches (4 release legs + CI) can exceed the 10 GB
  per-repo cache cap and evict each other. If release builds stop hitting cache,
  remove `swatinem/rust-cache` from `release.yml` only — releases are rare; keep
  CI warm.

## Auto-updates

The app checks `https://github.com/sinj3d/resume-builder/releases/latest/download/latest.json`
on launch (opt-out in Settings) and via Settings → "Check now". Updates are
signed with a minisign keypair; `tauri-action` generates `latest.json` plus a
`.sig` per artifact and uploads them to the draft release whenever the signing
env vars below are present.

### One-time setup (manual — not scriptable)

1. Generate a keypair:
   ```bash
   npm run tauri signer generate -- -w $HOME/.tauri/resume-builder.key
   ```
   Pick a password. **Back up the private key file** — losing it permanently
   breaks auto-update for every installed user; there is no recovery.
2. Paste the printed public key into `src-tauri/tauri.conf.json` →
   `plugins.updater.pubkey` (currently a placeholder —
   `REPLACE_WITH_PUBKEY_FROM_TAURI_SIGNER_GENERATE`).
3. In the GitHub repo, Settings → Secrets and variables → Actions, add:
   - `TAURI_SIGNING_PRIVATE_KEY` — the private key file's contents
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password

### Every release

**You must publish the draft release**, not just create it — `latest.json`
only exists once a release is published, so clients see "no update available"
against an unpublished draft. This is the same Publish step as any other
release (step 7 above); no separate action is needed once the pubkey and
secrets are configured.

### Caveats

- **v0.1.0 installs never auto-update** (no updater plugin inside them). The
  first updater-enabled release (v0.2.0+) is a one-time manual download for
  those users; auto-update works from then on.
- **Linux: only the AppImage self-updates.** `.deb`/`.rpm` users update
  manually (reinstall the new package).
- **Pre-release behavior is silent by design.** Before the pubkey/secrets are
  configured, or before the first updater-enabled release is published, the
  update check 404s or fails to verify — the app and Settings page treat this
  as "no update available," not an error.
