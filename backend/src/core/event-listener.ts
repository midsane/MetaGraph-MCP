import { Client } from 'pg';
import { businessDbConnectionString, config } from '../config/env.js';
import { SyncEngine } from './sync-engine.js';

const CHANNEL = 'metagraph_sync';
const RECONNECT_DELAY_MS = 3000;

/**
 * Listens for pg_notify('metagraph_sync', ...) events fired by the DDL and
 * query_logs triggers installed in init-target-db.sql, and runs syncUp() in
 * response. Notifications are debounced so a burst of DDL statements (e.g.
 * a multi-statement migration) collapses into a single sync.
 *
 * Uses a single dedicated (non-pooled) Client, per Postgres LISTEN/NOTIFY
 * requirements - the pg module's Pool cannot deliver notifications reliably
 * because clients are recycled between queries.
 */
export class EventListener {
  private client: Client | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private syncInFlight = false;
  private syncQueuedAgain = false;
  private stopped = false;

  async start(): Promise<void> {
    this.stopped = false;
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    await this.client?.end().catch(() => {});
    this.client = null;
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: businessDbConnectionString() });

    client.on('notification', msg => {
      console.log(`[EventListener] Notification on "${msg.channel}": ${msg.payload}`);
      this.scheduleSync();
    });

    client.on('error', err => {
      console.error('[EventListener] Connection error:', err.message);
      this.reconnect();
    });

    client.on('end', () => {
      if (!this.stopped) {
        console.warn('[EventListener] Connection ended unexpectedly, reconnecting...');
        this.reconnect();
      }
    });

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    this.client = client;
    console.log(`[EventListener] Listening on "${CHANNEL}" (business-db). Debounce: ${config.syncDebounceMs}ms`);

    // Catch up on anything that happened while nothing was listening.
    this.scheduleSync();
  }

  private reconnect(): void {
    if (this.stopped) return;
    this.client?.removeAllListeners();
    this.client = null;
    setTimeout(() => {
      if (!this.stopped) this.connect().catch(err => console.error('[EventListener] Reconnect failed:', err.message));
    }, RECONNECT_DELAY_MS);
  }

  private scheduleSync(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.runSync(), config.syncDebounceMs);
  }

  private async runSync(): Promise<void> {
    if (this.syncInFlight) {
      // A notification arrived mid-sync; run once more after this one finishes.
      this.syncQueuedAgain = true;
      return;
    }

    this.syncInFlight = true;
    try {
      const result = await SyncEngine.syncUp();
      console.log('[EventListener] syncUp() complete:', JSON.stringify(result));
    } catch (err: any) {
      console.error('[EventListener] syncUp() failed:', err.message);
    } finally {
      this.syncInFlight = false;
      if (this.syncQueuedAgain) {
        this.syncQueuedAgain = false;
        this.scheduleSync();
      }
    }
  }
}

export const eventListener = new EventListener();
