# Contributing

Thanks for your interest in improving the Thebes medical-imaging example (Lumen).

## Setup

- **Frontend** (`frontend/`): Node 20+. `npm install` then `npm run dev`.
- **Backend** (`motoko/`): [mops](https://mops.one). `mops install` then
  `moc --check $(mops sources) main.mo`.

The frontend toolkit comes from [`@thebes/sdk`](https://github.com/Mercatura-Forum/thebes-sdk)
and the backend library from [`thebes-lib`](https://github.com/Mercatura-Forum/thebes-lib).
Both are pinned dependencies — do not copy their files into this repo. Changes to
the shared toolkit belong in those repositories.

## Before opening a pull request

- `npm run build` succeeds in `frontend/`.
- `moc --check $(mops sources) main.mo` is clean in `motoko/`.
- CI (frontend build + backend check) is green.
