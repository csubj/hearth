"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Button, Tree, TreeItem, TreeItemContent } from "react-aria-components";
import type { HomeTreeNode } from "@/lib/actions/home";
import { itemKindLabel, spaceKindLabel } from "./format";

type TreeMaps = {
  spaceParent: Map<string, string | null>;
  itemToSpace: Map<string, string>;
  linkMeta: Map<string, { spaceId: string; group: string }>;
};

function buildTreeMaps(tree: HomeTreeNode[]): TreeMaps {
  const spaceParent = new Map<string, string | null>();
  const itemToSpace = new Map<string, string>();
  const linkMeta = new Map<string, { spaceId: string; group: string }>();

  function walk(nodes: HomeTreeNode[], parentId: string | null) {
    for (const node of nodes) {
      spaceParent.set(node.id, parentId);
      for (const item of node.items) {
        itemToSpace.set(item.id, node.id);
      }
      for (const inv of node.inventory) {
        linkMeta.set(`inv:${inv.id}`, { spaceId: node.id, group: "inventory" });
      }
      for (const m of node.maintenance) {
        linkMeta.set(`maint:${m.id}`, { spaceId: node.id, group: "maintenance" });
      }
      for (const p of node.projects) {
        linkMeta.set(`proj:${p.id}`, { spaceId: node.id, group: "projects" });
      }
      walk(node.children, node.id);
    }
  }

  walk(tree, null);
  return { spaceParent, itemToSpace, linkMeta };
}

function getActiveKey(pathname: string): string | null {
  const itemMatch = pathname.match(/^\/home-log\/items\/([^/]+)$/);
  if (itemMatch) return `item:${itemMatch[1]}`;

  const sectionMatch = pathname.match(
    /^\/home-log\/([^/]+)\/(materials|inventory|maintenance|projects)$/,
  );
  if (sectionMatch) return `space:${sectionMatch[1]}:${sectionMatch[2]}`;

  const spaceMatch = pathname.match(/^\/home-log\/([^/]+)$/);
  if (spaceMatch && spaceMatch[1] !== "items") return `space:${spaceMatch[1]}`;

  return null;
}

function getExpandedKeys(activeKey: string | null, maps: TreeMaps): Set<string> {
  const keys = new Set<string>();
  if (!activeKey) return keys;

  const expandSpaceChain = (spaceId: string) => {
    let current: string | null = spaceId;
    while (current) {
      keys.add(`space:${current}`);
      current = maps.spaceParent.get(current) ?? null;
    }
  };

  if (activeKey.startsWith("space:")) {
    const rest = activeKey.slice(6);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) {
      expandSpaceChain(rest);
    } else {
      const spaceId = rest.slice(0, colonIdx);
      keys.add(activeKey);
      expandSpaceChain(spaceId);
    }
    return keys;
  }

  if (activeKey.startsWith("item:")) {
    const itemId = activeKey.slice(5);
    const spaceId = maps.itemToSpace.get(itemId);
    if (spaceId) {
      keys.add(`space:${spaceId}:materials`);
      expandSpaceChain(spaceId);
    }
    return keys;
  }

  const meta = maps.linkMeta.get(activeKey);
  if (meta) {
    keys.add(`space:${meta.spaceId}:${meta.group}`);
    expandSpaceChain(meta.spaceId);
  }

  return keys;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden
      className={[
        "size-3.5 shrink-0 text-text-muted transition-transform",
        expanded ? "rotate-90" : "",
      ].join(" ")}
    >
      <path d="M6 4l4 4-4 4V4z" />
    </svg>
  );
}

function TreeRow({
  label,
  detail,
  count,
  isActive,
}: {
  label: string;
  detail?: string;
  count?: number;
  isActive: boolean;
}) {
  return (
    <span
      className={[
        "flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-sm",
        isActive ? "bg-accent/15 font-medium text-accent" : "text-text",
      ].join(" ")}
    >
      <span className="truncate">{label}</span>
      {detail ? <span className="shrink-0 text-xs text-text-muted">{detail}</span> : null}
      {count !== undefined ? (
        <span className="ml-auto shrink-0 text-xs text-text-muted">{count}</span>
      ) : null}
    </span>
  );
}

