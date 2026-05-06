import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateSalespersonInsights } from './ai-analytics.js'

const SUPABASE_URL = 'https://snzjsuwqetomdkvphvzs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuempzdXdxZXRvbWRrdnBodnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDQ5MTksImV4cCI6MjA5MzUyMDkxOX0.mkJ1_nxP0emPvhSqgUz7Q4zKm63LtG0J7xiYhwT78QQ'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
window.supabase = supabase

const page = document.body.dataset.page

const money = value =>
  new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(Number(value || 0))

const percent = value => `${Math.round(Number(value || 0) * 100)}%`

const clean = value =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const toNumber = value => {
  if (value === null || value === undefined || value === '') return 0
  const cleaned = String(value).replace(/[$,%\s,]/g, '')
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function parsePaste(text) {
  const lines = String(text || '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter(line => line.trim())

  if (lines.length < 2) return { headers: [], rows: [] }

  const delimiter = lines[0].includes('\t') ? '\t' : ','

  const split = line =>
    delimiter === '\t'
      ? line.split('\t')
      : line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g)?.map(v => v.replace(/^"|"$/g, '')) || []

  const headers = split(lines[0]).map(h => h.trim())

  const rows = lines.slice(1).map(line => {
    const cells = split(line)
    const row = {}
    headers.forEach((header, index) => {
      row[header] = cells[index] ?? ''
    })
    return row
  })

  return { headers, rows }
}

function getField(row, aliases) {
  const keys = Object.keys(row)
  const match = keys.find(key =>
    aliases.some(alias => clean(key).includes(clean(alias)))
  )
  return match ? row[match] : ''
}

function normaliseRow(type, row) {
  const dealNumber = getField(row, ['deal number', 'deal #', 'deal no', 'deal'])
  const salesperson = getField(row, ['sales person', 'salesperson', 'sales consultant', 'consultant'])

  if (type === 'deal_log') {
    const processedGross = toNumber(getField(row, ['processed gross']))
    const amGross = toNumber(getField(row, ['am gross', 'am - gross', 'aftermarket gross']))

    return {
      dealNumber,
      salesperson,
      customerName: getField(row, ['customer name', 'client name']),
      vehicle: getField(row, ['vehicle', 'vehicle description', 'model']),
      processedGross,
      amGross,
      realGp: processedGross - amGross
    }
  }

  if (type === 'accessories') {
    const saleAmount = toNumber(getField(row, ['sale amount', 'sales amount']))
    const costAmount = toNumber(getField(row, ['cost amount', 'cost']))

    return {
      dealNumber,
      salesperson,
      accessoryGp: saleAmount - costAmount
    }
  }

  if (type === 'finance') {
    const dealerFinanceRaw = String(getField(row, ['dealer finance', 'financed'])).toLowerCase()

    return {
      dealNumber,
      salesperson,
      isDealerFinance: ['yes', 'y', 'true', '1'].some(v => dealerFinanceRaw.includes(v)),
      totalIncome: toNumber(getField(row, ['total income', 'finance income']))
    }
  }

  if (type === 'aftercare') {
    return {
      dealNumber,
      salesperson,
      totalAftermarket: toNumber(getField(row, ['total aftermarket', 'aftermarket total', 'aftercare total']))
    }
  }

  if (type === 'signups') {
    return { dealNumber, salesperson }
  }

  if (type === 'reviews') {
    return {
      salesperson,
      googleReviews: toNumber(getField(row, ['google reviews', 'reviews'])),
      nps: toNumber(getField(row, ['nps'])),
      dah: toNumber(getField(row, ['dah', 'driveaway happy', 'drive away happy']))
    }
  }

  return { dealNumber, salesperson, raw: row }
}

async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

async function requireLogin() {
  const session = await getSession()
  if (!session && page !== 'login') window.location.href = './login.html'
  return session
}

async function loadPeriods() {
  const { data, error } = await supabase
    .from('commission_periods')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return data || []
}

async function populatePeriods() {
  const select = document.querySelector('#periodSelect')
  if (!select) return null

  const periods = await loadPeriods()

  select.innerHTML = ''

  periods.forEach(period => {
    const option = document.createElement('option')
    option.value = period.id
    option.textContent = period.label
    select.appendChild(option)
  })

  return periods[0]?.id || null
}

async function handleLogin() {
  const form = document.querySelector('#loginForm')
  const message = document.querySelector('#loginMessage')

  form.addEventListener('submit', async event => {
    event.preventDefault()

    message.textContent = 'Signing in...'

    const email = document.querySelector('#email').value.trim()
    const password = document.querySelector('#password').value

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      message.textContent = error.message
      return
    }

    window.location.href = './manager.html'
  })
}

