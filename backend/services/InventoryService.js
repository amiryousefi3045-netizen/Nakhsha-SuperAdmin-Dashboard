const mongoose = require("mongoose");
const Product = require("../models/Product");
const InventoryLocation = require("../models/InventoryLocation");

/**
 * Multi-location inventory (phase 38).
 *
 * ## Why the numbers live on the Product
 *
 * The deployment runs a standalone MongoDB, so multi-document transactions do
 * not exist: two documents cannot be updated atomically together. An order
 * that reserved stock in `products` and recorded the same reservation in a
 * separate `inventorylevels` collection would be able to land in between the
 * two writes, and the gap would surface as a phantom unit or a phantom
 * shortfall. Instead `stock.locations[]` lives inside `Product.stock`, so
 * every movement is ONE update to ONE document and is atomic by construction.
 *
 * ## Invariants
 *
 *   1. `stock.onHand    === Σ stock.locations.onHand`
 *   2. `stock.reserved  === Σ stock.locations.reserved`
 *   3. `stock.onHand` is the FREE balance; `stock.reserved` is COMMITTED;
 *      the physical total is their sum.
 *
 * Invariant (1) and (2) are preserved by every helper below, and the guard that
 * decides whether an order may proceed is still on `stock.onHand` — the same
 * field the numbers are reported from, so the guard and the advertised figure
 * can never disagree.
 *
 * ## Opt-in per seller
 *
 * A seller with no `InventoryLocation` is not tracked at all: `stock.locations`
 * stays empty and behaviour is byte-for-byte what it was before phase 38. The
 * breakdown is materialised from the aggregate the first time stock moves for
 * a seller who has a location, which is why there is no migration step.
 */

const MAX_LOCATIONS = 10;

// ── Expression builders ─────────────────────────────────────────────────────

/**
 * Stage 0: build the breakdown from the aggregate if it does not exist yet.
 *
 * MUST run before the stage that changes the aggregate, because it copies the
 * totals as they are at that moment. A seller with no locations passes a null
 * id and the breakdown is deliberately left empty — nothing tracked, nothing
 * to drift.
 */
function materializeStage(locationId) {
  const oid = locationId ? toOid(locationId) : null;
  return {
    $set: {
      "stock.locations": {
        $cond: [
          { $eq: [{ $size: { $ifNull: ["$stock.locations", []] } }, 0] },
          {
            $cond: [
              { $ne: [oid, null] },
              [
                {
                  locationId: oid,
                  onHand: { $ifNull: ["$stock.onHand", 0] },
                  reserved: { $ifNull: ["$stock.reserved", 0] },
                },
              ],
              { $ifNull: ["$stock.locations", []] },
            ],
          },
          { $ifNull: ["$stock.locations", []] },
        ],
      },
    },
  };
}

/**
 * Move `qty` from a level's `onHand` to its `reserved`, in stored order.
 *
 * Stored order is the seller's location order with the default first, so a
 * sale is drawn from the default location and only spills into the next one
 * when the default is empty. Because the SAME reduce is inverted by
 * `unreserveExpr` on cancellation, each level gets its own units back rather
 * than the batch as a whole landing on whichever location happens to be first.
 */
function reserveExpr(qty) {
  return {
    $let: {
      vars: {
        r: {
          $reduce: {
            input: { $ifNull: ["$stock.locations", []] },
            initialValue: { remaining: qty, out: [] },
            in: {
              $let: {
                vars: {
                  take: { $min: [{ $max: ["$$this.onHand", 0] }, "$$value.remaining"] },
                },
                in: {
                  remaining: { $subtract: ["$$value.remaining", "$$take"] },
                  out: {
                    $concatArrays: [
                      "$$value.out",
                      [
                        {
                          $mergeObjects: [
                            "$$this",
                            {
                              onHand: { $subtract: ["$$this.onHand", "$$take"] },
                              reserved: { $add: ["$$this.reserved", "$$take"] },
                            },
                          ],
                        },
                      ],
                    ],
                  },
                },
              },
            },
          },
        },
      },
      in: "$$r.out",
    },
  };
}