function TreeItemRow({
  label,
  detail,
  count,
  isActive,
  hasChildItems,
  isExpanded,
}: {
  label: string;
  detail?: string;
  count?: number;
  isActive: boolean;
  hasChildItems: boolean;
  isExpanded: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-0.5">
      <div className="w-[calc((var(--tree-item-level)-1)*16px)] shrink-0" />
      {hasChildItems ? (
        <Button
          slot="chevron"
          className="flex size-6 shrink-0 items-center justify-center border-0 bg-transparent p-0"
        >
          <ChevronIcon expanded={isExpanded} />
        </Button>
      ) : (
        <div className="size-6 shrink-0" />
      )}
      <TreeRow label={label} detail={detail} count={count} isActive={isActive} />
    </div>
  );
}

function renderSpaceNode(
  node: HomeTreeNode,
  activeKey: string | null,
  hrefByKey: Map<string, string>,
): ReactNode {
  const spaceKey = `space:${node.id}`;
  hrefByKey.set(spaceKey, `/home-log/${node.id}`);
  const groups: ReactNode[] = [];

  if (node.items.length > 0) {
    const groupKey = `space:${node.id}:materials`;
    hrefByKey.set(groupKey, `/home-log/${node.id}/materials`);
    groups.push(
      <TreeItem key={groupKey} id={groupKey} textValue="Materials">
        <TreeItemContent>
          {({ hasChildItems, isExpanded }) => (
            <TreeItemRow
              label="Materials"
              count={node.items.length}
              isActive={activeKey === groupKey}
              hasChildItems={hasChildItems}
              isExpanded={isExpanded}
            />
          )}
        </TreeItemContent>
        {node.items.map((item) => {
          const itemKey = `item:${item.id}`;
          hrefByKey.set(itemKey, `/home-log/items/${item.id}`);
          return (
            <TreeItem key={itemKey} id={itemKey} textValue={item.name}>
              <TreeItemContent>
                {({ hasChildItems, isExpanded }) => (
                  <TreeItemRow
                    label={item.name}
                    detail={itemKindLabel(item.kind)}
                    isActive={activeKey === itemKey}
                    hasChildItems={hasChildItems}
                    isExpanded={isExpanded}
                  />
                )}
              </TreeItemContent>
            </TreeItem>
          );
        })}
      </TreeItem>,
    );
  }

  if (node.inventory.length > 0) {
    const groupKey = `space:${node.id}:inventory`;
    hrefByKey.set(groupKey, `/home-log/${node.id}/inventory`);
    groups.push(
      <TreeItem key={groupKey} id={groupKey} textValue="Inventory">
        <TreeItemContent>
          {({ hasChildItems, isExpanded }) => (
            <TreeItemRow
              label="Inventory"
              count={node.inventory.length}
              isActive={activeKey === groupKey}
              hasChildItems={hasChildItems}
              isExpanded={isExpanded}
            />
          )}
        </TreeItemContent>
        {node.inventory.map((inv) => {
          const leafKey = `inv:${inv.id}`;
          hrefByKey.set(leafKey, `/inventory/${inv.id}`);
          return (
            <TreeItem key={leafKey} id={leafKey} textValue={inv.name}>
              <TreeItemContent>
                {({ hasChildItems, isExpanded }) => (
                  <TreeItemRow
                    label={inv.name}
                    isActive={activeKey === leafKey}
                    hasChildItems={hasChildItems}
                    isExpanded={isExpanded}
                  />
                )}
              </TreeItemContent>
            </TreeItem>
          );
        })}
      </TreeItem>,
    );
  }

  if (node.maintenance.length > 0) {
    const groupKey = `space:${node.id}:maintenance`;
    hrefByKey.set(groupKey, `/home-log/${node.id}/maintenance`);
    groups.push(
      <TreeItem key={groupKey} id={groupKey} textValue="Maintenance">
        <TreeItemContent>
          {({ hasChildItems, isExpanded }) => (
            <TreeItemRow
              label="Maintenance"
              count={node.maintenance.length}
              isActive={activeKey === groupKey}
              hasChildItems={hasChildItems}
              isExpanded={isExpanded}
            />
          )}
        </TreeItemContent>
        {node.maintenance.map((m) => {
          const leafKey = `maint:${m.id}`;
          hrefByKey.set(leafKey, `/maintenance/${m.id}`);
          return (
            <TreeItem key={leafKey} id={leafKey} textValue={m.title}>
              <TreeItemContent>
                {({ hasChildItems, isExpanded }) => (
                  <TreeItemRow
                    label={m.title}
                    isActive={activeKey === leafKey}
                    hasChildItems={hasChildItems}
                    isExpanded={isExpanded}
                  />
                )}
              </TreeItemContent>
            </TreeItem>
          );
        })}
      </TreeItem>,
    );
  }

  if (node.projects.length > 0) {
    const groupKey = `space:${node.id}:projects`;
    hrefByKey.set(groupKey, `/home-log/${node.id}/projects`);
    groups.push(
      <TreeItem key={groupKey} id={groupKey} textValue="Projects">
        <TreeItemContent>
          {({ hasChildItems, isExpanded }) => (
            <TreeItemRow
              label="Projects"
              count={node.projects.length}
              isActive={activeKey === groupKey}
              hasChildItems={hasChildItems}
              isExpanded={isExpanded}
            />
          )}
        </TreeItemContent>
        {node.projects.map((p) => {
          const leafKey = `proj:${p.id}`;
          hrefByKey.set(leafKey, `/projects/${p.id}`);
          return (
            <TreeItem key={leafKey} id={leafKey} textValue={p.title}>
              <TreeItemContent>
                {({ hasChildItems, isExpanded }) => (
                  <TreeItemRow
                    label={p.title}
                    isActive={activeKey === leafKey}
                    hasChildItems={hasChildItems}
                    isExpanded={isExpanded}
                  />
                )}
              </TreeItemContent>
            </TreeItem>
          );
        })}
      </TreeItem>,
    );
  }

  return (
    <TreeItem key={spaceKey} id={spaceKey} textValue={node.name}>
      <TreeItemContent>
        {({ hasChildItems, isExpanded }) => (
          <TreeItemRow
            label={node.name}
            detail={spaceKindLabel(node.kind)}
            isActive={activeKey === spaceKey}
            hasChildItems={hasChildItems}
            isExpanded={isExpanded}
          />
        )}
      </TreeItemContent>
      {node.children.map((child) => renderSpaceNode(child, activeKey, hrefByKey))}
      {groups}
    </TreeItem>
  );
}

