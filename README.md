# inv

**Delegate repo work to a coding agent.** Plan tasks, execute in parallel, get PRs.

```bash
inv
```

That's it. Interactive mode guides you through everything.

## What It Does

1. **Plan** - Describe what you want in natural language. AI breaks it into tasks.
2. **Ship** - Execute all tasks in a single Claude Code session. One sandbox, one PR.
3. **Watch** - Monitor progress in real-time or replay completed jobs.

```
> /plan add user authentication with JWT

Creating plan...

## Plan: Add User Authentication
1. [US-001] Add User model with bcrypt
2. [US-002] Create auth service with JWT
3. [US-003] Add login endpoint
4. [US-004] Add auth middleware

[Approve] [Edit] [Cancel]

> /ship

Starting execution...
```

## Quick Start

```bash
# Clone and run locally (not published to npm yet)
git clone https://github.com/mmchougule/pr-agent.git
cd pr-agent
npm install
npm run build
npm link

# Now run from any directory
inv
```

## Commands

### Interactive Mode (Recommended)

```bash
inv
```

Launches the REPL with slash commands:

| Command | Description |
|---------|-------------|
| `/plan <description>` | Create an execution plan |
| `/ship` | Execute all tasks |
| `/status` | Show current session status |
| `/jobs` | List recent jobs |
| `/watch <jobId>` | Watch a running job |
| `/logs` | View execution logs |
| `/done` | Archive completed plan |
| `/history` | View archived plans |
| `/help` | Show all commands |

### CLI Commands

```bash
# Run a single task
inv run --repo owner/repo --task "add unit tests"

# Fix an existing PR
inv fix-pr --repo owner/repo --pr 123

# List jobs
inv jobs

# Watch/replay a job
inv watch <jobId>
inv replay <jobId> --speed 4
```

## How It Works

```
┌─────────────────────────────────────────────────────────┐
│                    INV WORKFLOW                          │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  /plan "add auth"                                        │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────┐   AI generates task breakdown          │
│  │   PLAN      │   Saved to .pr-agent/plan.md           │
│  └─────────────┘                                         │
│       │                                                  │
│       ▼                                                  │
│  /ship                                                   │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────┐   E2B sandbox + Claude Code            │
│  │   EXECUTE   │   All tasks in single session          │
│  └─────────────┘   Commits per task                     │
│       │                                                  │
│       ▼                                                  │
│  ┌─────────────┐                                         │
│  │     PR      │   Single PR with all changes           │
│  └─────────────┘                                         │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## Architecture

- **CLI**: React + Ink terminal UI
- **Execution**: E2B sandbox with Claude Code
- **Streaming**: Server-sent events for real-time updates
- **Persistence**: Local session state in `.pr-agent/`

Inspired by [Ralph TUI](https://github.com/subsy/ralph-tui) and [OpenCode](https://github.com/anomalyco/opencode).

## Session Files

```
your-project/
└── .pr-agent/
    ├── plan.md          # Current plan (source of truth)
    ├── state.json       # Execution state
    └── logs/            # Task execution logs
```

## Requirements

- Node.js 18+
- GitHub repository (authenticate for private repos)

## Development

```bash
# Run in dev mode
npm run dev

# Build
npm run build

# Type check
npm run typecheck
```

## License

MIT

## Links

- [Invariant](https://useinvariant.com) - The team behind inv
- [Documentation](https://docs.useinvariant.com/pr-agent)
