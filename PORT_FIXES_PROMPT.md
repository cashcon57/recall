# Prompt — Port Recall's Security + Perf Fixes to an Existing MCP Memory Server

Copy this whole document and paste it into a Claude Code session running inside the repo of any MCP memory server you maintain. It will apply the same hardening Recall got: 6 security fixes and 4 performance optimizations.

This prompt assumes the target repo is structured like Recall (Cloudflare Workers, TypeScript, D1 + Vectorize + Workers AI, single `src/index.ts` handler, `src/tools.ts` with search pipeline, `src/types.ts` with `Env` interface). If it's not, the agent should adapt the changes to the repo's actual layout.

---

## The prompt — paste this verbatim

```
I maintain a Cloudflare Workers MCP memory server in this repo. A sibling
project called Recall (https://github.com/cashcon57/recall) recently received
security hardening and performance improvements that I want to port here.

Do all of the following changes, in order. After each logical group, run
`npx tsc --noEmit` (or the repo's typecheck command) and fix any errors
before moving on. Do not batch-commit — make one commit per change group with
a clear message, or one final commit if the repo prefers that.

First, find the files:
- The Worker fetch handler (likely src/index.ts)
- The MCP tool implementations (likely src/tools.ts)
- The Env interface (likely src/types.ts)

If any of those are in different locations, adapt the paths. If the repo has
tests, run them after each group.

=== SECURITY FIXES ===

1. Enforce a hard request body size limit.
   The current fetch handler probably calls `request.json()` directly on the
   POST path. Replace with a streaming reader that enforces a 1 MB cap and
   fails with HTTP 413 on oversize. Add these near the top of the Worker file:

   ```ts
   const MAX_REQUEST_BODY_BYTES = 1_000_000;

   async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string> {
     const reader = request.body?.getReader();
     if (!reader) return '';
     const chunks: Uint8Array[] = [];
     let total = 0;
     while (true) {
       const { value, done } = await reader.read();
       if (done) break;
       if (!value) continue;
       total += value.byteLength;
       if (total > maxBytes) {
         reader.cancel();
         throw new Error(`Request body too large (max ${maxBytes} bytes)`);
       }
       chunks.push(value);
     }
     const combined = new Uint8Array(total);
     let offset = 0;
     for (const chunk of chunks) {
       combined.set(chunk, offset);
       offset += chunk.byteLength;
     }
     return new TextDecoder().decode(combined);
   }
   ```

   In the POST handler, check `Content-Length` first (reject if over the
   limit), then call `readBodyWithLimit(request, MAX_REQUEST_BODY_BYTES)` to
   read the body, and `JSON.parse(bodyText)` to parse. Return HTTP 413 on
   the size-error path and HTTP 400 on JSON parse errors.

2. Hash the full API key for the rate limit bucket (not a prefix).
   If the current code rate-limits using something like `apiKey.slice(0, 8)`,
   replace it with a SHA-256 hash of the full key. Add this helper:

   ```ts
   async function rateLimitBucket(apiKey: string): Promise<string> {
     const data = new TextEncoder().encode(apiKey);
     const digest = await crypto.subtle.digest('SHA-256', data);
     const bytes = new Uint8Array(digest);
     let hex = '';
     for (let i = 0; i < 8; i++) hex += bytes[i].toString(16).padStart(2, '0');
     return hex;
   }
   ```

   Then use `await rateLimitBucket(apiKey)` as the key to the existing rate
   limiter instead of the prefix.

3. Warn on weak MEMORY_API_KEY, fail closed if missing.
   At the top of the fetch handler, before any auth logic, check:

   ```ts
   const MIN_API_KEY_LENGTH = 32;

   if (!env.MEMORY_API_KEY) {
     return Response.json(
       { error: 'Server misconfigured: MEMORY_API_KEY secret is not set.' },
       { status: 503 },
     );
   }
   if (env.MEMORY_API_KEY.length < MIN_API_KEY_LENGTH) {
     console.warn(
       `[memory-server] MEMORY_API_KEY is shorter than ${MIN_API_KEY_LENGTH} chars — consider rotating.`,
     );
   }
   ```

4. Drop version/service details from the /health response.
   Whatever the current /health endpoint returns, trim it to just `{ status: 'ok' }`.
   Unauthenticated endpoints should not leak version strings — attackers use
   them to target known-vulnerable versions.

5. Gate clear_memories behind an opt-in env var.
   In the `Env` interface, add an optional field:

   ```ts
   ALLOW_DESTRUCTIVE_TOOLS?: string;
   ```

   In the `clear_memories` tool implementation, add a default-deny guard at
   the very top of the function:

   ```ts
   if (env.ALLOW_DESTRUCTIVE_TOOLS !== 'true') {
     return textResult(
       'clear_memories is disabled. Set ALLOW_DESTRUCTIVE_TOOLS="true" via ' +
         '`wrangler secret put ALLOW_DESTRUCTIVE_TOOLS` to enable.',
       true,
     );
   }
   ```

   (Adjust the error-return helper to whatever the file uses — `textResult`,
   `errorResult`, whatever.)

6. If the repo has a setup script that generates an API key, make sure the
   key is NEVER echoed to stdout. Write it to a chmod 600 file in the repo
   directory instead, and print the file path. Terminal scrollback and
   screen-sharing tools leak stdout.

=== PERFORMANCE FIXES ===

7. Parallelize the storeMemory writes.
   In the tool that stores a memory, the D1 INSERT, the FTS5 batch, and the
   Vectorize upsert are probably sequential. They are independent — wrap
   all three in `Promise.all([...])` to cut latency roughly in half.

8. Truncate content before reranking to save AI tokens (10-50x savings).
   In the rerank helper, currently something like
   `contexts: memories.map(m => m.content)`, add a truncation step:

   ```ts
   const RERANK_MAX_CHARS = 512;
   function truncateForRerank(content: string): string {
     return content.length <= RERANK_MAX_CHARS ? content : content.slice(0, RERANK_MAX_CHARS);
   }
   // ...
   contexts: memories.map((m) => truncateForRerank(m.content)),
   ```

   The reranker is judging topical relevance, not exhaustive content — the
   first 512 chars is plenty. This is the single biggest cost saving.

9. Fall back to RRF scores (not uniform 0.5) when the reranker fails.
   The current `rerank()` fallback probably returns
   `memories.map(m => ({ memory: m, rerankerScore: 0.5 }))`, which destroys
   ranking on error. Add a `fallbackScores?: Map<string, number>` parameter
   to rerank(), and in the catch/fallback path:

   ```ts
   if (fallbackScores && fallbackScores.size > 0) {
     const maxScore = Math.max(...fallbackScores.values());
     if (maxScore > 0) {
       return memories.map((m) => ({
         memory: m,
         rerankerScore: (fallbackScores.get(m.key) ?? 0) / maxScore,
       }));
     }
   }
   return memories.map((m) => ({ memory: m, rerankerScore: 0.5 }));
   ```

   Then in retrieveMemory, pass the fusion/RRF score map through:
   `const reranked = await rerank(env.AI, input.query, memories, rrfScores);`

10. Debounce access tracking updates to 1 hour.
    In retrieveMemory, find the code that runs UPDATE statements to bump
    accessed_at / access_count for returned memories. Wrap the update list
    in a .filter() that skips memories accessed in the last hour:

    ```ts
    const ACCESS_DEBOUNCE_MS = 60 * 60 * 1000;
    const accessUpdates = topResults
      .filter((r) => {
        const lastAccess = new Date(r.memory.accessed_at).getTime();
        return now - lastAccess > ACCESS_DEBOUNCE_MS;
      })
      .map((r) => /* existing UPDATE prepare */);
    ```

    (`now` is probably already defined above as `Date.now()` or similar.
    Reuse it.) This saves ~80% of D1 writes for chatty clients.

=== VERIFICATION ===

After all changes:
1. Run `npx tsc --noEmit` from the memory-server root. Fix any type errors.
2. If the repo has tests, run them.
3. If the repo has a dev script (`npm run dev`), start it and do a smoke test:
   - `curl -X POST https://localhost:8787/mcp -H "Authorization: Bearer <key>"
      -H "Content-Type: application/json"
      -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`
   - Expect a JSON response with the tool definitions.
4. Commit with a clear message describing security + perf improvements.
5. Deploy with `wrangler deploy`.
6. Immediately test `clear_memories` — it should return the "disabled" error
   message. This proves the default-deny guard is working. If you actually
   need to clear memories, set the secret:
   `echo "true" | wrangler secret put ALLOW_DESTRUCTIVE_TOOLS`

Do not skip the verification steps. These changes touch auth, rate limiting,
and destructive tool gating — a broken deploy would be worse than no deploy.

If any step is ambiguous because this repo's structure differs from Recall's,
stop and ask me for clarification. Do not guess.
```

---

## If your other MCP server is NOT a memory server

If you have MCP servers for other purposes (custom tools, integrations, API wrappers), most of these fixes still apply. The relevant ones:

- **Body size limit** — applies to any Worker accepting POST bodies
- **Full-key-hashed rate limiter** — applies to any Worker with bearer auth
- **Weak API key warning** — applies to any Worker using a secret API key
- **Drop version from /health** — applies to any unauthenticated health endpoint
- **Setup script not echoing secrets to stdout** — applies to any setup tool

The memory-server-specific ones (parallel store writes, rerank truncation, debounced access tracking) are only relevant if the server has a similar search + rerank + access-tracking pipeline.

You can edit the prompt above to strip the memory-specific items before pasting it into a non-memory MCP repo.
