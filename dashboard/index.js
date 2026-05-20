const express = require('express')

const app  = express()
const PORT = process.env.PORT || 3000

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL || 'http://localhost:3001'
const WS_URL = ORCHESTRATOR_URL.replace(/^https/, 'wss').replace(/^http/, 'ws')

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'dashboard' }))

app.get('/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html')
  res.send(buildHTML(WS_URL, ORCHESTRATOR_URL))
})

function buildHTML(wsUrl, apiUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Agent Pipeline Dashboard</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
:root{
  --bg:#0a0a14;--card:#111827;--input:#0f172a;--border:#1e293b;
  --purple:#7c3aed;--blue:#2563eb;--green:#10b981;--yellow:#f59e0b;--red:#ef4444;
  --text:#e2e8f0;--muted:#64748b;
  --pglow:rgba(124,58,237,.3);--bglow:rgba(37,99,235,.3);
}
body{background:var(--bg);color:var(--text);font-family:'Courier New',Consolas,monospace;
     height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* ── HEADER ── */
header{background:#080810;border-bottom:1px solid var(--border);padding:10px 20px;
       display:flex;align-items:center;gap:16px;flex-shrink:0;flex-wrap:wrap}
header h1{font-size:16px;font-weight:bold;color:var(--purple);
          text-shadow:0 0 20px var(--pglow);white-space:nowrap}
.status-bar{display:flex;gap:10px;flex-wrap:wrap;flex:1}
.chip{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--muted);
      background:var(--card);border:1px solid var(--border);border-radius:20px;padding:4px 10px}
.dot{width:8px;height:8px;border-radius:50%;background:var(--green);
     box-shadow:0 0 6px var(--green);transition:all .3s;flex-shrink:0}
.dot.working{background:var(--yellow);box-shadow:0 0 6px var(--yellow);
             animation:pulse-dot .8s ease-in-out infinite alternate}
.dot.error{background:var(--red);box-shadow:0 0 6px var(--red)}
.dot.done{background:var(--blue);box-shadow:0 0 6px var(--blue)}
.dot.idle{background:var(--green);box-shadow:0 0 6px var(--green)}
@keyframes pulse-dot{from{transform:scale(1);opacity:1}to{transform:scale(1.5);opacity:.6}}
.api-badge{font-size:11px;padding:4px 10px;border-radius:20px;border:1px solid var(--border);
           background:var(--card);white-space:nowrap;color:var(--muted)}
.api-badge.valid{color:var(--green);border-color:var(--green)}
.api-badge.missing{color:var(--red);border-color:var(--red)}

/* ── MAIN ── */
.main{display:flex;flex:1;overflow:hidden}

/* ── LEFT PANEL ── */
.left{width:40%;border-right:1px solid var(--border);padding:16px;
      display:flex;flex-direction:column;gap:10px;overflow-y:auto}
.lbl{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:3px}
textarea{width:100%;min-height:180px;background:var(--input);border:1px solid var(--border);
         border-radius:6px;color:var(--text);font-family:'Courier New',monospace;font-size:12px;
         padding:10px;resize:vertical;outline:none;transition:border-color .2s;line-height:1.5}
textarea:focus{border-color:var(--purple);box-shadow:0 0 0 2px var(--pglow)}
input,select{width:100%;background:var(--input);border:1px solid var(--border);border-radius:6px;
             color:var(--text);font-family:'Courier New',monospace;font-size:13px;
             padding:9px 11px;outline:none;transition:border-color .2s}
input:focus,select:focus{border-color:var(--purple);box-shadow:0 0 0 2px var(--pglow)}
select option{background:var(--card)}
.run-btn{width:100%;padding:13px;background:linear-gradient(135deg,var(--purple),var(--blue));
         border:none;border-radius:6px;color:#fff;font-family:'Courier New',monospace;
         font-size:14px;font-weight:bold;cursor:pointer;letter-spacing:1px;
         transition:all .2s;position:relative;overflow:hidden}
.run-btn:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 20px var(--pglow)}
.run-btn:active:not(:disabled){transform:translateY(0)}
.run-btn:disabled{opacity:.5;cursor:not-allowed}
.run-btn::before{content:'';position:absolute;top:-50%;left:-50%;width:200%;height:200%;
  background:linear-gradient(45deg,transparent 30%,rgba(255,255,255,.1) 50%,transparent 70%);
  transform:translateX(-100%);transition:transform .6s}
