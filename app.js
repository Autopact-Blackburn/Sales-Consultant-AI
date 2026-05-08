/**
 * Dealership Performance Intelligence — application bootstrap
 * Vanilla ESM; pairs with index.html and ./ai.js
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateSalespersonInsights } from './ai.js'

/* =============================================================================
   SUPABASE CONFIG
   Replace with your project URL + anon (public) key from Supabase Dashboard
   → Settings → API. The anon key must be the full JWT string (starts with eyJ).
============================================================================= */
const SB_URL = 'https://snzjsuwqetomdkvphvzs.supabase.co'
const SB_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuempzdXdxZXRvbWRrdnBodnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDQ5MTksImV4cCI6MjA5MzUyMDkxOX0.mkJ1_nxP0emPvhSqgUz7Q4zKm63LtG0J7xiYhwT78QQ'

/* =============================================================================
   STATE
============================================================================= */
const S = {
  role: null,
  periodId: null,
  metrics: [],
  deals: [],
  files: {},
  selectedConsultant: null
}

let db = null

/* =============================================================================
   UTILITIES — DOM & FORMATTING
============================================================================= */
function show(id) {
  ;['page-login', 'page-manager', 'page-salesperson'].forEach(p => {
    const el = document.getElementById(p)
    if (el) el.classList.toggle('active', p === id)
  })
}

function showRoleWarning(show, message) {
  const bar = $('mgr-role-warning')
  if (!bar) return
  bar.hidden = !show
  const textEl = bar.querySelector('.role-warning-text')
  if (textEl && message) textEl.textContent = message
}

/** Keeps Import as the default visible tab after manager login (avoids landing on empty Dashboard). */
function ensureManagerImportTabActive() {
  document.querySelectorAll('#page-manager .tab-btn').forEach(b => b.classList.remove('active'))
  document.querySelectorAll('#page-manager .tab-panel').forEach(p => p.classList.remove('active'))
  document.querySelector('#page-manager .tab-btn[data-tab="mgr-import"]')?.classList.add('active')
  $('mgr-import')?.classList.add('active')
}

function syncImportProgress() {
  const stepUpload = $('import-step-upload')
  const stepReady = $('import-step-ready')
  const stepRun = $('import-step-run')
  if (!stepUpload || !stepReady || !stepRun) return

  const keys = Object.keys(S.files)
  const n = keys.length
  const hasDealLog = !!S.files.deal_log

  ;[stepUpload, stepReady, stepRun].forEach(el => el.classList.remove('step-active', 'step-done'))

  if (n === 0) {
    stepUpload.classList.add('step-active')
  } else {
    stepUpload.classList.add('step-done')
    if (hasDealLog) {
      stepReady.classList.add('step-done')
      stepRun.classList.add('step-active')
    } else {
      stepReady.classList.add('step-active')
    }
  }
}

function markImportFlowComplete() {
  ;['import-step-upload', 'import-step-ready', 'import-step-run'].forEach(id => {
    const el = $(id)
    if (!el) return
    el.classList.remove('step-active')
    el.classList.add('step-done')
  })
}

let managerEventsBound = false

function $(id) {
  return document.getElementById(id)
}

function setText(id, v) {
  const el = $(id)
  if (el) el.textContent = v
}

