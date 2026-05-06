import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateSalespersonInsights } from './ai-analytics.js'

const SUPABASE_URL = 'https://snzjsuwqetomdkvphvzs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuempzdXdxZXRvbWRrdnBodnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDQ5MTksImV4cCI6MjA5MzUyMDkxOX0.mkJ1_nxP0emPvhSqgUz7Q4zKm63LtG0J7xiYhwT78QQ'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

const state = {
  page: document.body.dataset.page,
  selectedPeriodId: null,
  selectedConsultant: null,
  imports: {},
  metrics: [],
  deals: []
}

document.addEventListener('DOMContentLoaded', async () => {
  if (state.page === 'login') {
    // If already logged in, redirect to correct dashboard
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData?.session) {
      const { data: auth } = await supabase.auth.getUser()
      const { data: staffRows } = await supabase
        .from('staff')
        .select('role')
        .eq('email', auth?.user?.email)
        .limit(1)
      const role = staffRows?.[0]?.role
      window.location.href = role === 'salesperson' ? './salesperson.html' : './manager.html'
      return
    }
    bindLogin()
    return
  }

  // Auth guard for protected pages
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData?.session) {
    window.location.href = './index.html'
    return
  }

  bindTabs()
  bindImportButtons()
  bindNormalizeButton()
  bindRefreshButtons()
  bindMailButtons()

  await loadPeriods()

  const periodSelect = document.getElementById('periodSelect')

  if (!state.selectedPeriodId && periodSelect?.value) {
    state.selectedPeriodId = periodSelect.value
  }

  if (state.page === 'manager') {
    await refreshManagerDashboard()
  }

  if (state.page === 'salesperson') {
    await refreshSalespersonDashboard()
  }
})

function bindLogin() {
  const form = document.getElementById('loginForm')
  const message = document.getElementById('loginMessage')

  form?.addEventListener('submit', async (event) => {
    event.preventDefault()

    const email = document.getElementById('email')?.value?.trim()
    const password = document.getElementById('password')?.value

    message.textContent = 'Signing in...'

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    })

    if (error) {
      message.textContent = error.message
      return
    }

    // Check role to decide redirect
    const { data: staffRows } = await supabase
      .from('staff')
      .select('role')
      .eq('email', email)
      .limit(1)

    const role = staffRows?.[0]?.role
    window.location.href = role === 'salesperson' ? './salesperson.html' : './manager.html'
  })
}

function bindTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'))

      btn.classList.add('active')

      const target = document.getElementById(btn.dataset.tab)

      if (target) target.classList.add('active')
    })
  })
}

function bindImportButtons() {
  document.querySelectorAll('.import-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const type = btn.dataset.type
      const textarea = document.getElementById(type)

      if (!state.selectedPeriodId) {
        alert('Select a commission period first')
        return
      }

      if (!textarea?.value?.trim()) {
        alert(`Paste ${type} data first`)
        return
      }

      const rows = parseFlexibleTable(textarea.value)

      if (!rows.length) {
        appendImportResult(`${label(type)} failed: no valid rows detected.`)
        return
      }

      state.imports[type] = rows

      await persistRawImport(type, rows)

      appendImportResult(`${label(type)} processed and saved (${rows.length} rows).`)
    })
  })
}

function bindNormalizeButton() {
  const btn = document.getElementById('normalizeBtn')

  btn?.addEventListener('click', async () => {
    if (!state.selectedPeriodId) {
      alert('Select a commission period first')
      return
    }

    await loadImportsFromDatabase()

    if (!state.imports.deal_log?.length) {
      alert('Deal Log import required')
      return
    }

    const normalizedDeals = buildDeals()
    const metrics = buildMetrics(normalizedDeals)

    await persistDeals(normalizedDeals)
    await persistMetrics(metrics)

    appendImportResult(`Normalization completed (${normalizedDeals.length} deals, ${metrics.length} salespeople).`)

    await refreshManagerDashboard()
  })
}

