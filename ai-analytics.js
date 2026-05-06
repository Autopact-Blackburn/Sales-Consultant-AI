export function generateSalespersonInsights(row = {}) {
  const name = row.salesperson_name || 'Sales Consultant'

  const units = Number(row.units || 0)
  const financePen = Number(row.finance_pen || 0)
  const financeIpur = Number(row.finance_ipur || 0)
  const aftercarePpv = Number(row.aftercare_ppv || 0)
  const accessoryGp = Number(row.accessory_gp || 0)
  const googleReviews = Number(row.google_reviews || 0)
  const nps = Number(row.nps || 0)
  const dah = Number(row.dah || 0)
  const totalCommission = Number(row.total_commission || 0)

  const strengths = []
  const opportunities = []
  const focusAreas = []

  if (units >= 18) {
    strengths.push('Elite volume result with strong month-end impact.')
  } else if (units >= 15) {
    strengths.push('Strong sales volume with good consistency.')
  } else if (units >= 12) {
    strengths.push('Solid unit contribution with room to unlock higher accelerator value.')
  } else {
    opportunities.push('Unit volume needs attention to unlock stronger commission outcomes.')
    focusAreas.push('Increase appointments, test drives and daily follow-up activity.')
  }

  if (financePen >= 60) {
    strengths.push('Finance penetration is above a strong dealership benchmark.')
  } else {
    opportunities.push('Finance penetration is below target opportunity level.')
    focusAreas.push('Introduce finance earlier and more consistently in the sale.')
  }

  if (financeIpur >= 1500) {
    strengths.push('Finance income per unit is contributing well to overall performance.')
  } else {
    opportunities.push('Finance IPUR can improve through better finance structure quality.')
    focusAreas.push('Work closer with the business manager on every finance opportunity.')
  }

  if (aftercarePpv >= 1200) {
    strengths.push('Aftercare PPV shows strong ownership protection presentation.')
  } else {
    opportunities.push('Aftercare PPV is a key upside area.')
    focusAreas.push('Build more value in aftercare before delivery pressure begins.')
  }

  if (accessoryGp >= 4000) {
    strengths.push('Accessory gross is adding meaningful value to the month.')
  } else {
    opportunities.push('Accessory attachment appears underdeveloped.')
    focusAreas.push('Start accessory conversations earlier during vehicle selection.')
  }

  if (googleReviews >= 5) {
    strengths.push('Customer advocacy is strong through Google review activity.')
  } else {
    opportunities.push('Google review activity can be improved.')
    focusAreas.push('Ask every happy customer for a review before they leave delivery.')
  }

  if (nps >= 85 || dah >= 85) {
    strengths.push('Customer experience indicators are tracking positively.')
  } else if (nps > 0 || dah > 0) {
    opportunities.push('Customer experience scores suggest room for process tightening.')
    focusAreas.push('Improve communication rhythm from sale through delivery.')
  }

  const uniqueFocus = [...new Set(focusAreas)].slice(0, 3)

  while (uniqueFocus.length < 3) {
    uniqueFocus.push('Maintain daily discipline and protect follow-up consistency.')
  }

  const summary = `${name} finished the period with ${units} units and an estimated commission of ${formatMoney(totalCommission)}. The strongest indicators are ${strengths.slice(0, 2).join(' and ') || 'overall contribution and consistency'}. The main coaching focus for the next month should be ${uniqueFocus[0].toLowerCase()}`

  const fullText = [
    `Performance Success Plan - ${name}`,
    '',
    `Units: ${units}`,
    `Total Commission: ${formatMoney(totalCommission)}`,
    `Finance Penetration: ${financePen}%`,
    `Finance IPUR: ${formatMoney(financeIpur)}`,
    `Aftercare PPV: ${formatMoney(aftercarePpv)}`,
    `Accessory GP: ${formatMoney(accessoryGp)}`,
    `Google Reviews: ${googleReviews}`,
    `NPS: ${nps}`,
    `DAH: ${dah}`,
    '',
    'Summary:',
    summary,
    '',
    'Strengths:',
    ...strengths.map(x => `- ${x}`),
    '',
    'Opportunities:',
    ...opportunities.map(x => `- ${x}`),
    '',
    'Top 3 Focus Areas:',
    ...uniqueFocus.map((x, i) => `${i + 1}. ${x}`)
  ].join('\n')

  return {
    summary,
    strengths,
    opportunities,
    focusAreas: uniqueFocus,
    fullText
  }
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0
  }).format(Number(value || 0))
}