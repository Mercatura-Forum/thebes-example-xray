# Lumen — on-chain medical imaging

A Thebes Protocol example: a radiology **reading room** where patients, imaging
studies, and diagnostic reports live on the chain, and the image pixels live in
the Thebes **media contract**. It shows how to build an access-controlled,
privacy-sensitive application — role-based staff, an immutable access log, and
binary media — entirely on Thebes.

The privacy surface is **checkable, not just claimed**: the access log's ids
are dense (1..n with no holes — append-only made verifiable), final reports
can never be empty or edited, the DICOM-style hierarchy is referentially
whole, and instance numbers are unique per series. The **public oracle**
(`invariantReportView`) re-proves those five laws on every read, and the seal
(`lumenSealView`) exposes counts only — no patient data ever crosses it.

Live demo: <https://memphis.mercaturaforum.com/_/raw/57650296797843/index.html>

![stack: React + @thebes/sdk · Motoko + thebes-lib · Thebes media contract](https://img.shields.io/badge/stack-thebes-22d3ee)

## What it demonstrates

- **A medical-record entity model.** Patient → ImagingStudy → Series → Image,
  the shape used by [DICOM](https://www.dicomstandard.org/) and HL7
  [FHIR](https://www.hl7.org/fhir/imagingstudy.html), without the binary DICOM
  wire format. A `DiagnosticReport` (findings + impression) attaches to a study.
- **Images stored in the media contract.** A study's image record holds only the
  media **path** — the bytes are uploaded to the Thebes media contract and served
  from it. The imaging database stores pointers, not pixels.
- **Role-based access control.** Three clinical roles on top of `thebes-lib`'s
  owner/admin tiers:
  - **technician** — registers patients, creates studies and series, acquires images
  - **radiologist** — writes and finalizes diagnostic reports
  - **referrer** — read-only access to the worklist
  Patient records are visible to clinical staff only; a caller with no role sees
  nothing.
- **An immutable access log.** Opening a study writes a who/what/when entry to an
  append-only log the administrator can review — the privacy-sensitive surface of
  any medical system.
- **A forward-only study lifecycle.** `scheduled → acquired → reported`: a study
  becomes *acquired* when its first image lands, and *reported* when its report is
  finalized. Finalized reports are locked.

## Architecture

```
React + @thebes/sdk  ─────►  Lumen backend (Motoko + thebes-lib)
   (this frontend)            patients · studies · series · reports · access log
        │
        └── image bytes ────►  Thebes media contract  (chunked upload, served by path)
```

- **Frontend** (`frontend/`) — React + Vite + Tailwind, built on
  [`@thebes/sdk`](https://github.com/Mercatura-Forum/thebes-sdk): typed
  query/update calls, the chunked media-upload helper, and Memphis passkey
  sign-in. Served to the browser as certified assets. The SDK is **vendored** under
  `frontend/vendor/@thebes/sdk` and resolved as a local dependency
  (upstream source of truth: [`thebes-sdk`](https://github.com/Mercatura-Forum/thebes-sdk)).
- **Backend** (`motoko/`) — a `persistent actor` built on
  [`thebes-lib`](https://github.com/Mercatura-Forum/thebes-lib) (`Admin` for the
  ownership tier, `Pagination` for bounded lists). Every privileged method has an
  `*OrTrap` twin so an authorization failure surfaces as a clear rejection rather
  than a silently-swallowed error. The library is **vendored** under
  `motoko/thebes-lib` and resolved as a local Mops dependency.
- **Media contract** (optional) — a separate Thebes contract instance that holds
  image bytes, content-addressed and served at `/_/raw/{cid}/{path}`. This example
  reads its id from `window.MEDIA_CID`; without one the app degrades gracefully and
  image bytes simply aren't stored.

Both halves are self-contained: the repository builds with no external Git or Mops
toolkit pins. The frontend asset-canister wasm is the one artifact fetched at
deploy time (see [Deploy](#deploy)).

## Run it locally

**Frontend** (Node 18+):

```bash
cd frontend
npm install            # resolves the vendored @thebes/sdk
npm run dev            # sync-sdk copies the browser runtimes into public/, then Vite serves
```

**Backend** ([mops](https://mops.one)). `mops install` fetches the pinned Motoko
compiler **1.4.1** to `~/.cache/mops/moc/1.4.1/moc` (macOS:
`~/Library/Caches/mops/moc/1.4.1/moc`) — use that binary, not a bare `moc` on
`PATH`:

```bash
cd motoko
mops install           # resolves the vendored thebes-lib + the pinned compiler
"$(ls "$HOME/.cache/mops/moc/1.4.1/moc" "$HOME/Library/Caches/mops/moc/1.4.1/moc" 2>/dev/null | head -1)" --check $(mops sources) main.mo
```

`mops install` prints `core@2.5.0 requires moc >= 1.6.0` while 1.4.1 is pinned;
this is expected — the cluster pins 1.4.1 and the build succeeds.

## Deploy

`thebes.toml` describes the deploy. Its `[networks.wan].validators` are pre-filled
with the current WAN cluster endpoints; to re-confirm them run `thebes-deploy init`.

> **Deploying your own copy?** The committed `cid` values pin the **live catalog
> deployment** (that's what the demo links serve — only its controller can
> upgrade it). Before your first deploy, set `cid = "auto"` on each canister:
> the deploy allocates fresh canisters you control and writes their ids back
> into the manifest.

### 1. Backend

```sh
thebes-deploy identity new me      # one-time local signing identity
thebes-deploy deploy xray          # build + install + verify → prints the backend cid
```

### 2. Frontend

The frontend installs an asset canister, then uploads your built bundle. Fetch the
asset-canister wasm once (it is referenced by `thebes.toml` as `asset_canister.wasm`):

```sh
curl -L -o asset_canister.wasm \
  https://github.com/Mercatura-Forum/Thebes-Protocol-/releases/download/asset-canister-v0.1.0/asset_canister.wasm
```

Build the bundle and inject the backend cid from step 1 into the built page (the
frontend reads `window.XRAY_CID` at runtime), then deploy:

```sh
cd frontend && npm run build && cd ..
sed -i 's#<head>#<head><script>window.XRAY_CID=YOUR_XRAY_CID;</script>#' frontend/dist/index.html
thebes-deploy deploy web           # install asset canister + upload bundle + verify
```

The deploy prints the live URL:
`https://memphis.mercaturaforum.com/_/raw/<web-cid>/index.html`.

The first signed-in visitor can claim the clinic and load a small demo worklist
(three patients across the three study states) from the worklist screen.

> Image bytes are served by a separate media canister via `window.MEDIA_CID`.
> It is optional — without one, studies render without their image pixels. Inject
> it alongside `XRAY_CID` if you have a media instance:
> `<script>window.XRAY_CID=…;window.MEDIA_CID=…;</script>`.

For a machine-readable deploy contract, see [AGENTS.md](AGENTS.md).

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