async function processImport(type, periodId) {
  const textarea = document.querySelector(`#${type}`)
  const rawText = textarea?.value || ''

  if (!periodId) return alert('Please select a commission period first.')
  if (!rawText.trim()) return alert(`Paste ${type} data first.`)

  const parsed = parsePaste(rawText)
  const normalisedRows = parsed.rows.map(row => normaliseRow(type, row))

  const { data: batch, error: batchError } = await supabase
    .from('raw_import_batches')
    .insert({
      period_id: periodId,
      import_type: type,
      source_filename: `${type}_${Date.now()}.txt`,
      row_count: normalisedRows.length
    })
    .select()
    .single()

  if (batchError) {
    console.error(batchError)
    alert(`${type} batch failed: ${batchError.message}`)
    return
  }

  const payload = normalisedRows.map((row, index) => ({
    batch_id: batch.id,
    period_id: periodId,
    import_type: type,
    row_number: index + 1,
    row_data: row
  }))

  const { error: rowsError } = await supabase
    .from('raw_import_rows')
    .insert(payload)

  if (rowsError) {
    console.error(rowsError)
    alert(`${type} rows failed: ${rowsError.message}`)
    return
  }

  alert(`${type} imported: ${normalisedRows.length} rows`)
}

function getVolumeUnlockRate(units) {
  if (units >= 18) return 1
  if (units >= 15) return 0.75
  if (units >= 12) return 0.25
  return 0
}

function calculateCommission(metrics) {
  const units = Number(metrics.units || 0)
  const base = units * 100

  const bonusPool =
    Number(metrics.aftercare_ppv || 0) * 0.2 +
    Number(metrics.finance_penetration || 0) * 1000 +
    Number(metrics.finance_ipur || 0) * 0.2 +
    Number(metrics.accessory_gp || 0) * 0.05 +
    Number(metrics.google_reviews || 0) * 50 +
    Number(metrics.nps || 0) * 5 +
    Number(metrics.dah || 0) * 5

  const unlocked = bonusPool * getVolumeUnlockRate(units)
  const directPurchase = Number(metrics.direct_purchases || 0) * 150
  const manual = Number(metrics.manual_bonus_total || 0)

  return Math.round(base + unlocked + directPurchase + manual)
}

