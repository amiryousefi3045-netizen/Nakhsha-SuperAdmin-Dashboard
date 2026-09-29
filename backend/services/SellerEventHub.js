/**
 * Seller Event Hub
 * A tiny in-process pub/sub used to push live store events to subscribed
 * seller clients (Server-Sent Events).
 *
 * Design notes:
 *   - Events are NOT persisted here; Mongo (AuditLog / Order / Payout) remains
 *     the durable source of truth. The dashboard always refetches on an event.
 *   - Every client is bound to a `sellerProfileId`, so a publish NEVER crosses
 *     stores: another seller's event cannot reach a subscriber.
 *   - In multi-instance deployments this should be replaced with Redis Pub/Sub
 *     (same caveat as AdminEventHub).
 */
const { EventEmitter } = require("events");
const logger = require("../utils/logger");

const MAX_CLIENTS_PER_SELLER = 10;
const MAX_CLIENTS_TOTAL = 200;

class SellerEventHub extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // id -> { res, sellerId, userId, lastSeen }
    this._nextId = 1;
  }

  /**
   * Register a client for live store events.
   * @returns {{ id: string, unsubscribe: Function }} the connection id (for
   *   per-client heartbeats) and its teardown function.
   */
  subscribe(res, { sellerId, userId, initialPayload }) {
    if (!this.canAccept(sellerId)) {
      const err = Object.assign(new Error("Too many live connections"), { code: "TOO_MANY" });
      throw err;
    }

    const id = String(this._nextId++);
    this.clients.set(id, { res, sellerId: String(sellerId), userId, lastSeen: Date.now() });

    if (initialPayload !== undefined) {
      this.write(id, "initial", initialPayload);
    }

    const unsubscribe = () => {
      this.clients.delete(id);
    };
    res.on("close", unsubscribe);
    return { id, unsubscribe };
  }

  /**
   * Whether one more connection for this store can be accepted. Callers check
   * this BEFORE writing any SSE header so a rejection can still be a clean
   * JSON 503 rather than a half-open event stream.
   */
  canAccept(sellerId) {
    return (
      this._countFor(sellerId) < MAX_CLIENTS_PER_SELLER &&
      this.clients.size < MAX_CLIENTS_TOTAL
    );
  }

  write(id, event, payload) {
    const client = this.clients.get(id);
    if (!client || client.res.writableEnded || client.res.destroyed) {
      this.clients.delete(id);
      return false;
    }
    try {
      client.res.write(`event: ${event}\n`);
      client.res.write(`data: ${JSON.stringify(payload)}\n\n`);
      client.lastSeen = Date.now();
      return true;
    } catch (e) {
      logger.warn("Seller event hub write failed", { error: e.message });
      this.clients.delete(id);
      return false;
    }
  }

  /**
   * Push an event to every live client of ONE store. `sellerId` is always the
   * authenticated store — callers must never pass a client-supplied value.
   */
  publish(sellerId, event, payload) {
    const target = String(sellerId);
    let delivered = 0;
    const doomed = [];
    for (const [id, client] of this.clients) {
      if (client.sellerId !== target) continue;
      if (this.write(id, event, payload)) delivered += 1;
      else doomed.push(id);
    }
    if (doomed.length > 0) logger.info("Dropped stale seller SSE clients", { count: doomed.length });
    return delivered;
  }

  _countFor(sellerId) {
    const target = String(sellerId);
    let n = 0;
    for (const client of this.clients.values()) {
      if (client.sellerId === target) n += 1;
    }
    return n;
  }

  get connectionCount() {
    return this.clients.size;
  }

  /**
   * Heartbeat clients. With an `id` only that connection is pinged (one timer
   * per stream); without it every alive client is pinged. Returns the number
   * still connected.
   */
  heartbeat(id) {
    if (id !== undefined) {
      this.write(String(id), "heartbeat", { at: new Date().toISOString() });
      return this.clients.has(String(id)) ? 1 : 0;
    }
    let alive = 0;
    for (const clientId of this.clients.keys()) {
      if (this.write(clientId, "heartbeat", { at: new Date().toISOString() })) alive += 1;
    }
    return alive;
  }

  /** Test helper: drop every client (used to isolate suites). */
  reset() {
    for (const client of this.clients.values()) {
      try {
        client.res.end();
      } catch {
        // client socket already gone — nothing to clean up
      }
    }
    this.clients.clear();
  }
}

module.exports = new SellerEventHub();
module.exports.SellerEventHub = SellerEventHub;
module.exports.MAX_CLIENTS_PER_SELLER = MAX_CLIENTS_PER_SELLER;
