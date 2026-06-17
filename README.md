# Lumen — on-chain medical imaging

A Thebes Protocol example: a radiology **reading room** where patients, imaging
studies, and diagnostic reports live on the chain, and the image pixels live in
the Thebes **media contract**. It shows how to build an access-controlled,
privacy-sensitive application — role-based staff, an immutable access log, and
binary media — entirely on Thebes.

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
  sign-in. Served to the browser as certified assets.
- **Backend** (`motoko/`) — a `persistent actor` built on
  [`thebes-lib`](https://github.com/Mercatura-Forum/thebes-lib) (`Admin` for the
  ownership tier, `Pagination` for bounded lists). Every privileged method has an
  `*OrTrap` twin so an authorization failure surfaces as a clear rejection rather
  than a silently-swallowed error.
- **Media contract** — a separate Thebes contract instance that holds image bytes,
  content-addressed and served at `/_/raw/{cid}/{path}`. This example reads its id
  from `window.MEDIA_CID`.

Neither toolkit is copied into this repository — both resolve as pinned
git/mops dependencies, so an improvement to the shared toolkit lands in one place.

## Run it locally

**Frontend** (Node 20+):

```bash
cd frontend
npm install
npm run dev            # vendors boundary.js/passkey.js from @thebes/sdk, starts Vite
```

**Backend** ([mops](https://mops.one)):

```bash
cd motoko
mops install
moc --check $(mops sources) main.mo
```

## Deploy

The backend and frontend deploy to a Thebes cluster with
[`thebes-deploy`](https://github.com/Mercatura-Forum/thebes-sdk). The frontend
reads two contract ids from `window` globals, injected at deploy time:

| Global        | Points at                                  |
| ------------- | ------------------------------------------ |
| `XRAY_CID`    | the Lumen backend contract                 |
| `MEDIA_CID`   | the media contract instance for its images |

The first signed-in visitor can claim the clinic and load a small demo worklist
(three patients across the three study states) from the worklist screen, then
acquire a real image on any study to see the media round-trip end to end.

## License

Apache-2.0. See [LICENSE](./LICENSE) and [NOTICE](./NOTICE).
