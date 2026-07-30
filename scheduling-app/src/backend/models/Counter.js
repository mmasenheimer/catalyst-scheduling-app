"use strict";
const { Schema, model } = require("mongoose");

// One row per model that uses numeric ids ("Staff", "Event"), holding the
// highest id ever handed out for it.
//
// Why this exists: ids used to be computed as max(_id) + 1, which silently
// *reuses* an id as soon as the highest-numbered document is deleted. Because
// availability, requests and notifications all key off the numeric staffId,
// a new hire could be given a departed employee's id and inherit their data.
// A counter only ever moves forward, so an id is never handed out twice.
const counterSchema = new Schema({
  _id: { type: String }, // model name
  seq: { type: Number, required: true, default: 0 },
});

module.exports = model("Counter", counterSchema);
