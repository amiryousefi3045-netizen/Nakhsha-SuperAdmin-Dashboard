/**
 * Admin Event Hub
 * A tiny in-process pub/sub used to push live activity to subscribed admin
 * clients (Server-Sent Events). Events published here are NOT persisted; the
 * AuditLog collection remains the durable source of truth. In multi-instance
 * deployments this should be replaced with Redis Pub/Sub.
 */
const { EventEmitter } = require("events");
const logger = require("../utils/logger");

const MAX_CLIENTS = 50;

class AdminEventHub extends EventEmitter {
  constructor() {
    super();
    this.clients = new Map(); // key: client id -> { res, userId, lastSeen }
    this._nextId = 1;
  }

  /**
   * Register a client for live events.
   * @returns {Function} unsubscribe function
   */
  subscribe(res, { userId, initialPayload }) {
    if (this.clients.size >= MAX_CLIENTS) {
      const err = Object.assign(new Error("Too many live connections"), { code: "TOO_MANY" });
      throw err;
    }

    const id = String(this._nextId++);
    this.clients.set(id, { res, userId, lastSeen: Date.now() });

    if (initialPayload !== undefined) {
      this.write(id, "initial", initialPayload);
    }

    const unsubscribe = () => {
      this.clients.delete(id);
    };

    res.on("close", unsubscribe);
    return unsubscribe;
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
      logger.warn("Admin event hub write failed", { error: e.message });
      this.clients.delete(id);
      return false;
    }
  }

  /**
   * Broadcast a payload to every connected admin client.
   */
  publish(event, payload) {
    const doomed = [];
    for (const id of this.clients.keys()) {
      if (!this.write(id, event, payload)) doomed.push(id);
    }
    if (doomed.length > 0) logger.info("Dropped stale SSE clients", { count: doomed.length });
  }

  get connectionCount() {
    return this.clients.size;
  }

  /**
   * Heartbeat every alive client. Returns the number still connected.
   */
  heartbeat() {
    let alive = 0;
    for (const id of this.clients.keys()) {
      if (this.write(id, "heartbeat", { at: new Date().toISOString() })) alive += 1;
    }
    return alive;
  }
}

module.exports = new AdminEventHub();