function bindRefreshButtons() {
  document.getElementById('refreshDashboardBtn')?.addEventListener('click', refreshManagerDashboard)
  document.getElementById('refreshMyDashboardBtn')?.addEventListener('click', refreshSalespersonDashboard)
}

function bindMailButtons() {
  document.getElementById('mailFcBtn')?.addEventListener('click', () => {
    let body = 'Monthly Commission Summary\n\n'

    state.metrics.forEach((row) => {
      body += `${row.salesperson_name} - ${money(row.final_commission)}\n`
    })

    window.location.href =
      `mailto:?subject=Monthly Commission Summary&body=${encodeURIComponent(body)}`
  })

  document.getElementById('mailtoPspBtn')?.addEventListener('click', () => {
    if (!state.selectedConsultant) return

    const insights = generateSalespersonInsights(state.selectedConsultant)

    window.location.href =
      `mailto:?subject=Performance Success Plan - ${state.selectedConsultant.salesperson_name}&body=${encodeURIComponent(insights.fullText)}`
  })
}

async function loadPeriods() {
  const select = document.getElementById('periodSelect')
  if (!select) return

  const { data, error } = await supabase
    .from('commission_periods')
    .select('*')
    .order('period_year', { ascending: false })
    .order('period_month', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  select.innerHTML = ''

  data.forEach((period) => {
    const option = document.createElement('option')
    option.value = period.id
    option.textContent = period.label
    select.appendChild(option)
  })

  if (data.length) {
    state.selectedPeriodId = data[0].id
    select.value = data[0].id
  }

  select.addEventListener('change', async () => {
    state.selectedPeriodId = select.value

    if (state.page === 'manager') await refreshManagerDashboard()
    if (state.page === 'salesperson') await refreshSalespersonDashboard()
  })
}

async function persistRawImport(type, rows) {
  const { data: batch, error: batchError } = await supabase
    .from('raw_import_batches')
    .insert({
      period_id: state.selectedPeriodId,
      import_type: type,
      row_count: rows.length
    })
    .select()
    .single()

  if (batchError) throw batchError

  const payload = rows.map((row, index) => ({
    batch_id: batch.id,
    period_id: state.selectedPeriodId,
    import_type: type,
    row_number: index + 1,
    row_data: row
  }))

  const { error } = await supabase
    .from('raw_import_rows')
    .insert(payload)

  if (error) throw error
}

async function loadImportsFromDatabase() {
  const { data, error } = await supabase
    .from('raw_import_rows')
    .select('*')
    .eq('period_id', state.selectedPeriodId)
    .order('created_at', { ascending: true })

  if (error) throw error

  state.imports = {}

  ;(data || []).forEach((row) => {
    if (!state.imports[row.import_type]) {
      state.imports[row.import_type] = []
    }

    state.imports[row.import_type].push(row.row_data)
  })
}

async function refreshManagerDashboard() {
  if (!state.selectedPeriodId) return

  const metricsRes = await supabase
    .from('salesperson_monthly_metrics')
    .select('*')
    .eq('period_id', state.selectedPeriodId)
    .order('final_commission', { ascending: false })

  const dealsRes = await supabase
    .from('master_deals')
    .select('*')
    .eq('period_id', state.selectedPeriodId)

  state.metrics = metricsRes.data || []
  state.deals = dealsRes.data || []

  renderManagerDashboard()
}

async function refreshSalespersonDashboard() {
  if (!state.selectedPeriodId) return

  const { data: auth } = await supabase.auth.getUser()
  const userEmail = auth?.user?.email

  const { data: staffRows } = await supabase
    .from('staff')
    .select('*')
    .eq('email', userEmail)
    .limit(1)

  const staff = staffRows?.[0]

  let query = supabase
    .from('salesperson_monthly_metrics')
    .select('*')
    .eq('period_id', state.selectedPeriodId)

  if (staff?.full_name) {
    query = query.eq('salesperson_name', staff.full_name)
  }

  const { data } = await query.limit(1)

  renderSalespersonDashboard(data?.[0] || null)
}

function renderManagerDashboard() {
  renderSummaryCards()
  renderTeamTable()
}

function renderSummaryCards() {
  const totalComm = state.metrics.reduce((sum, row) => sum + num(row.final_commission), 0)
  const totalUnits = state.metrics.reduce((sum, row) => sum + num(row.units), 0)
  const avgFinance = state.metrics.length
    ? state.metrics.reduce((sum, row) => sum + num(row.finance_penetration), 0) / state.metrics.length
    : 0

  const top = state.metrics[0]

  setText('teamCommission', money(totalComm))
  setText('unitsSold', totalUnits)
  setText('financePen', `${Math.round(avgFinance)}%`)
  setText('topPerformer', top?.salesperson_name || '—')
}

function renderTeamTable() {
  const tbody = document.getElementById('teamRows')
  if (!tbody) return

  tbody.innerHTML = ''

  if (!state.metrics.length) {
    tbody.innerHTML = `<tr><td colspan="8">No rows for this period.</td></tr>`
    return
  }

  state.metrics.forEach((row) => {
    const tr = document.createElement('tr')

    tr.innerHTML = `
      <td>${safe(row.salesperson_name)}</td>
      <td>${num(row.units)}</td>
      <td>${Math.round(num(row.finance_penetration))}%</td>
      <td>${money(row.finance_ipur)}</td>
      <td>${money(row.aftercare_ppv)}</td>
      <td>${money(row.accessory_gp)}</td>
      <td><strong>${money(row.final_commission)}</strong></td>
      <td><button class="btn btn-secondary psp-btn">PSP</button></td>
    `

    tr.addEventListener('click', () => renderConsultantDetail(row))

    tr.querySelector('.psp-btn')?.addEventListener('click', (event) => {
      event.stopPropagation()
      renderPSP(row)
      document.querySelector('[data-tab="pspTab"]')?.click()
    })

    tbody.appendChild(tr)
  })
}

function renderConsultantDetail(row) {
  state.selectedConsultant = row

  const container = document.getElementById('consultantDetail')
  if (!container) return

  const consultantDeals = state.deals.filter((deal) => deal.salesperson_name === row.salesperson_name)

  container.innerHTML = `
    <div class="consultant-grid">
      <div class="detail-card">
        <h3>${safe(row.salesperson_name)}</h3>
        <p><strong>Units:</strong> ${num(row.units)}</p>
        <p><strong>Sign Ups:</strong> ${num(row.signups)}</p>
        <p><strong>Finance Pen:</strong> ${Math.round(num(row.finance_penetration))}%</p>
        <p><strong>Finance IPUR:</strong> ${money(row.finance_ipur)}</p>
        <p><strong>Aftercare PPV:</strong> ${money(row.aftercare_ppv)}</p>
        <p><strong>Accessory GP:</strong> ${money(row.accessory_gp)}</p>
      </div>

      <div class="detail-card">
        <h3>Commission Breakdown</h3>
        <p>Base Unit Commission: ${money(row.base_unit_commission)}</p>
        <p>Fixed / Earned Payouts: ${money(row.fixed_payout_total)}</p>
        <p>KPI Bonus Pool: ${money(row.kpi_bonus_pool)}</p>
        <p>Volume Unlock: ${Math.round(num(row.volume_unlock_percentage) * 100)}%</p>
        <p>Unlocked KPI Bonus: ${money(row.unlocked_kpi_bonus)}</p>
        <p>Manual Bonus: ${money(row.manual_bonus_total)}</p>
        <p>Direct Purchase Bonus: ${money(row.direct_purchase_bonus)}</p>
        <hr>
        <h2>${money(row.final_commission)}</h2>
      </div>

      <div class="detail-card">
        <h3>Deal Breakdown</h3>
        ${
          consultantDeals.length
            ? consultantDeals.map((deal) => `
              <div class="deal-line">
                <span>${safe(deal.deal_number)}</span>
                <span>${money(deal.real_gp)}</span>
              </div>
            `).join('')
            : '<p class="muted">No deal detail found.</p>'
        }
      </div>
    </div>
  `
}

function renderPSP(row) {
  state.selectedConsultant = row

  const btn = document.getElementById('mailtoPspBtn')
  if (btn) btn.disabled = false

  const panel = document.getElementById('pspPanel')
  if (!panel) return

  const insights = generateSalespersonInsights(row)

  panel.innerHTML = `
    <div class="psp-grid">
      <div class="detail-card">
        <h3>AI Summary</h3>
        <p>${safe(insights.summary)}</p>
      </div>

      <div class="detail-card">
        <h3>Strengths</h3>
        ${insights.strengths.map((x) => `<p>• ${safe(x)}</p>`).join('') || '<p class="muted">No strengths detected yet.</p>'}
      </div>

      <div class="detail-card">
        <h3>Opportunities</h3>
        ${insights.opportunities.map((x) => `<p>• ${safe(x)}</p>`).join('') || '<p class="muted">No major gaps detected yet.</p>'}
      </div>

      <div class="detail-card">
        <h3>Focus Areas</h3>
        ${insights.focusAreas.map((x) => `<p>• ${safe(x)}</p>`).join('')}
      </div>
    </div>
  `
}

function renderSalespersonDashboard(row) {
  if (!row) {
    setText('myCommission', '$0')
    setText('myUnits', '0')
    setText('myFinancePen', '0%')
    setText('myAftercare', '$0')
    return
  }

  const insights = generateSalespersonInsights(row)

  setText('myCommission', money(row.final_commission))
  setText('myUnits', num(row.units))
  setText('myFinancePen', `${Math.round(num(row.finance_penetration))}%`)
  setText('myAftercare', money(row.aftercare_ppv))

  const aiSummary = document.getElementById('aiSummary')
  if (aiSummary) {
    aiSummary.innerHTML = `<p>${safe(insights.summary)}</p>`
  }

  const focusAreas = document.getElementById('focusAreas')
  if (focusAreas) {
    focusAreas.innerHTML = insights.focusAreas.map((x) => `<li>${safe(x)}</li>`).join('')
  }

  const breakdown = document.getElementById('performanceBreakdown')
  if (breakdown) {
    breakdown.innerHTML = `
      <tr><td>Units</td><td>${num(row.units)}</td></tr>
      <tr><td>Finance Penetration</td><td>${Math.round(num(row.finance_penetration))}%</td></tr>
      <tr><td>Finance IPUR</td><td>${money(row.finance_ipur)}</td></tr>
      <tr><td>Aftercare PPV</td><td>${money(row.aftercare_ppv)}</td></tr>
      <tr><td>Accessory GP</td><td>${money(row.accessory_gp)}</td></tr>
      <tr><td>Google Reviews</td><td>${num(row.google_reviews)}</td></tr>
      <tr><td>NPS</td><td>${num(row.nps)}</td></tr>
      <tr><td>DAH</td><td>${num(row.dah)}</td></tr>
    `
  }
}

function buildDeals() {
  const dealRows = state.imports.deal_log || []

  return dealRows
    .map((row) => {
      const dealNumber = get(row, ['deal', 'deal number', 'deal no', 'stock deal no', 'stock no', 'deal ref'])
      const salesperson = get(row, ['salesperson', 'sales person', 'consultant', 'sales consultant'])

      if (!dealNumber || !salesperson) return null

      const processedGross = moneyNumber(get(row, ['processed gross', 'posted gross', 'gross', 'total gross', 'est gross']))
      const amGross = moneyNumber(get(row, ['am gross', 'am  gross', 'am cost amount', 'aftermarket gross']))

      const accessoryGp = sumByDeal('accessories', dealNumber, (r) => {
        return moneyNumber(get(r, ['sale amount', 'sales amount', 'accessory sale'])) -
          moneyNumber(get(r, ['cost amount', 'cost', 'accessory cost']))
      })

      const financeRows = rowsByDeal('finance', dealNumber)
      const financeIncome = financeRows.reduce((sum, r) => sum + moneyNumber(get(r, ['adj total inc', 'total income', 'tot fin income', 'income', 'finance income'])), 0)
      const dealerFinance = financeRows.some((r) => {
        const pm = String(get(r, ['payment method']) || '').toLowerCase()
        const ft = String(get(r, ['finance product type', 'deal type', 'loan type']) || '').toLowerCase()
        return pm.includes('dealer finance') || ft.includes('dealer finance')
      })

      const aftercareTotal = sumByDeal('aftercare', dealNumber, (r) => {
        return moneyNumber(get(r, ['total aftermarket', 'aftermarket total', 'aftercare total', 'aftermarket income']))
      })

      return {
        period_id: state.selectedPeriodId,
        deal_number: String(dealNumber),
        salesperson_name: cleanName(salesperson),
        customer_name: get(row, ['customer', 'customer name', 'name']) || '',
        vehicle: get(row, ['vehicle', 'vehicle description', 'model']) || '',
        processed_gross: processedGross,
        am_gross: amGross,
        real_gp: processedGross - amGross,
        accessory_gp: accessoryGp,
        finance_income: financeIncome,
        dealer_finance: dealerFinance,
        aftercare_total: aftercareTotal
      }
    })
    .filter(Boolean)
}

function buildMetrics(deals) {
  const grouped = {}

  deals.forEach((deal) => {
    const key = deal.salesperson_name || 'Unknown'

    if (!grouped[key]) grouped[key] = blankMetric(key)

    grouped[key].units += 1
    grouped[key].finance_income_total += num(deal.finance_income)
    grouped[key].accessory_gp += num(deal.accessory_gp)
    grouped[key].aftercare_total += num(deal.aftercare_total)
    grouped[key].new_gross_total = (grouped[key].new_gross_total || 0) + num(deal.real_gp)

    if (deal.dealer_finance) grouped[key].finance_deals += 1
  })

  addSignups(grouped)
  addReviews(grouped)
  addLeads(grouped)

  Object.values(grouped).forEach((row) => {
    row.finance_penetration = row.units ? (row.finance_deals / row.units) * 100 : 0
    row.finance_ipur = row.units ? row.finance_income_total / row.units : 0
    row.aftercare_ppv = row.units ? row.aftercare_total / row.units : 0

    // $100 per delivered unit
    row.base_unit_commission = row.units * 100

    // Volume bonus: $750 if >= 18 deliveries
    row.volume_bonus = row.units >= 18 ? 750 : 0

    // Sign ups bonus: $250 if >= 23 sign ups
    row.signups_bonus = row.signups >= 23 ? 250 : 0

    // 5% of new gross (can be negative)
    row.gross_bonus = (row.new_gross_total || 0) * 0.05

    // KPI bonuses via scale lookups
    row.kpi_bonus_pool = calculateKpiPool(row)
    row.volume_unlock_percentage = 1
    row.unlocked_kpi_bonus = row.kpi_bonus_pool

    row.manual_bonus_total = 0
    row.direct_purchase_bonus = 0
    row.fixed_payout_total = row.volume_bonus + row.signups_bonus

    row.final_commission =
      row.base_unit_commission +
      row.fixed_payout_total +
      row.gross_bonus +
      row.unlocked_kpi_bonus +
      row.manual_bonus_total +
      row.direct_purchase_bonus
  })

  return Object.values(grouped)
}

function blankMetric(name) {
  return {
    period_id: state.selectedPeriodId,
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

function addSignups(grouped) {
  const seenDeals = new Set()
  ;(state.imports.signups || []).forEach((row) => {
    const name = cleanName(get(row, ['sales person', 'salesperson', 'consultant', 'sales consultant']))
    if (!name) return
    // Deduplicate by deal number to avoid double-counting duplicate rows
    const dealKey = normalizeDealNumber(get(row, ['deal', 'deal number', 'deal no']))
    const dedupKey = dealKey ? name + '|' + dealKey : null
    if (dedupKey) {
      if (seenDeals.has(dedupKey)) return
      seenDeals.add(dedupKey)
    }
    if (!grouped[name]) grouped[name] = blankMetric(name)
    grouped[name].signups += 1
  })
}

function addReviews(grouped) {
  ;(state.imports.reviews || []).forEach((row) => {
    // Support both structured (name column present) and shifted exports
    // where salesperson name appears in nps/dah column and metrics in google reviews column
    let name = cleanName(get(row, ['salesperson', 'sales person', 'consultant', 'sales consultant', 'name']))

    // Detect shifted format: if name is empty but 'nps' looks like a name (not a number)
    if (!name) {
      const npsVal = String(get(row, ['nps', 'nps score']) || '').trim()
      if (npsVal && isNaN(Number(npsVal.replace('%', '')))) {
        name = cleanName(npsVal)
      }
    }

    if (!name) return
    if (!grouped[name]) grouped[name] = blankMetric(name)

    const googleVal = get(row, ['google reviews', 'google review', 'reviews'])
    const npsVal = get(row, ['nps score', 'nps'])
    const dahVal = get(row, ['dah', 'drive away happy', 'driveaway happy'])

    // In the shifted format, google reviews column holds the numeric % value
    const googleNum = moneyNumber(googleVal)
    const npsNum = moneyNumber(npsVal)
    const dahNum = moneyNumber(dahVal)

    if (googleNum > 0) grouped[name].google_reviews += googleNum
    if (npsNum > 0) grouped[name].nps = npsNum
    if (dahNum > 0) grouped[name].dah = dahNum
  })
}

function addLeads(grouped) {
  ;(state.imports.leads || []).forEach((row) => {
    const name = cleanName(get(row, ['sales person', 'salesperson', 'owner', 'consultant', 'sales consultant']))
    if (!name) return

    if (!grouped[name]) grouped[name] = blankMetric(name)

    grouped[name].new_leads += 1
    grouped[name].test_drives += moneyNumber(get(row, ['test drive', 'test drives', 'test drive count']))
    grouped[name].valuations += moneyNumber(get(row, ['valuation', 'valuations', 'valuation count']))
  })
}

// ── Commission rules matching Excel calculator ──────────────────────────────
// Aftercare PPV scale → payout
function aftercarePayout(ppv) {
  if (ppv >= 800) return 1100
  if (ppv >= 600) return 1000
  if (ppv >= 400) return 750
  if (ppv >= 250) return 500
  return 0
}

// Finance penetration % (0-100) → payout
function financePenPayout(pen) {
  if (pen >= 75) return 1000
  if (pen >= 40) return 500
  if (pen >= 25) return 250
  return 0
}

// Finance IPUR → payout
function financeIpurPayout(ipur) {
  if (ipur >= 1500) return 1000
  if (ipur >= 1100) return 500
  if (ipur >= 800)  return 250
  return 0
}

// Accessory PVR → payout
function accessoryPayout(pvr) {
  if (pvr >= 500) return 450
  if (pvr >= 100) return 150
  return 0
}

// Google reviews: $25 per review
function googleReviewPayout(count) {
  return Math.round(count) * 25
}

// NPS (0-100): $250 if >= 80
function npsPayout(nps) {
  return nps >= 80 ? 250 : 0
}

// DAH (0-100): $250 if >= 80
function dahPayout(dah) {
  return dah >= 80 ? 250 : 0
}

function calculateUnlock(units) {
  return units > 0 ? 1 : 0
}

function calculateKpiPool(row) {
  return (
    aftercarePayout(row.aftercare_ppv) +
    financePenPayout(row.finance_penetration) +
    financeIpurPayout(row.finance_ipur) +
    accessoryPayout(row.accessory_gp) +
    googleReviewPayout(row.google_reviews) +
    npsPayout(row.nps) +
    dahPayout(row.dah)
  )
}

async function persistDeals(deals) {
  await supabase
    .from('master_deals')
    .delete()
    .eq('period_id', state.selectedPeriodId)

  if (!deals.length) return

  const { error } = await supabase
    .from('master_deals')
    .insert(deals)

  if (error) throw error
}

async function persistMetrics(metrics) {
  await supabase
    .from('salesperson_monthly_metrics')
    .delete()
    .eq('period_id', state.selectedPeriodId)

  if (!metrics.length) return

  const { error } = await supabase
    .from('salesperson_monthly_metrics')
    .insert(metrics)

  if (error) throw error
}

function parseFlexibleTable(text) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const delimiter = detectDelimiter(lines)

  let headerIndex = lines.findIndex((line) => {
    const lowered = line.toLowerCase()
    return lowered.includes('deal') ||
      lowered.includes('salesperson') ||
      lowered.includes('sales person') ||
      lowered.includes('consultant')
  })

  if (headerIndex < 0) headerIndex = 0

  const headers = splitLine(lines[headerIndex], delimiter).map(normalizeHeader)

  return lines.slice(headerIndex + 1)
    .map((line) => splitLine(line, delimiter))
    .filter((cols) => cols.some(Boolean))
    .map((cols) => {
      const obj = {}

      headers.forEach((header, index) => {
        if (header) obj[header] = cols[index]?.trim() || ''
      })

      return obj
    })
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 10).join('\n')
  const tabs = (sample.match(/\t/g) || []).length
  const commas = (sample.match(/,/g) || []).length

  return tabs >= commas ? '\t' : ','
}

function splitLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t')

  const result = []
  let current = ''
  let quoted = false

  for (const char of line) {
    if (char === '"') quoted = !quoted
    else if (char === ',' && !quoted) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)

  return result
}

