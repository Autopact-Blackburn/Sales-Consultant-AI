import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateSalespersonInsights } from './ai-analytics.js'

const SUPABASE_URL = 'https://snzjsuwqetomdkvphvzs.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInJlZiI6InNuempzdXdxZXRvbWRrdnBodnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDQ5MTksImV4cCI6MjA5MzUyMDkxOX0.mkJ1_nxP0emPvhSqgUz7Q4zKm63LtG0J7xiYhwT78QQ'

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
    const { data: sessionData } = await supabase.auth.getSession()

    if (sessionData?.session) {
      await redirectByRole()
      return
    }

    bindLogin()
    return
  }

  const { data: sessionData } = await supabase.auth.getSession()

  if (!sessionData?.session) {
    window.location.href = './index.html'
    return
  }

  bindTabs()
  bindImportButtons()
  bindFileUploads()
  bindNormalizeButton()
  bindRefreshButtons()
  bindMailButtons()

  async function loadPeriods() {
  const select = document.getElementById('periodSelect')

  if (!select) return

  try {

    const { data, error } = await supabase
      .from('commission_periods')
      .select('*')
      .order('period_year', { ascending: false })
      .order('period_month', { ascending: false })

    if (error) {
      console.error('Period load error:', error)
      alert('Failed to load commission periods')
      return
    }

    console.log('Commission periods:', data)

    select.innerHTML = ''

    if (!data || !data.length) {

      const option = document.createElement('option')
      option.value = ''
      option.textContent = 'No Commission Periods Found'
      select.appendChild(option)

      state.selectedPeriodId = null

      return
    }

    data.forEach((period) => {

      const option = document.createElement('option')

      option.value = period.id

      option.textContent =
        period.label ||
        `${period.period_month}/${period.period_year}`

      select.appendChild(option)
    })

    state.selectedPeriodId = data[0].id

    select.value = data[0].id

    console.log('Selected period set:', state.selectedPeriodId)

    select.addEventListener('change', async () => {

      state.selectedPeriodId = select.value

      console.log('Period changed:', state.selectedPeriodId)

      if (state.page === 'manager') {
        await refreshManagerDashboard()
      }

      if (state.page === 'salesperson') {
        await refreshSalespersonDashboard()
      }
    })

  } catch (err) {

    console.error(err)

    alert('Critical period loading failure')
  }
}

async function redirectByRole() {
  const { data: auth } = await supabase.auth.getUser()

  const { data: staffRows } = await supabase
    .from('staff')
    .select('role')
    .eq('email', auth?.user?.email)
    .limit(1)

  const role = staffRows?.[0]?.role

  window.location.href = role === 'salesperson'
    ? './salesperson.html'
    : './manager.html'
}

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

    await redirectByRole()
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

function bindFileUploads() {
  document.querySelectorAll('.file-input').forEach((input) => {
    input.addEventListener('change', async (event) => {
      try {
        const file = event.target.files?.[0]
        if (!file) return

        const type = input.dataset.type
        const text = await file.text()
        const textarea = document.getElementById(type)

        if (textarea) {
          textarea.value = text
        }

        appendImportResult(`${label(type)} upload loaded successfully (${file.name})`)

        console.log(`${type} file preview:`)
        console.log(text.slice(0, 1200))
      } catch (error) {
        console.error(error)
        alert('File upload failed')
      }
    })
  })
}

function bindImportButtons() {
  document.querySelectorAll('.import-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        const type = btn.dataset.type
        const textarea = document.getElementById(type)

        if (!state.selectedPeriodId) {
          alert('Select a commission period first')
          return
        }

        if (!textarea?.value?.trim()) {
          alert(`Upload or paste ${label(type)} data first`)
          return
        }

        const rows = parseFlexibleTable(textarea.value)

        console.log(`${type} parsed rows`, rows.slice(0, 5))

        if (!rows.length) {
          appendImportResult(`${label(type)} failed: no valid rows detected.`)
          return
        }

        state.imports[type] = rows

        await persistRawImport(type, rows)

        appendImportResult(`${label(type)} processed and saved (${rows.length} rows).`)
      } catch (error) {
        console.error(error)
        alert(error.message || 'Import failed')
      }
    })
  })
}

