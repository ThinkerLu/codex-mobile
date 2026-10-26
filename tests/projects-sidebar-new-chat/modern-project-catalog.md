# Modern Codex project catalog

Prerequisites: Codex with `project/list`, legacy saved roots smaller than its project catalog, and persisted thread assignments. Run the current checkout on http://127.0.0.1:4173/.

1. Compare `/codex-api/workspace-roots-state` projects with a fully paginated `project/list` response. Every project, including empty projects and duplicate names, must have a distinct sidebar group keyed by ID.
2. Refresh the browser. Project count, labels and explicit legacy thread memberships must survive. Shared roots must not override explicit assignments; ambiguous unassigned threads belong under Chats.
3. Check light and dark themes. Open the new-thread action of an empty project and confirm its root directory is selected. For a disposable test project, send a message and verify `thread/metadata/update` assigns the selected project before the first turn; do not use a live task for this check.
4. Modern project rename, removal and drag sorting are disabled until their mutation APIs are integrated. Manage those operations in Codex Desktop. Legacy-server behavior remains available when `project/list` is unsupported.
5. Verify concurrent catalog requests are coalesced, with a 15-second client cache. Catalog fetch uses pagination rather than one RPC per thread. Errors other than unsupported methods must not silently downgrade the catalog endpoint.

Verification 2026-10-26: real Chrome at 4173 displayed 28 project groups, preserved after reload. Light/dark screenshots are `output/playwright/projects-light.png` and `projects-dark.png` (2560x1289). New-thread membership tested with mocked RPCs; no real model message submitted. Full suite passed with `TMPDIR=/private/tmp CODEXUI_MEMORIES=true` (canonical macOS temporary path and explicit runtime-test default). Warm catalog endpoint sample: 21 ms, 65,541 bytes. Main production JS increased from 524.06 to 527.02 KB, gzip from 161.59 to 162.64 KB.

Rollback: restore the previously built `dist` and `dist-cli` directories and restart the service. No project data migration or shared database writes are performed by catalog reads. Close the verification browser tab after inspection. Remove any disposable test threads through the normal application workflow.