.run-btn:not(:disabled):hover::before{transform:translateX(100%)}
.tid{font-size:10px;color:var(--muted);text-align:center;word-break:break-all}

/* ── RIGHT PANEL ── */
.right{width:60%;display:flex;flex-direction:column;overflow:hidden}

/* ── PIPELINE VIZ ── */
.viz-section{padding:14px 18px;border-bottom:1px solid var(--border);background:#08080f;flex-shrink:0}
.viz-title{font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:10px}
.pipeline{display:flex;align-items:center;gap:0;overflow-x:auto;padding:4px 0}
.vbox{display:flex;flex-direction:column;align-items:center;background:var(--card);
      border:1px solid var(--border);border-radius:8px;padding:8px 12px;min-width:80px;
      position:relative;transition:all .3s;flex-shrink:0}
.vbox.active{border-color:var(--purple);box-shadow:0 0 15px var(--pglow);background:#1a0e30}
.vbox.done{border-color:var(--blue);box-shadow:0 0 8px var(--bglow)}
.vbox.error{border-color:var(--red);box-shadow:0 0 8px rgba(239,68,68,.3)}
.vbox-icon{font-size:16px;margin-bottom:3px}
.vbox-name{font-size:9px;font-weight:bold;text-transform:uppercase;letter-spacing:.5px}
.vbox-stat{font-size:9px;color:var(--muted);margin-top:3px;text-align:center;min-height:14px}
.vbox-stat.active{color:var(--yellow);animation:blink 1s infinite}
@keyframes blink{50%{opacity:.3}}
.conn{flex-shrink:0;width:24px;height:2px;background:var(--border);position:relative;overflow:visible}
.conn.active{background:linear-gradient(90deg,var(--purple),var(--blue))}
.conn.active::after{content:'';position:absolute;top:-4px;left:-100%;width:100%;height:10px;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.8),transparent);
  animation:flow .7s linear infinite}
@keyframes flow{to{left:200%}}

