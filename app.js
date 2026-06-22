// ── Storage ─────────────────────────────────────────────────────────────────

const DB = (() => {
  const get = k => JSON.parse(localStorage.getItem(k) || 'null')
  const set = (k, v) => localStorage.setItem(k, JSON.stringify(v))
  return {
    projects:     ()  => get('tc_projects') || [],
    saveProjects: v   => set('tc_projects', v),
    entries:      ()  => get('tc_entries')  || [],
    saveEntries:  v   => set('tc_entries', v),
  }
})()

// ── Helpers ──────────────────────────────────────────────────────────────────

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2)
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`
}

function fmtHours(ms) {
  return (ms / 3600000).toFixed(2) + 'h'
}

function fmtMoney(n) {
  return '$' + n.toFixed(2)
}

function fmtDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function fmtTime(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function calcEarnings(ms, rate) {
  return (ms / 3600000) * rate
}

const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#db2777','#0891b2','#059669']

function randomColor() {
  return COLORS[Math.floor(Math.random() * COLORS.length)]
}

// ── State ────────────────────────────────────────────────────────────────────

let currentView      = 'clock'
let timerInterval    = null
let logFilter        = 'all'
let summaryFilter    = 'week'
let byDayWeekOffset  = 0
let weeklySummaryText = ''

// ── Navigation ───────────────────────────────────────────────────────────────

function showView(name) {
  currentView = name
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'))
  document.getElementById('view-' + name).classList.add('active')
  document.querySelectorAll('#bottom-nav button').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name)
  })
  render()
}

document.querySelectorAll('#bottom-nav button').forEach(b => {
  b.addEventListener('click', () => showView(b.dataset.view))
})

// ── Clock View ───────────────────────────────────────────────────────────────

function renderClock() {
  const entries  = DB.entries()
  const active   = entries.find(e => !e.end)
  const projects = DB.projects()
  const view     = document.getElementById('view-clock')

  if (active) {
    const project = projects.find(p => p.id === active.projectId)
    const elapsed = Date.now() - active.start
    view.innerHTML = `
      <div class="clock-status">
        <div class="clock-badge in">Clocked In</div>
        <div class="clock-timer" id="clock-timer">${fmtDuration(elapsed)}</div>
        <div class="clock-project-name">${project ? project.name : 'Unknown Project'}</div>
        <div class="clock-earnings" id="clock-earnings">${project ? fmtMoney(calcEarnings(elapsed, project.rate)) : ''}</div>
        <button class="btn btn-danger" id="btn-clockout">Clock Out</button>
      </div>
    `
    document.getElementById('btn-clockout').addEventListener('click', clockOut)
    startTimer(active, project)
  } else {
    stopTimer()
    view.innerHTML = `
      <div class="clock-status">
        <div class="clock-badge out">Clocked Out</div>
        <div class="clock-timer">00:00:00</div>
        ${projects.length === 0
          ? `<div class="clock-project-name" style="margin-bottom:36px">Add a project to get started</div>
             <button class="btn btn-ghost" onclick="showView('projects')">Go to Projects</button>`
          : `<div class="clock-project-name" style="margin-bottom:36px">Select a project to start</div>
             <div class="select-wrapper">
               <select id="project-select">
                 <option value="">— choose project —</option>
                 ${projects.map(p => `<option value="${p.id}">${p.name} (${fmtMoney(p.rate)}/hr)</option>`).join('')}
               </select>
             </div>
             <button class="btn btn-success" id="btn-clockin">Clock In</button>`
        }
      </div>
    `
    const btn = document.getElementById('btn-clockin')
    if (btn) {
      btn.addEventListener('click', () => {
        const sel = document.getElementById('project-select')
        if (!sel.value) { sel.classList.add('input-error'); return }
        clockIn(sel.value)
      })
    }
  }
}

function startTimer(entry, project) {
  stopTimer()
  timerInterval = setInterval(() => {
    const elapsed    = Date.now() - entry.start
    const timerEl    = document.getElementById('clock-timer')
    const earningsEl = document.getElementById('clock-earnings')
    if (timerEl)    timerEl.textContent    = fmtDuration(elapsed)
    if (earningsEl && project) earningsEl.textContent = fmtMoney(calcEarnings(elapsed, project.rate))
  }, 1000)
}

function stopTimer() {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
}

function clockIn(projectId) {
  const entries = DB.entries()
  entries.push({ id: uid(), projectId, start: Date.now(), end: null })
  DB.saveEntries(entries)
  renderClock()
}

function clockOut() {
  const entries = DB.entries()
  const idx = entries.findIndex(e => !e.end)
  if (idx === -1) return
  entries[idx].end = Date.now()
  DB.saveEntries(entries)
  renderClock()
}

// ── Projects View ─────────────────────────────────────────────────────────────

function renderProjects() {
  const projects = DB.projects()
  const view     = document.getElementById('view-projects')

  view.innerHTML = `
    <div class="section-header">
      <span class="section-title">Projects</span>
      <button class="btn btn-primary btn-sm" id="btn-add-project">+ Add</button>
    </div>
    ${projects.length === 0
      ? `<div class="empty">
           <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
             <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
           </svg>
           <div class="empty-text">No projects yet. Add one to start tracking.</div>
         </div>`
      : projects.map(p => `
          <div class="card">
            <div class="project-item">
              <div class="project-dot" style="background:${p.color}"></div>
              <div class="project-info">
                <div class="project-name">${p.name}</div>
                <div class="project-rate">${fmtMoney(p.rate)}/hr</div>
              </div>
              <div class="project-actions">
                <button class="btn btn-ghost btn-sm" onclick="editProject('${p.id}')">Edit</button>
                <button class="btn btn-danger btn-sm" onclick="deleteProject('${p.id}')">Delete</button>
              </div>
            </div>
          </div>
        `).join('')
    }
    <div class="section-header" style="margin-top:20px">
      <span class="section-title">Data</span>
    </div>
    <div class="data-actions">
      <button class="btn btn-ghost" onclick="exportData()">Export</button>
      <button class="btn btn-ghost" onclick="importData()">Import</button>
    </div>
  `
  document.getElementById('btn-add-project').addEventListener('click', () => showProjectModal())
}

function showProjectModal(id = null) {
  const project = id ? DB.projects().find(p => p.id === id) : null
  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${project ? 'Edit Project' : 'New Project'}</div>
      <div class="form-group">
        <label>Project Name</label>
        <input type="text" id="f-name" value="${project ? escHtml(project.name) : ''}" placeholder="e.g. Web Design" autocomplete="off">
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>Hourly Rate ($)</label>
          <input type="number" id="f-rate" value="${project ? project.rate : ''}" placeholder="0.00" min="0" step="0.01">
        </div>
        <div class="form-group">
          <label>Color</label>
          <input type="color" id="f-color" value="${project ? project.color : randomColor()}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="btn-cancel">Cancel</button>
        <button class="btn btn-primary" id="btn-save">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  const nameEl = document.getElementById('f-name')
  const rateEl = document.getElementById('f-rate')

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('btn-cancel').addEventListener('click', () => overlay.remove())
  document.getElementById('btn-save').addEventListener('click', () => {
    const name  = nameEl.value.trim()
    const rate  = parseFloat(rateEl.value)
    const color = document.getElementById('f-color').value

    let valid = true
    if (!name)            { nameEl.classList.add('input-error'); valid = false }
    if (isNaN(rate) || rate < 0) { rateEl.classList.add('input-error'); valid = false }
    if (!valid) return

    const projects = DB.projects()
    if (project) {
      const idx = projects.findIndex(p => p.id === id)
      projects[idx] = { ...projects[idx], name, rate, color }
    } else {
      projects.push({ id: uid(), name, rate, color })
    }
    DB.saveProjects(projects)
    overlay.remove()
    renderProjects()
  })

  nameEl.focus()
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

window.editProject   = id => showProjectModal(id)
window.deleteProject = id => {
  if (!confirm('Delete this project? Time entries will remain in the log.')) return
  DB.saveProjects(DB.projects().filter(p => p.id !== id))
  renderProjects()
}

// ── Log View ──────────────────────────────────────────────────────────────────

function renderLog() {
  const projects = DB.projects()
  const view     = document.getElementById('view-log')

  let entries = DB.entries().filter(e => e.end).reverse()

  if (logFilter !== 'all') {
    const days = logFilter === 'week' ? 7 : 30
    const cutoff = Date.now() - days * 86400000
    entries = entries.filter(e => e.start >= cutoff)
  }

  view.innerHTML = `
    <div class="section-header">
      <span class="section-title">Time Log</span>
    </div>
    <div class="tabs">
      ${['all','week','month'].map(f => `
        <button class="tab${logFilter===f?' active':''}" onclick="setLogFilter('${f}')">
          ${f==='all'?'All Time':f==='week'?'This Week':'This Month'}
        </button>
      `).join('')}
    </div>
    ${entries.length === 0
      ? `<div class="empty">
           <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
             <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
           </svg>
           <div class="empty-text">No time entries for this period.</div>
         </div>`
      : entries.map(e => {
          const project = projects.find(p => p.id === e.projectId)
          const dur     = e.end - e.start
          return `
            <div class="card">
              <div class="entry-item">
                <div class="entry-left">
                  <div class="entry-project" style="color:${project ? project.color : 'var(--muted)'}">
                    ${project ? escHtml(project.name) : 'Deleted Project'}
                  </div>
                  <div class="entry-date">${fmtDate(e.start)}</div>
                  <div class="entry-time-range">${fmtTime(e.start)} – ${fmtTime(e.end)}</div>
                </div>
                <div class="entry-right">
                  <div class="entry-duration">${fmtDuration(dur)}</div>
                  <div class="entry-earnings">${project ? fmtMoney(calcEarnings(dur, project.rate)) : '—'}</div>
                  <div class="entry-actions">
                    <button class="btn btn-ghost btn-sm" onclick="editEntry('${e.id}')">Edit</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteEntry('${e.id}')">Remove</button>
                  </div>
                </div>
              </div>
            </div>
          `
        }).join('')
    }
  `
}

window.setLogFilter = f => { logFilter = f; renderLog() }
window.deleteEntry  = id => {
  if (!confirm('Remove this time entry?')) return
  DB.saveEntries(DB.entries().filter(e => e.id !== id))
  renderLog()
}

function showEntryModal(id) {
  const entry    = DB.entries().find(e => e.id === id)
  if (!entry) return
  const projects = DB.projects()

  const toLocal = ts => {
    const d = new Date(ts)
    const p = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
  }

  const overlay = document.createElement('div')
  overlay.className = 'modal-overlay'
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">Edit Entry</div>
      <div class="form-group">
        <label>Project</label>
        <div class="select-wrapper">
          <select id="ef-project">
            ${projects.map(p => `<option value="${p.id}"${p.id === entry.projectId ? ' selected' : ''}>${escHtml(p.name)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="form-group">
        <label>Start</label>
        <input type="datetime-local" id="ef-start" value="${toLocal(entry.start)}">
      </div>
      <div class="form-group">
        <label>End</label>
        <input type="datetime-local" id="ef-end" value="${toLocal(entry.end)}">
      </div>
      <div class="modal-actions">
        <button class="btn btn-ghost" id="ef-cancel">Cancel</button>
        <button class="btn btn-primary" id="ef-save">Save</button>
      </div>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove() })
  document.getElementById('ef-cancel').addEventListener('click', () => overlay.remove())
  document.getElementById('ef-save').addEventListener('click', () => {
    const projectId = document.getElementById('ef-project').value
    const startEl   = document.getElementById('ef-start')
    const endEl     = document.getElementById('ef-end')
    const start     = new Date(startEl.value).getTime()
    const end       = new Date(endEl.value).getTime()

    let valid = true
    if (!startEl.value || isNaN(start)) { startEl.classList.add('input-error'); valid = false }
    if (!endEl.value   || isNaN(end))   { endEl.classList.add('input-error');   valid = false }
    if (valid && end <= start)          { endEl.classList.add('input-error');   valid = false }
    if (!valid) return

    const entries = DB.entries()
    const idx = entries.findIndex(e => e.id === id)
    if (idx !== -1) entries[idx] = { ...entries[idx], projectId, start, end }
    DB.saveEntries(entries)
    overlay.remove()
    renderLog()
  })
}

