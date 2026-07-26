"use strict";

// Shared error responder for write handlers.
//
// Mongoose surfaces bad client input as ValidationError (enum/required/min) or
// CastError (wrong type). Those are the caller's fault, so they get 400 with the
// specific reason — without this they'd be reported as 500, which reads as a
// server fault and tells the client nothing actionable. Anything else is a real
// server error: logged here, generic message out.
function sendWriteError(res, err, fallback = "Request failed") {
  if (err?.name === "ValidationError" || err?.name === "CastError") {
    return res.status(400).json({ error: err.message });
  }
  console.error(`${fallback}:`, err?.message ?? err);
  return res.status(500).json({ error: err?.message ?? fallback });
}

module.exports = { sendWriteError };