async function runNormalization(periodId) {
  if (!periodId) return alert('Select a period first.')

  const { data: rows, error } = await supabase
    .from('raw_import_rows')
    .select('*')
    .eq('period_id', periodId)

  if (error) {
    console.error(error)
    alert(error.message)
    return
  }

  const groups = {
    deal_log: [],
    accessories: [],
    finance: [],
    aftercare: [],
    signups: [],
    reviews: []
  }

  rows.forEach(row => {
    if (groups[row.import_type]) groups[row.import_type].push(row.row_data)
  })

  if (!groups.deal_log.length) {
    alert('Deal Log is required before normalization.')
    return
  }

  const deals = new Map()

  groups.deal_log.forEach(row => {
    if (!row.dealNumber) return

    deals.set(row.dealNumber, {
      deal_number: row.dealNumber,
      salesperson_name: row.salesperson || 'Unassigned',
      customer_name: row.customerName || '',
      vehicle_description: row.vehicle || '',
      processed_gross: row.processedGross || 0,
      am_gross: row.amGross || 0,
      accessory_gp: 0,
      finance_dealer_finance: false,
      finance_total_income: 0,
      aftercare_total_aftermarket: 0,
      direct_purchase_count: 0
    })
  })

  groups.accessories.forEach(row => {
    const deal = deals.get(row.dealNumber)
    if (deal) deal.accessory_gp += Number(row.accessoryGp || 0)
  })

  groups.finance.forEach(row => {
    const deal = deals.get(row.dealNumber)
    if (deal) {
      deal.finance_dealer_finance = Boolean(row.isDealerFinance)
      deal.finance_total_income = Number(row.totalIncome || 0)
    }
  })

  groups.aftercare.forEach(row => {
    const deal = deals.get(row.dealNumber)
    if (deal) {
      deal.aftercare_total_aftermarket += Number(row.totalAftermarket || 0)
    }
  })

  const dealRows = [...deals.values()].map(deal => ({
    ...deal,
    period_id: periodId
  }))

  const { error: dealError } = await supabase
    .from('master_deals')
    .upsert(dealRows, { onConflict: 'period_id,deal_number' })

  if (dealError) {
    console.error(dealError)
    alert(dealError.message)
    return
  }

  const byPerson = new Map()

  dealRows.forEach(deal => {
    const name = deal.salesperson_name || 'Unassigned'

    if (!byPerson.has(name)) {
      byPerson.set(name, {
        period_id: periodId,
        salesperson_name: name,
        units: 0,
        real_gp: 0,
        accessory_gp: 0,
        finance_deals: 0,
        finance_income: 0,
        aftercare_income: 0,
        signups: 0,
        google_reviews: 0,
        nps: 0,
        dah: 0,
        direct_purchases: 0,
        manual_bonus_total: 0
      })
    }

    const metric = byPerson.get(name)

    metric.units += 1
    metric.real_gp += Number(deal.processed_gross || 0) - Number(deal.am_gross || 0)
    metric.accessory_gp += Number(deal.accessory_gp || 0)
    if (deal.finance_dealer_finance) metric.finance_deals += 1
    metric.finance_income += Number(deal.finance_total_income || 0)
    metric.aftercare_income += Number(deal.aftercare_total_aftermarket || 0)
  })

  groups.signups.forEach(row => {
    const name = row.salesperson || 'Unassigned'
    if (!byPerson.has(name)) {
      byPerson.set(name, { period_id: periodId, salesperson_name: name, units: 0, signups: 0 })
    }
    byPerson.get(name).signups += 1
  })

  groups.reviews.forEach(row => {
    const name = row.salesperson || 'Unassigned'
    if (!byPerson.has(name)) {
      byPerson.set(name, { period_id: periodId, salesperson_name: name, units: 0 })
    }

    const metric = byPerson.get(name)

    metric.google_reviews += Number(row.googleReviews || 0)
    metric.nps = Number(row.nps || metric.nps || 0)
    metric.dah = Number(row.dah || metric.dah || 0)
  })

  const metricRows = [...byPerson.values()].map(metric => {
    const units = Number(metric.units || 0)

    const output = {
      period_id: periodId,
      salesperson_name: metric.salesperson_name,
      units,
      signups: Number(metric.signups || 0),
      real_gp: Number(metric.real_gp || 0),
      accessory_gp: Number(metric.accessory_gp || 0),
      finance_penetration: units ? Number(metric.finance_deals || 0) / units : 0,
      finance_ipur: units ? Number(metric.finance_income || 0) / units : 0,
      aftercare_ppv: units ? Number(metric.aftercare_income || 0) / units : 0,
      trade_in_penetration: 0,
      google_reviews: Number(metric.google_reviews || 0),
      nps: Number(metric.nps || 0),
      dah: Number(metric.dah || 0),
      direct_purchases: Number(metric.direct_purchases || 0),
      manual_bonus_total: Number(metric.manual_bonus_total || 0)
    }

    output.calculated_commission = calculateCommission(output)
    output.final_commission = output.calculated_commission

    return output
  })

  const { error: metricError } = await supabase
    .from('salesperson_monthly_metrics')
    .upsert(metricRows, { onConflict: 'period_id,salesperson_name' })

  if (metricError) {
    console.error(metricError)
    alert(metricError.message)
    return
  }

  alert(`Normalization complete. ${dealRows.length} deals and ${metricRows.length} salesperson records processed.`)
  await renderManager()
}

async function fetchMetrics(periodId) {
  const { data, error } = await supabase
    .from('salesperson_monthly_metrics')
    .select('*')
    .eq('period_id', periodId)
    .order('final_commission', { ascending: false })

  if (error) {
    console.error(error)
    return []
  }

  return data || []
}

async function renderManager() {
  await requireLogin()

  const periodId = await populatePeriods()
  const select = document.querySelector('#periodSelect')
  const activePeriodId = select?.value || periodId

  if (!activePeriodId) return

  const metrics = await fetchMetrics(activePeriodId)

  const teamCommission = metrics.reduce((sum, row) => sum + Number(row.final_commission || 0), 0)
  const units = metrics.reduce((sum, row) => sum + Number(row.units || 0), 0)
  const avgFinance = metrics.length
    ? metrics.reduce((sum, row) => sum + Number(row.finance_penetration || 0), 0) / metrics.length
    : 0

  document.querySelector('#teamCommission').textContent = money(teamCommission)
  document.querySelector('#unitsSold').textContent = units
  document.querySelector('#financePen').textContent = percent(avgFinance)
  document.querySelector('#topPerformer').textContent = metrics[0]?.salesperson_name || '—'

  const teamRows = document.querySelector('#teamRows')

  if (!metrics.length) {
    teamRows.innerHTML = `<tr><td colspan="7">No team metrics yet. Import data and run normalization.</td></tr>`
    return
  }

  teamRows.innerHTML = metrics.map(row => `
    <tr>
      <td>${row.salesperson_name || 'Unassigned'}</td>
      <td>${row.units || 0}</td>
      <td>${percent(row.finance_penetration)}</td>
      <td>${money(row.aftercare_ppv)}</td>
      <td>${money(row.accessory_gp)}</td>
      <td>${money(row.final_commission)}</td>
      <td>
        <button class="btn btn-secondary psp-btn" data-name="${row.salesperson_name}">
          PSP
        </button>
      </td>
    </tr>
  `).join('')

  document.querySelectorAll('.psp-btn').forEach(button => {
    button.addEventListener('click', () => {
      const person = metrics.find(row => row.salesperson_name === button.dataset.name)
      renderPsp(person)
    })
  })
}

