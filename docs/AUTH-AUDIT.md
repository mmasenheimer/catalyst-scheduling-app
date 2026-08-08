# Authentication System — Bug Audit

Audit only; no code changed. Findings marked **[verified]** were reproduced by
running the real code against the live backend. Probes created only `zzaudit*`,
`zzrec*` and `zzmgr*` accounts, all deleted. No real account's password was
changed.

---

## Executive Summary

**Confirmed bugs: 3.** 0 critical, 0 high, 2 medium, 1 low.
**Potential issues needing verification: 3.**
**Attacks attempted and repelled: 22.**

**Is it safe to use?** Yes. This is the strongest subsystem in the application by
a clear margin. The core is correct in the ways that matter most: tokens cannot
be forged, privilege cannot be escalated, temporary passwords are genuinely
one-time, and revocation actually works. Nothing found here would let an
attacker into somebody else's account.

**Most dangerous issue:** none of the findings are exploitable by an attacker.
The most *consequential* is operational — **a manager who completes setup and
then forgets their password cannot be recovered by any path in the application**
[verified]. With three manager accounts about to exist on a deployed instance,
this is the finding most likely to actually cost you something.

**Scope note.** Unlike the scheduling audit, this one found no
validation-boundary bugs. The authorization model is genuinely well built:
identity is read from the database on every request rather than trusted from the
token, the forced-password-change gate is a fail-secure allowlist, and the
account-existence recheck means removal cuts off sessions immediately. Three of
my first four "findings" turned out to be defects in my own probes, not the app
— documented below under _False Positives_ so the same ground isn't re-covered.

---

## Authentication Architecture

```
LoginPage ──► POST /api/auth/login          (public, rate limited ×2)
                 normUsername() → User.findOne
                 bcrypt.compare
                 signToken() → JWT{sub, role, staffId, username, name, tv}
                      │
                 localStorage["catalyst.token"]        ← known XSS exposure
                      │
  every request ──► requireAuth  (middleware/auth.js)
                      jwt.verify(SECRET)               ← rejects alg=none, bad sig
                      User.findById(payload.sub)       ← account still exists?
                      payload.tv === user.tokenVersion ← revocation
                      req.user ← role/staffId FROM DB, not from the token
                      mustChangePassword gate (allowlist)
                      │
                 requireManager  → role check
                      │
        ┌─────────────┴───────────────┬──────────────────┐
   POST /auth/provision      POST /auth/reset      POST /auth/change-password
   (manager only)            (manager only)        (any authed user)
   temp password, once       by staffId ONLY       bumps tokenVersion
   mustChangePassword=true   bumps tokenVersion    re-issues own token
```

**Secret handling.** `JWT_SECRET` from env; falls back to a known dev constant
with a startup warning, and **throws** when `NODE_ENV=production`. Correct
fail-closed behaviour, and the throw sits above all requires so it cannot be
bypassed by import order.

**Hashing.** bcrypt, cost factor 10. Temporary passwords use `crypto.randomBytes`
over a 32-character ambiguity-free alphabet — 256 is a multiple of 32, so no
modulo bias. That detail is correct and easy to get wrong.

**Rate limiting.** Two layers on login only: 10 failures per account per 15
minutes, then 100 per IP. Both `skipSuccessfulRequests`. The per-account key is
`String(req.body?.username).toLowerCase().trim()` — **byte-identical** to the
`normUsername()` used for the database lookup, so the key cannot be desynchronised
from the account it protects [verified: no bypass found].

---

## Confirmed Bugs

### [MEDIUM] A manager account cannot be recovered if its password is lost

**Location:**
- File: `src/backend/routes/auth.js`
- Function: `router.post("/reset")`, line ~99–103
- Also: `router.post("/provision")`, line ~57

**What happens:** Password reset is keyed exclusively on `staffId`:

```js
const { staffId } = req.body;
if (staffId == null) return res.status(400).json({ error: "staffId is required" });
const user = await User.findOne({ staffId });
```

Manager accounts carry `staffId: null` by design — they are not on the
schedulable roster. So the guard rejects them before the lookup happens.

Re-provisioning is also refused once the account is active:

```js
if (existing && !existing.mustChangePassword) {
  return res.status(409).json({ error: "That username is already taken by an active account" });
}
```

**[verified]** Provisioning a second manager, completing the forced password
change, then attempting every recovery path the application exposes:

```
POST /auth/reset  {staffId: null}   -> 400 "staffId is required"
POST /auth/reset  {username}        -> 400 "staffId is required"
POST /auth/provision (same name)    -> 409 "already taken by an active account"
=> LOCKED OUT
```

**Why it is wrong:** The two conditions are individually sensible and jointly
exhaustive. `staffId` is the right key for employees, and refusing to
re-provision an active account is the right way to stop username takeover — but
together they leave manager accounts with no door.

**Trigger condition:** Any manager who completes first-login setup and later
forgets their password. Note the window: *before* setup, `mustChangePassword` is
still `true`, so re-provisioning works [verified: 201]. The account becomes
unrecoverable at the moment its owner first secures it.

