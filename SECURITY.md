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
- **Rate-limit bypass**: Per-isolate sliding window, keyed off a hashed derivative of the full API key (not just a prefix)
- **Bulk wipe via leaked key**: `clear_memories` is default-disabled. Requires explicit `ALLOW_DESTRUCTIVE_TOOLS=true` secret to enable
- **Payload DoS**: Hard 1 MB body limit enforced via streaming reader, not Content-Length alone
- **FTS5 injection**: Special characters stripped from query before reaching SQLite
- **Duplicate-key overwrites**: Dedup guard refuses to store new memories with > 0.92 cosine similarity to existing entries under different keys
- **Session fixation**: No server-side sessions. Every request is independently authenticated

### What Recall does NOT protect against

- **Leaked API keys**: A leaked key grants full read + mutate access (minus `clear_memories` by default). Treat the key as a password and rotate immediately if it leaks
- **Malicious teammates**: Team usage shares a single API key. All team members can read, update, and delete each other's memories. The `author` field is a **convention**, not access control. See [`TEAM_USAGE.md`](./TEAM_USAGE.md#privacy-read-this-before-you-use-it-for-secrets)
- **Cloudflare account compromise**: Recall runs on your CF account. If your CF account is compromised, the attacker has full access to your D1 database and Vectorize index regardless of what Recall does
- **Browser-based attacks**: No CORS headers are set. MCP clients are not browsers, so this is intentional — but don't try to front Recall with a web UI without adding proper CORS + CSRF protection
- **Embedding inversion attacks**: Vector embeddings can, in theory, be partially reversed. Do not store content you wouldn't share with an attacker who gains Cloudflare account access
- **Prompt injection via stored memories**: If a malicious actor can store memories, they can attempt to influence the behavior of downstream LLMs that retrieve them. Only give the API key to trusted clients

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