/* ── TABS ── */
.tabs{display:flex;border-bottom:1px solid var(--border);background:#08080f;flex-shrink:0;overflow-x:auto}
.tab{padding:9px 14px;background:none;border:none;border-bottom:2px solid transparent;
     color:var(--muted);font-family:'Courier New',monospace;font-size:11px;cursor:pointer;
     transition:all .2s;white-space:nowrap;flex-shrink:0}
.tab:hover{color:var(--text)}
.tab.active{color:var(--purple);border-bottom-color:var(--purple)}
.tab.has-result{color:var(--blue)}
.tab.has-result.active{color:var(--purple);border-bottom-color:var(--purple)}

/* ── RESULT PANES ── */
.pane{display:none;flex:1;overflow-y:auto;padding:14px 18px}
.pane.active{display:block}
.placeholder{color:var(--muted);font-size:12px;text-align:center;margin-top:40px}
.rcard{background:var(--card);border:1px solid var(--border);border-radius:6px;
       padding:12px 14px;margin-bottom:10px}
.rcard h3{font-size:10px;text-transform:uppercase;letter-spacing:1px;color:var(--purple);margin-bottom:7px}
.rcard pre{font-size:11px;white-space:pre-wrap;word-break:break-word;line-height:1.6}
.badge{display:inline-block;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:bold;margin:2px}
.badge.critical{background:rgba(239,68,68,.15);color:var(--red);border:1px solid var(--red)}
.badge.high{background:rgba(245,158,11,.15);color:var(--yellow);border:1px solid var(--yellow)}
.badge.medium{background:rgba(59,130,246,.15);color:#60a5fa;border:1px solid #60a5fa}
.badge.low{background:rgba(16,185,129,.15);color:var(--green);border:1px solid var(--green)}
.score{font-size:38px;font-weight:bold;text-align:center;padding:8px;color:var(--purple)}
.working-row{display:flex;align-items:center;gap:8px;color:var(--yellow);font-size:12px;padding:8px}
.spinner{width:13px;height:13px;border:2px solid var(--border);border-top-color:var(--yellow);
         border-radius:50%;animation:spin .6s linear infinite;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── FOOTER ── */
footer{background:#08080f;border-top:1px solid var(--border);padding:7px 20px;
       display:flex;gap:28px;align-items:center;flex-shrink:0;flex-wrap:wrap}
.stat{font-size:11px;color:var(--muted)}
.stat span{color:var(--purple);font-weight:bold}
.ws-status{margin-left:auto;font-size:11px;display:flex;align-items:center;gap:6px}

/* scrollbar */
::-webkit-scrollbar{width:4px;height:4px}
::-webkit-scrollbar-track{background:var(--bg)}
::-webkit-scrollbar-thumb{background:var(--border);border-radius:4px}
::-webkit-scrollbar-thumb:hover{background:var(--purple)}
</style>
</head>
<body>

<header>
  <h1>⚡ Agent Pipeline Dashboard</h1>
  <div class="status-bar">
    <div class="chip"><div class="dot idle" id="dot-debugger"></div><span>Debugger</span></div>
    <div class="chip"><div class="dot idle" id="dot-reviewer"></div><span>Reviewer</span></div>
    <div class="chip"><div class="dot idle" id="dot-security"></div><span>Security</span></div>
    <div class="chip"><div class="dot idle" id="dot-tests"></div><span>Tests</span></div>
    <div class="chip"><div class="dot idle" id="dot-docs"></div><span>Docs</span></div>
  </div>
  <div class="api-badge" id="api-badge">API: checking…</div>
</header>

<div class="main">
  <!-- ── LEFT PANEL ── -->
  <div class="left">
    <div>
      <div class="lbl">Code Input</div>
      <textarea id="code" placeholder="Paste your code here…&#10;&#10;function example() {&#10;  // Your code here&#10;}"></textarea>
    </div>
    <div>
      <div class="lbl">Describe the issue or task</div>
      <input type="text" id="desc" placeholder="e.g. Why does this crash on null input?">
    </div>
    <div>
      <div class="lbl">Pipeline Type</div>
      <select id="ptype">
        <option value="full">Full Audit (all agents)</option>
        <option value="debug">Debug Only</option>
        <option value="review">Code Review Only</option>
        <option value="security">Security Audit Only</option>
        <option value="tests">Write Tests Only</option>
        <option value="docs">Write Docs Only</option>
      </select>
    </div>
    <button class="run-btn" id="run-btn" onclick="submitTask()">▶ RUN PIPELINE</button>
    <div class="tid" id="tid"></div>
  </div>

  <!-- ── RIGHT PANEL ── -->
  <div class="right">
    <!-- Pipeline visualization -->
    <div class="viz-section">
      <div class="viz-title">Pipeline Flow</div>
      <div class="pipeline">
        <div class="vbox" id="vb-orchestrator">
          <div class="vbox-icon">⚡</div>
          <div class="vbox-name">Orchestrator</div>
          <div class="vbox-stat" id="vs-orchestrator">Ready</div>
        </div>
        <div class="conn" id="cn-debugger"></div>
        <div class="vbox" id="vb-debugger">
          <div class="vbox-icon">🔍</div>
          <div class="vbox-name">Debugger</div>
          <div class="vbox-stat" id="vs-debugger">Idle</div>
        </div>
        <div class="conn" id="cn-reviewer"></div>
        <div class="vbox" id="vb-reviewer">
          <div class="vbox-icon">👁</div>
          <div class="vbox-name">Reviewer</div>
          <div class="vbox-stat" id="vs-reviewer">Idle</div>
        </div>
        <div class="conn" id="cn-security"></div>
        <div class="vbox" id="vb-security">
          <div class="vbox-icon">🔒</div>
          <div class="vbox-name">Security</div>
          <div class="vbox-stat" id="vs-security">Idle</div>
        </div>
        <div class="conn" id="cn-tests"></div>
        <div class="vbox" id="vb-tests">
          <div class="vbox-icon">🧪</div>
          <div class="vbox-name">Tests</div>
          <div class="vbox-stat" id="vs-tests">Idle</div>
        </div>
        <div class="conn" id="cn-docs"></div>
        <div class="vbox" id="vb-docs">
          <div class="vbox-icon">📚</div>
          <div class="vbox-name">Docs</div>
          <div class="vbox-stat" id="vs-docs">Idle</div>
        </div>
      </div>
    </div>

    <!-- Tabs + result panes -->
    <div class="tabs">
      <button class="tab active" id="tb-debugger"  onclick="showTab('debugger')">🔍 Debugger</button>
      <button class="tab"        id="tb-reviewer"  onclick="showTab('reviewer')">👁 Reviewer</button>
      <button class="tab"        id="tb-security"  onclick="showTab('security')">🔒 Security</button>
      <button class="tab"        id="tb-tests"     onclick="showTab('tests')">🧪 Tests</button>
      <button class="tab"        id="tb-docs"      onclick="showTab('docs')">📚 Docs</button>
    </div>
    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column">
      <div class="pane active" id="pane-debugger"><div class="placeholder">Submit code to see debugger results</div></div>
      <div class="pane"        id="pane-reviewer"><div class="placeholder">Submit code to see reviewer results</div></div>
      <div class="pane"        id="pane-security"><div class="placeholder">Submit code to see security results</div></div>
      <div class="pane"        id="pane-tests"   ><div class="placeholder">Submit code to see generated tests</div></div>
      <div class="pane"        id="pane-docs"    ><div class="placeholder">Submit code to see generated docs</div></div>
    </div>
  </div>
</div>

<footer>
  <div class="stat">Tokens: <span id="total-tokens">0</span></div>
  <div class="stat">Est. Cost: $<span id="total-cost">0.0000</span></div>
  <div class="stat">Runs Today: <span id="run-count">0</span></div>
  <div class="ws-status">
    <div class="dot" id="ws-dot" style="background:var(--muted);box-shadow:none"></div>
    <span id="ws-label" style="color:var(--muted);font-size:11px">Connecting…</span>
  </div>
</footer>

<script>
const WS_URL  = '${wsUrl}'
const API_URL = '${apiUrl}'

const AGENTS = ['debugger','reviewer','security','tests','docs']
const COST_PER_TOKEN = 0.000003   // ~$3 / M tokens (Sonnet estimate)

let ws             = null
let currentTaskId  = null
let sessionTokens  = 0
let pollTimer      = null
let runCount       = parseInt(localStorage.getItem('runs') || '0')

// ── INIT ──────────────────────────────────────────────────────────────────────
document.getElementById('run-count').textContent = runCount
connectWS()
checkApiStatus()

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
function connectWS() {
  try {
    ws = new WebSocket(WS_URL)
    ws.onopen    = () => setWsStatus(true)
    ws.onclose   = () => { setWsStatus(false); setTimeout(connectWS, 3000) }
    ws.onerror   = () => setWsStatus(false)
    ws.onmessage = (e) => { try { handleMsg(JSON.parse(e.data)) } catch(_){} }
  } catch(_) {
    setWsStatus(false)
    setTimeout(connectWS, 3000)
  }
}

function setWsStatus(ok) {
  const dot = document.getElementById('ws-dot')
  const lbl = document.getElementById('ws-label')
  if (ok) {
    dot.style.background = 'var(--green)'; dot.style.boxShadow = '0 0 6px var(--green)'
    lbl.textContent = 'Live'; lbl.style.color = 'var(--green)'
  } else {
    dot.style.background = 'var(--red)'; dot.style.boxShadow = 'none'
    lbl.textContent = 'Disconnected'; lbl.style.color = 'var(--red)'
  }
}

function handleMsg(msg) {
  if (msg.taskId && msg.taskId !== currentTaskId) return
  if (msg.type === 'agent_status') setAgentStatus(msg.agent, msg.status)
  if (msg.type === 'agent_result') {
    finishAgent(msg.agent, msg.data, msg.tokensUsed, msg.durationMs)
    addTokens(msg.tokensUsed || 0)
  }
  if (msg.type === 'task_complete') finishTask()
}

// ── SUBMIT ────────────────────────────────────────────────────────────────────
async function submitTask() {
  const code = document.getElementById('code').value.trim()
  const desc = document.getElementById('desc').value.trim()
  const type = document.getElementById('ptype').value
  if (!code) { alert('Paste some code first'); return }

  resetPipeline(type)
  setBtnState('running')

  try {
    const r    = await fetch(API_URL + '/task', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, description: desc, type })
    })
    const data = await r.json()
    if (!r.ok) throw new Error(data.error || 'Server error')

    currentTaskId = data.taskId
    document.getElementById('tid').textContent = 'Task: ' + data.taskId

    runCount++
    localStorage.setItem('runs', runCount)
    document.getElementById('run-count').textContent = runCount

    setVizBox('orchestrator', 'active', 'Routing…')

    // polling fallback if WS drops
    if (pollTimer) clearInterval(pollTimer)
    pollTimer = setInterval(() => pollTask(data.taskId), 4000)
  } catch(e) {
    setBtnState('idle')
    alert('Failed: ' + e.message)
  }
}