/**
 * Move `qty` from a level's `reserved` back to its `onHand` (cancellation).
 * Exact inverse of `reserveExpr` per level.
 */
function restoreExpr(qty) {
  return {
    $let: {
      vars: {
        r: {
          $reduce: {
            input: { $ifNull: ["$stock.locations", []] },
            initialValue: { remaining: qty, out: [] },
            in: {
              $let: {
                vars: {
                  take: { $min: [{ $max: ["$$this.reserved", 0] }, "$$value.remaining"] },
                },
                in: {
                  remaining: { $subtract: ["$$value.remaining", "$$take"] },
                  out: {
                    $concatArrays: [
                      "$$value.out",
                      [
                        {
                          $mergeObjects: [
                            "$$this",
                            {
                              reserved: { $subtract: ["$$this.reserved", "$$take"] },
                              onHand: { $add: ["$$this.onHand", "$$take"] },
                            },
                          ],
                        },
                      ],
                    ],
                  },
                },
              },
            },
          },
        },
      },
      in: "$$r.out",
    },
  };
}

/**
 * Drop `qty` of committed units at shipment: only `reserved` shrinks, because
 * the units were already taken out of `onHand` when they were reserved and
 * have now physically left.
 */
function releaseExpr(qty) {
  return {
    $let: {
      vars: {
        r: {
          $reduce: {
            input: { $ifNull: ["$stock.locations", []] },
            initialValue: { remaining: qty, out: [] },
            in: {
              $let: {
                vars: {
                  take: { $min: [{ $max: ["$$this.reserved", 0] }, "$$value.remaining"] },
                },
                in: {
                  remaining: { $subtract: ["$$value.remaining", "$$take"] },
                  out: {
                    $concatArrays: [
                      "$$value.out",
                      [
                        {
                          $mergeObjects: [
                            "$$this",
                            { reserved: { $subtract: ["$$this.reserved", "$$take"] } },
                          ],
                        },
                      ],
                    ],
                  },
                },
              },
            },
          },
        },
      },
      in: "$$r.out",
    },
  };
}

/**
 * Credit returned units back to the first location that exists.
 *
 * After shipment `reserved` is zero everywhere, so there is nothing left to
 * infer the origin from; the first location — the default, the one orders are
 * drawn from — is the right default. Totals stay exact either way.
 */
function creditFirstExpr(qty) {
  return {
    $let: {
      vars: {
        locations: { $ifNull: ["$stock.locations", []] },
      },
      in: {
        $cond: [
          { $gt: [{ $size: "$$locations" }, 0] },
          {
            $let: {
              vars: { first: { $arrayElemAt: ["$$locations", 0] } },
              in: {
                $concatArrays: [
                  [
                    {
                      $mergeObjects: [
                        "$$first",
                        { onHand: { $add: ["$$first.onHand", qty] } },
                      ],
                    },
                  ],
                  { $slice: ["$$locations", 1, { $size: "$$locations" }] },
                ],
              },
            },
          },
          [],
        ],
      },
    },
  };
}

function toOid(value) {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return mongoose.Types.ObjectId.isValid(value)
    ? new mongoose.Types.ObjectId(String(value))
    : null;
}

// ── Atomic stock helpers ────────────────────────────────────────────────────

/**
 * Reserve `qty` free units: `onHand -= qty`, `reserved += qty`.
 *
 * The guard is on `stock.onHand` alone — the free balance — so this is the one
 * place that can refuse an order for lack of stock, and it refuses exactly
 * when the storefront reports nothing available.
 *
 * @returns the updated product, or null when the guard did not hold.
 */
async function reserveStock(productId, sellerId, qty, locationId = null) {
  return Product.findOneAndUpdate(
    {
      _id: productId,
      sellerId,
      stockPolicy: "tracked",
      "stock.onHand": { $gte: qty },
    },
    [
      materializeStage(locationId),
      {
        $set: {
          "stock.onHand": { $subtract: [{ $ifNull: ["$stock.onHand", 0] }, qty] },
          "stock.reserved": { $add: [{ $ifNull: ["$stock.reserved", 0] }, qty] },
          "stock.locations": reserveExpr(qty),
        },
      },
    ],
    { new: true },
  );
}