function bindNormalizeButton() {
  const btn = document.getElementById('normalizeBtn')

  btn?.addEventListener('click', async () => {
    try {
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

      console.log('normalized deals', normalizedDeals.slice(0, 10))
      console.log('metrics payload', metrics)

      await persistDeals(normalizedDeals)
      await persistMetrics(metrics)

      appendImportResult(`Normalization completed (${normalizedDeals.length} deals, ${metrics.length} salespeople).`)

      await refreshManagerDashboard()
      document.querySelector('[data-tab="dashboardTab"]')?.click()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Normalization failed')
    }
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
  await supabase
    .from('raw_import_rows')
    .delete()
    .eq('period_id', state.selectedPeriodId)
    .eq('import_type', type)

  await supabase
    .from('raw_import_batches')
    .delete()
    .eq('period_id', state.selectedPeriodId)
    .eq('import_type', type)

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
    .order('row_number', { ascending: true })

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

  const avgFinance = totalUnits
    ? (state.metrics.reduce((sum, row) => sum + num(row.finance_deals), 0) / totalUnits) * 100
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
      <td>
        <div class="table-actions">
          <button class="btn btn-secondary psp-btn">PSP</button>
          <button class="btn btn-primary workings-btn">Workings</button>
        </div>
      </td>
    `

    tr.addEventListener('click', () => renderConsultantDetail(row))

    tr.querySelector('.psp-btn')?.addEventListener('click', (event) => {
      event.stopPropagation()
      renderPSP(row)
      document.querySelector('[data-tab="pspTab"]')?.click()
    })

    tr.querySelector('.workings-btn')?.addEventListener('click', (event) => {
      event.stopPropagation()
      renderConsultantDetail(row)

      const section = document.getElementById('consultantDetail')
      if (section) {
        section.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        })
      }
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
        <p class="eyebrow">Summary</p>
        <h3>${safe(row.salesperson_name)}</h3>

        <p><strong>Units:</strong> ${num(row.units)}</p>
        <p><strong>Finance Deals:</strong> ${num(row.finance_deals)}</p>
        <p><strong>Finance Pen:</strong> ${Math.round(num(row.finance_penetration))}%</p>
        <p><strong>Finance IPUR:</strong> ${money(row.finance_ipur)}</p>
        <p><strong>Aftercare PPV:</strong> ${money(row.aftercare_ppv)}</p>
        <p><strong>Accessory GP:</strong> ${money(row.accessory_gp)}</p>
      </div>

      <div class="detail-card">
        <p class="eyebrow">Commission Workings</p>
        <h3>How the total was calculated</h3>

        <p>Base Unit Commission: <strong>${money(row.base_unit_commission)}</strong></p>
        <p>Volume Bonus: <strong>${money(row.volume_bonus)}</strong></p>
        <p>Sign Ups Bonus: <strong>${money(row.signups_bonus)}</strong></p>
        <p>Gross Bonus: <strong>${money(row.gross_bonus)}</strong></p>
        <p>KPI Bonus Pool: <strong>${money(row.kpi_bonus_pool)}</strong></p>
        <p>Volume Unlock: <strong>${Math.round(num(row.volume_unlock_percentage) * 100)}%</strong></p>
        <p>Unlocked KPI Bonus: <strong>${money(row.unlocked_kpi_bonus)}</strong></p>
        <p>Manual Bonus: <strong>${money(row.manual_bonus_total)}</strong></p>
        <p>Direct Purchase Bonus: <strong>${money(row.direct_purchase_bonus)}</strong></p>

        <hr>
        <h2>${money(row.final_commission)}</h2>
      </div>

      <div class="detail-card">
        <p class="eyebrow">KPI Pool Components</p>
        <h3>Bonus contributors</h3>

        <p>Aftercare PPV Bonus: <strong>${money(aftercarePayout(row.aftercare_ppv))}</strong></p>
        <p>Finance Pen Bonus: <strong>${money(financePenPayout(row.finance_penetration))}</strong></p>
        <p>Finance IPUR Bonus: <strong>${money(financeIpurPayout(row.finance_ipur))}</strong></p>
        <p>Accessory Bonus: <strong>${money(accessoryPayout(row.accessory_gp))}</strong></p>
        <p>Google Review Bonus: <strong>${money(googleReviewPayout(row.google_reviews))}</strong></p>
        <p>NPS Bonus: <strong>${money(npsPayout(row.nps))}</strong></p>
        <p>DAH Bonus: <strong>${money(dahPayout(row.dah))}</strong></p>
      </div>

      <div class="detail-card">
        <p class="eyebrow">Deal Trace</p>
        <h3>Deal-level contribution</h3>

        ${
          consultantDeals.length
            ? consultantDeals.map((deal) => `
              <div class="deal-line">
                <span>
                  <strong>${safe(deal.deal_number)}</strong><br>
                  <small>${safe(deal.vehicle || deal.customer_name || '')}</small>
                </span>
                <span>
                  GP ${money(deal.real_gp)}<br>
                  F&I ${money(deal.finance_income)}<br>
                  AC ${money(deal.aftercare_total)}
                </span>
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
      <tr><td>Final Commission</td><td>${money(row.final_commission)}</td></tr>
      <tr><td>Base Unit Commission</td><td>${money(row.base_unit_commission)}</td></tr>
      <tr><td>Volume Bonus</td><td>${money(row.volume_bonus)}</td></tr>
      <tr><td>Sign Ups Bonus</td><td>${money(row.signups_bonus)}</td></tr>
      <tr><td>Gross Bonus</td><td>${money(row.gross_bonus)}</td></tr>
      <tr><td>KPI Bonus Pool</td><td>${money(row.kpi_bonus_pool)}</td></tr>
      <tr><td>Volume Unlock</td><td>${Math.round(num(row.volume_unlock_percentage) * 100)}%</td></tr>
      <tr><td>Unlocked KPI Bonus</td><td>${money(row.unlocked_kpi_bonus)}</td></tr>
      <tr><td>Finance Penetration</td><td>${Math.round(num(row.finance_penetration))}%</td></tr>
      <tr><td>Finance IPUR</td><td>${money(row.finance_ipur)}</td></tr>
      <tr><td>Aftercare PPV</td><td>${money(row.aftercare_ppv)}</td></tr>
      <tr><td>Accessory GP</td><td>${money(row.accessory_gp)}</td></tr>
      <tr><td>Google Reviews</td><td>${num(row.google_reviews)}</td></tr>
      <tr><td>NPS</td><td>${num(row.nps)}</td></tr>
      <tr><td>DAH</td><td>${num(row.dah)}</td></tr>
      <tr><td>Leads</td><td>${num(row.new_leads)}</td></tr>
      <tr><td>Test Drives</td><td>${num(row.test_drives)}</td></tr>
      <tr><td>Valuations</td><td>${num(row.valuations)}</td></tr>
    `
  }
}

function buildDeals() {
  const dealRows = state.imports.deal_log || []

  return dealRows
    .map((row) => {
      const dealNumber = getDealValue(row)
      const salesperson = get(row, [
        'salesperson',
        'sales person',
        'sales consultant',
        'consultant',
        'salesperson name',
        'sales person name',
        'sales person full name'
      ])

      if (!dealNumber || !salesperson) return null

      const processedGross = moneyNumber(get(row, [
        'processed gross',
        'posted gross',
        'gross',
        'total gross',
        'est gross',
        'estimated gross',
        'real gross'
      ]))

      const amGross = moneyNumber(get(row, [
        'am gross',
        'am - gross',
        'aftermarket gross',
        'am cost amount'
      ]))

      const accessoryGp = sumByDeal('accessories', dealNumber, (r) => {
        const sale = moneyNumber(get(r, [
          'sale amount',
          'sales amount',
          'accessory sale',
          'sell amount',
          'selling amount',
          'sell price incl gst',
          'sell price excl gst'
        ]))

        const cost = moneyNumber(get(r, [
          'cost amount',
          'cost',
          'accessory cost',
          'cost incl gst',
          'cost excl gst'
        ]))

        const profit = moneyNumber(get(r, [
          'profit excl gst',
          'profit incl gst',
          'profit',
          'gross'
        ]))

        return profit || (sale - cost)
      })

      const financeRows = rowsByDeal('finance', dealNumber)

      const financeIncome = financeRows.reduce((sum, r) => {
        const directIncome = moneyNumber(get(r, [
          'adj total inc',
          'total income',
          'tot fin income',
          'finance income',
          'finance commission',
          'income',
          'commission',
          'comm'
        ]))

        const commissionSum = sumMoneyFields(r, [
          'commission',
          'comm'
        ])

        return sum + (directIncome || commissionSum)
      }, 0)

      const dealerFinance = financeRows.some((r) => {
        const paymentMethod = String(get(r, [
          'payment method'
        ])).toLowerCase()

        const financeType = String(get(r, [
          'finance product type',
          'loan type',
          'finance supplier',
          'finance type',
          'product type'
        ])).toLowerCase()

        const income = moneyNumber(get(r, [
          'adj total inc',
          'total income',
          'finance income',
          'commission',
          'comm'
        ])) || sumMoneyFields(r, ['commission', 'comm'])

        return (
          paymentMethod.includes('finance') ||
          financeType.includes('loan') ||
          financeType.includes('lease') ||
          financeType.includes('consumer') ||
          financeType.includes('business') ||
          income > 0
        )
      })

      const aftercareTotal = sumByDeal('aftercare', dealNumber, (r) => {
        const directAftermarket = moneyNumber(get(r, [
          'total aftermarket',
          'aftermarket total',
          'aftercare total',
          'aftermarket income',
          'aftercare income',
          'total income',
          'total aftercare'
        ]))

        const commissionSum = sumMoneyFields(r, [
          'commission',
          'comm'
        ])

        const premiumSum = sumMoneyFields(r, [
          'premium'
        ])

        const gross = moneyNumber(get(r, [
          'gross'
        ]))

        return directAftermarket || commissionSum || gross || premiumSum
      })

      return {
        period_id: state.selectedPeriodId,
        deal_number: String(dealNumber),
        salesperson_name: cleanName(salesperson),
        customer_name: get(row, ['customer', 'customer name', 'name']) || '',
        vehicle: get(row, ['vehicle', 'vehicle description', 'model', 'description']) || '',
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
    grouped[key].new_gross_total += num(deal.real_gp)

    if (deal.dealer_finance) {
      grouped[key].finance_deals += 1
    }
  })

  addSignups(grouped)
  addReviews(grouped)
  addAftercareSummary(grouped)
  addLeads(grouped)

  Object.values(grouped).forEach((row) => {
    row.finance_penetration = row.units ? (row.finance_deals / row.units) * 100 : 0
    row.finance_ipur = row.units ? row.finance_income_total / row.units : 0

    if (!row.aftercare_ppv) {
      row.aftercare_ppv = row.units ? row.aftercare_total / row.units : 0
    }

    row.base_unit_commission = row.units * 100
    row.volume_bonus = row.units >= 18 ? 750 : 0
    row.signups_bonus = row.signups >= 23 ? 250 : 0
    row.gross_bonus = row.new_gross_total * 0.05

    row.kpi_bonus_pool = calculateKpiPool(row)
    row.volume_unlock_percentage = volumeUnlock(row.units)
    row.unlocked_kpi_bonus = row.kpi_bonus_pool * row.volume_unlock_percentage

    row.manual_bonus_total = num(row.manual_bonus_total)
    row.direct_purchase_bonus = num(row.direct_purchase_bonus)
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
    const name = cleanName(get(row, [
      'sales person',
      'salesperson',
      'consultant',
      'sales consultant',
      'salesperson name'
    ]))

    if (!name) return

    const dealKey = normalizeDealNumber(getDealValue(row))
    const dedupKey = dealKey ? `${name}|${dealKey}` : null

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
    let name = cleanName(get(row, [
      'salesperson',
      'sales person',
      'consultant',
      'sales consultant',
      'name'
    ]))

    if (!name) {
      const maybeName = String(get(row, ['nps', 'nps score']) || '').trim()

      if (maybeName && isNaN(Number(maybeName.replace('%', '')))) {
        name = cleanName(maybeName)
      }
    }

    if (!name) return

    if (!grouped[name]) grouped[name] = blankMetric(name)

    const googleNum = moneyNumber(get(row, [
      'google reviews',
      'google review',
      'reviews'
    ]))

    const npsNum = moneyNumber(get(row, [
      'nps score',
      'nps'
    ]))

    const dahNum = moneyNumber(get(row, [
      'dah',
      'drive away happy',
      'driveaway happy'
    ]))

    if (googleNum > 0) grouped[name].google_reviews += googleNum
    if (npsNum > 0) grouped[name].nps = npsNum
    if (dahNum > 0) grouped[name].dah = dahNum
  })
}

function addAftercareSummary(grouped) {
  ;(state.imports.aftercare || []).forEach((row) => {
    const hasDeal = Boolean(getDealValue(row))
    if (hasDeal) return

    const name = cleanName(get(row, [
      'salespersonname',
      'salesperson name',
      'salesperson',
      'sales person',
      'consultant',
      'name'
    ]))

    if (!name || name.toLowerCase() === 'total') return

    if (!grouped[name]) grouped[name] = blankMetric(name)

    const gross = moneyNumber(get(row, [
      'gross',
      'total aftermarket',
      'aftermarket total',
      'aftercare total'
    ]))

    const deals = moneyNumber(get(row, [
      'deals',
      'units',
      'vehicles'
    ]))

    const pvr = moneyNumber(get(row, [
      'pvr',
      'ppv',
      'aftercare ppv',
      'aftercare pvr'
    ]))

    if (gross > 0) grouped[name].aftercare_total = gross
    if (pvr > 0) grouped[name].aftercare_ppv = pvr

    if (!grouped[name].units && deals > 0) {
      grouped[name].units = deals
    }
  })
}

function addLeads(grouped) {
  ;(state.imports.leads || []).forEach((row) => {
    const name = cleanName(get(row, [
      'sales person',
      'salesperson',
      'owner',
      'consultant',
      'sales consultant',
      'salesperson name'
    ]))

    if (!name) return

    if (!grouped[name]) grouped[name] = blankMetric(name)

    grouped[name].new_leads += moneyNumber(get(row, [
      'new leads',
      'leads',
      'lead count'
    ])) || 1

    grouped[name].test_drives += moneyNumber(get(row, [
      'test drive',
      'test drives',
      'test drive count'
    ]))

    grouped[name].valuations += moneyNumber(get(row, [
      'valuation',
      'valuations',
      'valuation count',
      'appraisals'
    ]))
  })
}

function volumeUnlock(units) {
  if (units >= 18) return 1
  if (units >= 15) return 0.75
  if (units >= 12) return 0.25
  return 0
}

function aftercarePayout(ppv) {
  if (ppv >= 800) return 1100
  if (ppv >= 600) return 1000
  if (ppv >= 400) return 750
  if (ppv >= 250) return 500
  return 0
}

function financePenPayout(pen) {
  if (pen >= 75) return 1000
  if (pen >= 40) return 500
  if (pen >= 25) return 250
  return 0
}

function financeIpurPayout(ipur) {
  if (ipur >= 1500) return 1000
  if (ipur >= 1100) return 500
  if (ipur >= 800) return 250
  return 0
}

function accessoryPayout(pvr) {
  if (pvr >= 500) return 450
  if (pvr >= 100) return 150
  return 0
}

function googleReviewPayout(count) {
  return Math.round(count) * 25
}

function npsPayout(nps) {
  return nps >= 80 ? 250 : 0
}

function dahPayout(dah) {
  return dah >= 80 ? 250 : 0
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

  let bestIndex = 0
  let bestScore = -1

  lines.slice(0, 40).forEach((line, index) => {
    const headers = splitLine(line, delimiter).map(normalizeHeader)

    const score = headers.reduce((sum, header) => {
      if (header.includes('deal')) sum += 4
      if (header.includes('sales')) sum += 4
      if (header.includes('consultant')) sum += 3
      if (header.includes('gross')) sum += 2
      if (header.includes('income')) sum += 2
      if (header.includes('amount')) sum += 2
      if (header.includes('customer')) sum += 1
      if (header.includes('vehicle')) sum += 1
      if (header.includes('finance')) sum += 2
      if (header.includes('aftermarket')) sum += 2
      if (header.includes('commission')) sum += 2
      if (header.includes('pvr')) sum += 2
      return sum
    }, 0)

    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  const rawHeaders = splitLine(lines[bestIndex], delimiter).map(normalizeHeader)
  const headers = makeUniqueHeaders(rawHeaders)

  console.log('Detected headers:', headers)

  return lines.slice(bestIndex + 1)
    .map((line) => splitLine(line, delimiter))
    .filter((cols) => cols.some((col) => String(col || '').trim()))
    .map((cols) => {
      const obj = {}

      headers.forEach((header, index) => {
        if (header) obj[header] = cols[index]?.trim() || ''
      })

      return obj
    })
}

function makeUniqueHeaders(headers) {
  const seen = {}

  return headers.map((header) => {
    const clean = header || 'blank'

    seen[clean] = (seen[clean] || 0) + 1

    if (seen[clean] === 1) {
      return clean
    }

    return `${clean} ${seen[clean]}`
  })
}

function detectDelimiter(lines) {
  const sample = lines.slice(0, 12).join('\n')
  const tabs = (sample.match(/\t/g) || []).length
  const commas = (sample.match(/,/g) || []).length
  const semicolons = (sample.match(/;/g) || []).length

  if (tabs >= commas && tabs >= semicolons) return '\t'
  if (semicolons > commas) return ';'
  return ','
}

function splitLine(line, delimiter) {
  if (delimiter === '\t') return line.split('\t')

  const result = []
  let current = ''
  let quoted = false

  for (const char of line) {
    if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }

  result.push(current)

  return result
}

function getDealValue(row) {
  return get(row, [
    'deal',
    'deal number',
    'deal no',
    'deal no.',
    'deal #',
    'deal#',
    'stock deal no',
    'stock no',
    'stock number',
    'stock #',
    'deal ref',
    'reference',
    'customer number',
    'proposal number',
    'quote number',
    'contract number',
    'contract no',
    'invoice number',
    'invoice no'
  ])
}

function normalizeDealNumber(value) {
  const raw = String(value || '').toLowerCase().trim()

  if (!raw) return ''

  const numberGroups = raw.match(/\d+/g)

  if (numberGroups?.length) {
    return numberGroups.join('')
      .replace(/^0+/, '')
  }

  return raw
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')
}

function rowsByDeal(type, dealNumber) {
  const normalized = normalizeDealNumber(dealNumber)

  return (state.imports[type] || []).filter((row) => {
    const rowDeal = getDealValue(row)

    if (!rowDeal) return false

    return normalizeDealNumber(rowDeal) === normalized
  })
}

function sumByDeal(type, dealNumber, mapper) {
  return rowsByDeal(type, dealNumber).reduce((sum, row) => {
    return sum + mapper(row)
  }, 0)
}

function get(row, names) {
  const keys = Object.keys(row || {})

  for (const name of names) {
    const target = normalizeHeader(name)

    let foundKey = keys.find((key) => normalizeHeader(key) === target)

    if (!foundKey) {
      foundKey = keys.find((key) => normalizeHeader(key).includes(target))
    }

    if (!foundKey) {
      foundKey = keys.find((key) => target.includes(normalizeHeader(key)))
    }

    if (foundKey) {
      const value = row[foundKey]

      if (value !== undefined && value !== null && String(value).trim() !== '') {
        return value
      }
    }
  }

  return ''
}

function sumMoneyFields(row, names) {
  const keys = Object.keys(row || {})
  let total = 0

  keys.forEach((key) => {
    const normalizedKey = normalizeHeader(key)

    const match = names.some((name) => {
      const target = normalizeHeader(name)
      return normalizedKey === target ||
        normalizedKey.startsWith(`${target} `) ||
        normalizedKey.includes(target)
    })

    if (match) {
      total += moneyNumber(row[key])
    }
  })

  return total
}

function normalizeHeader(header) {
  return String(header || '')
    .toLowerCase()
    .replace(/[$#.()\[\]{}]/g, '')
    .replace(/[-_/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function cleanName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
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