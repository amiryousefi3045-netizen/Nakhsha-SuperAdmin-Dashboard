/**
 * AtomicCounter — race-safe monotonic sequence per key.
 *
 * Used to mint order/payout numbers without duplicate collisions under
 * concurrency. `findOneAndUpdate` with `$inc` + upsert is atomic, so two
 * parallel requests can never observe the same sequence value.
 */
const mongoose = require("mongoose");

const AtomicCounterSchema = new mongoose.Schema({
  // Namespaced key, e.g. "order:<sellerId>".
  _id: { type: String, required: true },
  seq: { type: Number, default: 0, min: 0 },
});

const AtomicCounter = mongoose.model("AtomicCounter", AtomicCounterSchema);

/**
 * Atomically increments the counter for `key` and returns the new value.
 * @param {string} key
 * @returns {Promise<number>}
 */
async function nextSequence(key) {
  const doc = await AtomicCounter.findOneAndUpdate(
    { _id: key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  );
  return doc.seq;
}

module.exports = AtomicCounter;
module.exports.nextSequence = nextSequence;