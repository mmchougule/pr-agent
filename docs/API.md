# PR-Agent API Reference

Complete API documentation for programmatic access to pr-agent.

## Base URL

```
Production: https://api.invariant.sh
Local:      http://localhost:3001
```

## Authentication

Most endpoints work without authentication. For private repos or higher rate limits, include a GitHub token:

```http
Authorization: Bearer ghp_your_github_token
```

Or pass it in the request body as `githubToken`.

---

## Endpoints

### Execute Task

Create a new coding task and get a stream URL.

```http
POST /api/pr-agent/execute
Content-Type: application/json
```

**Request Body:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `repo` | string | Yes | Repository in `owner/repo` format |
| `task` | string | Yes | Task description |
| `branch` | string | No | Base branch (default: `main`) |
| `githubToken` | string | No | GitHub PAT for private repos |
| `clientFingerprint` | string | No | Client identifier for rate limiting |

**Example Request:**

```bash
curl -X POST https://api.invariant.sh/api/pr-agent/execute \
  -H "Content-Type: application/json" \
  -d '{
    "repo": "myorg/myrepo",
    "task": "add unit tests for the auth module",
    "branch": "main"
  }'
```

**Response:**

```json
{
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "streamUrl": "/api/pr-agent/550e8400-e29b-41d4-a716-446655440000/stream"
}
```

**Error Responses:**

| Status | Description |
|--------|-------------|
| 400 | Invalid request (missing repo/task, invalid format) |
| 429 | Rate limit exceeded |
| 500 | Internal server error |

---

### Get Job Status

Get the current status of a job.

```http
GET /api/pr-agent/:jobId
```

**Example Request:**

```bash
curl https://api.invariant.sh/api/pr-agent/550e8400-e29b-41d4-a716-446655440000
```

**Response:**

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "repoFullName": "myorg/myrepo",
  "branch": "main",
  "task": "add unit tests for the auth module",
  "status": "success",
  "fixBranch": "pr-agent/add-tests-1234567890",
  "prNumber": 42,
  "prUrl": "https://github.com/myorg/myrepo/pull/42",
  "filesChanged": 3,
  "commitSha": "abc123def456",
  "sandboxDurationSeconds": 95,
  "estimatedCostUsd": 0.24,
  "createdAt": "2025-01-12T10:00:00.000Z",
  "completedAt": "2025-01-12T10:01:35.000Z"
}
```

**Job Statuses:**

| Status | Description |
|--------|-------------|
| `pending` | Job created, waiting to start |
| `running` | Job is executing |
| `success` | Job completed successfully |
| `failed` | Job failed |

---

### Stream Job Events (SSE)

Stream real-time events from a running job.

```http
GET /api/pr-agent/:jobId/stream
Accept: text/event-stream
```

**Example Request:**

```bash
curl -N https://api.invariant.sh/api/pr-agent/550e8400-e29b-41d4-a716-446655440000/stream
```

**Response Format:**

Server-Sent Events (SSE) with JSON payloads:

```
data: {"type":"status","phase":"sandbox","message":"Creating sandbox..."}

data: {"type":"status","phase":"clone","message":"Cloning repository..."}

data: {"type":"agent","eventType":"tool_call","tool":"Read","display":"src/index.ts"}

data: {"type":"result","success":true,"result":{...}}
```

**Event Types:**

#### Status Event

```json
{
  "type": "status",
  "timestamp": "2025-01-12T10:00:05.000Z",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "running",
  "phase": "sandbox",
  "message": "Creating sandbox..."
}
```

| Phase | Description |
|-------|-------------|
| `sandbox` | Creating E2B sandbox |
| `clone` | Cloning repository |
| `agent` | Running Claude Code |
| `push` | Pushing changes to GitHub |
| `pr` | Creating pull request |

#### Agent Event

```json
{
  "type": "agent",
  "timestamp": "2025-01-12T10:00:30.000Z",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "eventType": "tool_call",
  "tool": "Read",
  "display": "src/index.ts"
}
```

| eventType | Description |
|-----------|-------------|
| `tool_call` | Claude Code is using a tool |
| `tool_result` | Tool execution completed |
| `thinking` | Claude Code is reasoning |
| `message` | Claude Code sent a message |

#### Result Event

```json
{
  "type": "result",
  "timestamp": "2025-01-12T10:01:35.000Z",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "success": true,
  "result": {
    "success": true,
    "fixBranch": "pr-agent/add-tests-1234567890",
    "prNumber": 42,
    "prUrl": "https://github.com/myorg/myrepo/pull/42",
    "commitSha": "abc123def456",
    "filesChanged": 3,
    "sandboxDurationSeconds": 95,
    "estimatedCostUsd": 0.24
  }
}
```

#### Error Event

```json
{
  "type": "error",
  "timestamp": "2025-01-12T10:01:00.000Z",
  "jobId": "550e8400-e29b-41d4-a716-446655440000",
  "error": "Failed to clone repository: access denied",
  "recoverable": false
}
```

---

### List Jobs

Get recent jobs for the authenticated user.

```http
GET /api/pr-agent/jobs
Authorization: Bearer ghp_your_github_token
```

**Query Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 10 | Max jobs to return (1-100) |
| `offset` | number | 0 | Pagination offset |
| `status` | string | all | Filter by status |

**Example Request:**

```bash
curl https://api.invariant.sh/api/pr-agent/jobs?limit=5 \
  -H "Authorization: Bearer ghp_your_github_token"
