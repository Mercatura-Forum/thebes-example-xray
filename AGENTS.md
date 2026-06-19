# AGENTS.md — deploying this example

A canonical, copy-pasteable contract for an automated agent deploying
`thebes-example-xray` (Lumen) to a Thebes cluster. Human-readable detail is in
[README.md](README.md).

## Layout

```
thebes.toml                 deploy manifest (network + canisters)
motoko/main.mo              backend (Motoko); imports mo:thebes-lib/{Admin,Pagination}
motoko/thebes-lib/          vendored backend library (local Mops dep — no external pin)
frontend/                   React + Vite app on @thebes/sdk
frontend/vendor/@thebes/sdk vendored SDK (local file: dep — no external pin)
```

## Toolchain (exact)

- Motoko compiler **1.4.1**, fetched by `mops install` to
  `~/.cache/mops/moc/1.4.1/moc` (macOS: `~/Library/Caches/mops/moc/1.4.1/moc`).
  Do **not** invoke a bare `moc` — a default `PATH` may resolve a different
  compiler version or Qt's Meta-Object Compiler.
- Node 18+, Mops, and the `thebes-deploy` CLI (Linux x86-64 prebuilt; build from
  the release source bundle on other platforms).
- `mops install` prints `core@2.5.0 requires moc >= 1.6.0` while 1.4.1 is pinned.
  This is expected — the cluster pins 1.4.1 and the build succeeds.

## Deploy

```sh
# 0. network: the [networks.wan].validators in thebes.toml are pre-filled with the
#    current WAN cluster. To re-confirm them:
thebes-deploy init            # prints current WAN cluster validators

# 1. backend
thebes-deploy identity new me
thebes-deploy deploy xray     # → prints the backend cid (call it XRAY_CID)

# 2. frontend
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
cd frontend && npm install && npm run build && cd ..
sed -i 's#<head>#<head><script>window.XRAY_CID=XRAY_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web      # → prints https://memphis.mercaturaforum.com/_/raw/<cid>/index.html
```

Verify: `curl -s -o /dev/null -w '%{http_code}' <printed-url>` returns `200`.

## Calling the backend

```sh
thebes-deploy call  xray claimOwner                        # first caller claims the clinic
thebes-deploy call  xray seedDemo                          # loads the demo worklist
thebes-deploy query xray studyCount                        # queries need no identity
```

Candid arguments use textual form, e.g.
`thebes-deploy call xray addPatientOrTrap --arg '("MRN-1042", "Jordan Reyes", "F", 1986 : nat)'`.
Always pass `--arg '(...)'` for any method that takes parameters.

Public methods (from `motoko/main.mo`):

- **Ownership / admin** (`mo:thebes-lib/Admin`): `claimOwner`, `transferOwner`,
  `addAdmin`, `removeAdmin`, `setPaused`, `getOwner`, `getAdmins`, `isPaused`.
- **Roles**: `assignRole` / `assignRoleOrTrap`, `revokeRole` / `revokeRoleOrTrap`,
  `myRole`, `staffView`.
- **Records** (each guarded write has an `*OrTrap` twin): `addPatient` /
  `addPatientOrTrap`, `addStudy` / `addStudyOrTrap`, `addSeries` /
  `addSeriesOrTrap`, `addImage` / `addImageOrTrap`, `saveReport` /
  `saveReportOrTrap`, `finalizeReport` / `finalizeReportOrTrap`, `openStudyOrTrap`.
- **Reads** (role-gated; a caller with no role sees an empty list): `worklistView`,
  `studyCount`, `patientsView`, `patientCount`, `patientView`,
  `studiesForPatientView`, `studyView`, `seriesForStudyView`, `studyImagesView`,
  `accessLogView`, `accessLogCount`.
- **Demo**: `seedDemo` (three patients across the three study states).

## Conventions that affect correctness

- **`window.XRAY_CID`** is injected into the built page at deploy time; the
  frontend reads it at runtime. If you skip the injection step, the page falls
  back to a compiled-in default (`0`) and talks to no backend.
- **`window.MEDIA_CID`** (optional) points the image-upload helper at a Thebes
  media contract instance. This manifest does not deploy a media contract — the
  app degrades gracefully without one (image bytes simply aren't stored), so the
  global is optional. Inject it the same way if you have a media instance:
  `<script>window.XRAY_CID=…;window.MEDIA_CID=…;</script>`.
- **`*OrTrap` methods** trap on a failed guard so the client sees a rejection
  instead of a silently-swallowed error. The frontend calls the `OrTrap` form for
  any guarded write.
- **Role-gated queries** read `msg.caller`, so they need a signed-in identity to
  return rows; an anonymous query returns an empty list by design.
- **Boundary decoding** returns a `vec record` of scalar fields. A single record
  is a 0-or-1-element array; principal fields are 56-character hex. Decode with
  the SDK's `decodeVecRecord` / `decodeNat` / `decodeBool`.