/** Release a reservation at shipment: only `reserved` falls, clamped at 0. */
async function releaseReserved(productId, sellerId, qty, locationId = null) {
  return Product.findOneAndUpdate(
    { _id: productId, sellerId, stockPolicy: "tracked" },
    [
      materializeStage(locationId),
      {
        $set: {
          "stock.reserved": {
            $max: [{ $subtract: [{ $ifNull: ["$stock.reserved", 0] }, qty] }, 0],
          },
          "stock.locations": releaseExpr(qty),
        },
      },
    ],
    { new: true },
  );
}

/** Cancel: committed units go back to free. Guarded on `reserved`. */
async function restoreStock(productId, sellerId, qty, locationId = null) {
  return Product.findOneAndUpdate(
    {
      _id: productId,
      sellerId,
      stockPolicy: "tracked",
      "stock.reserved": { $gte: qty },
    },
    [
      materializeStage(locationId),
      {
        $set: {
          "stock.reserved": { $subtract: [{ $ifNull: ["$stock.reserved", 0] }, qty] },
          "stock.onHand": { $add: [{ $ifNull: ["$stock.onHand", 0] }, qty] },
          "stock.locations": restoreExpr(qty),
        },
      },
    ],
    { new: true },
  );
}

/** Physical return after delivery: `onHand` grows, `reserved` does not. */
async function returnToStock(productId, sellerId, qty, locationId = null) {
  return Product.findOneAndUpdate(
    { _id: productId, sellerId, stockPolicy: "tracked" },
    [
      materializeStage(locationId),
      {
        $set: {
          "stock.onHand": { $add: [{ $ifNull: ["$stock.onHand", 0] }, qty] },
          "stock.locations": creditFirstExpr(qty),
        },
      },
    ],
    { new: true },
  );
}

// ── Location lifecycle ──────────────────────────────────────────────────────

const LOCATION_ORDER = { isDefault: -1, sortOrder: 1, createdAt: 1 };

/**
 * The location stock is drawn from for this seller, or null when the seller
 * has not set up locations (in which case nothing is tracked — see module
 * docs). Resolved once per order operation rather than once per line.
 *
 * The sort here is the SAME order `reorderLevels` writes into every product's
 * breakdown. Resolve and drain must agree, or an order would be charged to a
 * location the seller never sees supplying it.
 *
 * `isActive` deliberately takes no part in this ordering: a closed location
 * still holds its units and must keep supplying them, because silently
 * relocating stock the moment a seller unticks a box is a surprise that
 * corrupts the per-location history. Deactivation only stops a location being
 * chosen as a transfer target.
 */
async function resolveDefaultLocationId(sellerId) {
  const loc = await InventoryLocation.findOne({ sellerId })
    .sort(LOCATION_ORDER)
    .select("_id")
    .lean();
  return loc ? loc._id : null;
}

/**
 * Rewrite every product's breakdown into the canonical location order.
 *
 * Stock is drained in stored order, so the array has to track whatever
 * `resolveDefaultLocationId` would answer. One updateMany over one pipeline,
 * one document at a time — a reorder never changes a number, only where the
 * numbers sit, so the sum invariants hold by construction.
 */
