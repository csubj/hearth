/**
 * CLI entry point for `pnpm jobs:tick` (design D11, task 3.5).
 *
 * Runs `tick(new Date())` once against the production database, then exits.
 * Intended for when the app is stopped and the operator wants to run
 * scheduled maintenance manually.
 */

import { tick, setConnection } from "./jobs";
import { sqlite } from "../db";

setConnection(sqlite);

tick(new Date())
  .then(() => {
    console.log("✓ tick completed");
    process.exit(0);
  })
  .catch((err: unknown) => {
    console.error("✗ tick failed:", err);
    process.exit(1);
  });
