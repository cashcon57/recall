# Security

## Reporting a vulnerability

If you discover a security issue in Recall, please report it privately:

1. **Preferred**: Open a [private security advisory](https://github.com/cashcon57/recall/security/advisories/new) on this repo.
2. **Alternative**: Email the maintainer (see GitHub profile) with the subject line `[recall] security`.

Do **not** open a public issue for security vulnerabilities. Public issues are fine for non-security bugs and feature requests.

### What to include

- A clear description of the vulnerability
- Steps to reproduce (or a minimal proof-of-concept)
- The impact (what an attacker could do)
- Your suggested fix, if you have one

### What to expect

- Acknowledgment within 72 hours
- An initial assessment within 7 days
- Patch released within 14 days for confirmed vulnerabilities (critical issues faster)
- Credit in the release notes, if you'd like

## Threat model

Recall is designed to run as a private, authenticated endpoint. It is **not** a multi-tenant SaaS. Understanding what it protects against — and what it doesn't — is important before you deploy.

### What Recall protects against

- **Unauthorized access**: Bearer token authentication on every request, constant-time HMAC-SHA256 comparison to prevent timing side channels
- **Rate-limit abuse (per-isolate soft cap)**: In-memory sliding window at 60 requests per minute, keyed off a SHA-256 hash of the full API key. See the "Rate limiter is per-isolate" note below for the important caveat about this being a soft control, not a hard cost guardrail
- **Bulk wipe via leaked key**: `clear_memories` is default-disabled. Requires explicit `ALLOW_DESTRUCTIVE_TOOLS=true` secret to enable
- **Payload DoS**: Hard 1 MB body limit enforced via streaming reader, not Content-Length alone
- **FTS5 injection**: Special characters stripped from query before reaching SQLite; failures are logged and degrade gracefully to vector-only search
- **Duplicate-key overwrites**: Dedup guard refuses to store new memories with > 0.92 cosine similarity to existing entries under different keys
- **Session fixation**: No server-side sessions. Every request is independently authenticated

### Rate limiter is per-isolate (soft control, not a cost cap)

The rate limiter is an in-memory `Map` in module scope. Cloudflare Workers routes incoming requests to multiple isolates in parallel; each isolate has its own independent bucket. In practice, the effective rate limit is closer to `60 × N requests per minute`, where N is the number of concurrent isolates serving your traffic.

**This is a soft anti-abuse control, not a hard cost guardrail.** It will stop a casual hammer from a single client connection, but it will NOT protect you from a determined attacker or a runaway agent from exhausting your Workers AI free tier (which costs real money after 10K neurons/day).

If you need a hard cap — because you're running Recall on a non-free Cloudflare plan, or because an attacker with your API key could cost you real money — use Cloudflare's [native rate limiting rules](https://developers.cloudflare.com/waf/rate-limiting-rules/) on the worker's route. Those run in Cloudflare's edge network before the request reaches your isolate, and they're globally consistent.

For most personal and small-team deployments the built-in soft limit is fine. For team deployments where the key is widely shared, consider adding a WAF rate-limit rule.

### `delete_memory` is NOT gated

Only `clear_memories` (bulk wipe) requires `ALLOW_DESTRUCTIVE_TOOLS=true`. Individual `delete_memory` calls are allowed with any valid API key. This was a deliberate choice — needing to delete a single bad memory is a common benign operation, and gating it would create UX friction every time a user says "delete that wrong memory" to their agent.

The tradeoff: a leaked API key + a determined attacker can iteratively delete every memory one at a time via `list_memories` → loop → `delete_memory`. At 60 req/min (per isolate) and ~1K memories per hour of effort, a small store can be wiped in minutes. The security posture assumes:

1. API keys are treated as passwords and rotated on leak
2. Anyone with the API key is a trusted operator (consistent with single-tenant-by-design)
3. Backups are your responsibility — see the "Back up your D1 database" hardening item below

If your threat model includes "API key leaked to someone who shouldn't have full data access," the right mitigation is **key rotation + backups**, not gating delete. But you should know the tradeoff exists.

### What Recall does NOT protect against

- **Leaked API keys**: A leaked key grants full read + mutate access (minus `clear_memories` by default, but individual `delete_memory` still works — see the note above). Treat the key as a password and rotate immediately if it leaks
- **Malicious teammates**: Team usage shares a single API key. All team members can read, update, and delete each other's memories. The `author` field is a **convention**, not access control. See [`TEAM_USAGE.md`](./TEAM_USAGE.md#privacy-read-this-before-you-use-it-for-secrets)
- **Cloudflare account compromise**: Recall runs on your CF account. If your CF account is compromised, the attacker has full access to your D1 database and Vectorize index regardless of what Recall does
- **Browser-based attacks**: No CORS headers are set. MCP clients are not browsers, so this is intentional — but don't try to front Recall with a web UI without adding proper CORS + CSRF protection
- **Embedding inversion attacks**: Vector embeddings can, in theory, be partially reversed. Do not store content you wouldn't share with an attacker who gains Cloudflare account access
- **Prompt injection via stored memories**: If a malicious actor can store memories, they can attempt to influence the behavior of downstream LLMs that retrieve them. Only give the API key to trusted clients
- **Dual-write consistency under partial failure**: `store_memory` writes to D1 first, then FTS5, then Vectorize. If Vectorize fails after D1 succeeds, the memory is saved but not semantically searchable until the next upsert of that key (it will still show up in keyword search via FTS5). The partial-success state is logged and surfaced in the tool return value, not silent. A future release will add a reconciliation pass to the weekly consolidation cron

## Hardening checklist

Recommended for production deployments:

### 1. Use a strong API key

```bash
# Generate 32 random bytes, hex-encoded (64 characters)
openssl rand -hex 32
```

Recall warns in logs if the key is under 32 characters.

### 2. Rotate keys periodically

```bash
# Generate new key, update secret, update all clients
NEW_KEY=$(openssl rand -hex 32)
echo "$NEW_KEY" | npx wrangler secret put MEMORY_API_KEY
```

Old key stops working immediately. Coordinate with clients.

### 3. Put the worker behind Cloudflare Access (for truly private deployments)

For the most sensitive deployments, add an additional auth layer on top of Recall's bearer token by enabling [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) on the worker's route. This requires a custom domain (free with any domain on Cloudflare) and gives you SSO, mTLS, or IP allowlisting.

### 4. Keep `clear_memories` disabled

Default-deny is the correct posture for production. Only enable `ALLOW_DESTRUCTIVE_TOOLS=true` during explicit maintenance windows, then unset it:

```bash
# Enable temporarily
echo "true" | npx wrangler secret put ALLOW_DESTRUCTIVE_TOOLS

# Disable when done
npx wrangler secret delete ALLOW_DESTRUCTIVE_TOOLS
```

### 5. Monitor with `wrangler tail`

```bash
npx wrangler tail
```

Stream live logs during suspicious activity. Recall intentionally does not persist access logs — use Cloudflare's built-in analytics + log push if you need durable audit trails.

### 6. Back up your D1 database

```bash
npx wrangler d1 export recall --output=recall-backup-$(date +%Y%m%d).sql
```

Store backups in a secure location. Recall does not provide automated backups — this is your responsibility.

### 7. Don't store secrets in memories

The `content` field of a memory is designed for knowledge and context, not credentials. Anyone with the API key (team member or attacker) can retrieve every memory. Credentials belong in a dedicated secret manager (1Password, Bitwarden, Vault, etc.).

### 8. Use per-environment instances

For dev/staging/prod splits, deploy separate Recall instances with distinct API keys. Don't share a single instance across environments — a leaked dev key shouldn't grant access to prod memories.

### 9. Audit your Cloudflare account

- Enable 2FA on your Cloudflare account
- Use a strong, unique password
- Review API tokens periodically — delete unused ones
- Turn on [Account Audit Logs](https://developers.cloudflare.com/fundamentals/setup/account/account-security/review-audit-logs/) and review for unexpected activity

## Known limitations

- **No built-in audit trail**: Recall does not persist who did what, when. Cloudflare's `wrangler tail` provides ephemeral logs; for durable audit, enable [Logpush](https://developers.cloudflare.com/logs/logpush/) to an R2 bucket or external SIEM
- **Single shared key**: There is no per-user credential, no read-only mode, no scoped tokens. This is a deliberate simplification. If you need these, you will have to fork
- **No encryption at rest for content**: D1 uses SQLite, which is stored encrypted at the Cloudflare storage layer but decrypted within the worker. Memory content is readable by anyone with account access or a valid API key
- **Embeddings leak information**: Cloudflare Vectorize receives full memory content (as strings) for embedding generation. If this is unacceptable, run embeddings locally and skip the Cloudflare AI path — requires forking the storage layer

## Dependency security

Recall has minimal runtime dependencies — only Cloudflare's built-in bindings. Dev dependencies (`wrangler`, `typescript`, `@cloudflare/workers-types`) are standard.

- [Dependabot](https://github.com/cashcon57/recall/network/updates) is enabled for dependency updates
- Any reported CVEs in dev deps should be addressed within 7 days
- Runtime CVEs are critical-priority by definition (there are almost none to monitor)

## Responsible disclosure

If you find a vulnerability and it's confirmed, you will be credited in the release notes (unless you prefer anonymity). I appreciate responsible disclosure and will work with you to resolve the issue quickly.