function safe(v) {
  return String(v || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function money(v) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(Number(v || 0))
}

function label(t) {
  return String(t || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function cleanName(v) {
  return String(v || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function dr(l, v) {
  return `<div class="detail-row"><span class="dr-label">${l}</span><span class="dr-value">${v}</span></div>`
}

function addLog(msg, type = 'ok') {
  const el = $('importLog')
  if (!el) return
  const empty = el.querySelector('.empty')
  if (empty) empty.remove()
  const div = document.createElement('div')
  div.className = `log-item log-${type}`
  div.innerHTML = `<span class="log-icon">${type === 'ok' ? '✓' : '⚠'}</span><span>${msg}</span>`
  el.prepend(div)
}

function looksLikeSupabaseUrl(url) {
  try {
    const u = new URL(String(url || '').trim())
    if (u.protocol !== 'https:') return false
    return u.hostname.endsWith('.supabase.co')
  } catch {
    return false
  }
}

/** Anon keys are JWTs: three base64url segments, typically starting with eyJ */
function looksLikeSupabaseAnonKey(key) {
  const k = String(key || '').trim()
  if (!k.startsWith('eyJ')) return false
  const parts = k.split('.')
  if (parts.length !== 3) return false
  return parts.every(p => p.length > 0)
}

function formatAuthErrorMessage(err) {
  const msg = String(err?.message || err || '')
  const lower = msg.toLowerCase()
  if (lower.includes('invalid api key') || lower.includes('api key')) {
    return 'Authentication failed: invalid API key. In Supabase Dashboard → Settings → API, copy the anon (public) key again and update SB_KEY in app.js. Ensure the key matches this project URL.'
  }
  if (lower.includes('jwt') && lower.includes('invalid')) {
    return 'Authentication failed: the anon key JWT is not accepted. It may be expired, revoked, or for a different project.'
  }
  return msg || 'Authentication error. Check Supabase URL, anon key, and network.'
}

function showBootstrapError(message) {
  console.error('[bootstrap]', message)
  show('page-login')
  const errEl = $('loginError')
  if (errEl) {
    errEl.textContent = message
    errEl.style.whiteSpace = 'pre-wrap'
  }
  const btn = $('loginBtn')
  if (btn) {
    btn.disabled = true
    btn.textContent = 'Sign in unavailable'
  }
}

/* =============================================================================
   SUPABASE CLIENT
============================================================================= */
function createSupabaseClient() {
  const url = String(SB_URL || '').trim()
  const key = String(SB_KEY || '').trim()

  if (!url || !key) {
    return {
      client: null,
      error: new Error('Supabase URL and anon key must be set in app.js (SB_URL, SB_KEY).')
    }
  }

  if (!looksLikeSupabaseUrl(url)) {
    return {
      client: null,
      error: new Error(
        `Invalid Supabase URL format: "${url.slice(0, 48)}…" — expected https://YOUR-PROJECT.supabase.co`
      )
    }
  }

  if (!looksLikeSupabaseAnonKey(key)) {
    return {
      client: null,
      error: new Error(
        'Invalid Supabase anon key format — expected a JWT (three dot-separated parts, starting with eyJ). Remove spaces/line breaks from SB_KEY in app.js.'
      )
    }
  }

  try {
    const client = createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    })
    return { client, error: null }
  } catch (e) {
    return { client: null, error: e }
  }
}

/** Optional: warn if core tables are missing or RLS blocks anon */
async function warnIfTablesMissing() {
  if (!db) return
  const probes = [
    ['staff', () => db.from('staff').select('email').limit(1)],
    ['commission_periods', () => db.from('commission_periods').select('id').limit(1)]
  ]

  for (const [name, run] of probes) {
    const { error } = await run()
    if (error) {
      console.warn(
        `[schema] Table or access issue for "${name}":`,
        error.message || error,
        '— check migrations, RLS policies, and that you are using the correct Supabase project.'
      )
    }
  }
}

/* =============================================================================
   AUTH
============================================================================= */
function bindLogin() {
  const btn = $('loginBtn')
  const emailEl = $('loginEmail')
  const passEl = $('loginPassword')
  const errEl = $('loginError')
  if (!btn || !emailEl || !passEl || !errEl || !db) return

  btn.disabled = false
  btn.textContent = 'Sign In'

  async function doLogin() {
    const email = emailEl.value.trim()
    const password = passEl.value
    if (!email || !password) {
      errEl.textContent = 'Enter your email and password.'
      return
    }

    btn.innerHTML = '<span class="spinner"></span> Signing in…'
    btn.disabled = true
    errEl.textContent = ''

    const { error } = await db.auth.signInWithPassword({ email, password })

    if (error) {
      errEl.textContent = formatAuthErrorMessage(error)
      btn.innerHTML = 'Sign In'
      btn.disabled = false
      console.error('[auth] signInWithPassword failed:', error.message || error)
      return
    }

    const {
      data: { session },
      error: sessionErr
    } = await db.auth.getSession()

    if (sessionErr || !session) {
      errEl.textContent = sessionErr
        ? formatAuthErrorMessage(sessionErr)
        : 'Signed in but session could not be read. Try again or clear site data.'
      btn.innerHTML = 'Sign In'
      btn.disabled = false
      console.error('[auth] post-login session:', sessionErr || 'no session')
      return
    }

    console.log('Session found')
    const role = await getRole(session.user.email)
    S.role = role
    await bootPage(role)
    btn.innerHTML = 'Sign In'
    btn.disabled = false
  }

  btn.addEventListener('click', doLogin)
  passEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin()
  })
}

async function getRole(email) {
  const { data, error } = await db.from('staff').select('role').eq('email', email).limit(1)
  if (error) {
    console.warn('[auth] staff role lookup:', error.message || error)
    console.log('Role lookup failed')
    showRoleWarning(
      true,
      'We could not load your role from the staff table. You have temporary manager access so you can still reach Import and verify data. Ask an admin to fix database access or your staff record.'
    )
    return 'manager'
  }
  const raw = data?.[0]?.role
  if (raw == null || String(raw).trim() === '') {
    console.log('Role lookup failed')
    showRoleWarning(
      true,
      'No role is set in the staff table for your email. Temporary manager access is enabled. Ask an admin to set your role (manager, admin, or salesperson).'
    )
    return 'manager'
  }
  showRoleWarning(false)
  const r = String(raw).toLowerCase()
  if (r === 'manager' || r === 'admin') {
    console.log('Role detected: manager')
    return r === 'admin' ? 'admin' : 'manager'
  }
  console.log('Role detected: salesperson')
  return 'salesperson'
}

async function getStaffName(email) {
  const { data, error } = await db.from('staff').select('full_name').eq('email', email).limit(1)
  if (error) console.warn('[auth] staff name lookup:', error.message || error)
  return data?.[0]?.full_name || null
}

async function bootPage(role) {
  if (role === 'manager' || role === 'admin') {
    show('page-manager')
    ensureManagerImportTabActive()
    await loadPeriods('mgr-period', 'manager')
    bindManagerEvents()
    syncImportProgress()
    await refreshManager()
    requestAnimationFrame(() => {
      if (window.matchMedia('(max-width: 768px)').matches) {
        $('import-hub-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    })
  } else {
    show('page-salesperson')
    showRoleWarning(false)
    const {
      data: { session }
    } = await db.auth.getSession()
    if (session) {
      const name = await getStaffName(session.user.email)
      if (name) setText('sp-nameLabel', name)
    }
    await loadPeriods('sp-period', 'salesperson')
    bindSalespersonEvents()
    await refreshSalesperson()
  }
}

function bindLogout(btnId) {
  $(btnId)?.addEventListener('click', async () => {
    await db.auth.signOut()
    location.reload()
  })
}

/* =============================================================================
   BOOT
============================================================================= */
async function boot() {
  const { client, error: initErr } = createSupabaseClient()
  if (initErr || !client) {
    showBootstrapError(initErr?.message || 'Could not initialize Supabase client.')
    return
  }

  db = client
  console.log('Supabase initialized')

  const {
    data: { session },
    error: sessionError
  } = await db.auth.getSession()

  if (sessionError) {
    console.error('[auth] getSession:', sessionError.message || sessionError)
    showBootstrapError(formatAuthErrorMessage(sessionError))
    bindLogin()
    return
  }

  if (!session) {
    console.log('No session')
    show('page-login')
    bindLogin()
    return
  }

  console.log('Session found')
  await warnIfTablesMissing()

  const role = await getRole(session.user.email)
  S.role = role
  await bootPage(role)
}

boot().catch(err => {
  console.error('[boot] fatal:', err)
  showBootstrapError(err?.message || String(err))
})

/* =============================================================================
   PERIODS
============================================================================= */
async function loadPeriods(selectId, pageType) {
  const sel = $(selectId)
  if (!sel) return

  if (!sel.dataset.periodBound) {
    sel.dataset.periodBound = '1'
    sel.addEventListener('change', async () => {
      S.periodId = sel.value
      if (pageType === 'manager') await refreshManager()
      else await refreshSalesperson()
    })
  }

  const { data: periods, error } = await db
    .from('commission_periods')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })

  if (error) {
    console.warn('[periods] commission_periods:', error.message || error)
    sel.innerHTML = '<option value="">Could not load periods</option>'
    if ($('importStatus')) {
      $('importStatus').textContent =
        'Could not load commission periods. Check Supabase RLS SELECT policy on commission_periods.'
    }
    return
  }

  sel.innerHTML = ''
  if (!periods?.length) {
    sel.innerHTML = '<option value="">No periods found</option>'
    if ($('importStatus')) {
      $('importStatus').textContent =
        'No commission periods found. Run the period seed SQL.'
    }
    S.periodId = null
    console.error('[periods] No commission periods found. Run the period seed SQL.')
    return
  }

  periods.forEach(p => {
    const opt = document.createElement('option')
    opt.value = p.id
    opt.textContent = p.label || `${p.period_month}/${p.period_year}`
    sel.appendChild(opt)
  })

  S.periodId = periods[0].id
}

async function ensureActivePeriodForNormalization() {
  if (S.periodId) return true

  // Re-check periods right before normalization.
  await loadPeriods('mgr-period', 'manager')

  const sel = $('mgr-period')
  const selected = sel?.value || null
  if (selected) S.periodId = selected

  if (!S.periodId) {
    const msg = 'Normalization stopped: no active commission period. No commission periods found. Run the period seed SQL.'
    addLog(`❌ ${msg}`, 'err')
    if ($('importStatus')) $('importStatus').textContent = msg
    console.error('[periods] normalization blocked:', msg)
    return false
  }

  return true
}

/* =============================================================================
   MANAGER — EVENTS
============================================================================= */
function bindManagerEvents() {
  if (managerEventsBound) return
  managerEventsBound = true

  bindLogout('mgr-logout')

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      $(btn.dataset.tab)?.classList.add('active')
    })
  })

  const zone = $('dropZone')
  const fileIn = $('fileInput')

  zone.addEventListener('dragover', e => {
    e.preventDefault()
    zone.classList.add('drag-over')
  })
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'))
  zone.addEventListener('drop', e => {
    e.preventDefault()
    zone.classList.remove('drag-over')
    handleFiles([...e.dataTransfer.files])
  })
  fileIn.addEventListener('change', () => handleFiles([...fileIn.files]))

  $('runImportBtn').addEventListener('click', runNormalization)
  $('clearLogBtn').addEventListener('click', () => {
    $('importLog').innerHTML =
      '<div class="empty"><div class="empty-icon">📋</div>Log cleared.</div>'
  })

  $('closeWorkings').addEventListener('click', () => {
    $('workingsPanel').style.display = 'none'
  })

  $('emailSummaryBtn').addEventListener('click', () => {
    let body = 'Monthly Commission Summary\n\n'
    S.metrics.forEach(r => {
      body += `${r.salesperson_name} — ${money(r.final_commission)}\n`
    })
    location.href = `mailto:?subject=Monthly Commission Summary&body=${encodeURIComponent(body)}`
  })

  $('emailPspBtn').addEventListener('click', () => {
    if (!S.selectedConsultant) return
    const ins = generateSalespersonInsights(S.selectedConsultant)
    location.href = `mailto:?subject=PSP - ${S.selectedConsultant.salesperson_name}&body=${encodeURIComponent(ins.fullText)}`
  })
}

