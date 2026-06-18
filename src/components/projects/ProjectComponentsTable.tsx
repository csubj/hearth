"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/Collapsible";
import { PROJECT_COMPONENT_KINDS } from "@/db/schema";
import type { ProjectDetail } from "@/lib/actions/projects";
import {
  addComponent,
  removeComponent,
  reorderComponent,
  setComponentAcquired,
  updateComponent,
  type ProjectActionState,
} from "@/lib/actions/projects";
import {
  acquiredLabel,
  centsToDollarInput,
  componentKindChipClass,
  componentKindLabel,
  componentKindRowClass,
  formatCents,
  parseDollarsToCents,
  purchaseLinkLabel,
} from "@/components/projects/format";

function ActionMessage({ state }: { state: ProjectActionState }) {
  if (state.error) {
    return (
      <p className="text-sm text-red-600" role="alert">
        {state.error}
      </p>
    );
  }
  if (state.success) {
    return <p className="text-sm text-green-700">{state.success}</p>;
  }
  return null;
}

function KindChip({ kind }: { kind: ProjectDetail["components"][number]["kind"] }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${componentKindChipClass(kind)}`}
    >
      {componentKindLabel(kind)}
    </span>
  );
}

function ComponentRow({
  project,
  component,
  index,
  total,
}: {
  project: ProjectDetail;
  component: ProjectDetail["components"][number];
  index: number;
  total: number;
}) {
  const [updateState, updateAction, updatePending] = useActionState<
    ProjectActionState,
    FormData
  >(updateComponent, {});
  const [acquireState, acquireAction, acquirePending] = useActionState<
    ProjectActionState,
    FormData
  >(setComponentAcquired, {});
  const [removeState, removeAction, removePending] = useActionState<
    ProjectActionState,
    FormData
  >(removeComponent, {});
  const [reorderState, reorderAction, reorderPending] = useActionState<
    ProjectActionState,
    FormData
  >(reorderComponent, {});

  const lineTotal = component.quantity * component.unitCostCents;
  const acquireLabel = acquiredLabel(component.kind);

  return (
    <Collapsible
      className={`rounded-md border border-border border-l-4 ${componentKindRowClass(component.kind)}`}
    >
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <KindChip kind={component.kind} />
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-medium ${component.acquired ? "text-text-muted line-through" : "text-text"}`}>
            {component.name}
          </p>
          <p className="text-xs text-text-muted">
            {component.quantity} × {formatCents(component.unitCostCents)} = {formatCents(lineTotal)}
          </p>
          {component.purchaseUrl ? (
            <a
              href={component.purchaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-flex max-w-full items-center gap-1 text-xs text-accent hover:text-accent/80"
            >
              <span aria-hidden="true">↗</span>
              <span className="truncate">{purchaseLinkLabel(component.purchaseUrl)}</span>
            </a>
          ) : null}
        </div>
        <form action={acquireAction} className="flex items-center gap-1.5">
          <input type="hidden" name="componentId" value={component.id} />
          <input type="hidden" name="projectId" value={project.id} />
          <input type="hidden" name="acquired" value={component.acquired ? "false" : "true"} />
          <label className="flex items-center gap-1.5 text-xs text-text-muted">
            <input
              type="checkbox"
              checked={component.acquired}
              disabled={acquirePending}
              onChange={(event) => event.currentTarget.form?.requestSubmit()}
              className="rounded border-border"
            />
            {acquireLabel}
          </label>
        </form>
        <CollapsibleTrigger className="text-xs text-accent hover:text-accent/80">
          Details
        </CollapsibleTrigger>
        <ActionMessage state={acquireState} />
      </div>

      <CollapsibleContent className="border-t border-border px-3 py-3">
        <form action={updateAction} className="space-y-3">
          <input type="hidden" name="componentId" value={component.id} />
          <input type="hidden" name="projectId" value={project.id} />
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-text-muted">Name</span>
              <input
                name="name"
                defaultValue={component.name}
                required
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-text-muted">Kind</span>
              <select
                name="kind"
                defaultValue={component.kind}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              >
                {PROJECT_COMPONENT_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {componentKindLabel(kind)}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-xs text-text-muted">Quantity</span>
              <input
                name="quantity"
                type="number"
                min={1}
                defaultValue={component.quantity}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1">
              <span className="text-xs text-text-muted">Unit cost</span>
              <input type="hidden" name="unitCostCents" value={component.unitCostCents} />
              <input
                name="unitCostDollars"
                type="text"
                inputMode="decimal"
                defaultValue={centsToDollarInput(component.unitCostCents)}
                onChange={(event) => {
                  const form = event.currentTarget.form;
                  if (!form) {
                    return;
                  }
                  const hidden = form.querySelector<HTMLInputElement>('input[name="unitCostCents"]');
                  if (hidden) {
                    hidden.value = String(parseDollarsToCents(event.target.value));
                  }
                }}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-text-muted">Purchase link</span>
              <input
                name="purchaseUrl"
                type="url"
                defaultValue={component.purchaseUrl ?? ""}
                placeholder="https://…"
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
              {component.purchaseUrl ? (
                <a
                  href={component.purchaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-accent hover:text-accent/80"
                >
                  Open purchase link
                </a>
              ) : null}
            </label>
            <label className="space-y-1 sm:col-span-2">
              <span className="text-xs text-text-muted">How to acquire / notes</span>
              <textarea
                name="note"
                defaultValue={component.note ?? ""}
                rows={2}
                className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" disabled={updatePending} className="text-xs">
              {updatePending ? "Saving…" : "Save"}
            </Button>
            <ActionMessage state={updateState} />
          </div>
        </form>

        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <form action={reorderAction}>
            <input type="hidden" name="componentId" value={component.id} />
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="direction" value="up" />
            <button
              type="submit"
              disabled={reorderPending || index === 0}
              className="text-xs text-text-muted hover:text-text disabled:opacity-40"
            >
              Move up
            </button>
          </form>
          <form action={reorderAction}>
            <input type="hidden" name="componentId" value={component.id} />
            <input type="hidden" name="projectId" value={project.id} />
            <input type="hidden" name="direction" value="down" />
            <button
              type="submit"
              disabled={reorderPending || index === total - 1}
              className="text-xs text-text-muted hover:text-text disabled:opacity-40"
            >
              Move down
            </button>
          </form>
          <form action={removeAction}>
            <input type="hidden" name="componentId" value={component.id} />
            <input type="hidden" name="projectId" value={project.id} />
            <button
              type="submit"
              disabled={removePending}
              className="text-xs text-text-muted hover:text-red-600"
            >
              Remove
            </button>
          </form>
          <ActionMessage state={removeState} />
          <ActionMessage state={reorderState} />
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

export function ProjectComponentsTable({ project }: { project: ProjectDetail }) {
  const [addState, addAction, addPending] = useActionState<ProjectActionState, FormData>(
    addComponent,
    {},
  );

  return (
    <section className="rounded-lg border border-border bg-surface p-4 shadow-card">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="text-lg font-medium text-text">Budget</h2>
        <div className="text-right text-sm text-text-muted">
          <p>
            Estimated: <span className="font-medium text-text">{formatCents(project.estimatedCostCents)}</span>
          </p>
          <p>
            Acquired: <span className="font-medium text-text">{formatCents(project.acquiredCostCents)}</span>
          </p>
          <p>
            Remaining: <span className="font-medium text-text">{formatCents(project.remainingCostCents)}</span>
            {project.budgetCents != null ? (
              <>
                {" "}
                / budget {formatCents(project.budgetCents)}
              </>
            ) : null}
          </p>
          {project.componentCount > 0 ? (
            <p className="mt-1 text-xs">
              {project.acquiredCount}/{project.componentCount} acquired
            </p>
          ) : null}
        </div>
      </div>

      {project.components.length > 0 ? (
        <div className="mt-4 space-y-2">
          {project.components.map((component, index) => (
            <ComponentRow
              key={component.id}
              project={project}
              component={component}
              index={index}
              total={project.components.length}
            />
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-text-muted">No budget items yet.</p>
      )}

      <form action={addAction} className="mt-4 space-y-2 rounded-md border border-dashed border-border p-3">
        <p className="text-sm font-medium text-text">Add item</p>
        <input type="hidden" name="projectId" value={project.id} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            name="name"
            required
            placeholder="Name"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <select
            name="kind"
            defaultValue="item"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          >
            {PROJECT_COMPONENT_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {componentKindLabel(kind)}
              </option>
            ))}
          </select>
          <input
            name="quantity"
            type="number"
            min={1}
            defaultValue={1}
            placeholder="Qty"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            name="unitCostCents"
            type="number"
            min={0}
            defaultValue={0}
            placeholder="Unit cost (cents)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <input
            name="purchaseUrl"
            type="url"
            placeholder="Purchase link (optional)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
          />
          <textarea
            name="note"
            rows={2}
            placeholder="How to acquire / notes (optional)"
            className="rounded-md border border-border bg-background px-3 py-2 text-sm sm:col-span-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" disabled={addPending}>
            {addPending ? "Adding…" : "Add to budget"}
          </Button>
          <ActionMessage state={addState} />
        </div>
      </form>
    </section>
  );
}