function normalizeDealNumber(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/^0+/, '')
    .toLowerCase()
}

function rowsByDeal(type, dealNumber) {
  const normalized = normalizeDealNumber(dealNumber)
  return (state.imports[type] || []).filter((row) => {
    const rowDeal = get(row, ['deal', 'deal number', 'deal no', 'stock deal no', 'stock no', 'deal ref'])
    return normalizeDealNumber(rowDeal) === normalized
  })
}

function sumByDeal(type, dealNumber, mapper) {
  return rowsByDeal(type, dealNumber).reduce((sum, row) => sum + mapper(row), 0)
}

function get(row, names) {
  for (const name of names) {
    const key = normalizeHeader(name)
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key]
    }
  }

  return ''
}

function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[$#.()\[\]]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function truthy(value) {
  const v = String(value || '').toLowerCase().trim()
  return ['yes', 'y', 'true', '1', 'dealer finance', 'finance'].includes(v)
}

function moneyNumber(value) {
  const cleaned = String(value || '')
    .replace(/[$,]/g, '')
    .replace(/[^\d.-]/g, '')

  return Number(cleaned || 0)
}

function num(value) {
  return Number(value || 0)
}

function money(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(num(value))
}

function safe(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function label(type) {
  return String(type || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function appendImportResult(message) {
  const container = document.getElementById('importResults')
  if (!container) return

  const existingEmpty = container.querySelector('.empty-state')
  if (existingEmpty) existingEmpty.remove()

  const div = document.createElement('div')
  div.className = 'result-item'
  div.textContent = message

  container.prepend(div)
}

function setText(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}