/* =============================================================================
   FILE DETECTION & PARSING
============================================================================= */
function detectFileType(fileName, headers) {
  const name = String(fileName || '').toLowerCase()
  const h = headers.map(x => String(x || '').toLowerCase()).join(' ')

  // Filename-first hints (strong)
  if (name.includes('activity report')) return 'leads'
  if (name.includes('finance') || name.includes('insurance')) return 'finance'
  if (name.includes('aftercare')) return 'aftercare'
  if (name === 'acc.csv') return 'accessories'
  if (name.includes('sign ups')) return 'signups'
  if (name.includes('data -')) return 'deal_log'

  // Header fallback
  const isDeal =
    (h.includes('dealership') && h.includes('type') && h.includes('deal') && h.includes('posted gross')) ||
    (h.includes('est gross') && h.includes('salesperson') && h.includes('customer name'))
  if (isDeal) return 'deal_log'

  const isFinance =
    h.includes('sales person') &&
    h.includes('total sales') &&
    h.includes('finance sales') &&
    (h.includes('fin pen') || h.includes('fin ipru') || h.includes('fin ipur')) &&
    (h.includes('fin income') || h.includes('total income'))
  if (isFinance) return 'finance'

  const isAftercare =
    h.includes('salespersonname') ||
    (h.includes('deals') && h.includes('gross') && (h.includes('pvr') || h.includes('ppv')))
  if (isAftercare) return 'aftercare'

  const isAccessories =
    (h.includes('deal') || h.includes('deal #')) &&
    h.includes('salesperson') &&
    h.includes('sale amount') &&
    h.includes('cost amount')
  if (isAccessories) return 'accessories'

  const isSignups =
    h.includes('count - sign up') ||
    (h.includes('sales person') && h.includes('estimatedgross') && (h.includes('sign up') || h.includes('sign-up')))
  if (isSignups) return 'signups'

  const isLeads =
    h.includes('lead id') ||
    (h.includes('date created') && h.includes('test drive completed') && h.includes('valuation completed'))
  if (isLeads) return 'leads'

  return null
}

async function handleFiles(files) {
  for (const file of files) {
    const text = await file.text()
    const rows = parseCSV(text)
    if (!rows.length) {
      addLog(`⚠ ${file.name}: no rows detected`, 'err')
      continue
    }

    const type = detectFileType(file.name, Object.keys(rows[0]))
    if (!type) {
      addLog(`❓ ${file.name}: could not detect type — check headers`, 'err')
      continue
    }

    if (S.files[type]) {
      addLog(
        `⚠ ${file.name}: replacing existing ${label(type)} file (${S.files[type].name}).`,
        'err'
      )
    }
    S.files[type] = { name: file.name, rows }
    addLog(
      `✓ ${file.name} → detected as <strong>${label(type)}</strong> (${rows.length} rows)`,
      'ok'
    )
  }

  renderLoadedFiles()
  $('runImportBtn').disabled = Object.keys(S.files).length === 0
  $('importStatus').textContent = `${Object.keys(S.files).length} file(s) staged — tap Run Normalization when ready (Deal Log required).`
  syncImportProgress()
}

function renderLoadedFiles() {
  const el = $('loadedFiles')
  el.innerHTML = ''
  for (const [type, f] of Object.entries(S.files)) {
    const div = document.createElement('div')
    div.className = 'loaded-file'
    div.innerHTML = `<span class="lf-type">${label(type)}</span><span class="lf-name">${f.name}</span><span class="lf-remove" data-type="${type}">✕</span>`
    div.querySelector('.lf-remove').addEventListener('click', () => {
      delete S.files[type]
      renderLoadedFiles()
      $('runImportBtn').disabled = Object.keys(S.files).length === 0
      $('importStatus').textContent = `${Object.keys(S.files).length} file(s) staged — tap Run Normalization when ready (Deal Log required).`
      syncImportProgress()
    })
    el.appendChild(div)
  }
}

