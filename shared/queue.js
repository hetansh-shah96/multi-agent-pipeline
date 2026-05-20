const QUEUES = {
  debugger: 'agent-debugger-queue',
  reviewer: 'agent-reviewer-queue',
  security: 'agent-security-queue',
  tests:    'agent-tests-queue',
  docs:     'agent-docs-queue',
}

const PIPELINE_QUEUES = {
  full:     ['debugger', 'reviewer', 'security', 'tests', 'docs'],
  debug:    ['debugger'],
  review:   ['reviewer'],
  security: ['security'],
  tests:    ['tests'],
  docs:     ['docs'],
}

module.exports = { QUEUES, PIPELINE_QUEUES }