async function reorderLevels(sellerId) {
  const ordered = await InventoryLocation.find({ sellerId })
    .sort(LOCATION_ORDER)
    .select("_id")
    .lean();
  const ids = ordered.map((l) => l._id);
  if (ids.length === 0) return;

  await Product.updateMany({ sellerId, "stock.locations.0": { $exists: true } }, [
    // `$sortArray` only sorts by a path and a direction, never by a computed
    // key, so the rank is attached first and stripped afterwards. A level whose
    // location was deleted ranks last instead of vanishing: dropping it would
    // break the sum invariant, and nothing folds it away.
    {
      $set: {
        "stock.locations": {
          $map: {
            input: { $ifNull: ["$stock.locations", []] },
            as: "l",
            in: {
              $mergeObjects: [
                "$$l",
                {
                  _rank: {
                    $let: {
                      vars: { i: { $indexOfArray: [ids, "$$l.locationId"] } },
                      in: { $cond: [{ $lt: ["$$i", 0] }, 99, "$$i"] },
                    },
                  },
                },
              ],
            },
          },
        },
      },
    },
    {
      $set: {
        "stock.locations": {
          $map: {
            input: { $sortArray: { input: "$stock.locations", sortBy: { _rank: 1 } } },
            as: "l",
            in: { $unsetField: { field: "_rank", input: "$$l" } },
          },
        },
      },
    },
  ]);
}

async function listLocations(sellerId) {
  return InventoryLocation.find({ sellerId }).sort(LOCATION_ORDER).lean();
}

async function countLocations(sellerId) {
  return InventoryLocation.countDocuments({ sellerId });
}

async function createLocation(sellerId, data) {
  const total = await countLocations(sellerId);
  if (total >= MAX_LOCATIONS) {
    const err = new Error("LOCATION_LIMIT");
    err.code = "LOCATION_LIMIT";
    throw err;
  }

  const isFirst = total === 0;
  const isDefault = isFirst ? true : data.isDefault === true;

  if (isDefault && !isFirst) {
    await InventoryLocation.updateMany({ sellerId }, { $set: { isDefault: false } });
  }

  const loc = await InventoryLocation.create({
    sellerId,
    name: data.name,
    code: data.code,
    kind: data.kind || "warehouse",
    address: data.address || {},
    isDefault,
    isActive: data.isActive === undefined ? true : data.isActive === true,
    sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : total,
  });

  // First location: the seller's existing stock now has somewhere to live.
  // Each product is materialised on its own, so this is atomic per product and
  // cannot leave a product half-annotated.
  if (isFirst) {
    await Product.updateMany(
      // `stock.locations.0` matches a missing field as well as an empty array,
      // so products written before stage 38 are picked up too.
      { sellerId, "stock.locations.0": { $exists: false } },
      [
        {
          $set: {
            "stock.locations": [
              {
                locationId: loc._id,
                onHand: { $ifNull: ["$stock.onHand", 0] },
                reserved: { $ifNull: ["$stock.reserved", 0] },
              },
            ],
          },
        },
      ],
    );
  } else if (isDefault) {
    // A later location made the default outranks whatever the products are
    // draining from today, so the stored order has to follow it.
    await reorderLevels(sellerId);
  }

  return loc;
}

async function updateLocation(sellerId, locationId, data) {
  const loc = await InventoryLocation.findOne({ _id: locationId, sellerId });
  if (!loc) return null;

  if (data.name !== undefined) loc.name = data.name;
  if (data.kind !== undefined) loc.kind = data.kind;
  if (data.address !== undefined) loc.address = data.address;
  if (data.isActive !== undefined) loc.isActive = data.isActive === true;
  if (data.sortOrder !== undefined) loc.sortOrder = Number(data.sortOrder);
  if (data.code !== undefined) loc.code = data.code;

  if (data.isDefault === true && !loc.isDefault) {
    await InventoryLocation.updateMany({ sellerId }, { $set: { isDefault: false } });
    loc.isDefault = true;
  } else if (data.isDefault === false && loc.isDefault) {
    // A seller with no default falls back to sortOrder in
    // resolveDefaultLocationId, which is stable, so this is allowed.
    loc.isDefault = false;
  }

  await loc.save();
  // Default, sortOrder and name all decide which location a sale is drawn
  // from first, and that ranking lives in every product's stored breakdown as
  // well as in this collection. Rewriting one without the other would let the
  // seller name a source and watch stock leave a different one.
  await reorderLevels(sellerId);
  return loc;
}

/**
 * Remove a location. Any stock recorded only there is folded back onto the
 * remaining default so that no unit disappears from the aggregate's breakdown.
 * Returns null when the location is not this seller's.
 */
