/**
 * Module registry (task 6.1, design D2).
 *
 * Combines definitions, servers, and UIs into a single `ModuleRegistry`
 * record. Downstream code (procedure generation in task 6.2, nav, search,
 * API) iterates the registry.
 *
 * This file is server-only because it imports module servers (Drizzle tables).
 */

import "server-only";

import type { AnyModuleRecord, ModuleRegistry } from "./types";
import { definitions } from "./definitions";
import { servers } from "./server";
import { uis } from "./ui";

// ---------------------------------------------------------------------------
// Build the registry from the three central indexes
// ---------------------------------------------------------------------------

function buildRegistry(): ModuleRegistry {
  const registry: Record<string, AnyModuleRecord> = {};

  for (const [type, definition] of Object.entries(definitions)) {
    const server = servers[type];
    if (!server) {
      throw new Error(
        `Module "${type}" has a definition but no server registration. ` +
          `Add it to src/modules/server.ts.`,
      );
    }
    registry[type] = {
      definition,
      server,
      ui: uis[type] ?? null,
    };
  }

  return registry;
}

/**
 * The complete module registry, keyed by module type.
 * Built once at import time (server startup).
 */
export const registry: ModuleRegistry = buildRegistry();

/**
 * All registered module records as an array.
 */
export function allModules(): AnyModuleRecord[] {
  return Object.values(registry);
}

/**
 * Look up a module by type. Returns undefined for unknown types.
 */
export function getModule(type: string): AnyModuleRecord | undefined {
  return registry[type];
}

/**
 * All registered module type keys.
 */
export function moduleTypes(): string[] {
  return Object.keys(registry);
}
