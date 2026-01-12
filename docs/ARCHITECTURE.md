# PR-Agent Architecture

Technical architecture guide for contributors and developers.

## Overview

```
┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
│   CLI (npm)     │─────▶│  Invariant API  │─────▶│   E2B Sandbox   │
│  pr-agent run   │ HTTP │ /api/pr-agent/* │      │  Claude Code    │
└─────────────────┘  SSE └─────────────────┘      └────────┬────────┘
                                                           │
                                                           ▼
                                                    ┌──────────────┐
                                                    │   GitHub     │
                                                    │   PR API     │
                                                    └──────────────┘
```

## Components

### 1. CLI Layer (`packages/pr-agent-cli/`)

The CLI is built with **React + Ink** for a modern terminal UI.

| File | Purpose |
|------|---------|
| `src/index.tsx` | Entry point, Commander.js CLI setup |
| `src/App.tsx` | Main React component, mode routing |
| `src/hooks/useExecution.ts` | SSE streaming + execution state |
| `src/hooks/useAuth.ts` | GitHub Device Flow authentication |
| `src/lib/api-client.ts` | HTTP + SSE client |
| `src/lib/config.ts` | Local config storage (`~/.pr-agent/`) |
| `src/components/` | Ink UI components |

### 2. API Layer (`src/controllers/PRAgentController.ts`)

RESTful API with SSE streaming for real-time updates.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/pr-agent/execute` | POST | Create job, return stream URL |
| `/api/pr-agent/:jobId` | GET | Get job status |
| `/api/pr-agent/:jobId/stream` | GET | SSE event stream |
| `/api/pr-agent/jobs` | GET | List recent jobs (authenticated) |

### 3. Sandbox Layer (`src/services/sandbox/`)

Isolated execution environment using E2B.

| File | Purpose |
|------|---------|
| `CodingSupervisor.ts` | Orchestrates sandbox + Claude Code |
| `ClaudeCodeParser.ts` | Parses `--output-format stream-json` |
| `StreamFormatter.ts` | Formats events for SSE transmission |
| `types.ts` | Event type definitions |

## Data Flow

### Execution Flow

```
1. CLI sends POST /api/pr-agent/execute
   └── Body: { repo, task, branch, githubToken? }

2. API creates job in database
   └── Returns: { jobId, streamUrl }

3. CLI connects to SSE stream
   └── GET /api/pr-agent/:jobId/stream

4. API starts job processing
   └── Creates E2B sandbox
   └── Clones repository
   └── Runs Claude Code

5. Events stream to CLI
   └── status: phase changes
   └── agent: tool calls, thinking
   └── result: final outcome

6. Claude Code completes
   └── Commits changes
   └── Pushes to branch
   └── Creates PR via GitHub API

7. Result sent to CLI
   └── PR URL, files changed, cost
```

### SSE Event Flow

```
CLI                    API                     Sandbox
 │                      │                         │
 │──POST /execute──────▶│                         │
 │◀─── {jobId, url} ────│                         │
 │                      │                         │
 │──GET /stream────────▶│                         │
 │                      │──Create E2B sandbox────▶│
 │◀─status: sandbox─────│                         │
 │                      │◀────sandbox ready───────│
 │                      │                         │
 │                      │──Clone repo────────────▶│
 │◀─status: clone───────│                         │
 │                      │◀────clone complete──────│
 │                      │                         │
 │                      │──Run Claude Code───────▶│
 │◀─status: agent───────│                         │
 │◀─agent: tool_call────│◀────Read file───────────│
 │◀─agent: tool_call────│◀────Edit file───────────│
 │◀─agent: tool_call────│◀────Bash command────────│
 │                      │◀────Changes complete────│
 │                      │                         │
 │◀─status: push────────│──Push to GitHub────────▶│
 │◀─status: pr──────────│──Create PR─────────────▶│
 │◀─result: success─────│◀────PR created──────────│
 │                      │                         │
 └──────────────────────┴─────────────────────────┘