async function deleteLocation(sellerId, locationId) {
  const loc = await InventoryLocation.findOne({ _id: locationId, sellerId });
  if (!loc) return null;

  const remaining = await InventoryLocation.findOne({
    sellerId,
    _id: { $ne: locationId },
  })
    .sort(LOCATION_ORDER)
    .select("_id")
    .lean();

  if (remaining) {
    // Fold the departing location's units onto a survivor. One updateMany
    // pipeline over one document at a time: the sum across locations is
    // unchanged, so the aggregate never needs touching.
    await Product.updateMany(
      { sellerId, "stock.locations.locationId": loc._id },
      [
        {
          $set: {
            "stock.locations": {
              $let: {
                vars: {
                  all: { $ifNull: ["$stock.locations", []] },
                  target: {
                    $arrayElemAt: [
                      {
                        $filter: {
                          input: { $ifNull: ["$stock.locations", []] },
                          cond: { $eq: ["$$this.locationId", loc._id] },
                        },
                      },
                      0,
                    ],
                  },
                  others: {
                    $filter: {
                      input: { $ifNull: ["$stock.locations", []] },
                      cond: { $ne: ["$$this.locationId", loc._id] },
                    },
                  },
                },
                in: {
                  $cond: [
                    { $gt: [{ $size: "$$others" }, 0] },
                    {
                      $let: {
                        vars: { survivor: { $arrayElemAt: ["$$others", 0] } },
                        in: {
                          $concatArrays: [
                            [
                              {
                                $mergeObjects: [
                                  "$$survivor",
                                  {
                                    onHand: {
                                      $add: [
                                        { $ifNull: ["$$survivor.onHand", 0] },
                                        { $ifNull: ["$$target.onHand", 0] },
                                      ],
                                    },
                                    reserved: {
                                      $add: [
                                        { $ifNull: ["$$survivor.reserved", 0] },
                                        { $ifNull: ["$$target.reserved", 0] },
                                      ],
                                    },
                                  },
                                ],
                              },
                            ],
                            { $slice: ["$$others", 1, { $size: "$$others" }] },
                          ],
                        },
                      },
                    },
                    // The deleted location was the only tracked one: re-key it
                    // to the survivor instead of dropping the units.
                    [
                      {
                        locationId: remaining._id,
                        onHand: { $ifNull: ["$$target.onHand", 0] },
                        reserved: { $ifNull: ["$$target.reserved", 0] },
                      },
                    ],
                  ],
                },
              },
            },
          },
        },
      ],
    );
  } else {
    // Last location: stop tracking. The aggregate still holds every unit, so
    // nothing is lost — only the breakdown goes away, matching a seller who
    // never set locations up.
    await Product.updateMany({ sellerId }, { $set: { "stock.locations": [] } });
  }

  await loc.deleteOne();
  if (remaining) {
    if (loc.isDefault) {
      await InventoryLocation.updateOne({ _id: remaining._id }, { $set: { isDefault: true } });
    }
    await reorderLevels(sellerId);
  }
  return loc;
}

// ── Human-initiated stock changes ───────────────────────────────────────────

/**
 * Apply `delta` to the free balance, at `locationId` when this seller tracks
 * locations and against the bare aggregate when they do not.
 *
 * The tracked path recomputes the aggregate from the levels instead of adding
 * the delta to it: a level and its total are then changed by the SAME write,
 * so a level that clamps at zero cannot leave the total claiming a unit that
 * is nowhere. The guard sits on the level for negative deltas — the aggregate
 * being big enough says nothing about the location the seller picked.
 *
 * @returns the updated product, or null when a guard refused.
 */
