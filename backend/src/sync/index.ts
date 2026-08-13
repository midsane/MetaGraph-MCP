#!/usr/bin/env node
import { SyncEngine } from '../core/sync-engine.js';
import { eventListener } from '../core/event-listener.js';

const mode = process.argv[2] || 'once';

async function main() {
  if (mode === 'watch') {
    console.log('[Sync] Starting event-driven watch mode (LISTEN on business-db)...');
    await eventListener.start();

    const shutdown = async () => {
      console.log('\n[Sync] Shutting down listener...');
      await eventListener.stop();
      process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
    return;
  }

  console.log('[Sync] Running one-shot syncUp()...');
  const result = await SyncEngine.syncUp();
  console.log('[Sync] Done:', JSON.stringify(result, null, 2));
  process.exit(0);
}

main().catch(err => {
  console.error('[Sync] Fatal error:', err);
  process.exit(1);
});