function renderPsp(row) {
  const panel = document.querySelector('#pspPanel')
  const insight = generateSalespersonInsights(row)

  panel.innerHTML = `
    <div class="ai-card">
      <h3>${row.salesperson_name} PSP Summary</h3>
      <p>${insight.summary}</p>

      <div class="ai-grid">
        <div>
          <h4>Strengths</h4>
          <ul>${insight.strengths.map(item => `<li>${item}</li>`).join('')}</ul>
        </div>

        <div>
          <h4>Focus Areas</h4>
          <ol>${insight.focusAreas.slice(0, 3).map(item => `<li>${item}</li>`).join('')}</ol>
        </div>
      </div>
    </div>
  `
}

async function renderSalesperson() {
  const session = await requireLogin()
  const periodId = await populatePeriods()
  const email = session?.user?.email

  if (!periodId || !email) return

  const { data: staff } = await supabase
    .from('staff')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  const name = staff?.full_name

  const { data: rows } = await supabase
    .from('salesperson_monthly_metrics')
    .select('*')
    .eq('period_id', periodId)

  const row =
    rows?.find(r => clean(r.salesperson_name) === clean(name)) ||
    rows?.[0]

  if (!row) return

  document.querySelector('#myCommission').textContent = money(row.final_commission)
  document.querySelector('#myUnits').textContent = row.units || 0
  document.querySelector('#myFinancePen').textContent = percent(row.finance_penetration)
  document.querySelector('#myAftercare').textContent = money(row.aftercare_ppv)

  const insight = generateSalespersonInsights(row)

  document.querySelector('#aiSummary').innerHTML = `
    <div class="ai-card">
      <p>${insight.summary}</p>
    </div>
  `

  document.querySelector('#focusAreas').innerHTML =
    insight.focusAreas.slice(0, 3).map(item => `<li>${item}</li>`).join('')

  document.querySelector('#performanceBreakdown').innerHTML = `
    <tr><td>Units</td><td>${row.units || 0}</td></tr>
    <tr><td>Finance Penetration</td><td>${percent(row.finance_penetration)}</td></tr>
    <tr><td>Finance IPUR</td><td>${money(row.finance_ipur)}</td></tr>
    <tr><td>Aftercare PPV</td><td>${money(row.aftercare_ppv)}</td></tr>
    <tr><td>Accessory GP</td><td>${money(row.accessory_gp)}</td></tr>
    <tr><td>Google Reviews</td><td>${row.google_reviews || 0}</td></tr>
    <tr><td>NPS</td><td>${row.nps || 0}</td></tr>
    <tr><td>DAH</td><td>${row.dah || 0}</td></tr>
  `
}

function bindManagerEvents() {
  document.querySelectorAll('.import-btn').forEach(button => {
    button.addEventListener('click', async () => {
      const periodId = document.querySelector('#periodSelect')?.value
      await processImport(button.dataset.type, periodId)
    })
  })

  document.querySelector('#normalizeBtn')?.addEventListener('click', async () => {
    const periodId = document.querySelector('#periodSelect')?.value
    await runNormalization(periodId)
  })

  document.querySelector('#refreshDashboardBtn')?.addEventListener('click', renderManager)

  document.querySelector('#periodSelect')?.addEventListener('change', renderManager)
}

if (page === 'login') handleLogin()

if (page === 'manager') {
  bindManagerEvents()
  renderManager()
}

if (page === 'salesperson') {
  renderSalesperson()
  document.querySelector('#refreshMyDashboardBtn')?.addEventListener('click', renderSalesperson)
  document.querySelector('#periodSelect')?.addEventListener('change', renderSalesperson)
}