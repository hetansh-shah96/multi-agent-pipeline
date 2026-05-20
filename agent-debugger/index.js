const { Worker }       = require('bullmq')
const IORedis          = require('ioredis')
const Anthropic        = require('@anthropic-ai/sdk')
const { PrismaClient } = require('@prisma/client')
const express          = require('express')

const AGENT_NAME  = 'debugger'
const QUEUE_NAME  = 'agent-debugger-queue'
const MODEL       = 'claude-sonnet-4-5'

const prisma      = new PrismaClient()
const anthropic   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const redisOpts = { maxRetriesPerRequest: null, enableReadyCheck: false }
const workerRedis = new IORedis(process.env.REDIS_URL, redisOpts)
const pubRedis    = new IORedis(process.env.REDIS_URL, redisOpts)

const SYSTEM_PROMPT = `You are an expert code debugger and software engineer.
Analyze the provided code for bugs, logic errors, runtime issues, and potential crashes.
Identify the root cause clearly and provide a concrete fix.

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
{
  "rootCause": "string — concise description of the primary bug or issue",
  "fix": "string — the corrected code or step-by-step fix instructions",
  "severity": "critical | high | medium | low",
  "explanation": "string — detailed explanation of why this is a problem and how the fix resolves it"
}`

async function publish(payload) {
  await pubRedis.publish('agent-updates', JSON.stringify(payload))
}

async function setStatus(taskId, status) {
  await prisma.agentResult.upsert({
    where:  { taskId_agentName: { taskId, agentName: AGENT_NAME } },
    update: { status },
    create: { taskId, agentName: AGENT_NAME, status },
  })
  await publish({ type: 'agent_status', agent: AGENT_NAME, status, taskId })
}

const worker = new Worker(QUEUE_NAME, async (job) => {
  const { taskId, code, description } = job.data
  const startTime = Date.now()

  await setStatus(taskId, 'working')

  const userContent =
    `Code to debug:\n\`\`\`\n${code}\n\`\`\`\n\nTask: ${description || 'Find all bugs and issues'}`

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 2048,
    system:     SYSTEM_PROMPT,
    messages:   [{ role: 'user', content: userContent }],
  })

  const tokensUsed = response.usage.input_tokens + response.usage.output_tokens
  const durationMs = Date.now() - startTime
  const rawText    = response.content[0].text

  let output
  try {
    output = JSON.parse(rawText)
  } catch (_) {
    output = { rootCause: rawText, fix: '', severity: 'unknown', explanation: '' }
  }

  await prisma.agentResult.upsert({
    where:  { taskId_agentName: { taskId, agentName: AGENT_NAME } },
    update: { status: 'done', output, tokensUsed, durationMs },
    create: { taskId, agentName: AGENT_NAME, status: 'done', output, tokensUsed, durationMs },
  })

  await publish({ type: 'agent_result', agent: AGENT_NAME, taskId, data: output, tokensUsed, durationMs })

  console.log(`[${AGENT_NAME}] task ${taskId} done in ${durationMs}ms (${tokensUsed} tokens)`)
  return output
}, { connection: workerRedis, concurrency: 2 })

worker.on('failed', async (job, err) => {
  console.error(`[${AGENT_NAME}] job failed:`, err.message)
  if (!job?.data?.taskId) return
  const { taskId } = job.data
  await prisma.agentResult.upsert({
    where:  { taskId_agentName: { taskId, agentName: AGENT_NAME } },
    update: { status: 'error' },
    create: { taskId, agentName: AGENT_NAME, status: 'error' },
  }).catch(() => {})
  await publish({ type: 'agent_status', agent: AGENT_NAME, status: 'error', taskId }).catch(() => {})
})

// Minimal HTTP server for Railway health checks
const app = express()
app.get('/health', (_req, res) => res.json({ status: 'ok', agent: AGENT_NAME }))
app.listen(process.env.PORT || 3000, () =>
  console.log(`[${AGENT_NAME}] worker started, health check on port ${process.env.PORT || 3000}`)
)