```

**Response:**

```json
{
  "jobs": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "repoFullName": "myorg/myrepo",
      "task": "add unit tests",
      "status": "success",
      "prUrl": "https://github.com/myorg/myrepo/pull/42",
      "createdAt": "2025-01-12T10:00:00.000Z"
    }
  ],
  "total": 15,
  "limit": 5,
  "offset": 0
}
```

---

## Rate Limits

| User Type | Daily | Hourly | Per Minute |
|-----------|-------|--------|------------|
| Anonymous | 3 | 2 | 1 |
| Authenticated | 10 | 5 | 2 |
| Pro | Unlimited | Unlimited | 10 |

Rate limit headers are included in responses:

```http
X-RateLimit-Limit: 3
X-RateLimit-Remaining: 2
X-RateLimit-Reset: 1705060800
```

When rate limited:

```json
{
  "error": "Rate limit exceeded",
  "retryAfter": 3600,
  "upgradeUrl": "https://invariant.sh/pricing"
}
```

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": {}
}
```

**Common Error Codes:**

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_REPO` | 400 | Invalid repository format |
| `MISSING_TASK` | 400 | Task description required |
| `REPO_NOT_FOUND` | 404 | Repository doesn't exist or is private |
| `RATE_LIMITED` | 429 | Rate limit exceeded |
| `AUTH_REQUIRED` | 401 | Authentication required for this repo |
| `INTERNAL_ERROR` | 500 | Internal server error |

---

## Client Libraries

### JavaScript/TypeScript

```typescript
// Using the CLI's api-client
import { executeTask, streamJob } from 'pr-agent/lib/api-client';

const { jobId, streamUrl } = await executeTask({
  repo: 'myorg/myrepo',
  task: 'add unit tests',
});

streamJob(streamUrl, {
  onStatus: (message, phase) => console.log(`[${phase}] ${message}`),
  onAgent: (event) => console.log(`Tool: ${event.tool}`),
  onResult: (result) => console.log(`PR: ${result.prUrl}`),
  onError: (error) => console.error(error),
});
```

### cURL

```bash
# Execute task
JOB=$(curl -s -X POST https://api.invariant.sh/api/pr-agent/execute \
  -H "Content-Type: application/json" \
  -d '{"repo":"myorg/myrepo","task":"add tests"}')

JOB_ID=$(echo $JOB | jq -r '.jobId')

# Stream events
curl -N "https://api.invariant.sh/api/pr-agent/$JOB_ID/stream"
```

### Python

```python
import requests
import sseclient

# Execute task
response = requests.post(
    'https://api.invariant.sh/api/pr-agent/execute',
    json={'repo': 'myorg/myrepo', 'task': 'add tests'}
)
data = response.json()

# Stream events
stream = requests.get(
    f"https://api.invariant.sh{data['streamUrl']}",
    stream=True
)
client = sseclient.SSEClient(stream)

for event in client.events():
    print(event.data)
```

---

## Webhooks (Coming Soon)

Register webhooks to receive job completion notifications.

```http
POST /api/pr-agent/webhooks
Content-Type: application/json

{
  "url": "https://your-server.com/webhook",
  "events": ["job.completed", "job.failed"],
  "secret": "your-webhook-secret"
}
```

---

## SDK (Coming Soon)

Official SDKs for popular languages:

- `@invariant/pr-agent` - JavaScript/TypeScript
- `invariant-pr-agent` - Python
- `invariant/pr-agent` - Go