```

## SSE Event Types

### Status Event
Phase transitions during execution.

```typescript
{
  type: 'status',
  timestamp: Date,
  jobId: string,
  status: 'running' | 'completed' | 'failed',
  phase: 'sandbox' | 'clone' | 'agent' | 'push' | 'pr',
  message: string
}
```

### Agent Event
Claude Code activity (tool calls, thinking).

```typescript
{
  type: 'agent',
  timestamp: Date,
  jobId: string,
  eventType: 'tool_call' | 'tool_result' | 'thinking' | 'message',
  tool?: string,      // For tool_call: Read, Write, Edit, Bash, etc.
  display?: string,   // Human-readable description
  output?: string     // For thinking/message events
}
```

### Result Event
Final outcome of the job.

```typescript
{
  type: 'result',
  timestamp: Date,
  jobId: string,
  success: boolean,
  result: {
    success: boolean,
    fixBranch: string,
    prNumber?: number,
    prUrl?: string,
    commitSha?: string,
    filesChanged: number,
    sandboxDurationSeconds: number,
    estimatedCostUsd: number,
    error?: string
  }
}
```

### Error Event
Error during execution.

```typescript
{
  type: 'error',
  timestamp: Date,
  jobId: string,
  error: string,
  recoverable: boolean
}
```

## Database Schema

### `pr_agent_jobs` Table

```sql
CREATE TABLE pr_agent_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  repo_full_name VARCHAR(255) NOT NULL,
  branch VARCHAR(255) NOT NULL DEFAULT 'main',
  task TEXT NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  sandbox_id VARCHAR(255),
  fix_branch VARCHAR(255),
  pr_number INTEGER,
  pr_url TEXT,
  files_changed INTEGER DEFAULT 0,
  commit_sha VARCHAR(40),
  error_message TEXT,
  sandbox_duration_seconds INTEGER,
  estimated_cost_usd DECIMAL(10, 6),
  client_ip INET,
  client_fingerprint VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
```

## Rate Limiting

Rate limits are enforced by IP + fingerprint.

| User Type | Daily | Hourly |
|-----------|-------|--------|
| Anonymous | 3 | 2 |
| Authenticated | 10 | 5 |
| Pro | Unlimited | Unlimited |

Fingerprint is generated from: OS, architecture, Node version, home directory hash.

## Security

### Sandbox Isolation
- Each job runs in a fresh E2B sandbox
- Sandbox is destroyed after completion
- No persistent storage between runs

### Token Storage
- GitHub tokens stored in `~/.pr-agent/config.json`
- File permissions: `0o600` (owner read/write only)
- Directory permissions: `0o700` (owner only)

### API Security
- HTTPS in production
- Rate limiting by IP
- Token validation for private repos

## Local Development

### Prerequisites
- Node.js 18+
- npm or yarn

### Setup

```bash
# Clone the repo
git clone https://github.com/invariant-ai/pr-agent
cd pr-agent/packages/pr-agent-cli

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start -- run --repo owner/repo --task "test"
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `API_BASE_URL` | Override API endpoint (default: https://api.invariant.sh) |
| `PR_AGENT_DEBUG` | Enable debug logging |

### Testing

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

## Extending PR-Agent

### Adding Custom Skills

Skills are predefined prompts that enhance Claude Code's behavior.

```typescript
// src/services/sandbox/PRAgentSkills.ts
export const PR_AGENT_SKILLS = [
  {
    id: 'test-runner',
    name: 'Run Tests',
    prompt: 'Run the test suite and report results. If tests fail, analyze and fix.',
  },
  // Add more skills...
];
```

### MCP Integration (Future)

Connect pr-agent to MCP servers for extended capabilities:

```json
{
  "mcpServers": {
    "web-search": {
      "command": "npx",
      "args": ["@anthropic/mcp-web-search"]
    }
  }
}
```

### Claude Agent SDK (Future)

For full control, migrate from Claude Code CLI to Claude Agent SDK:

```typescript
import { createAgent, tools } from '@anthropic-ai/claude-agent-sdk';

const agent = createAgent({
  model: 'claude-sonnet-4-20250514',
  tools: [tools.read, tools.write, tools.edit, tools.bash],
});
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes
4. Run tests: `npm test`
5. Submit a PR

See [CONTRIBUTING.md](../CONTRIBUTING.md) for detailed guidelines.
