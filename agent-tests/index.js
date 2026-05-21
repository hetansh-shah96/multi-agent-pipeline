const { Worker }       = require('bullmq')
const IORedis          = require('ioredis')
const Anthropic        = require('@anthropic-ai/sdk')
const { PrismaClient } = require('@prisma/client')
const express          = require('express')

const AGENT_NAME  = 'tests'
const QUEUE_NAME  = 'agent-tests-queue'
const MODEL       = 'claude-sonnet-4-5'

const prisma      = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } })
const anthropic   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const redisOpts = { maxRetriesPerRequest: null, enableReadyCheck: false }
const workerRedis = new IORedis(process.env.REDIS_URL, redisOpts)
const pubRedis    = new IORedis(process.env.REDIS_URL, redisOpts)

const SYSTEM_PROMPT = `You are an expert software engineer specializing in test-driven development.
Write comprehensive test suites for the provided code covering happy paths, edge cases, and error conditions.
Choose the most appropriate testing framework based on the language and context.

Respond ONLY with valid JSON matching this exact schema (no markdown, no extra text):
{
  "testCode": "string — the complete test file content, ready to run",
  "framework": "string — name of the test framework used (e.g. Jest, Mocha, Pytest, JUnit)",
  "estimatedCoverage": "string — estimated line coverage percentage (e.g. '85%')"
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
    `Code to write tests for:\n\`\`\`\n${code}\n\`\`\`\n\nContext: ${description || 'Write comprehensive tests'}`

  const response = await anthropic.messages.create({
    model:      MODEL,
    max_tokens: 4096,
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
    output = { testCode: rawText, framework: 'unknown', estimatedCoverage: 'N/A' }
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

const app = express()
app.get('/health', (_req, res) => res.json({ status: 'ok', agent: AGENT_NAME }))
app.listen(process.env.PORT || 3000, () =>
  console.log(`[${AGENT_NAME}] worker started, health check on port ${process.env.PORT || 3000}`)
)