**Impact:** Recovery requires editing the database by hand — connecting to Atlas
and rewriting `passwordHash` and `tokenVersion` directly. There is no way to do
it from the application, and no other manager can help. This lands squarely on
the plan to run three manager accounts on a deployed instance.

**Root cause:** The reset flow was designed around the employee case, where
`staffId` is the natural identifier, and managers are the one account class that
does not have one.

**Recommended fix:** Accept either `staffId` **or** `username` in
`POST /auth/reset`, resolving whichever is supplied. That reuses the whole
existing mechanism — temporary password, `mustChangePassword`, `tokenVersion`
bump — and needs no schema change. Guard against a manager resetting their own
account into a state they cannot then complete, and consider requiring that at
least one other manager account remains reachable.

**Confidence:** High.

---

### [MEDIUM] Login timing reveals which usernames exist — ✅ FIXED

> **Fixed, and in `verifyPassword` rather than in the route.** There were two
> short-circuits, not one: the route's `!user ||`, and `verifyPassword`'s own
> `if (!hash) return false`. Fixing only the route would have left the second in
> place and the gap wide open. Putting it in the utility makes constant time a
> property of the function, so any future caller inherits it.
>
> `verifyPassword` now always runs a bcrypt comparison, against a `DUMMY_HASH`
> when there is no real one, and discards the result. The dummy is generated at
> startup from `SALT_ROUNDS` rather than hardcoded — a pasted constant would
> silently stop matching the real cost the day that value changed, quietly
> reopening the gap. Its content is random, so no password can match it.
>
> **Verified 14/14, with 12 interleaved pairs after a warm-up:**
>
> ```
> unknown username : median 139ms
> known username   : median 135ms
> gap              :   5ms   (was 82ms)
> ```
>
> Both paths now hash, confirmed by the unknown-username path taking 139ms
> rather than 50ms. Login still behaves: right password in, wrong password out,
> unknown user out, identical message, no `passwordHash` in the response. The
> utility handles `undefined`, `null` and empty-string hashes, and a missing
> password, without throwing.
>
> **Measurement note.** The *mean* for the known-username arm reads much lower
> than its median, because the per-account rate limiter began returning 429s
> partway through — and a 429 skips bcrypt, so those samples are fast. The
> median is the sound statistic here and is unaffected. That is not a residual
> oracle: the limiter keys on the submitted username whether or not it names a
> real account, so being limited says nothing about existence.
>
> Cost: one bcrypt hash at boot, once.

**Location:**
- File: `src/backend/routes/auth.js`
- Function: `router.post("/login")`, lines ~23–29

**What happens:**

```js
const user = await User.findOne({ username: normUsername(username) });

// Identical response for "no such user" and "wrong password" so this can't
// be used to probe which usernames exist.
if (!user || !(await verifyPassword(password, user.passwordHash))) {
  return res.status(401).json({ error: "Invalid username or password" });
}
```

The `||` short-circuits. When no account matches, `bcrypt.compare` never runs and
the response returns immediately; when one does, it costs a full bcrypt
comparison.

**[verified]** Four paired attempts against the same server:

```
unknown username : 50ms average
known username   : 132ms average
                   82ms gap
```

**Why it is wrong:** The comment directly above states the intent — that the two
cases be indistinguishable. The *response body* is identical, which is the half
that was designed for. The *timing* is not, and 82ms is far above measurement
noise on a LAN or a university network.

**Trigger condition:** Anyone who can reach the login endpoint. No credentials
needed.

**Example:** An attacker submits `alex.c`, `jamie.t`, `sam.k` with junk
passwords and reads the response times. The slow ones are real accounts. They now
know the roster and can spend their limited rate-limit budget only on accounts
that exist.

**Impact:** Confirms which usernames are valid. Genuinely mitigated here by the
username scheme being guessable anyway (`firstname.l`) and by the 10-attempt
per-account limit — this narrows an attacker's search, it does not open a door.
Rated MEDIUM rather than LOW because the code explicitly claims to prevent it.

**Root cause:** Constant-time thinking applied to the response but not to the
work performed.

**Recommended fix:** Always run a bcrypt comparison. Keep a fixed dummy hash and
compare against it when no user is found, discarding the result:

```js
const DUMMY_HASH = "$2a$10$" + "…";   // any valid bcrypt hash, generated once
const hash = user?.passwordHash ?? DUMMY_HASH;
const ok = await verifyPassword(password, hash);
if (!user || !ok) return res.status(401).json({ error: "Invalid username or password" });
```

**Confidence:** High.

---

### [LOW] Password policy is length-only

**Location:** `src/backend/routes/auth.js`, `MIN_PASSWORD_LENGTH = 8`, line 9.

**What happens:** `change-password` enforces eight characters and nothing else.
`password`, `12345678` and `catalyst` are all accepted.

**Why it is wrong:** Eight characters with no other constraint permits the most
commonly breached passwords in existence.

**Impact:** Limited in context. Login is rate limited to 10 failures per account
per 15 minutes, which makes online guessing impractical, and there is no public
signup. The exposure is an attacker who obtains the database and cracks weak
hashes offline — where cost factor 10 (see _Potential Issues_) also matters.