window.editEntry = id => showEntryModal(id)

// ── Summary View ──────────────────────────────────────────────────────────────

function weeklySummaryHtml() {
  const projects   = DB.projects()
  const entries    = DB.entries().filter(e => e.end)

  const now        = new Date()
  const dow        = now.getDay()
  const daysFromMon = dow === 0 ? 6 : dow - 1
  const monday     = new Date(now)
  monday.setDate(now.getDate() - daysFromMon + byDayWeekOffset * 7)
  monday.setHours(0, 0, 0, 0)
  const nextMonday = new Date(monday)
  nextMonday.setDate(monday.getDate() + 7)

  const sunday = new Date(nextMonday)
  sunday.setDate(nextMonday.getDate() - 1)
  const fmt = d => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const weekLabel = `${fmt(monday)} – ${fmt(sunday)}`

  const weekNavHtml = `
    <div class="week-nav">
      <button class="btn btn-ghost btn-sm" onclick="shiftByDayWeek(-1)">&#8249; Prev</button>
      <span class="week-nav-label">${weekLabel}</span>
      <button class="btn btn-ghost btn-sm" onclick="shiftByDayWeek(1)"${byDayWeekOffset >= 0 ? ' disabled' : ''}>Next &#8250;</button>
    </div>
  `

  const weekEntries = entries.filter(e => e.start >= monday.getTime() && e.start < nextMonday.getTime())

  const DAY_NAMES  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
  const WEEK_ORDER = [1,2,3,4,5,6,0]

  const byDay = {}
  weekEntries.forEach(e => {
    const d       = new Date(e.start).getDay()
    const project = projects.find(p => p.id === e.projectId)
    if (!byDay[d]) byDay[d] = {}
    if (!byDay[d][e.projectId]) {
      byDay[d][e.projectId] = { name: project ? project.name : 'Deleted Project', rate: project ? project.rate : 0, ms: 0 }
    }
    byDay[d][e.projectId].ms += (e.end - e.start)
  })

  const dayKeys = WEEK_ORDER.filter(d => byDay[d])

  if (!dayKeys.length) {
    return weekNavHtml + `<div class="empty">
      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
        <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
      </svg>
      <div class="empty-text">No entries for this week.</div>
    </div>`
  }

  const n = v => parseFloat(v.toFixed(2)).toString()

  let total  = 0
  const textLines = []

  dayKeys.forEach(d => {
    textLines.push(DAY_NAMES[d])
    Object.values(byDay[d]).forEach(p => {
      const hrs  = Math.round(p.ms / 36000) / 100
      const earn = Math.round(hrs * p.rate * 100) / 100
      total += earn
      textLines.push(`${n(hrs)} ${hrs === 1 ? 'hour' : 'hours'} ${p.name} $${n(p.rate)}/hr = $${n(earn)}`)
    })
    textLines.push('')
  })

  const totalRounded = Math.round(total * 100) / 100
  textLines.push(`total: $${n(totalRounded)}`)

  weeklySummaryText = textLines.join('\n')
  return weekNavHtml + `
    <div class="card wsum-card">
      <pre class="wsum-pre">${escHtml(weeklySummaryText)}</pre>
    </div>
    <button class="btn btn-ghost wsum-copy" onclick="copyWeeklySummary()">Copy to Clipboard</button>
    <div class="wsum-copied" id="wsum-copied">Copied!</div>
  `
}