async function adjustStock(sellerId, productId, delta, locationId = null) {
  const oid = locationId ? toOid(locationId) : null;

  if (!oid) {
    // No locations: byte-for-byte the pre-stage-38 update, and
    // `stock.locations` stays empty so the invariant holds vacuously.
    return Product.findOneAndUpdate(
      {
        _id: productId,
        sellerId,
        stockPolicy: "tracked",
        "stock.onHand": { $gte: delta < 0 ? -delta : 0 },
      },
      [
        {
          $set: {
            "stock.onHand": { $max: [{ $add: [{ $ifNull: ["$stock.onHand", 0] }, delta] }, 0] },
          },
        },
      ],
      { new: true, runValidators: true },
    );
  }

  const owned = await InventoryLocation.exists({ _id: oid, sellerId });
  if (!owned) return undefined;

  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      sellerId,
      stockPolicy: "tracked",
      "stock.onHand": { $gte: delta < 0 ? -delta : 0 },
      ...(delta < 0
        ? {
            $or: [
              { "stock.locations": { $elemMatch: { locationId: oid, onHand: { $gte: -delta } } } },
              // `stock.locations.0` matches a missing field as well as an empty
              // array, which is how a product written before stage 38 is stored.
              { "stock.locations.0": { $exists: false } },
            ],
          }
        : {}),
    },
    [
      materializeStage(oid),
      {
        $set: {
          "stock.locations": {
            $let: {
              vars: {
                all: { $ifNull: ["$stock.locations", []] },
                has: { $in: [oid, { $map: { input: { $ifNull: ["$stock.locations", []] }, in: "$$this.locationId" } }] },
              },
              in: {
                $concatArrays: [
                  {
                    $map: {
                      input: "$$all",
                      as: "l",
                      in: {
                        $cond: [
                          { $eq: ["$$l.locationId", oid] },
                          {
                            $mergeObjects: [
                              "$$l",
                              { onHand: { $add: [{ $ifNull: ["$$l.onHand", 0] }, delta] } },
                            ],
                          },
                          "$$l",
                        ],
                      },
                    },
                  },
                  // Only reachable when the product already tracked other
                  // locations: a brand-new level owns no committed units.
                  { $cond: ["$$has", [], [{ locationId: oid, onHand: { $max: [delta, 0] }, reserved: 0 }]] },
                ],
              },
            },
          },
        },
      },
      {
        $set: {
          "stock.onHand": { $sum: { $map: { input: "$stock.locations", in: "$$this.onHand" } } },
          "stock.reserved": { $sum: { $map: { input: "$stock.locations", in: "$$this.reserved" } } },
        },
      },
    ],
    { new: true, runValidators: true },
  );

  if (updated) return updated;

  const exists = await Product.exists({ _id: productId, sellerId });
  return exists ? null : undefined;
}

/**
 * Move `qty` free units from one location to another.
 *
 * A pure level-to-level move: `stock.onHand` and `stock.reserved` do not
 * change, so no guard on the aggregate is involved and nothing outside the
 * two levels is touched. Committed units cannot be transferred — the parcels
 * they are promised to are physically wherever they were picked.
 *
 * @returns `{ product }` on success, or `{ error }`.
 */
async function transferStock(sellerId, productId, fromId, toId, qty) {
  const from = toOid(fromId);
  const to = toOid(toId);
  if (!from || !to || from.equals(to)) return { error: "VALIDATION" };

  // A foreign location must be indistinguishable from a missing one: neither
  // may become a silo the seller can pour stock into.
  const [ownedFrom, ownedTo] = await Promise.all([
    InventoryLocation.exists({ _id: from, sellerId }),
    InventoryLocation.exists({ _id: to, sellerId }),
  ]);
  if (!ownedFrom || !ownedTo) return { error: "LOCATION_NOT_FOUND" };

  const updated = await Product.findOneAndUpdate(
    {
      _id: productId,
      sellerId,
      stockPolicy: "tracked",
      "stock.locations": { $elemMatch: { locationId: from, onHand: { $gte: qty } } },
    },
    [
      {
        $set: {
          "stock.locations": {
            $let: {
              vars: {
                all: { $ifNull: ["$stock.locations", []] },
                hasTo: { $in: [to, { $map: { input: { $ifNull: ["$stock.locations", []] }, in: "$$this.locationId" } }] },
              },
              in: {
                $concatArrays: [
                  {
                    $map: {
                      input: "$$all",
                      as: "l",
                      in: {
                        $cond: [
                          { $eq: ["$$l.locationId", from] },
                          { $mergeObjects: ["$$l", { onHand: { $subtract: [{ $ifNull: ["$$l.onHand", 0] }, qty] } }] },
                          {
                            $cond: [
                              { $eq: ["$$l.locationId", to] },
                              { $mergeObjects: ["$$l", { onHand: { $add: [{ $ifNull: ["$$l.onHand", 0] }, qty] } }] },
                              "$$l",
                            ],
                          },
                        ],
                      },
                    },
                  },
                  { $cond: ["$$hasTo", [], [{ locationId: to, onHand: qty, reserved: 0 }]] },
                ],
              },
            },
          },
        },
      },
    ],
    { new: true },
  );

  if (updated) return { product: updated };

  const exists = await Product.exists({ _id: productId, sellerId });
  return { error: exists ? "INSUFFICIENT_STOCK" : "NOT_FOUND" };
}

