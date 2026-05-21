const express    = require('express')
const http       = require('http')
const { WebSocketServer, WebSocket } = require('ws')
const { Queue }  = require('bullmq')
const IORedis    = require('ioredis')
const { PrismaClient } = require('@prisma/client')
const { v4: uuid } = require('uuid')

const app    = express()
const server = http.createServer(app)
const wss    = new WebSocketServer({ server })
const prisma = new PrismaClient()
const PORT   = process.env.PORT || 3001

// ── REDIS CONNECTIONS ──────────────────────────────────────────────────────────
const redisOpts = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
}

const queueRedis = new IORedis(process.env.REDIS_URL, redisOpts)
const subRedis   = new IORedis(process.env.REDIS_URL, redisOpts)
const pubRedis   = new IORedis(process.env.REDIS_URL, redisOpts)

// ── BULLMQ QUEUES ──────────────────────────────────────────────────────────────
const QUEUE_NAMES = {
  debugger: 'agent-debugger-queue',
  reviewer: 'agent-reviewer-queue',
  security: 'agent-security-queue',
  tests:    'agent-tests-queue',
  docs:     'agent-docs-queue',
}

const PIPELINE_AGENTS = {
  full:     ['debugger', 'reviewer', 'security', 'tests', 'docs'],
  debug:    ['debugger'],
  review:   ['reviewer'],
  security: ['security'],
  tests:    ['tests'],
  docs:     ['docs'],
}

const queues = {}
Object.entries(QUEUE_NAMES).forEach(([name, qname]) => {
  queues[name] = new Queue(qname, { connection: queueRedis })
})

// ── AGENT STATE (in-memory, augmented by Redis) ────────────────────────────────
const agentStatus = {
  debugger: 'idle', reviewer: 'idle', security: 'idle', tests: 'idle', docs: 'idle',
}

// ── WEBSOCKET BROADCAST ────────────────────────────────────────────────────────
function broadcast(data) {
  const msg = JSON.stringify(data)
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg)
  })
}

wss.on('connection', (ws) => {
  console.log('[ws] dashboard connected')
  ws.send(JSON.stringify({ type: 'welcome', agents: agentStatus }))
  ws.on('close', () => console.log('[ws] dashboard disconnected'))
})

// ── REDIS PUB/SUB: relay agent updates to dashboard ───────────────────────────
// NOTE: subscribe() is called in start() after explicit connect()

subRedis.on('message', async (_channel, raw) => {
  try {
    const msg = JSON.parse(raw)

    if (msg.type === 'agent_status') {
      agentStatus[msg.agent] = msg.status
    }
    if (msg.type === 'agent_result') {
      agentStatus[msg.agent] = 'idle'

      // Check if all expected agents for this task are done
      if (msg.taskId) {
        const done     = await pubRedis.incr(`task:${msg.taskId}:done`)
        const expected = await pubRedis.get(`task:${msg.taskId}:expected`)
        if (parseInt(done) >= parseInt(expected)) {
          await prisma.task.update({
            where: { id: msg.taskId },
            data:  { status: 'complete' },
          }).catch(() => {})
          broadcast({ type: 'task_complete', taskId: msg.taskId })
        }
      }
    }

    broadcast(msg)
  } catch (e) {
    console.error('[pubsub] parse error:', e.message)
  }
})

// ── MIDDLEWARE ─────────────────────────────────────────────────────────────────
app.use(express.json())

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  next()
})

// ── ROUTES ─────────────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'orchestrator' }))

app.get('/agents/status', (_req, res) => {
  const apiKey = process.env.ANTHROPIC_API_KEY ? 'valid' : 'missing'
  res.json({ agents: agentStatus, apiKey })
})

// POST /task — create task, push to queue(s)
app.post('/task', async (req, res) => {
  try {
    const { code, description = '', type = 'full' } = req.body
    if (!code) return res.status(400).json({ error: 'code is required' })

    const taskId = uuid()
    const agents = PIPELINE_AGENTS[type] || PIPELINE_AGENTS.full

    // Persist task
    await prisma.task.create({
      data: { id: taskId, code, description, type, status: 'pending' },
    })

    // Pre-create agent result rows so GET /task/:id can return them immediately
    await Promise.all(agents.map(agent =>
      prisma.agentResult.create({
        data: { taskId, agentName: agent, status: 'queued' },
      })
    ))

    // Track expected completions in Redis (expire after 1 hour)
    await pubRedis.set(`task:${taskId}:expected`, agents.length, 'EX', 3600)
    await pubRedis.set(`task:${taskId}:done`,     0,            'EX', 3600)

    // Dispatch to queues
    await Promise.all(agents.map(agent =>
      queues[agent].add('analyze', { taskId, code, description, type }, {
        attempts:    3,
        backoff:     { type: 'exponential', delay: 2000 },
        removeOnComplete: 100,
        removeOnFail:     50,
      })
    ))

    res.json({ taskId, agents, message: 'Task queued' })
  } catch (e) {
    console.error('[POST /task]', e.message)
    res.status(500).json({ error: e.message })
  }
})

// GET /task/:id — poll task status + results
app.get('/task/:id', async (req, res) => {
  try {
    const task = await prisma.task.findUnique({
      where:   { id: req.params.id },
      include: { results: true },
    })
    if (!task) return res.status(404).json({ error: 'Task not found' })
    res.json(task)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── STARTUP ────────────────────────────────────────────────────────────────────
async function start() {
  // Start HTTP server first so Railway healthcheck passes immediately
  await new Promise(resolve => server.listen(PORT, () => {
    console.log(`[orchestrator] HTTP+WS listening on port ${PORT}`)
    resolve()
  }))

  // subRedis and pubRedis are plain ioredis clients with lazyConnect — connect explicitly.
  // queueRedis is managed by BullMQ which connects it automatically; do NOT call connect() on it.
  await subRedis.connect()
  await pubRedis.connect()

  await subRedis.subscribe('agent-updates')
  console.log('[redis] subscribed to agent-updates')

  // Push schema to DB (creates tables without needing migration files)
  const { execSync } = require('child_process')
  try {
    execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'inherit' })
    console.log('[prisma] schema pushed successfully')
  } catch (e) {
    console.warn('[prisma] db push failed:', e.message)
  }
}

start().catch(err => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