function renderSummary() {
  const projects = DB.projects()
  const view     = document.getElementById('view-summary')

  const tabsHtml = `
    <div class="section-header">
      <span class="section-title">Summary</span>
    </div>
    <div class="tabs">
      ${['week','month','all','weekly'].map(f => `
        <button class="tab${summaryFilter===f?' active':''}" onclick="setSummaryFilter('${f}')">
          ${f==='week'?'This Week':f==='month'?'This Month':f==='all'?'All Time':'By Day'}
        </button>
      `).join('')}
    </div>
  `

  if (summaryFilter === 'weekly') {
    view.innerHTML = tabsHtml + weeklySummaryHtml()
    return
  }

  let entries = DB.entries().filter(e => e.end)

  if (summaryFilter !== 'all') {
    const days = summaryFilter === 'week' ? 7 : 30
    const cutoff = Date.now() - days * 86400000
    entries = entries.filter(e => e.start >= cutoff)
  }

  const byProject = {}
  entries.forEach(e => {
    const dur     = e.end - e.start
    const project = projects.find(p => p.id === e.projectId)
    if (!byProject[e.projectId]) {
      byProject[e.projectId] = {
        name:     project ? project.name  : 'Deleted Project',
        color:    project ? project.color : 'var(--muted)',
        rate:     project ? project.rate  : 0,
        ms:       0,
        earnings: 0,
      }
    }
    byProject[e.projectId].ms       += dur
    byProject[e.projectId].earnings += calcEarnings(dur, byProject[e.projectId].rate)
  })

  const rows          = Object.values(byProject).sort((a, b) => b.earnings - a.earnings)
  const totalMs       = rows.reduce((s, r) => s + r.ms, 0)
  const totalEarnings = rows.reduce((s, r) => s + r.earnings, 0)

  const contentHtml = rows.length === 0
    ? `<div class="empty">
         <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
           <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
         </svg>
         <div class="empty-text">No data for this period.</div>
       </div>`
    : `<div class="card">
         ${rows.map(r => `
           <div class="summary-row">
             <div style="display:flex;align-items:center;gap:10px">
               <div class="project-dot" style="background:${r.color}"></div>
               <div>
                 <div style="font-weight:600">${escHtml(r.name)}</div>
                 <div style="font-size:12px;color:var(--muted)">${fmtHours(r.ms)} &middot; ${fmtMoney(r.rate)}/hr</div>
               </div>
             </div>
             <div style="font-weight:700;color:var(--green)">${fmtMoney(r.earnings)}</div>
           </div>
         `).join('')}
         <div class="summary-total">
           <div>Total &nbsp;<span style="font-size:14px;font-weight:400;color:var(--muted)">${fmtHours(totalMs)}</span></div>
           <div style="color:var(--green)">${fmtMoney(totalEarnings)}</div>
         </div>
       </div>`

  view.innerHTML = tabsHtml + contentHtml
}