async function pollTask(taskId) {
  try {
    const r    = await fetch(API_URL + '/task/' + taskId)
    const data = await r.json()
    if (!data.results) return
    data.results.forEach(r => {
      if (r.status === 'working')                 setAgentStatus(r.agentName, 'working')
      if (r.status === 'done' && r.output)        finishAgent(r.agentName, r.output, r.tokensUsed, r.durationMs)
      if (r.status === 'error')                   setAgentStatus(r.agentName, 'error')
    })
    if (data.status === 'complete') { clearInterval(pollTimer); finishTask() }
  } catch(_) {}
}

// ── PIPELINE STATE ────────────────────────────────────────────────────────────
function resetPipeline(type) {
  const active = pipelineAgents(type)
  AGENTS.forEach(a => {
    const isActive = active.includes(a)
    setDot(a, 'idle')
    setVizBox(a, '', 'Idle')
    setConn(a, false)
    document.getElementById('pane-' + a).innerHTML =
      isActive
        ? '<div class="working-row"><div class="spinner"></div><span>Queued…</span></div>'
        : '<div class="placeholder">Not included in this pipeline</div>'
    document.getElementById('tb-' + a).classList.remove('has-result')
  })
  setVizBox('orchestrator', '', 'Ready')
}

function pipelineAgents(type) {
  const map = {
    full:['debugger','reviewer','security','tests','docs'],
    debug:['debugger'], review:['reviewer'], security:['security'],
    tests:['tests'], docs:['docs']
  }
  return map[type] || map.full
}