function parseCSV(text) {
  const lines = text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return []

  const delim = detectDelimiter(lines)
  let headerIdx = 0
  let bestScore = -1

  lines.slice(0, 40).forEach((line, i) => {
    const heads = splitLine(line, delim).map(normH)
    const score = heads.reduce((s, h) => {
      if (h.includes('deal')) s += 5
      if (h.includes('sales')) s += 4
      if (h.includes('consultant')) s += 3
      if (h.includes('gross')) s += 3
      if (h.includes('salesperson')) s += 4
      if (h.includes('finance')) s += 2
      if (h.includes('income')) s += 2
      if (h.includes('aftercare') || h.includes('aftermarket')) s += 2
      if (h.includes('lead')) s += 2
      if (h.includes('sign')) s += 2
      return s
    }, 0)
    if (score > bestScore) {
      bestScore = score
      headerIdx = i
    }
  })

  const rawHeads = splitLine(lines[headerIdx], delim).map(normH)
  const heads = dedupeHeads(rawHeads)

  return lines
    .slice(headerIdx + 1)
    .map(l => splitLine(l, delim))
    .filter(cols => cols.some(c => String(c || '').trim()))
    .map(cols => {
      const obj = {}
      heads.forEach((h, i) => {
        if (h) obj[h] = (cols[i] || '').trim()
      })
      return obj
    })
}

function detectDelimiter(lines) {
  const s = lines.slice(0, 10).join('\n')
  const tabs = (s.match(/\t/g) || []).length
  const commas = (s.match(/,/g) || []).length
  const semis = (s.match(/;/g) || []).length
  if (tabs >= commas && tabs >= semis) return '\t'
  if (semis > commas) return ';'
  return ','
}

function splitLine(line, delim) {
  if (delim === '\t') return line.split('\t')
  const res = []
  let cur = ''
  let q = false
  for (const ch of line) {
    if (ch === '"') q = !q
    else if (ch === delim && !q) {
      res.push(cur)
      cur = ''
    } else cur += ch
  }
  res.push(cur)
  return res
}

function dedupeHeads(heads) {
  const seen = {}
  return heads.map(h => {
    const k = h || 'blank'
    seen[k] = (seen[k] || 0) + 1
    return seen[k] === 1 ? k : `${k} ${seen[k]}`
  })
}

