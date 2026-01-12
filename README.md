# pr-agent

Delegate repo work to a coding agent. Creates PRs automatically.

```bash
# Interactive mode - just run pr-agent and follow prompts
npx pr-agent

# Or specify everything in one command
npx pr-agent run --repo owner/repo --task "add unit tests"
```

Creates an isolated sandbox, runs Claude Code, and opens a PR.

![PR Agent Demo](https://github.com/invariant-ai/pr-agent/raw/main/docs/demo.gif)

## Documentation

- **[Quick Start](./docs/QUICKSTART.md)** - Get started in 5 minutes
- **[Architecture](./docs/ARCHITECTURE.md)** - How it works under the hood
- **[API Reference](./docs/API.md)** - Programmatic access

## Installation

```bash
# Run directly with npx (no install needed)
npx pr-agent run --repo owner/repo --task "your task"

# Or install globally
npm install -g pr-agent
```

## Commands

### `pr-agent` (Interactive Mode)

Launch interactive mode - prompts for repo and task step by step.

```bash
pr-agent
```

Perfect for quick tasks and demos.

### `pr-agent run`

Execute a task and create a PR.

```bash
pr-agent run --repo owner/repo --task "add unit tests"
```

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--repo` | Yes | Repository (owner/repo) |
| `--task` | Yes | Task description |
| `--branch` | No | Base branch (default: main) |

### `pr-agent fix-pr`

Fix an existing PR based on review comments or CI failures.

```bash
pr-agent fix-pr --repo owner/repo --pr 123
```

**Options:**

| Flag | Required | Description |
|------|----------|-------------|
| `--repo` | Yes | Repository (owner/repo) |
| `--pr` | Yes | PR number to fix |
| `--task` | No | Specific fix instructions |

### `pr-agent auth`

Authenticate with GitHub (required for private repos).

```bash
pr-agent auth
```

Opens a browser for GitHub OAuth device flow. Your token is stored locally in `~/.pr-agent/config.json`.

### `pr-agent logout`

Clear saved authentication.

```bash
pr-agent logout
```

### `pr-agent status`

Show current authentication status.

```bash
pr-agent status
```

## Examples

### Add tests to a repository

```bash
npx pr-agent run \
  --repo myorg/myrepo \
  --task "add unit tests for the authentication module"
```

### Fix CI failures

```bash
npx pr-agent run \
  --repo myorg/myrepo \
  --task "fix the failing TypeScript type errors in CI"
```

### Refactor code

```bash
npx pr-agent run \
  --repo myorg/myrepo \
  --task "refactor the UserService to use dependency injection"
```

### Work on a specific branch

```bash
npx pr-agent run \
  --repo myorg/myrepo \
  --task "add error handling to API endpoints" \
  --branch feature/api-v2
```

## How It Works

1. **Creates an isolated sandbox** - Your code runs in a secure E2B sandbox
2. **Clones your repository** - The agent clones your repo into the sandbox
3. **Runs Claude Code** - An AI coding agent works on your task
4. **Opens a PR** - Changes are committed and a pull request is created

## Rate Limits

| User Type | Limit |
|-----------|-------|
| Anonymous | 3 tasks/day |
| Authenticated | 10 tasks/day |
| Pro | Unlimited |

## Requirements

- Node.js 18+
- A public GitHub repository (or authenticate for private repos)

## Privacy & Security

- Your code runs in an isolated sandbox
- No code is stored after execution
- GitHub tokens are stored locally with secure permissions
- See our [Privacy Policy](https://invariant.sh/privacy)

## Powered By

pr-agent uses **Claude Code** running in an **E2B sandbox** to execute coding tasks. Under the hood:

- **Claude Code** - Anthropic's AI coding assistant with full file system access
- **E2B Sandbox** - Secure, isolated execution environment
- **GitHub API** - Automatic PR creation and branch management

## Advanced Usage

### Using Skills (Coming Soon)

```bash
# Run built-in skills
npx pr-agent run --repo myorg/repo --skill test-runner
npx pr-agent run --repo myorg/repo --skill linter-fixer
npx pr-agent run --repo myorg/repo --skill security-scan
```

### Programmatic Access

```typescript
import { executeTask, streamJob } from 'pr-agent/lib/api-client';

const { jobId, streamUrl } = await executeTask({
  repo: 'myorg/myrepo',
  task: 'add unit tests',
});

streamJob(streamUrl, {
  onStatus: (msg, phase) => console.log(`[${phase}] ${msg}`),
  onResult: (result) => console.log(`PR: ${result.prUrl}`),
});
```

See the [API Reference](./docs/API.md) for full documentation.

## Contributing

Contributions are welcome! Please open an issue or PR.

```bash
# Clone the repo
git clone https://github.com/invariant-ai/pr-agent.git
cd pr-agent

# Install dependencies
npm install

# Run in dev mode
npm run dev

# Build
npm run build

# Link globally for testing
npm link
```

## License

MIT - see [LICENSE](./LICENSE)

## Links

- [Website](https://invariant.sh)
- [Documentation](https://docs.invariant.sh)
- [GitHub](https://github.com/invariant-ai/pr-agent)
- [Discord](https://discord.gg/invariant)
