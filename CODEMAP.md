# CODEMAP

Which file owns what, and which document answers a question. GAP itself is
`../general-automation-app` (its own `CODEMAP.md`).

```
general-automation-catalogue/
├── Official/                the "Official GAP" script catalogue, one folder per script and channel
│   └── LineTsumTsum/Production/  frozen at Tsum Tsum 4.0: script releases now go to ../tsum-tsum-catalogue
│       ├── metadata.json    the entry: Name, Version, Date, Hash, File, Message (notes), MinHost, Versions (older builds still offered)
│       ├── CHANGELOG.md     what shipped in each release, newest first
│       └── TsumTsum-*.zip   the builds metadata.json names
├── site/                    the getting-started page (index.html, assets/), served at www.gapapp.app
├── build-official.sh/.ps1   folds every metadata.json into official.json
├── notify-discord.sh        posts each script whose Version changed to Discord
├── notify-discord-app.sh    posts a published GAP app release's changelog to Discord
├── official.json            generated, gitignored
└── .github/workflows/
    ├── build-official.yml       builds official.json, publishes it with site/ to Pages
    └── announce-app-release.yml announces a published gap-app-* release
```

GitHub Releases here hold the GAP app: `gap-app-<v>` (APKs per ABI,
`gap-latest.txt`, `gap-starter.zip` / `.tar.gz`). The app's update check and
`site/` download from `releases/latest/download`.

## Which document answers it

| Question | Document |
|:--|:--|
| Releasing the GAP app (cut, draft `gap-app-<v>`, made Latest by the Devkit's **GAP host** card) | `../tools/DEPLOYMENTS.md` § GAP app |
| Where Tsum Tsum script releases go now | `../tsum-tsum-catalogue/CODEMAP.md`, `../tools/DEPLOYMENTS.md` § Tsum Tsum script |

## Finding a name

| Name | Where |
|:--|:--|
| `official.json` (`Name` "Official GAP", reserved: the app refuses another source claiming it; `Updated`; `Scripts`: each `metadata.json` with `File` and every `Versions[].File` rewritten to a raw GitHub URL) | `build-official.sh` (`.ps1` the same on Windows) |
| The live `official.json` the app reads | `https://www.gapapp.app/official.json` (GAP `Config.kt` `OFFICIAL_URL`) |
| Script Discord announcement (diff of the live `official.json` against the new one; secret `DISCORD_WEBHOOK_URL`, none = skipped) | `notify-discord.sh` |
| App Discord announcement (release notes above the first `---`) | `notify-discord-app.sh`, run by `announce-app-release.yml` on a published, non-prerelease `gap-app-*` release |
| `build-official.yml`: on a push to `main`/`master` touching a `metadata.json`, `site/**`, the build or notify script or itself; `workflow_dispatch` with no inputs | `.github/workflows/build-official.yml` |
| Devkit card **GAP host** (`gap-host`): drafts the release on a cut, marks it Latest on deploy | `../tools/deploy/cuts.mjs` (`releaseRepo`), `components.mjs` (`gapHostLatest`) |

## Commands

| Command | What |
|:--|:--|
| `bash build-official.sh` / `pwsh build-official.ps1` | Preview `official.json` locally (needs `jq` for the `.sh`) |
| (none) | Releases go through the GAP Devkit, never by hand and never by pushing here: `../tools/DEPLOYMENTS.md` |
