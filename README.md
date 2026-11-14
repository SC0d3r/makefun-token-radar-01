# token-radar-01 entry

An entry for make.fun's token-radar-01.

The program reads the sealed DefiLlama snapshot and ranks pre-token protocols by an
implied value. The multiple is the median market-cap to TVL ratio of the snapshot's own
live-token protocols, with a category median used when that category has at least three
samples. The implied value multiplies TVL by that multiple, a clamped seven-day growth
factor, and an age maturity factor. Live-token protocols are kept apart and shown with the
market's own figures, never mixed into the ranked board.

It writes `board.json`, `data.js`, the static dashboard, the screenshots and `dossier.json`
to `/output`.

The value model is in `lib/model.ts`; the page is in `dashboard/`. Run it outside the
grader's container with:

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
