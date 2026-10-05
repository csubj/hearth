# Design docs — hearth

The platform design lives in the OpenSpec change specs under [`openspec/`](../../openspec/).

## Where the design is

- **[openspec/changes/rebuild-p0-platform/proposal.md](../../openspec/changes/rebuild-p0-platform/proposal.md)** — motivation, what changes, capabilities, impact.
- **[openspec/changes/rebuild-p0-platform/design.md](../../openspec/changes/rebuild-p0-platform/design.md)** — all decisions (D1–D21): core `entities` table, module registry, oRPC procedures, the write pipeline, auth, places, shared services, operations.
- **[openspec/changes/rebuild-p0-platform/tasks.md](../../openspec/changes/rebuild-p0-platform/tasks.md)** — the implementation checklist, phased 1–14.
- **[openspec/changes/rebuild-p0-platform/specs/platform/**](../../openspec/changes/rebuild-p0-platform/specs/platform) — per-capability specs (auth, entities, service-api, collaboration, organization, reminders, activity, search, app-shell, operations, places).

## How to use this repo

- Read `proposal.md` (why) then `design.md` (how) before coding.
- Check `tasks.md` for the current phase; implement only that phase unless told otherwise.
- [`../../AGENTS.md`](../../AGENTS.md) is the agent/contributor guide — stack conventions, commands, module split, write rules.

## Archived docs

The pre-rebuild design docs, user guide, reference, operations, getting-started, admin, architecture, and the old `DESIGN.md` / `PRODUCT.md` are preserved in [`../legacy/`](../legacy/). They describe the purged app and are reference only — do not use them to build against the new platform.
