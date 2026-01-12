# PR-Agent: Claude Agent SDK Architecture

## Overview

PR-Agent can run in two modes:
1. **CLI Mode** (current) - Shells out to `claude` CLI
2. **SDK Mode** (recommended) - Uses `@anthropic-ai/claude-agent-sdk` directly

## Why SDK is Better

Based on Anthropic's architecture diagram:

```
┌─────────────────────────────────────────────────────────────┐
│                    Your Application                          │
│                    (PR-Agent Backend)                        │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│                   Claude Agent SDK                           │
├─────────────────────────────────────────────────────────────┤
│  SKILLS (Harness)                    │    Enhancements       │
│  ┌─────────┬──────────┬───────────┐  │  ┌─────────────────┐  │
│  │  Tools  │  Prompts │   Files   │  │  │ • Subagents     │  │
│  │   MCP   │   Core   │ Process   │  │  │ • Web Search    │  │
│  │ Custom  │  Custom  │ JIT Code  │  │  │ • Research Mode │  │
│  │ FileSys │ Workflow │  Ex Out   │  │  │ • Auto Compact  │  │
│  └─────────┴──────────┴───────────┘  │  │ • Hooks         │  │
│                                       │  │ • Memory        │  │
└─────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────┐
│          Claude Haiku  │  Claude Sonnet  │  Claude Opus     │
└─────────────────────────────────────────────────────────────┘
```

### Feature Comparison

| Feature | CLI Mode | SDK Mode |
|---------|----------|----------|
| **Subagents** | Not available | Parallel task execution |
| **Custom Tools** | Shell commands only | In-process functions |
| **Hooks** | None | PreToolUse, PostToolUse, etc. |
| **Sessions** | New each time | Resume, fork sessions |
| **MCP Servers** | Manual config | Built-in integration |
| **Event Streaming** | Parse stdout JSON | Native async iterators |
| **Cost Control** | Limited | max_turns, tool allowlist |
| **Type Safety** | None | Full TypeScript types |

## SDK Architecture for PR-Agent

```
┌─────────────────────────────────────────────────────────────┐
│                      E2B Sandbox                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │            Claude Agent SDK (TypeScript)               │  │
│  │                                                         │  │
│  │  Main Agent                                             │  │
│  │  ├── System Prompt: PR-Agent instructions              │  │
│  │  ├── Tools: Read, Write, Edit, Bash, Glob, Grep, Task  │  │
│  │  └── Hooks: Event emission, cost tracking               │  │
│  │                                                         │  │
│  │  Subagents (invoked via Task tool)                      │  │
│  │  ├── test-writer: Comprehensive unit tests              │  │
│  │  ├── code-reviewer: Quality & security review           │  │
│  │  ├── type-fixer: Fix TypeScript errors                  │  │
│  │  ├── linter: ESLint/Prettier fixes                      │  │
│  │  ├── security-scanner: npm audit + code scan            │  │
│  │  └── docs-generator: JSDoc/README generation            │  │
│  │                                                         │  │
│  │  MCP Servers                                            │  │
│  │  └── github: PR creation, issue updates                 │  │
│  └───────────────────────────────────────────────────────┘  │
│                           │                                  │
│                           ↓                                  │
│                 Anthropic API (Sonnet)                       │
└─────────────────────────────────────────────────────────────┘
```

## Skill Agents

Pre-defined specialized agents that can be invoked by the main agent:

### test-writer
```typescript
{
  description: 'Expert at writing comprehensive unit tests',
  prompt: 'Analyze patterns, write tests with edge cases, verify they pass',
  tools: ['Read', 'Write', 'Bash', 'Glob', 'Grep']
}
```

### code-reviewer
```typescript
{
  description: 'Reviews code for quality, security, best practices',
  prompt: 'Check OWASP top 10, performance, suggest improvements',
  tools: ['Read', 'Glob', 'Grep']  // Read-only
}
```

### type-fixer
```typescript
{
  description: 'Fixes TypeScript type errors systematically',
  prompt: 'Run tsc, analyze errors, fix without using any',
  tools: ['Read', 'Edit', 'Bash', 'Glob']
}
```

### linter
```typescript
{
  description: 'Fixes linting and formatting issues',
  prompt: 'Run ESLint/Prettier, auto-fix, manually fix rest',
  tools: ['Read', 'Edit', 'Bash', 'Glob']
}
```

### security-scanner
```typescript
{
  description: 'Security vulnerability scanner and fixer',
  prompt: 'Run npm audit, fix vulnerabilities, check code',
  tools: ['Read', 'Edit', 'Bash', 'Glob', 'Grep']
}
```

### docs-generator
```typescript
{
  description: 'Documentation generator',
  prompt: 'Add JSDoc, update README, document complex logic',
  tools: ['Read', 'Write', 'Edit', 'Glob']
}
```

## Usage Examples

### Basic Task (SDK)
```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Add unit tests for the auth module",
  options: {
    allowedTools: ["Read", "Write", "Edit", "Bash", "Glob", "Task"],
    agents: SKILL_AGENTS,
    permissionMode: "acceptEdits"
  }
})) {
  console.log(message);
}
```

### With Skill (SDK)
```typescript
for await (const message of query({
  prompt: "Use the test-writer agent to add tests for src/utils/",
  options: {
    allowedTools: ["Read", "Write", "Bash", "Task"],
    agents: { "test-writer": SKILL_AGENTS["test-writer"] }
  }
})) {
  // test-writer subagent handles the task
}
```

### With Hooks (SDK)
```typescript
const options = {
  hooks: {
    PreToolUse: [{
      matcher: ".*",
      hooks: [async (input) => {
        // Log every tool call
        console.log(`Tool: ${input.tool_name}`);
        return {};
      }]
    }],
    PostToolUse: [{
      matcher: "Edit|Write",
      hooks: [async (input) => {
        // Track file changes for billing
        trackFileChange(input.tool_input.file_path);
        return {};
      }]
    }]
  }
};
```

## CLI Usage

```bash
# Basic task
npx pr-agent run --repo owner/repo --task "add unit tests"

# With skill
npx pr-agent run --repo owner/repo --skill test-writer --task "add tests for auth"

# Multiple skills
npx pr-agent run --repo owner/repo --skill type-fixer --task "fix all type errors"
```

## Migration Path

### Phase 1: Current (CLI Mode)
- Shell out to `claude` CLI
- Parse stream-json output
- Works but limited

### Phase 2: SDK Mode (Recommended)
1. Install SDK in E2B template
2. Generate executor script
3. Run via Node.js in sandbox
4. Full subagent/hook support

### Phase 3: Hybrid (Best of Both)
- SDK for complex tasks with subagents
- CLI fallback for simple tasks
- Choose based on task complexity

## Implementation Files

| File | Purpose |
|------|---------|
| `src/services/sandbox/SDKBasedExecutor.ts` | SDK executor logic |
| `src/services/sandbox/CodingSupervisor.ts` | Main orchestrator |
| `packages/pr-agent-cli/src/lib/agent-sdk-executor.ts` | CLI skill definitions |

## Resources

- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview)
- [SDK TypeScript Package](https://github.com/anthropics/claude-agent-sdk-typescript)
- [SDK Python Package](https://github.com/anthropics/claude-agent-sdk-python)
- [Building Agents Guide](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
