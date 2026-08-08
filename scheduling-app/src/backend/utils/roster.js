"use strict";
const Staff = require("../models/Staff");

/**
 * Which of these ids name nobody on the roster.
 *
 * Removing a staff member already cascades — their id is pulled from every
 * event and their unresolved requests are deleted — so a stray id arriving in a
 * request body means a malformed payload rather than ordinary drift. It is
 * worth catching because an id that names nobody does not fail loudly; it sits
 * there behaving like a real person who never does anything.
 *
 * Deliberately a lookup rather than a validator in `utils/validate.js`: those
 * are pure functions over a payload, and this needs the database. Callers should
 * only use it where a write is infrequent — it costs a query, which is why
 * schedule saves (sent on every debounced autosave, carrying the whole roster)
 * do not do this.
 *
 * Returns a de-duplicated array, empty when everything checks out.
 */
async function unknownStaffIds(ids) {
  const list = (Array.isArray(ids) ? ids : [ids]).filter(id => id != null);
  if (list.length === 0) return [];

  const found = await Staff.find({ _id: { $in: list } }, "_id").lean();
  const known = new Set(found.map(s => s._id));
  return [...new Set(list.filter(id => !known.has(id)))];
}

module.exports = { unknownStaffIds };
