# Testing PR-Agent CLI

Real-world test examples you can run right now.

## Prerequisites

1. Backend running: `npm run dev` (from root)
2. CLI built: `cd packages/pr-agent-cli && npm run build`
3. Test repo: Create `mmchougule/pr-agent-demo` (or use your own)

## Quick Test Commands

### 1. Test Streaming (No Sandbox, Free)
```bash
cd packages/pr-agent-cli
API_BASE_URL=http://localhost:3001 npm start -- test-stream
```

Expected output:
- Animated spinners
- Tool calls streaming
- Final result box with PR URL

### 2. Test Real Execution (Uses Sandbox + Claude)

**Simple Task - Add a Function:**
```bash
API_BASE_URL=http://localhost:3001 npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "add a multiply function to index.js"
```

**Add Tests:**
```bash
API_BASE_URL=http://localhost:3001 npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "add Jest tests for the math functions in index.js"
```

**Fix Linting:**
```bash
API_BASE_URL=http://localhost:3001 npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "run eslint and fix all errors"
```

### 3. Test Auth Flow
```bash
npm start -- auth
```

Should:
1. Show GitHub device code URL
2. Wait for you to authorize
3. Save token to `~/.pr-agent/config.json`

### 4. Test Status
```bash
npm start -- status
```

## Creating a Test Repository

Create a simple repo for testing:

```bash
# Create repo on GitHub: mmchougule/pr-agent-demo
gh repo create pr-agent-demo --public --clone
cd pr-agent-demo

# Add a simple file
cat > index.js << 'EOF'
function add(a, b) {
  return a + b;
}

function subtract(a, b) {
  return a - b;
}

module.exports = { add, subtract };
EOF

cat > package.json << 'EOF'
{
  "name": "pr-agent-demo",
  "version": "1.0.0",
  "main": "index.js"
}
EOF

git add .
git commit -m "Initial commit"
git push -u origin main
```

## Test Scenarios

### Scenario 1: Add New Feature
```bash
npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "add a divide function that throws an error for division by zero"
```

**Expected:**
- Claude Code reads index.js
- Adds divide function
- Creates PR

### Scenario 2: Add Documentation
```bash
npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "add JSDoc comments to all functions in index.js"
```

### Scenario 3: Refactor
```bash
npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "refactor index.js to use TypeScript"
```

### Scenario 4: Fix Bug
```bash
# First, introduce a bug
npm start -- run \
  --repo mmchougule/pr-agent-demo \
  --task "the add function has a bug where it returns a-b instead of a+b, fix it"
```

## Debugging

### View Logs
```bash
# Backend logs
npm run dev 2>&1 | grep -E "(PRAgent|Sandbox|Claude)"

# Check SSE events
curl -N http://localhost:3001/api/pr-agent/test-stream
```

### Check Job Status
```bash
curl http://localhost:3001/api/pr-agent/YOUR_JOB_ID
```

### Check Rate Limits
```bash
curl http://localhost:3001/api/pr-agent/rate-limit-status
```

## Common Issues

### "Sandbox creation failed"
- Check E2B_API_KEY is set
- Check ANTHROPIC_API_KEY is set

### "Repository not found"
- Ensure repo is public, or auth with `pr-agent auth`

### "Rate limit exceeded"
- Run `pr-agent auth` to increase limits
- Wait for reset (check headers)

### CLI hangs at "Creating sandbox..."
- Check backend logs for errors
- Ensure SSE connection isn't being blocked

## Unit Tests

```bash
cd packages/pr-agent-cli
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
```
