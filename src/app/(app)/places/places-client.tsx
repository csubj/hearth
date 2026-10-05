"use client";

/**
 * Places client (task 7.5) — tree view, create/move, and rollup counts.
 *
 * Reads/writes through `invoke`. The tree is built from the flat place list.
 * Selecting a place loads its rollup (subtree or "this level only") grouped
 * by module.
 */

import { useMemo, useState, useTransition } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invoke } from "@/lib/actions/invoke";
import { QuickCreateDialog, type QuickCreateModule } from "@/components/quick-create-dialog";

interface PlaceNode {
  id: string;
  title: string;
  kind: string;
  path: string;
  parentId: string | null;
  children: PlaceNode[];
}

interface RollupResult {
  place: { id: string; title: string; kind: string };
  exact: boolean;
  groups: Array<{ type: string; count: number }>;
  total: number;
  children: Array<{ id: string; title: string; kind: string; count: number }>;
}

const KIND_OPTIONS = ["property", "structure", "room", "area"];
const MODULE_LABELS: Record<string, string> = {
  place: "Places",
  "notes-page": "Household notes",
};

export function PlacesClient({
  initialTree,
  createModules,
}: {
  initialTree: Array<Omit<PlaceNode, "children">>;
  createModules: QuickCreateModule[];
}) {
  const [flat, setFlat] = useState(
    initialTree.map((n) => ({ ...n })),
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [exact, setExact] = useState(false);
  const [rollup, setRollup] = useState<RollupResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isWorking, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);

  // Create form state
  const [newTitle, setNewTitle] = useState("");
  const [newKind, setNewKind] = useState("room");
  const [newParent, setNewParent] = useState("__none__");
  // Move state
  const [moveTarget, setMoveTarget] = useState("");
  const [moveParent, setMoveParent] = useState("__none__");

  const tree = useMemo(() => buildTree(flat), [flat]);

  const options = flat.map((n) => ({ id: n.id, title: n.title }));

  const handleCreate = () => {
    setError(null);
    startTransition(async () => {
      const [err] = await invoke("placesCreate", {
        title: newTitle,
        kind: newKind,
        parentId: newParent === "__none__" ? null : newParent,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setNewTitle("");
    });
  };

  const handleMove = () => {
    if (!moveTarget) return;
    setError(null);
    startTransition(async () => {
      const [err] = await invoke("placesMove", {
        id: moveTarget,
        parentId: moveParent === "__none__" ? null : moveParent,
      });
      if (err) {
        setError(err.message);
        return;
      }
      // Reload the tree.
      const [reloadErr, result] = await invoke("placesTree", {});
      if (!reloadErr) {
        setFlat(
          (result as Array<Omit<PlaceNode, "children">>).map((n) => ({ ...n })),
        );
      }
    });
  };

  const loadRollup = (id: string, exactFlag = exact) => {
    setError(null);
    startTransition(async () => {
      const [err, result] = await invoke("placesRollup", {
        id,
        exact: exactFlag,
      });
      if (err) {
        setError(err.message);
        return;
      }
      setRollup(result as RollupResult);
      setSelectedId(id);
      setExact(exactFlag);
    });
  };

  const toggleExact = (value: boolean) => {
    if (selectedId) loadRollup(selectedId, value);
  };

  return (
    <>
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Left: tree + actions */}
      <div className="space-y-6">
        {/* Create form */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-lg font-medium">New place</h2>
          <div className="space-y-1">
            <Label className="text-xs">Title</Label>
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="e.g. Kitchen"
              data-testid="place-title"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Kind</Label>
              <Select value={newKind} onValueChange={setNewKind}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KIND_OPTIONS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Parent</Label>
              <Select value={newParent} onValueChange={setNewParent}>
                <SelectTrigger>
                  <SelectValue placeholder="(none)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(none)</SelectItem>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={handleCreate} disabled={isWorking || !newTitle}>
            Create
          </Button>
        </div>

        {/* Create in the selected place (task 13.2 prefill) */}
        {selectedId && createModules.length > 0 && (
          <div className="rounded-lg border bg-card p-4 space-y-3">
            <h2 className="text-lg font-medium">Create in this place</h2>
            <p className="text-sm text-muted-foreground">
              Create an entity in the selected place.
            </p>
            <Button
              onClick={() => setCreateOpen(true)}
              disabled={isWorking}
              data-testid="create-in-place"
            >
              New in this place
            </Button>
          </div>
        )}

        {/* Move form */}
        <div className="rounded-lg border bg-card p-4 space-y-3">
          <h2 className="text-lg font-medium">Move a place</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Place</Label>
              <Select value={moveTarget} onValueChange={setMoveTarget}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a place" />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">New parent</Label>
              <Select value={moveParent} onValueChange={setMoveParent}>
                <SelectTrigger>
                  <SelectValue placeholder="(none)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">(none)</SelectItem>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            onClick={handleMove}
            disabled={isWorking || !moveTarget}
            variant="outline"
          >
            Move
          </Button>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {/* Tree */}
        <div
          className="rounded-lg border bg-card p-4"
          data-testid="place-tree"
        >
          <h2 className="text-lg font-medium">Tree</h2>
          {tree.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No places yet.
            </p>
          ) : (
            <TreeNodes nodes={tree} depth={0} onSelect={loadRollup} />
          )}
        </div>
      </div>

      {/* Right: rollup */}
      <div className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium">Rollup</h2>
          {selectedId && (
            <div className="flex items-center gap-2">
              <Button
                variant={exact ? "secondary" : "outline"}
                size="sm"
                onClick={() => toggleExact(false)}
              >
                Subtree
              </Button>
              <Button
                variant={exact ? "outline" : "secondary"}
                size="sm"
                onClick={() => toggleExact(true)}
              >
                This level only
              </Button>
            </div>
          )}
        </div>
        {!rollup ? (
          <p className="text-muted-foreground text-sm">
            Select a place to see rollup counts.
          </p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium">
              {rollup.place.title}{" "}
              <span className="text-muted-foreground">
                ({rollup.exact ? "this level" : "subtree"}) — {rollup.total}{" "}
                items
              </span>
            </p>
            {rollup.groups.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nothing placed here.
              </p>
            ) : (
              <ul className="space-y-1">
                {rollup.groups.map((g) => (
                  <li key={g.type} className="text-sm flex justify-between">
                    <span>{MODULE_LABELS[g.type] ?? g.type}</span>
                    <span className="font-medium">{g.count}</span>
                  </li>
                ))}
              </ul>
            )}
            {rollup.children.length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">
                  Child spaces
                </p>
                <ul className="space-y-1">
                  {rollup.children.map((c) => (
                    <li key={c.id} className="text-sm flex justify-between">
                      <span>{c.title}</span>
                      <span className="text-muted-foreground">{c.count}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>

    <QuickCreateDialog
      open={createOpen}
      onOpenChange={setCreateOpen}
      modules={createModules}
      contextPlaceId={selectedId}
    />
    </>
  );
}

// ---------------------------------------------------------------------------
// Tree rendering
// ---------------------------------------------------------------------------

function TreeNodes({
  nodes,
  depth,
  onSelect,
}: {
  nodes: PlaceNode[];
  depth: number;
  onSelect: (id: string) => void;
}) {
  return (
    <ul className="space-y-1">
      {nodes.map((n) => (
        <li key={n.id}>
          <button
            className="text-left text-sm w-full rounded px-2 py-1 hover:bg-accent"
            style={{ paddingLeft: `${depth * 16 + 8}px` }}
            onClick={() => onSelect(n.id)}
            data-testid={`place-node-${n.title}`}
          >
            {n.title}
            <span className="ml-2 text-xs text-muted-foreground">
              {n.kind}
            </span>
          </button>
          {n.children.length > 0 && (
            <TreeNodes nodes={n.children} depth={depth + 1} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Build the tree from the flat list (parentId → children)
// ---------------------------------------------------------------------------

function buildTree(flat: Array<Omit<PlaceNode, "children">>): PlaceNode[] {
  const map = new Map<string, PlaceNode>();
  for (const n of flat) {
    map.set(n.id, { ...n, children: [] });
  }
  const roots: PlaceNode[] = [];
  for (const n of map.values()) {
    if (n.parentId && map.has(n.parentId)) {
      map.get(n.parentId)!.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}