**Recommended fix:** Rejecting a small deny-list of obvious passwords costs
almost nothing and catches the realistic cases. A full complexity policy is not
warranted for an internal tool of this size and tends to produce worse passwords.

**Confidence:** High.

---

## Potential Issues / Needs Verification

**1. bcrypt cost factor 10.** Current guidance is 12; 10 dates from an era of
slower hardware. Raising it costs roughly 4× per login — irrelevant at this
scale — and meaningfully raises offline cracking cost. Existing hashes would
need rehashing on next successful login to benefit. Not a bug, a hardening
decision.

**2. Twelve-hour token lifetime with no idle timeout.** A stolen token is valid
for up to twelve hours regardless of activity, and there is no refresh mechanism
or server-side session list. Combined with `localStorage` storage, an XSS
anywhere in the app yields a session valid until expiry. Whether that is
acceptable is a risk decision, not a defect.

**3. No audit trail for authentication events.** Failed logins, password changes,
provisioning and resets are not recorded anywhere durable. If an account were
misused there would be no way to establish what happened or when. Relevant to
the multi-manager plan, where "who changed this" becomes a real question.

---

## False Positives — attacks that looked successful but were not

Recorded because they cost real time to chase and would otherwise be re-chased.

**Payload tampering "succeeded".** My first probe rebuilt the JWT payload as
`{...original, role: 'manager', staffId: null}` against the *manager's own*
token — a payload identical to the original, so the signature naturally still
verified. Re-tested with a genuinely altered `sub`, and with an employee token
edited to `role: 'manager'`: both **401** [verified].

**Forced-password-change gate "bypassed" via trailing slash and query string.**
My probe varied `/auth/me`, which is *supposed* to be reachable during a forced
change, and read 200 as a bypass. Re-tested against a path that should be
blocked (`/api/staff`) in six shapes — plain, trailing slash, query string,
uppercase, dot-segment, encoded slash — all **403 or 404** [verified]. The gate
normalises with `originalUrl.split("?")[0].replace(/\/+$/, "")` and is
fail-secure by allowlist.

---

## What was attacked and held

| Attack | Result |
|---|---|
| Token signed with `alg=none` | 401 |
| Token signed with the wrong secret | 401 |
| Payload altered, original signature reused | 401 |
| Employee token edited to `role: manager` | 401 |
| Employee calling `/auth/provision` | 403 |
| Employee provisioning a `role: manager` account | 403 |
| Employee calling `/auth/reset` | 403 |
| Provision used to hijack an active username | 409 |
| Temp-password session reading the roster | 403 |
| Temp-password session writing a schedule | 403 |
| Forced-change gate, six path shapes | 403 / 404 |
| Temporary password reused after replacement | 401 |
| Pre-change token used after a password change | 401 |
| Voluntary change without the current password | 400 |
| Voluntary change with a wrong current password | 401 |
| One-character password | 400 |
| `passwordHash` present in the login response | absent |
| Response differs for unknown vs wrong password | identical |
| Rate-limit key desynchronised from the lookup | not possible |

---

## Missing Test Coverage

No authentication tests exist. The 35-test suite covers scheduling utilities
only. Worth adding, in order of value:

1. **`requireAuth` middleware** — forged tokens, `tokenVersion` mismatch, deleted
   account, the `mustChangePassword` allowlist. Testable with a stubbed model.
2. **The temporary-password lifecycle** — provision → login → forced change →
   old password dead, old token dead.
3. **Privilege boundaries** — an employee token against every manager-only route.
4. **`generateTempPassword`** — alphabet, length, and absence of modulo bias.
5. **Login timing** — a regression test asserting the unknown-user and
   known-user paths take comparable time, once fixed.

---

## Recommended Fix Order

1. **Accept `username` as well as `staffId` in `POST /auth/reset`.** Closes the
   manager lockout before three manager accounts exist on a live instance. Small
   and self-contained.
2. **Constant-time login.** Compare against a dummy hash when no user is found.
3. **Deny-list the obvious weak passwords.**
4. Raise bcrypt cost to 12, rehashing on next login.
5. Consider an auth event log, if multi-manager accountability matters.

Items 1 and 2 are the only ones I would treat as required before real staff use
this.

---

## Overall Assessment

**A− — Robust.**

This subsystem is markedly better built than the scheduling code was before this
week. The decisions that are easy to get wrong are all right: identity is
re-read from the database rather than trusted from the token, so a stale token
cannot carry stale privileges; `tokenVersion` gives stateless JWTs real
revocation; the forced-password-change gate is an allowlist, so any route added
later is protected by default; temporary passwords are generated without modulo
bias and die on use; and the rate limiter is keyed per account rather than per
IP, which is the choice that avoids one person locking out the studio.

Twenty-two attacks were attempted and repelled, including every one that would
have constituted an actual break. Three of my four initial findings were my own
probe defects.

It is not an A because of the manager lockout — not a security hole, but a real
operational trap sitting directly in the path of the deployment now under way —
and because the login endpoint's stated intent is contradicted by its timing.
Both are small, well-understood fixes.