function setAgentStatus(agent, status) {
  setDot(agent, status)
  if (status === 'working') {
    setVizBox(agent, 'active', 'Working…')
    setConn(agent, true)
    document.getElementById('pane-' + agent).innerHTML =
      '<div class="working-row"><div class="spinner"></div><span>Analyzing your code…</span></div>'
  } else if (status === 'error') {
    setVizBox(agent, 'error', 'Error')
    setConn(agent, false)
  }
}

function finishAgent(agent, output, tokensUsed, durationMs) {
  setDot(agent, 'done')
  const tk = tokensUsed || 0
  const ms = durationMs || 0
  setVizBox(agent, 'done', tk.toLocaleString() + 'tk · ' + (ms/1000).toFixed(1) + 's')
  setConn(agent, false)
  document.getElementById('tb-' + agent).classList.add('has-result')
  renderResult(agent, output)
  setBtnState('idle')
}

function finishTask() {
  if (pollTimer) clearInterval(pollTimer)
  setVizBox('orchestrator', 'done', 'Complete')
  setBtnState('idle')
}

// ── DOM HELPERS ───────────────────────────────────────────────────────────────
function setDot(agent, status) {
  const el = document.getElementById('dot-' + agent)
  if (el) el.className = 'dot ' + status
}
function setVizBox(agent, cls, stat) {
  const box = document.getElementById('vb-' + agent)
  const st  = document.getElementById('vs-' + agent)
  if (!box) return
  box.className = 'vbox' + (cls ? ' ' + cls : '')
  st.textContent = stat
  st.className   = 'vbox-stat' + (cls === 'active' ? ' active' : '')
}
function setConn(agent, active) {
  const el = document.getElementById('cn-' + agent)
  if (el) el.className = 'conn' + (active ? ' active' : '')
}
function setBtnState(state) {
  const btn = document.getElementById('run-btn')
  if (state === 'running') { btn.disabled = true;  btn.textContent = '⏳ Running…' }
  else                     { btn.disabled = false; btn.textContent = '▶ RUN PIPELINE' }
}
function addTokens(n) {
  sessionTokens += n
  document.getElementById('total-tokens').textContent = sessionTokens.toLocaleString()
  document.getElementById('total-cost').textContent   = (sessionTokens * COST_PER_TOKEN).toFixed(4)
}
function showTab(agent) {
  document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'))
  document.querySelectorAll('.tab').forEach(t  => t.classList.remove('active'))
  document.getElementById('pane-' + agent).classList.add('active')
  document.getElementById('tb-'   + agent).classList.add('active')
}

