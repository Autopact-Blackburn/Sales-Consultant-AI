import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { generateSalespersonInsights } from './ai-analytics.js'

const SUPABASE_URL = 'https://snzjsuwqetomdkvphvzs.supabase.co'

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNuempzdXdxZXRvbWRrdnBodnpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5NDQ5MTksImV4cCI6MjA5MzUyMDkxOX0.mkJ1_nxP0emPvhSqgUz7Q4zKm63LtG0J7xiYhwT78QQ'

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
)

const state = {
  selectedPeriodId: null,
  selectedConsultant: null,
  imports: {},
  metrics: [],
  deals: []
}

document.addEventListener('DOMContentLoaded', async () => {

  bindTabs()
  bindImportButtons()
  bindNormalizeButton()
  bindRefreshButton()
  bindMailButtons()

  await loadPeriods()
  await refreshDashboard()
})

function bindTabs() {

  document.querySelectorAll('.tab-btn').forEach(btn => {

    btn.addEventListener('click', () => {

      document.querySelectorAll('.tab-btn').forEach(x => x.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'))

      btn.classList.add('active')

      const target = document.getElementById(btn.dataset.tab)

      if (target) {
        target.classList.add('active')
      }
    })
  })
}

function bindImportButtons() {

  document.querySelectorAll('.import-btn').forEach(btn => {

    btn.addEventListener('click', async () => {

      const type = btn.dataset.type
      const textarea = document.getElementById(type)

      if (!textarea?.value?.trim()) {
        alert(`Paste ${type} data first`)
        return
      }

      const rows = parseTSV(textarea.value)

      state.imports[type] = rows

      appendImportResult(
        `${type.toUpperCase()} imported successfully (${rows.length} rows)`
      )
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

    if (!state.imports.deal_log) {
      alert('Deal Log import required')
      return
    }

    const normalizedDeals = buildDeals()

    const metrics = buildMetrics(normalizedDeals)

    await persistDeals(normalizedDeals)

    await persistMetrics(metrics)

    appendImportResult(
      `Normalization completed (${normalizedDeals.length} deals)`
    )

    await refreshDashboard()
  })
}

function bindRefreshButton() {

  const btn = document.getElementById('refreshDashboardBtn')

  btn?.addEventListener('click', refreshDashboard)
}

function bindMailButtons() {

  const fcBtn = document.getElementById('mailFcBtn')

  fcBtn?.addEventListener('click', () => {

    let body = 'Monthly Commission Summary%0D%0A%0D%0A'

    state.metrics.forEach(row => {

      body += `${row.salesperson_name} - $${Number(row.total_commission || 0).toLocaleString()}%0D%0A`
    })

    window.location.href =
      `mailto:?subject=Monthly Commission Summary&body=${body}`
  })

  const pspBtn = document.getElementById('mailtoPspBtn')

  pspBtn?.addEventListener('click', () => {

    if (!state.selectedConsultant) return

    const insights = generateSalespersonInsights(state.selectedConsultant)

    const body = encodeURIComponent(insights.fullText)

    window.location.href =
      `mailto:?subject=Performance Success Plan - ${state.selectedConsultant.salesperson_name}&body=${body}`
  })
}

async function loadPeriods() {

  const select = document.getElementById('periodSelect')

  const { data, error } = await supabase
    .from('commission_periods')
    .select('*')
    .order('period_year', { ascending: false })

  if (error) {
    console.error(error)
    return
  }

  select.innerHTML = ''

  data.forEach(period => {

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

    await refreshDashboard()
  })
}

async function refreshDashboard() {

  if (!state.selectedPeriodId) return

  const metricsRes = await supabase
    .from('salesperson_metrics')
    .select('*')
    .eq('period_id', state.selectedPeriodId)

  const dealsRes = await supabase
    .from('master_deals')
    .select('*')
    .eq('period_id', state.selectedPeriodId)

  state.metrics = metricsRes.data || []
  state.deals = dealsRes.data || []

  renderDashboard()
}

function renderDashboard() {

  renderSummaryCards()
  renderTeamTable()
}

function renderSummaryCards() {

  const totalComm = state.metrics.reduce(
    (sum, row) => sum + Number(row.total_commission || 0),
    0
  )

  const totalUnits = state.metrics.reduce(
    (sum, row) => sum + Number(row.units || 0),
    0
  )

  const avgFinance =
    state.metrics.length
      ? state.metrics.reduce((sum, row) =>
          sum + Number(row.finance_pen || 0), 0
        ) / state.metrics.length
      : 0

  const top =
    [...state.metrics]
      .sort((a, b) =>
        Number(b.total_commission || 0) -
        Number(a.total_commission || 0)
      )[0]

  setText('teamCommission', `$${Math.round(totalComm).toLocaleString()}`)
  setText('unitsSold', totalUnits)
  setText('financePen', `${Math.round(avgFinance)}%`)
  setText('topPerformer', top?.salesperson_name || '—')
}

function renderTeamTable() {

  const tbody = document.getElementById('teamRows')

  if (!tbody) return

  tbody.innerHTML = ''

  if (!state.metrics.length) {

    tbody.innerHTML = `
      <tr>
        <td colspan="8">No rows for this period.</td>
      </tr>
    `

    return
  }

  state.metrics.forEach(row => {

    const tr = document.createElement('tr')

    tr.innerHTML = `
      <td>${row.salesperson_name}</td>
      <td>${row.units || 0}</td>
      <td>${row.finance_pen || 0}%</td>
      <td>$${formatNumber(row.finance_ipur)}</td>
      <td>$${formatNumber(row.aftercare_ppv)}</td>
      <td>$${formatNumber(row.accessory_gp)}</td>
      <td><strong>$${formatNumber(row.total_commission)}</strong></td>
      <td>
        <button class="btn btn-secondary psp-btn">
          PSP
        </button>
      </td>
    `

    tr.addEventListener('click', () => {
      renderConsultantDetail(row)
    })

    tbody.appendChild(tr)
  })

  document.querySelectorAll('.psp-btn').forEach((btn, index) => {

    btn.addEventListener('click', (e) => {

      e.stopPropagation()

      renderPSP(state.metrics[index])
    })
  })
}

function renderConsultantDetail(row) {

  state.selectedConsultant = row

  const container = document.getElementById('consultantDetail')

  const consultantDeals =
    state.deals.filter(d =>
      d.salesperson_name === row.salesperson_name
    )

  container.innerHTML = `
    <div class="consultant-grid">

      <div class="detail-card">
        <h3>${row.salesperson_name}</h3>

        <p><strong>Units:</strong> ${row.units}</p>
        <p><strong>Finance Pen:</strong> ${row.finance_pen}%</p>
        <p><strong>IPUR:</strong> $${formatNumber(row.finance_ipur)}</p>
        <p><strong>Aftercare PPV:</strong> $${formatNumber(row.aftercare_ppv)}</p>
        <p><strong>Accessory GP:</strong> $${formatNumber(row.accessory_gp)}</p>
      </div>

      <div class="detail-card">
        <h3>Commission Breakdown</h3>

        <p>Base Commission: $${formatNumber(row.base_commission)}</p>
        <p>Volume Bonus: $${formatNumber(row.volume_bonus)}</p>
        <p>Finance Bonus: $${formatNumber(row.finance_bonus)}</p>
        <p>Aftercare Bonus: $${formatNumber(row.aftercare_bonus)}</p>
        <p>Accessory Bonus: $${formatNumber(row.accessory_bonus)}</p>

        <hr>

        <h2>$${formatNumber(row.total_commission)}</h2>
      </div>

      <div class="detail-card">
        <h3>Deal Breakdown</h3>

        ${consultantDeals.map(deal => `
          <div class="deal-line">
            <span>${deal.deal_number}</span>
            <span>$${formatNumber(deal.real_gp)}</span>
          </div>
        `).join('')}
      </div>

    </div>
  `
}

function renderPSP(row) {

  state.selectedConsultant = row

  const pspBtn = document.getElementById('mailtoPspBtn')

  if (pspBtn) {
    pspBtn.disabled = false
  }

  const panel = document.getElementById('pspPanel')

  const insights = generateSalespersonInsights(row)

  panel.innerHTML = `
    <div class="psp-grid">

      <div class="detail-card">
        <h3>AI Summary</h3>
        <p>${insights.summary}</p>
      </div>

      <div class="detail-card">
        <h3>Strengths</h3>
        ${insights.strengths.map(x => `<p>• ${x}</p>`).join('')}
      </div>

      <div class="detail-card">
        <h3>Opportunities</h3>
        ${insights.opportunities.map(x => `<p>• ${x}</p>`).join('')}
      </div>

      <div class="detail-card">
        <h3>Focus Areas</h3>
        ${insights.focusAreas.map(x => `<p>• ${x}</p>`).join('')}
      </div>

    </div>
  `
}

function buildDeals() {

  const dealRows = state.imports.deal_log || []

  return dealRows.map(row => {

    const processedGross =
      Number(row['Processed Gross'] || 0)

    const amGross =
      Number(row['AM - Gross'] || 0)

    return {
      period_id: state.selectedPeriodId,
      deal_number: row['Deal Number'],
      salesperson_name: row['Salesperson'],
      customer_name: row['Customer'],
      vehicle: row['Vehicle'],
      processed_gross: processedGross,
      am_gross: amGross,
      real_gp: processedGross - amGross
    }
  })
}

function buildMetrics(deals) {

  const grouped = {}

  deals.forEach(deal => {

    const key = deal.salesperson_name

    if (!grouped[key]) {

      grouped[key] = {
        salesperson_name: key,
        period_id: state.selectedPeriodId,
        units: 0,
        finance_pen: 0,
        finance_ipur: 0,
        aftercare_ppv: 0,
        accessory_gp: 0,
        base_commission: 0,
        volume_bonus: 0,
        finance_bonus: 0,
        aftercare_bonus: 0,
        accessory_bonus: 0,
        total_commission: 0
      }
    }

    grouped[key].units += 1
    grouped[key].base_commission += 200
    grouped[key].total_commission += 200
  })

  return Object.values(grouped)
}

async function persistDeals(deals) {

  await supabase
    .from('master_deals')
    .delete()
    .eq('period_id', state.selectedPeriodId)

  await supabase
    .from('master_deals')
    .insert(deals)
}

async function persistMetrics(metrics) {

  await supabase
    .from('salesperson_metrics')
    .delete()
    .eq('period_id', state.selectedPeriodId)

  await supabase
    .from('salesperson_metrics')
    .insert(metrics)
}

function parseTSV(text) {

  const lines =
    text.trim().split('\n')

  const headers =
    lines[0].split('\t')

  return lines.slice(1).map(line => {

    const cols = line.split('\t')

    const obj = {}

    headers.forEach((header, index) => {

      obj[header.trim()] =
        cols[index]?.trim() || ''
    })

    return obj
  })
}

function appendImportResult(message) {

  const container =
    document.getElementById('importResults')

  const div =
    document.createElement('div')

  div.className = 'result-item'

  div.textContent = message

  container.prepend(div)
}

function setText(id, value) {

  const el = document.getElementById(id)

  if (el) {
    el.textContent = value
  }
}

function formatNumber(value) {

  return Number(value || 0).toLocaleString()
}