/**
 * Set the PHYSICAL count at one location: what the seller just counted on the
 * shelf, free units and committed ones together.
 *
 * The free balance becomes `max(0, counted - reserved)` there, and the
 * aggregate is recomputed from the levels rather than nudged by a delta. An
 * absolute write is idempotent, so replaying the same count cannot drift the
 * numbers — which a `+= 3` correction could do the moment a second tab applied
 * it too. The `before` snapshot is read separately and is therefore
 * informational; the numbers themselves are decided entirely by the database.
 *
 * @returns `{ product, before }` on success, or `{ error }`.
 */
async function reconcileLevel(sellerId, productId, locationId, counted) {
  const oid = toOid(locationId);
  if (!oid) return { error: "VALIDATION" };

  const existing = await Product.findOne({ _id: productId, sellerId }).select("stockPolicy stock").lean();
  if (!existing) return { error: "NOT_FOUND" };
  if (existing.stockPolicy !== "tracked") return { error: "NOT_TRACKED" };

  const owned = await InventoryLocation.exists({ _id: oid, sellerId });
  if (!owned) return { error: "LOCATION_NOT_FOUND" };

  const updated = await Product.findOneAndUpdate(
    { _id: productId, sellerId, stockPolicy: "tracked" },
    [
      materializeStage(oid),
      {
        $set: {
          "stock.locations": {
            $let: {
              vars: {
                all: { $ifNull: ["$stock.locations", []] },
                has: { $in: [oid, { $map: { input: { $ifNull: ["$stock.locations", []] }, in: "$$this.locationId" } }] },
              },
              in: {
                $concatArrays: [
                  {
                    $map: {
                      input: "$$all",
                      as: "l",
                      in: {
                        $cond: [
                          { $eq: ["$$l.locationId", oid] },
                          {
                            $mergeObjects: [
                              "$$l",
                              {
                                onHand: {
                                  $max: [{ $subtract: [counted, { $ifNull: ["$$l.reserved", 0] }] }, 0],
                                },
                              },
                            ],
                          },
                          "$$l",
                        ],
                      },
                    },
                  },
                  { $cond: ["$$has", [], [{ locationId: oid, onHand: counted, reserved: 0 }]] },
                ],
              },
            },
          },
        },
      },
      {
        $set: {
          "stock.onHand": { $sum: { $map: { input: "$stock.locations", in: "$$this.onHand" } } },
          "stock.reserved": { $sum: { $map: { input: "$stock.locations", in: "$$this.reserved" } } },
        },
      },
    ],
    { new: true },
  );

  if (!updated) return { error: "NOT_FOUND" };
  return { product: updated, before: existing.stock };
}

module.exports = {
  MAX_LOCATIONS,
  LOCATION_ORDER,
  materializeStage,
  reserveExpr,
  restoreExpr,
  releaseExpr,
  creditFirstExpr,
  reserveStock,
  releaseReserved,
  restoreStock,
  returnToStock,
  resolveDefaultLocationId,
  reorderLevels,
  listLocations,
  countLocations,
  createLocation,
  updateLocation,
  deleteLocation,
  adjustStock,
  transferStock,
  reconcileLevel,
  toOid,
};
