/**
 * Generic module detail page (task 13.3, design D2/D3/D13).
 *
 * A Server Component that loads a single entity via the server-only router
 * client and renders the shared detail layout with inline field editing. The
 * module's shared-feature sections (organization, collaboration, reminders,
 * activity) render below the header.
 *
 * 404 for unregistered module types or missing entities.
 */

import { notFound } from "next/navigation";
import { definitions } from "@/modules/definitions";
import { serverClient } from "@/lib/orpc-server-client";
import { extractFields } from "@/lib/module-fields";
import { EntityDetail } from "@/components/entity-detail";
import { PinButton } from "./pin-button";
import { OrganizationPanel } from "./organization-panel";
import { CollaborationPanel } from "./collaboration-panel";
import { RemindersPanel } from "./reminders-panel";
import { ActivityFeed } from "@/components/activity-feed";

function procedurePrefix(type: string): string {
  return type.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
}

export default async function ModuleDetailPage({
  params,
}: {
  params: Promise<{ module: string; id: string }>;
}) {
  const { module: moduleType, id } = await params;

  const definition = definitions[moduleType];
  if (!definition) {
    notFound();
  }

  const prefix = procedurePrefix(moduleType);
  const getProcKey = `${prefix}Get` as keyof typeof serverClient;

  const getFn = serverClient[getProcKey] as unknown as (input: {
    id: string;
  }) => Promise<Record<string, unknown>>;

  let entity: Record<string, unknown> | null = null;
  try {
    entity = await getFn({ id });
  } catch {
    entity = null;
  }

  if (!entity) {
    notFound();
  }

  let currentUserId = "";
  try {
    const profile = (await serverClient.getProfile({})) as { id?: string };
    currentUserId = profile?.id ?? "";
  } catch {
    currentUserId = "";
  }

  const allFields = extractFields(definition);

  return (
    <EntityDetail
      moduleType={moduleType}
      label={definition.label}
      fields={allFields}
      entity={entity}
    >
      <PinButton entityId={entity.id as string} />
      <OrganizationPanel
        entityId={entity.id as string}
        moduleType={moduleType}
        features={{
          tags: definition.features.tags === true,
          links: definition.features.links === true,
          urls: true,
          attachments: definition.features.attachments ?? false,
        }}
      />
      <CollaborationPanel
        entityId={entity.id as string}
        currentUserId={currentUserId}
        features={{
          notes: definition.features.notes === true,
          comments: definition.features.comments === true,
          assignees: definition.features.assignees === true,
        }}
      />
      {definition.features.reminders === true && (
        <RemindersPanel entityId={entity.id as string} />
      )}
      <div className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">
          Activity
        </h2>
        <ActivityFeed entityId={entity.id as string} />
      </div>
    </EntityDetail>
  );
}
