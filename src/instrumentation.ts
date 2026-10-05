/**
 * Next.js instrumentation hook (design D11/D20, tasks 3.5 and 4.1).
 *
 * Runs the startup sequence (pragma verification, pre-migration backup,
 * migration) and then starts the scheduler. Registers a graceful shutdown
 * handler for SIGTERM/SIGINT.
 *
 * If a migration fails, the process exits non-zero and the scheduler is
 * never started.
 */

const TICK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export async function register(): Promise<void> {
  // Only run in the Node.js server runtime, not in Edge or during build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // Guard against dev-reload / HMR starting a second timer.
  const g = globalThis as Record<string, unknown>;
  if (g.__hearthSchedulerStarted) return;
  g.__hearthSchedulerStarted = true;

  // Dynamic import so the module (and its DB connection) is only loaded
  // when we actually need it.
  const { tick, setConnection } = await import("./server/jobs");
  const { setHealthConnection } = await import("./server/health");
  const { sqlite } = await import("./db");
  const { runStartup, registerShutdown } = await import("./server/startup");

  // Step 1: Run the startup sequence (pragmas → backup → migrate).
  // On failure this calls process.exit(1) and never returns.
  await runStartup(sqlite);

  // Step 2: Wire up connections for the scheduler and health checks.
  setConnection(sqlite);
  setHealthConnection(sqlite);

  // Step 3: Register graceful-shutdown signal handlers.
  registerShutdown(sqlite);

  // Step 4: Start the scheduler.
  // One tick at startup — catches up on missed daily jobs.
  tick(new Date()).catch((err: unknown) => {
    console.error("[scheduler] startup tick failed:", err);
  });

  // Recurring tick every 5 minutes.
  const intervalId = setInterval(() => {
    tick(new Date()).catch((err: unknown) => {
      console.error("[scheduler] tick failed:", err);
    });
  }, TICK_INTERVAL_MS);

  // Store the interval so stopScheduler() can clear it.
  g.__hearthSchedulerInterval = intervalId;

  // Prevent the interval from keeping the process alive when shutdown is
  // requested — the stop sequence clears it explicitly.
  if (typeof intervalId === "object" && "unref" in intervalId) {
    intervalId.unref();
  }
}
