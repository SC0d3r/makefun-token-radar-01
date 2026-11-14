# token-radar-01 entry

An entry for make.fun's token-radar-01.

The program reads the sealed DefiLlama snapshot and ranks pre-token protocols by an
implied value derived from each protocol's TVL, its seven-day growth and its age. The
snapshot's live-token protocols are kept apart and shown with the market's own figures,
never mixed into the ranked board.

It writes `board.json`, `data.js`, the static dashboard, the screenshots and `dossier.json`
to `/output`.

The value model is in `lib/model.ts`; the page is in `dashboard/`. Run it outside the
grader's container with:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