// ── RESULT RENDERERS ──────────────────────────────────────────────────────────
function renderResult(agent, out) {
  if (!out) return
  const pane = document.getElementById('pane-' + agent)
  const html = {
    debugger: renderDebugger,
    reviewer: renderReviewer,
    security: renderSecurity,
    tests:    renderTests,
    docs:     renderDocs,
  }[agent]
  if (html) pane.innerHTML = html(out)
}

function renderDebugger(o) {
  return card('Root Cause', x(o.rootCause)) +
         card('Severity & Explanation',
               '<span class="badge ' + sev(o.severity) + '">' + x(o.severity) + '</span><br><pre style="margin-top:6px">' + x(o.explanation) + '</pre>') +
         card('Suggested Fix', '<pre>' + x(o.fix) + '</pre>')
}
function renderReviewer(o) {
  const sc = o.score || 0
  const col = sc >= 8 ? 'var(--green)' : sc >= 5 ? 'var(--yellow)' : 'var(--red)'
  return '<div class="rcard"><h3>Code Score</h3><div class="score" style="color:' + col + '">' +
         sc + '<span style="font-size:16px;color:var(--muted)">/10</span></div></div>' +
         issueCard('Critical Issues', o.criticals, 'critical') +
         issueCard('Warnings',        o.warnings,  'high') +
         issueCard('Suggestions',     o.suggestions,'medium')
}
function renderSecurity(o) {
  return issueCard('Critical', o.critical, 'critical') +
         issueCard('High',     o.high,     'high') +
         issueCard('Medium',   o.medium,   'medium') +
         issueCard('Low',      o.low,      'low')
}
function renderTests(o) {
  return card('Framework: ' + x(o.framework) + ' · Est. Coverage: ' + x(String(o.estimatedCoverage || 'N/A')),
              '<pre>' + x(o.testCode) + '</pre>')
}
function renderDocs(o) {
  return card('Summary', '<pre>' + x(o.summary) + '</pre>') +
         card('JSDoc',   '<pre>' + x(o.jsdoc)   + '</pre>') +
         card('README',  '<pre>' + x(o.readme)  + '</pre>')
}

function card(title, body) {
  return '<div class="rcard"><h3>' + title + '</h3>' + body + '</div>'
}
function issueCard(title, items, severity) {
  const list = Array.isArray(items) && items.length
    ? items.map(i => '<pre>• ' + x(i) + '</pre>').join('')
    : '<pre style="color:var(--muted)">None found ✓</pre>'
  const count = Array.isArray(items) ? items.length : 0
  return card(title + ' <span class="badge ' + severity + '">' + count + '</span>', list)
}

function sev(s) {
  return { critical:'critical', high:'high', medium:'medium', low:'low' }[(s||'').toLowerCase()] || 'medium'
}
function x(s) {
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
}

// ── API STATUS ────────────────────────────────────────────────────────────────
async function checkApiStatus() {
  try {
    const r = await fetch(API_URL + '/agents/status')
    const d = await r.json()
    const badge = document.getElementById('api-badge')
    if (d.apiKey === 'valid') {
      badge.textContent = 'API Key: Valid ✓'; badge.className = 'api-badge valid'
    } else {
      badge.textContent = 'API Key: Missing ✗'; badge.className = 'api-badge missing'
    }
  } catch(_) {
    document.getElementById('api-badge').textContent = 'API: Unreachable'
  }
}
</script>
</body>
</html>`
}

app.listen(PORT, () => console.log(`[dashboard] listening on port ${PORT}`))