function normH(h) {
  return String(h || '')
    .toLowerCase()
    .replace(/[\uFEFF$#.()\[\]{}]/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function get(row, names) {
  const keys = Object.keys(row || {})
  for (const name of names) {
    const t = normH(name)
    let found =
      keys.find(k => normH(k) === t) ||
      keys.find(k => normH(k).includes(t)) ||
      keys.find(k => t.includes(normH(k)))
    if (found) {
      const v = row[found]
      if (v !== undefined && v !== null && String(v).trim() !== '') return v
    }
  }
  return ''
}

function num$(v) {
  return Number(
    String(v || '')
      .replace(/[$,\s]/g, '')
      .replace(/[^\d.-]/g, '') || 0
  )
}

function numInt(v) {
  return Number(v || 0)
}

function getDealNum(row) {
  return get(row, [
    'deal',
    'deal number',
    'deal no',
    'deal no.',
    'deal #',
    'deal#',
    'stock deal no',
    'deal ref',
    'contract number',
    'invoice number',
    'contract no',
    'invoice no',
    'proposal number'
  ])
}

function normDeal(v) {
  const raw = String(v || '')
    .toLowerCase()
    .trim()
  if (!raw) return ''
  const ns = raw.match(/\d+/g)
  if (ns?.length) return ns.join('').replace(/^0+/, '')
  return raw.replace(/[^a-z0-9]/g, '').replace(/^0+/, '')
}

function rowsByDeal(type, dealNum) {
  const n = normDeal(dealNum)
  return ((S.files[type]?.rows) || []).filter(r => normDeal(getDealNum(r)) === n)
}

function sumByDeal(type, dealNum, fn) {
  return rowsByDeal(type, dealNum).reduce((s, r) => s + fn(r), 0)
}

/* =============================================================================
   NORMALIZATION — BUILD DEALS & METRICS
============================================================================= */
function buildDeals() {
  const dealRows = S.files.deal_log?.rows || []

  return dealRows
    .map(row => {
      const dealNum = getDealNum(row)
      const spName = cleanName(
        get(row, [
          'salesperson',
          'sales person',
          'sales consultant',
          'consultant',
          'salesperson name',
          'sales person full name'
        ])
      )

      if (!dealNum || !spName) return null

      const postedGross = num$(get(row, ['posted gross', 'processed gross', 'real gross']))
      const estGross = num$(get(row, ['est gross', 'estimated gross', 'gross']))
      const usedGross = postedGross || estGross
      const amGross = num$(get(row, ['am gross', 'am - gross', 'aftermarket gross', 'am cost amount']))
      const realGp = usedGross - amGross

      const tradeAllowance = num$(get(row, ['trade allowance', 'trade in allowance', 'trade']))
      const tradePayout = num$(get(row, ['trade payout', 'payout']))

      const accGp = sumByDeal('accessories', dealNum, r => {
        const profit = num$(get(r, ['profit excl gst', 'profit incl gst', 'profit', 'gross']))
        const sale = num$(get(r, ['sale amount', 'sales amount', 'sell amount', 'sell price incl gst', 'sell price excl gst']))
        const cost = num$(get(r, ['cost amount', 'cost', 'cost incl gst', 'cost excl gst']))
        return profit || sale - cost
      })

      const finRows = rowsByDeal('finance', dealNum)
      const finIncome = finRows.reduce((s, r) => {
        const primary = num$(
          get(r, ['adj total inc', 'total income', 'tot fin income', 'finance income', 'fin income'])
        )
        const fallback = num$(get(r, ['commission', 'comm']))
        return s + (primary || fallback)
      }, 0)
      const dealerFin = finRows.some(r => {
        const pen = numInt(get(r, ['fin pen', 'finance pen', 'finance sales']))
        const inc = num$(get(r, ['adj total inc', 'total income', 'fin income', 'finance income']))
        return pen > 0 || inc > 0
      })

      const acTotal = sumByDeal('aftercare', dealNum, r => {
        return (
          num$(get(r, ['total aftermarket', 'aftermarket total', 'aftercare total', 'aftermarket income', 'gross'])) ||
          num$(get(r, ['commission', 'comm'])) ||
          num$(get(r, ['premium']))
        )
      })

      return {
        period_id: S.periodId,
        deal_number: String(dealNum),
        salesperson_name: spName,
        customer_name: get(row, ['customer', 'customer name', 'cust']) || '',
        vehicle: get(row, ['carline', 'vehicle', 'description', 'model']) || '',
        posted_gross: postedGross,
        est_gross: estGross,
        real_gp: realGp,
        am_gross: amGross,
        trade_allowance: tradeAllowance,
        trade_payout: tradePayout,
        accessory_gp: accGp,
        finance_income: finIncome,
        dealer_finance: dealerFin,
        aftercare_total: acTotal
      }
    })
    .filter(Boolean)
}

function buildMetrics(deals) {
  const grouped = {}

  deals.forEach(d => {
    const k = d.salesperson_name
    if (!grouped[k]) grouped[k] = blank(k)
    grouped[k].units++
    grouped[k].finance_income_total += d.finance_income
    grouped[k].accessory_gp += d.accessory_gp
    grouped[k].aftercare_total += d.aftercare_total
    grouped[k].new_gross_total += d.real_gp
    if (d.dealer_finance) grouped[k].finance_deals++
  })

  addSignups(grouped)
  addFinanceSummary(grouped)
  addAftercareSummary(grouped)
  addLeads(grouped)

  Object.values(grouped).forEach(r => {
    r.finance_penetration = r.units ? (r.finance_deals / r.units) * 100 : 0
    r.finance_ipur = r.units ? r.finance_income_total / r.units : 0
    if (!r.aftercare_ppv) r.aftercare_ppv = r.units ? r.aftercare_total / r.units : 0

    r.base_unit_commission = r.units * 100
    r.volume_bonus = r.units >= 18 ? 750 : 0
    r.signups_bonus = r.signups >= 23 ? 250 : 0
    r.gross_bonus = r.new_gross_total * 0.05
    r.kpi_bonus_pool = calcKpi(r)
    r.volume_unlock_percentage = volumeUnlock(r.units)
    r.unlocked_kpi_bonus = r.kpi_bonus_pool * r.volume_unlock_percentage
    r.fixed_payout_total = r.volume_bonus + r.signups_bonus
    r.manual_bonus_total = numInt(r.manual_bonus_total)
    r.direct_purchase_bonus = numInt(r.direct_purchase_bonus)
    r.final_commission =
      r.base_unit_commission +
      r.fixed_payout_total +
      r.gross_bonus +
      r.unlocked_kpi_bonus +
      r.manual_bonus_total +
      r.direct_purchase_bonus
  })

  return Object.values(grouped)
}

function blank(name) {
  return {
    period_id: S.periodId,
    salesperson_name: cleanName(name),
    units: 0,
    signups: 0,
    finance_deals: 0,
    finance_penetration: 0,
    finance_ipur: 0,
    finance_income_total: 0,
    aftercare_total: 0,
    aftercare_ppv: 0,
    accessory_gp: 0,
    new_leads: 0,
    test_drives: 0,
    valuations: 0,
    google_reviews: 0,
    nps: 0,
    dah: 0,
    new_gross_total: 0,
    volume_bonus: 0,
    signups_bonus: 0,
    gross_bonus: 0,
    base_unit_commission: 0,
    fixed_payout_total: 0,
    kpi_bonus_pool: 0,
    volume_unlock_percentage: 0,
    unlocked_kpi_bonus: 0,
    manual_bonus_total: 0,
    direct_purchase_bonus: 0,
    final_commission: 0
  }
}

function addSignups(g) {
  const seen = new Set()
  ;(S.files.signups?.rows || []).forEach(r => {
    const name = cleanName(get(r, ['sales person', 'salesperson', 'consultant', 'sales consultant', 'salesperson name']))
    if (!name) return
    const deal = normDeal(getDealNum(r))
    const key = deal ? `${name}|${deal}` : null
    if (key) {
      if (seen.has(key)) return
      seen.add(key)
    }
    if (!g[name]) g[name] = blank(name)
    g[name].signups++
  })
}

function addFinanceSummary(g) {
  ;(S.files.finance?.rows || []).forEach(r => {
    const dealNum = getDealNum(r)
    if (dealNum) return
    const name = cleanName(get(r, ['sales person', 'salesperson', 'consultant']))
    if (!name || name.toLowerCase() === 'total') return
    if (!g[name]) g[name] = blank(name)

    const totalSales = numInt(get(r, ['total sales']))
    const finSales = numInt(get(r, ['finance sales']))
    const finPen = num$(get(r, ['fin pen', 'finance pen']))
    const finInc = num$(get(r, ['fin income', 'total income', 'finance income']))
    const ipru = num$(get(r, ['fin ipru', 'ipru', 'ipur']))

    if (totalSales > 0 && !g[name].units) g[name].units = totalSales
    if (finSales > 0) g[name].finance_deals = finSales
    if (finPen > 0) g[name].finance_penetration = finPen * (finPen <= 1 ? 100 : 1)
    if (finInc > 0 && g[name].finance_income_total === 0) g[name].finance_income_total = finInc
    if (ipru > 0 && g[name].finance_ipur === 0) g[name].finance_ipur = ipru
  })
}

function addAftercareSummary(g) {
  ;(S.files.aftercare?.rows || []).forEach(r => {
    const dealNum = getDealNum(r)
    if (dealNum) return
    const name = cleanName(
      get(r, ['salespersonname', 'salesperson name', 'salesperson', 'sales person', 'consultant', 'name'])
    )
    if (!name || name.toLowerCase() === 'total') return
    if (!g[name]) g[name] = blank(name)

    const gross = num$(get(r, ['gross', 'total aftermarket', 'aftermarket total', 'aftercare total']))
    const pvr = num$(get(r, ['pvr', 'ppv', 'aftercare ppv', 'aftercare pvr', 'ppr']))
    const deals = numInt(get(r, ['deals', 'units', 'vehicles']))

    if (gross > 0 && g[name].aftercare_total === 0) g[name].aftercare_total = gross
    if (pvr > 0) g[name].aftercare_ppv = pvr
    if (!g[name].units && deals > 0) g[name].units = deals
  })
}

function addLeads(g) {
  ;(S.files.leads?.rows || []).forEach(r => {
    const name = cleanName(
      get(r, ['sales person', 'salesperson', 'owner', 'consultant', 'sales consultant', 'salesperson name'])
    )
    if (!name) return
    if (!g[name]) g[name] = blank(name)

    g[name].new_leads++

    const tdDone = String(get(r, ['test drive completed'])).toLowerCase()
    if (tdDone === 'yes' || tdDone === '1' || tdDone === 'true') g[name].test_drives++

    const valDone = String(get(r, ['valuation completed'])).toLowerCase()
    if (valDone === 'yes' || valDone === '1' || valDone === 'true') g[name].valuations++
  })
}

/* =============================================================================
   KPI HELPERS
============================================================================= */
function volumeUnlock(u) {
  return u >= 18 ? 1 : u >= 15 ? 0.75 : u >= 12 ? 0.25 : 0
}
function acPay(ppv) {
  return ppv >= 800 ? 1100 : ppv >= 600 ? 1000 : ppv >= 400 ? 750 : ppv >= 250 ? 500 : 0
}
function finPenPay(p) {
  return p >= 75 ? 1000 : p >= 40 ? 500 : p >= 25 ? 250 : 0
}
function ipurPay(i) {
  return i >= 1500 ? 1000 : i >= 1100 ? 500 : i >= 800 ? 250 : 0
}
function accPay(g) {
  return g >= 500 ? 450 : g >= 100 ? 150 : 0
}
function rvwPay(c) {
  return Math.round(c) * 25
}
function npsPay(n) {
  return n >= 80 ? 250 : 0
}
function dahPay(d) {
  return d >= 80 ? 250 : 0
}
function calcKpi(r) {
  return (
    acPay(r.aftercare_ppv) +
    finPenPay(r.finance_penetration) +
    ipurPay(r.finance_ipur) +
    accPay(r.accessory_gp) +
    rvwPay(r.google_reviews) +
    npsPay(r.nps) +
    dahPay(r.dah)
  )
}

async function runNormalization() {
  const btn = $('runImportBtn')

  const hasPeriod = await ensureActivePeriodForNormalization()
  if (!hasPeriod) return
  if (!S.files.deal_log) {
    addLog('⚠ Deal Log is required — could not detect it in uploaded files', 'err')
    return
  }

  const staged = Object.entries(S.files)
    .map(([type, f]) => `${type}:${f.rows.length}`)
    .join(', ')
  console.log('[normalization] staged files:', staged || '(none)')
  addLog(`ℹ Staged files → ${staged}`, 'ok')

  const financeRowCount = (S.files.finance?.rows || []).length
  const aftercareRowCount = (S.files.aftercare?.rows || []).length
  console.log(`Finance rows detected: ${financeRowCount}`)
  console.log(`Aftercare rows detected: ${aftercareRowCount}`)
  console.log('Normalization started')

  btn.innerHTML = '<span class="spinner"></span> Normalizing…'
  btn.disabled = true

  let normalizedOk = false

  try {
    for (const [type, f] of Object.entries(S.files)) {
      await persistRaw(type, f.rows)
      addLog(`💾 ${label(type)} saved to database (${f.rows.length} rows)`, 'ok')
    }
    console.log('[normalization] raw rows persisted')

    const deals = buildDeals()
    const metrics = buildMetrics(deals)

    console.log(`[normalization] deals built: ${deals.length}`)
    console.log(`[normalization] metrics built: ${metrics.length}`)
    addLog(`🔄 Built ${deals.length} deals across ${metrics.length} consultants`, 'ok')

    await persistDeals(deals)
    console.log('[normalization] master_deals persisted')
    await persistMetrics(metrics)
    console.log('[normalization] salesperson_monthly_metrics persisted')

    console.log('Metrics persisted')
    addLog(`✅ Normalization complete — ${metrics.length} consultants updated`, 'ok')

    const [dealsCountRes, metricsCountRes, rawCountRes] = await Promise.all([
      db
        .from('master_deals')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', S.periodId),
      db
        .from('salesperson_monthly_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', S.periodId),
      db
        .from('raw_import_rows')
        .select('id', { count: 'exact', head: true })
        .eq('period_id', S.periodId)
    ])
    console.log(
      `[normalization] verify counts (period ${S.periodId}) -> master_deals=${dealsCountRes.count || 0}, metrics=${metricsCountRes.count || 0}, raw_rows=${rawCountRes.count || 0}`
    )

    markImportFlowComplete()
    normalizedOk = true

    await refreshManager()
    document.querySelector('[data-tab="mgr-dashboard"]')?.click()
  } catch (err) {
    addLog(`❌ Error: ${err.message}`, 'err')
    console.error(err)
  } finally {
    btn.innerHTML = '⚡ Run Normalization'
    btn.disabled = false
    if (!normalizedOk) syncImportProgress()
  }
}

/* =============================================================================
   PERSIST
============================================================================= */
async function persistRaw(type, rows) {
  await db.from('raw_import_rows').delete().eq('period_id', S.periodId).eq('import_type', type)
  await db.from('raw_import_batches').delete().eq('period_id', S.periodId).eq('import_type', type)

  const { data: batch, error: bErr } = await db
    .from('raw_import_batches')
    .insert({ period_id: S.periodId, import_type: type, row_count: rows.length })
    .select()
    .single()
  if (bErr) throw bErr

  const payload = rows.map((r, i) => ({
    batch_id: batch.id,
    period_id: S.periodId,
    import_type: type,
    row_number: i + 1,
    row_data: r
  }))
  const { error } = await db.from('raw_import_rows').insert(payload)
  if (error) throw error
}

async function persistDeals(deals) {
  await db.from('master_deals').delete().eq('period_id', S.periodId)
  if (!deals.length) return
  const { error } = await db.from('master_deals').insert(deals)
  if (error) throw error
}

async function persistMetrics(metrics) {
  await db.from('salesperson_monthly_metrics').delete().eq('period_id', S.periodId)
  if (!metrics.length) return
  const { error } = await db.from('salesperson_monthly_metrics').insert(metrics)
  if (error) throw error
}

/* =============================================================================
   RENDERING — MANAGER
============================================================================= */
async function refreshManager() {
  if (!S.periodId) return

  const periodSel = $('mgr-period')
  if (periodSel) S.periodId = periodSel.value || S.periodId

  const [mRes, dRes] = await Promise.all([
    db
      .from('salesperson_monthly_metrics')
      .select('*')
      .eq('period_id', S.periodId)
      .order('final_commission', { ascending: false }),
    db.from('master_deals').select('*').eq('period_id', S.periodId)
  ])

  if (mRes.error) console.warn('[refreshManager] metrics:', mRes.error.message || mRes.error)
  if (dRes.error) console.warn('[refreshManager] deals:', dRes.error.message || dRes.error)

  S.metrics = mRes.data || []
  S.deals = dRes.data || []
  console.log(`[refreshManager] period=${S.periodId} metrics=${S.metrics.length} deals=${S.deals.length}`)
  renderManagerDashboard()
}

function renderManagerDashboard() {
  const totComm = S.metrics.reduce((s, r) => s + numInt(r.final_commission), 0)
  const totUnits = S.metrics.reduce((s, r) => s + numInt(r.units), 0)
  const totSU = S.metrics.reduce((s, r) => s + numInt(r.signups), 0)
  const finDeals = S.metrics.reduce((s, r) => s + numInt(r.finance_deals), 0)
  const avgFin = totUnits ? (finDeals / totUnits) * 100 : 0
  const top = S.metrics[0]

  setText('mgr-totalComm', money(totComm))
  setText('mgr-units', totUnits)
  setText('mgr-finPen', `${Math.round(avgFin)}%`)
  setText('mgr-signups', totSU)
  setText('mgr-top', top?.salesperson_name || '—')

  const tbody = $('teamRows')
  if (!tbody) return
  tbody.innerHTML = ''

  if (!S.metrics.length) {
    tbody.innerHTML =
      '<tr><td colspan="12"><div class="empty"><div class="empty-icon">📊</div>No data for this period.</div></td></tr>'
    return
  }

  S.metrics.forEach(row => {
    const unlock = Math.round(numInt(row.volume_unlock_percentage) * 100)
    const tr = document.createElement('tr')
    tr.innerHTML = `
          <td><strong>${safe(row.salesperson_name)}</strong></td>
          <td>${numInt(row.units)}</td>
          <td>${numInt(row.signups)}</td>
          <td>${Math.round(numInt(row.finance_penetration))}%</td>
          <td>${money(row.finance_ipur)}</td>
          <td>${money(row.aftercare_ppv)}</td>
          <td>${money(row.accessory_gp)}</td>
          <td>${numInt(row.new_leads)}</td>
          <td>${numInt(row.test_drives)}</td>
          <td><strong class="text-green">${money(row.final_commission)}</strong></td>
          <td><span class="badge ${unlock === 100 ? 'badge-green' : unlock >= 75 ? 'badge-blue' : unlock >= 25 ? 'badge-gold' : 'badge-red'}">${unlock}%</span></td>
          <td>
            <div class="td-actions">
              <button class="btn btn-secondary" style="font-size:12px;padding:6px 12px;" data-action="psp">PSP</button>
              <button class="btn btn-primary" style="font-size:12px;padding:6px 12px;" data-action="workings">Detail</button>
            </div>
          </td>
        `

    tr.querySelector('[data-action="psp"]').addEventListener('click', e => {
      e.stopPropagation()
      renderPSP(row)
      document.querySelector('[data-tab="mgr-psp"]')?.click()
    })

    tr.querySelector('[data-action="workings"]').addEventListener('click', e => {
      e.stopPropagation()
      renderWorkings(row)
    })

    tbody.appendChild(tr)
  })
}

function renderWorkings(row) {
  S.selectedConsultant = row
  $('workingsPanel').style.display = 'block'
  setText('workingsName', row.salesperson_name)

  const consultantDeals = S.deals.filter(d => d.salesperson_name === row.salesperson_name)

  $('workingsContent').innerHTML = `
        <div class="detail-grid">
          <div class="detail-card">
            <h3>Commission Breakdown</h3>
            ${dr('Base Unit Commission', money(row.base_unit_commission))}
            ${dr('Volume Bonus', money(row.volume_bonus))}
            ${dr('Sign Ups Bonus', money(row.signups_bonus))}
            ${dr('Gross Bonus (5%)', money(row.gross_bonus))}
            ${dr('KPI Bonus Pool', money(row.kpi_bonus_pool))}
            ${dr('Volume Unlock', Math.round(numInt(row.volume_unlock_percentage) * 100) + '%')}
            ${dr('Unlocked KPI Bonus', money(row.unlocked_kpi_bonus))}
            ${dr('Manual Bonus', money(row.manual_bonus_total))}
            <div class="detail-row"><span class="dr-label">FINAL</span><span class="dr-value dr-total">${money(row.final_commission)}</span></div>
          </div>

          <div class="detail-card">
            <h3>KPI Pool Components</h3>
            ${dr('Aftercare PPV Bonus', money(acPay(row.aftercare_ppv)))}
            ${dr('Finance Pen Bonus', money(finPenPay(row.finance_penetration)))}
            ${dr('Finance IPUR Bonus', money(ipurPay(row.finance_ipur)))}
            ${dr('Accessory Bonus', money(accPay(row.accessory_gp)))}
            ${dr('Google Review Bonus', money(rvwPay(row.google_reviews)))}
            ${dr('NPS Bonus', money(npsPay(row.nps)))}
            ${dr('DAH Bonus', money(dahPay(row.dah)))}
            ${dr('TOTAL POOL', money(row.kpi_bonus_pool))}
          </div>

          <div class="detail-card">
            <h3>Performance Summary</h3>
            ${dr('Units', numInt(row.units))}
            ${dr('Sign Ups', numInt(row.signups))}
            ${dr('Finance Deals', numInt(row.finance_deals))}
            ${dr('Finance %', Math.round(numInt(row.finance_penetration)) + '%')}
            ${dr('Finance IPUR', money(row.finance_ipur))}
            ${dr('Aftercare PPV', money(row.aftercare_ppv))}
            ${dr('Accessory GP', money(row.accessory_gp))}
            ${dr('Leads', numInt(row.new_leads))}
            ${dr('Test Drives', numInt(row.test_drives))}
            ${dr('Valuations', numInt(row.valuations))}
          </div>

          <div class="detail-card">
            <h3>Deal Trace (${consultantDeals.length} deals)</h3>
            ${
              consultantDeals.length
                ? consultantDeals
                    .map(
                      d => `
                  <div class="detail-row">
                    <span class="dr-label" style="max-width:160px;overflow:hidden;text-overflow:ellipsis;">
                      <strong>${safe(d.deal_number)}</strong><br>
                      <span style="font-size:12px;">${safe(d.vehicle || d.customer_name || '')}</span>
                    </span>
                    <span class="dr-value" style="font-size:12px;text-align:right;">
                      GP ${money(d.real_gp)}<br>
                      F&I ${money(d.finance_income)}<br>
                      AC ${money(d.aftercare_total)}
                    </span>
                  </div>
                `
                    )
                    .join('')
                : '<p class="muted small">No deal detail found.</p>'
            }
          </div>
        </div>
      `

  $('workingsPanel').scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function renderPSP(row) {
  S.selectedConsultant = row
  $('emailPspBtn').disabled = false
  const ins = generateSalespersonInsights(row)

  $('pspContent').innerHTML = `
        <div style="margin-bottom:20px;">
          <h3 style="font-size:18px;font-weight:800;">${safe(row.salesperson_name)}</h3>
          <p class="muted small">${numInt(row.units)} units · ${money(row.final_commission)} commission · ${Math.round(numInt(row.volume_unlock_percentage) * 100)}% KPI unlock</p>
        </div>

        <div class="ai-box ai-box--live" style="margin-bottom:20px;">${safe(ins.summary)}</div>

        <div class="detail-grid">
          <div class="detail-card">
            <h3>💪 Strengths</h3>
            ${
              ins.strengths.length
                ? ins.strengths.map(x => `<div class="psp-insight">${safe(x)}</div>`).join('')
                : '<p class="muted small">Building this month.</p>'
            }
          </div>
          <div class="detail-card">
            <h3>📈 Opportunities</h3>
            ${
              ins.opportunities.length
                ? ins.opportunities.map(x => `<div class="psp-insight" style="border-color:var(--gold);">${safe(x)}</div>`).join('')
                : '<p class="muted small">No major gaps.</p>'
            }
          </div>
          <div class="detail-card">
            <h3>🎯 Top 3 Focus Areas</h3>
            <ol class="focus-list" style="padding:0;">
              ${ins.focusAreas.map((x, i) => `<li class="focus-item-premium"><span class="focus-num">${i + 1}</span>${safe(x)}</li>`).join('')}
            </ol>
          </div>
          <div class="detail-card">
            <h3>🗣 Coaching Language</h3>
            <p class="muted small" style="margin-bottom:12px;font-style:italic;">For the 1:1 conversation:</p>
            <p style="font-size:14px;">${safe(ins.managerLanguage)}</p>
          </div>
        </div>
      `
}

/* =============================================================================
   RENDERING — SALESPERSON
============================================================================= */
function bindSalespersonEvents() {
  bindLogout('sp-logout')
  /* Period changes: single handler attached in loadPeriods('sp-period', …) */
}

async function refreshSalesperson() {
  if (!S.periodId) return
  const {
    data: { session }
  } = await db.auth.getSession()
  const name = session ? await getStaffName(session.user.email) : null
  if (name) setText('sp-nameLabel', name)

  let q = db.from('salesperson_monthly_metrics').select('*').eq('period_id', S.periodId)
  if (name) q = q.eq('salesperson_name', name)
  const { data, error } = await q.limit(1)
  if (error) console.warn('[refreshSalesperson]', error.message || error)
  renderSalesperson(data?.[0] || null)
}

function renderSalesperson(row) {
  const flowHint = $('sp-flow-hint')
  if (!row) {
    if (flowHint) flowHint.hidden = false
    setText('sp-comm', '$0')
    setText('sp-units', '0')
    setText('sp-fin', '0%')
    setText('sp-ac', '$0')
    setText('sp-acc', '$0')
    setText('sp-unlock', '0%')
    $('sp-aiSummary').innerHTML = `
      <div class="onboarding-card">
        <h3>Your coaching snapshot is waiting on data</h3>
        <p>No commission data has been loaded for this period yet. Once your manager uploads and normalizes the monthly reports (deal log, finance, aftercare, and supporting files), your <strong>AI summary</strong>, <strong>focus areas</strong>, and <strong>KPI breakdown</strong> will appear here automatically.</p>
        <p>You do not need to upload anything yourself — stay on this page or check back after month-end processing.</p>
        <ul>
          <li>Confirm the correct <strong>month</strong> is selected above.</li>
          <li>If a period is missing, ask your manager to add it in <strong>commission periods</strong>.</li>
        </ul>
      </div>`
    $('sp-focus').innerHTML = `
      <li class="focus-item-premium"><span class="focus-num">1</span><strong>What this section does:</strong> After normalization, you’ll see the top three behaviours that would most improve your commission next month.</li>
      <li class="focus-item-premium"><span class="focus-num">2</span>For now, focus on consistent process: log every deal and keep finance &amp; aftercare conversations early in the journey.</li>
      <li class="focus-item-premium"><span class="focus-num">3</span>Questions? Ask your manager when the monthly import is scheduled to run.</li>`
    $('sp-breakdown').innerHTML = `<tr><td colspan="2">
      <div class="onboarding-card" style="margin:8px 0;">
        <h3>KPI detail table</h3>
        <p>This grid lists every input to your commission — units, bonuses, finance penetration, aftercare PPV, accessories, leads, and more. Values populate from the same normalized dataset as your headline cards.</p>
        <p><strong>Nothing is wrong with your account</strong> — we’re simply waiting on the first successful import for this period.</p>
      </div>
    </td></tr>`
    return
  }

  if (flowHint) flowHint.hidden = true

  const ins = generateSalespersonInsights(row)

  setText('sp-comm', money(row.final_commission))
  setText('sp-units', numInt(row.units))
  setText('sp-fin', Math.round(numInt(row.finance_penetration)) + '%')
  setText('sp-ac', money(row.aftercare_ppv))
  setText('sp-acc', money(row.accessory_gp))
  setText('sp-unlock', Math.round(numInt(row.volume_unlock_percentage) * 100) + '%')

  $('sp-aiSummary').innerHTML = `<div class="ai-box ai-box--live"><p>${safe(ins.summary)}</p></div>`
  const focusEl = $('sp-focus')
  focusEl.classList.remove('focus-list--live')
  focusEl.innerHTML = ins.focusAreas
    .map(
      (x, i) =>
        `<li class="focus-item-premium"><span class="focus-num">${i + 1}</span>${safe(x)}</li>`
    )
    .join('')
  void focusEl.offsetWidth
  focusEl.classList.add('focus-list--live')

  $('sp-breakdown').innerHTML = [
    ['Units', numInt(row.units)],
    ['Sign Ups', numInt(row.signups)],
    ['Base Commission', money(row.base_unit_commission)],
    ['Volume Bonus', money(row.volume_bonus)],
    ['Sign Ups Bonus', money(row.signups_bonus)],
    ['Gross Bonus', money(row.gross_bonus)],
    ['KPI Bonus Pool', money(row.kpi_bonus_pool)],
    ['Volume Unlock', Math.round(numInt(row.volume_unlock_percentage) * 100) + '%'],
    ['Unlocked KPI', money(row.unlocked_kpi_bonus)],
    ['Final Commission', money(row.final_commission)],
    ['Finance %', Math.round(numInt(row.finance_penetration)) + '%'],
    ['Finance IPUR', money(row.finance_ipur)],
    ['Aftercare PPV', money(row.aftercare_ppv)],
    ['Accessory GP', money(row.accessory_gp)],
    ['Google Reviews', numInt(row.google_reviews)],
    ['NPS', numInt(row.nps)],
    ['DAH', numInt(row.dah)],
    ['Leads', numInt(row.new_leads)],
    ['Test Drives', numInt(row.test_drives)],
    ['Valuations', numInt(row.valuations)]
  ]
    .map(([l, v]) => `<tr><td>${l}</td><td><strong>${v}</strong></td></tr>`)
    .join('')
}
