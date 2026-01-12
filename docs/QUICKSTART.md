# PR-Agent Quick Start

Get started with pr-agent in under 5 minutes.

## 1. Run Your First Task (30 seconds)

```bash
npx pr-agent run --repo YOUR_USERNAME/YOUR_REPO --task "add a hello world function"
```

That's it! Watch as the agent:
1. Creates an isolated sandbox
2. Clones your repo
3. Writes code with Claude Code
4. Opens a PR for review

## 2. Authenticate for Private Repos (1 minute)

```bash
pr-agent auth
```

Opens browser -> Enter code -> Done. Token saved to `~/.pr-agent/config.json`.

## 3. Try These Examples

### Add Unit Tests
```bash
npx pr-agent run --repo myorg/api --task "add Jest tests for UserService"
```

### Fix CI Errors
```bash
npx pr-agent run --repo myorg/app --task "fix TypeScript errors in CI"
```

### Refactor Code
```bash
npx pr-agent run --repo myorg/lib --task "convert callbacks to async/await"
```

### Add Documentation
```bash
npx pr-agent run --repo myorg/sdk --task "add JSDoc comments to public APIs"
```

### Work on a Specific Branch
```bash
npx pr-agent run --repo myorg/api --task "add error handling" --branch feature/api-v2
```

## 4. Tips for Better Results

### Be Specific
```bash
# Good - specific file and action
npx pr-agent run --repo myorg/api --task "add input validation to /api/users POST endpoint"

# Less good - vague
npx pr-agent run --repo myorg/api --task "add validation"
```

### Reference Files
```bash
npx pr-agent run --repo myorg/api --task "update src/auth/login.ts to use bcrypt for password hashing"
```

### Set Constraints
```bash
npx pr-agent run --repo myorg/api --task "add rate limiting using existing patterns, don't add new dependencies"
```

### Describe the Why
```bash
npx pr-agent run --repo myorg/api --task "add retry logic to API calls because we're seeing intermittent timeouts"
```

## 5. Understanding the Output

When you run a task, you'll see:

```
PR-AGENT v1.0.0

Creating sandbox...

  ✓ Create sandbox
  ✓ Clone repository
  ⠋ Run Claude Code
  ○ Push changes
  ○ Create pull request

──────────────────────────────────────────────────────
  14:32:51 Read src/index.ts
  14:32:52 Read package.json
  14:32:53 Edit src/math.ts
  14:32:54 Bash npm test
──────────────────────────────────────────────────────

╭──────────────────────────────────────────────────────╮
│  ✓ PR Created Successfully                           │
│                                                      │
│  https://github.com/owner/repo/pull/123              │
│  2 files changed                                     │
│  $0.15 · 1m 30s                                      │
╰──────────────────────────────────────────────────────╯
```

## 6. Rate Limits

| User Type | Daily Limit |
|-----------|-------------|
| Anonymous | 3 tasks |
| Authenticated | 10 tasks |
| Pro | Unlimited |

Run `pr-agent auth` to increase your limits.

## 7. Commands Reference

| Command | Description |
|---------|-------------|
| `pr-agent run` | Execute a task and create a PR |
| `pr-agent auth` | Authenticate with GitHub |
| `pr-agent logout` | Clear saved authentication |
| `pr-agent status` | Show authentication status |

## Next Steps

- Read the [Architecture](./ARCHITECTURE.md) to understand how pr-agent works
- Check the [API Reference](./API.md) for programmatic access
- View [examples on GitHub](https://github.com/invariant-ai/pr-agent)