export function HomeTree({ tree }: { tree: HomeTreeNode[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const maps = useMemo(() => buildTreeMaps(tree), [tree]);
  const activeKey = getActiveKey(pathname);
  const autoExpanded = useMemo(() => getExpandedKeys(activeKey, maps), [activeKey, maps]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => new Set(autoExpanded));

  useEffect(() => {
    setExpandedKeys((prev) => {
      const merged = new Set(prev);
      for (const key of autoExpanded) merged.add(key);
      return merged;
    });
  }, [autoExpanded]);

  const { items, hrefByKey } = useMemo(() => {
    const hrefs = new Map<string, string>();
    const nodes = tree.map((node) => renderSpaceNode(node, activeKey, hrefs));
    return { items: nodes, hrefByKey: hrefs };
  }, [tree, activeKey]);

  return (
    <Tree
      aria-label="Home log"
      selectionMode="none"
      expandedKeys={expandedKeys}
      onExpandedChange={(keys) => setExpandedKeys(keys as Set<string>)}
      onAction={(key) => {
        const href = hrefByKey.get(String(key));
        if (href) router.push(href);
      }}
      className="flex flex-col gap-0.5 outline-none [&_.react-aria-TreeItem]:outline-none [&_.react-aria-TreeItemContent]:min-w-0 [&_.react-aria-TreeItemContent]:flex-1 [&_.react-aria-TreeItemContent[data-focus-visible]]:rounded-md [&_.react-aria-TreeItemContent[data-focus-visible]]:ring-2 [&_.react-aria-TreeItemContent[data-focus-visible]]:ring-accent [&_.react-aria-TreeItemContent[data-focus-visible]]:outline-none"
    >
      {items}
    </Tree>
  );
}
