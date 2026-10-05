/**
 * Generic module list page (task 13.3, design D2/D3/D16).
 *
 * A Server Component that looks up the module by the dynamic [module] param,
 * loads the first page of entities via the server-only router client, and
 * renders the shared registry-driven <EntityList> with filters, sort,
 * infinite scroll, and quick-create.
 *
 * 404 for unregistered module types.
 */

import { notFound } from "next/navigation";
import { definitions } from "@/modules/definitions";
import { serverClient } from "@/lib/orpc-server-client";
import { extractFields, extractListColumns } from "@/lib/module-fields";
import { EntityListPage } from "./entity-list-page";

function procedurePrefix(type: string): string {
  return type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default async function ModuleListPage({
  params,
  searchParams,
}: {
  params: Promise<{ module: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { module: moduleType } = await params;
  const sp = await searchParams;

  const definition = definitions[moduleType];
  if (!definition) {
    notFound();
  }

  const prefix = procedurePrefix(moduleType);
  const listProcKey = `${prefix}List` as keyof typeof serverClient;

  const sort =
    typeof sp.sort === "string" ? sp.sort : undefined;
  const sortDirection =
    typeof sp.sortDirection === "string" &&
    (sp.sortDirection === "asc" || sp.sortDirection === "desc")
      ? sp.sortDirection
      : undefined;

  const filters: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(sp)) {
    if (key.startsWith("f_") && typeof value === "string") {
      filters[key.slice(2)] = value;
    }
  }

  const listFn = serverClient[listProcKey] as unknown as (input: {
    sort?: string;
    sortDirection?: "asc" | "desc";
    limit?: number;
    filters?: Record<string, unknown>;
  }) => Promise<{
    data: Record<string, unknown>[];
    nextCursor: string | null;
  }>;

  let initialData: Record<string, unknown>[] = [];
  let initialCursor: string | null = null;
  let loadError: string | null = null;

  try {
    const result = await listFn({
      sort,
      sortDirection,
      limit: 50,
      filters: Object.keys(filters).length > 0 ? filters : undefined,
    });
    initialData = result.data;
    initialCursor = result.nextCursor;
  } catch {
    loadError = "Failed to load data.";
  }

  return (
    <EntityListPage
      moduleType={moduleType}
      label={definition.label}
      fields={extractFields(definition)}
      listColumns={extractListColumns(definition)}
      filterKeys={[...definition.filters]}
      sortKeys={Object.keys(definition.sorts)}
      quickCreateFields={[...definition.quickCreate]}
      initialData={initialData}
      initialCursor={initialCursor}
      initialSort={sort}
      initialSortDirection={sortDirection}
      initialFilters={filters}
      showTagFilter={definition.features.tags === true}
      loadError={loadError}
    />
  );
}
