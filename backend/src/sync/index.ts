#!/usr/bin/env node
import { eventListener } from '../core/event-listener.js';

/**
 * Long-running event-driven sync daemon (`npm run sync:watch`). For a
 * one-shot sync, use `npm run cli sync` instead - this entrypoint's only
 * job is the LISTEN/NOTIFY watch loop.
 */
async function main() {
  console.log('[Sync] Starting event-driven watch mode (LISTEN on business-db)...');
  await eventListener.start();

  const shutdown = async () => {
    console.log('\n[Sync] Shutting down listener...');
    await eventListener.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch(err => {
  console.error('[Sync] Fatal error:', err);
  process.exit(1);
});
