/**
 * Rendering test for the activity feed row (task 10.1 acceptance).
 *
 * Verifies the presentational `ActivityRow` renders an API-key write as
 * "CJ via Claude" and shows no "via" for a web write. Rendered on the server
 * via `react-dom/server`, which works in the node test environment.
 */

import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ActivityRow } from "@/components/activity-feed";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "a1",
    entityId: "e1",
    entityTitle: "Fridge",
    entityType: "notes-page",
    action: "update",
    actorName: "CJ",
    viaLabel: null,
    createdAt: Date.now(),
    undoable: true,
    ...overrides,
  };
}

describe("10.1 activity feed rendering", () => {
  it("renders a write from an API key as \"CJ via Claude\"", () => {
    const html = renderToString(
      createElement(ActivityRow, {
        item: row({ viaLabel: "Claude" }) as never,
        undoDisabled: true,
      }),
    );
    expect(html).toContain("CJ");
    expect(html).toContain("via");
    expect(html).toContain("Claude");
    expect(html).toContain('data-via="Claude"');
  });

  it("renders a web write without a via attribution", () => {
    const html = renderToString(
      createElement(ActivityRow, {
        item: row({ viaLabel: null }) as never,
        undoDisabled: true,
      }),
    );
    // No "via" text node between the actor and the action.
    expect(html).toMatch(/CJ<\/span> <span class="text-muted-foreground">updated/);
    expect(html).toContain('data-via=""');
  });

  it("shows an Undo button only for an undoable entry", () => {
    const undoable = renderToString(
      createElement(ActivityRow, {
        item: row({ undoable: true }) as never,
        undoDisabled: false,
      }),
    );
    expect(undoable).toContain("Undo");

    const notUndoable = renderToString(
      createElement(ActivityRow, {
        item: row({ undoable: false }) as never,
        undoDisabled: false,
      }),
    );
    expect(notUndoable).not.toContain("Undo");
  });
});