window.setSummaryFilter = f => { summaryFilter = f; renderSummary() }
window.shiftByDayWeek  = d => { byDayWeekOffset = Math.min(0, byDayWeekOffset + d); renderSummary() }

window.copyWeeklySummary = () => {
  navigator.clipboard.writeText(weeklySummaryText).then(() => {
    const el = document.getElementById('wsum-copied')
    if (!el) return
    el.classList.add('visible')
    setTimeout(() => el.classList.remove('visible'), 2000)
  })
}

// ── Import / Export ───────────────────────────────────────────────────────────

window.exportData = () => {
  const payload = JSON.stringify({ projects: DB.projects(), entries: DB.entries() }, null, 2)
  const a = Object.assign(document.createElement('a'), {
    href:     URL.createObjectURL(new Blob([payload], { type: 'text/plain' })),
    download: `timeclock-${new Date().toISOString().slice(0,10)}.json`,
  })
  a.click()
  URL.revokeObjectURL(a.href)
}

window.importData = () => {
  const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,text/plain' })
  input.onchange = () => {
    const file = input.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = evt => {
      try {
        const data = JSON.parse(evt.target.result)
        if (!Array.isArray(data.projects) || !Array.isArray(data.entries)) {
          alert('Invalid file: expected { projects, entries }.')
          return
        }
        if (!confirm(`Import ${data.projects.length} projects and ${data.entries.length} entries? This will replace all current data.`)) return
        DB.saveProjects(data.projects)
        DB.saveEntries(data.entries)
        render()
      } catch {
        alert('Could not parse file.')
      }
    }
    reader.readAsText(file)
  }
  input.click()
}

// ── Render dispatcher ─────────────────────────────────────────────────────────

function render() {
  if (currentView === 'clock')    renderClock()
  if (currentView === 'projects') renderProjects()
  if (currentView === 'log')      renderLog()
  if (currentView === 'summary')  renderSummary()
}

// ── Service Worker ────────────────────────────────────────────────────────────

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(console.error)
  })
}

// ── Boot ──────────────────────────────────────────────────────────────────────

showView('clock')
