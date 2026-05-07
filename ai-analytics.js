export function generateSalespersonInsights(row = {}) {
  const name = row.salesperson_name || 'Sales Consultant'

  const units = Number(row.units || 0)
  const signups = Number(row.signups || 0)
  const financePenetration = Number(row.finance_penetration || 0)
  const financeIpur = Number(row.finance_ipur || 0)
  const aftercarePpv = Number(row.aftercare_ppv || 0)
  const accessoryGp = Number(row.accessory_gp || 0)
  const newLeads = Number(row.new_leads || 0)
  const testDrives = Number(row.test_drives || 0)
  const valuations = Number(row.valuations || 0)
  const googleReviews = Number(row.google_reviews || 0)
  const nps = Number(row.nps || 0)
  const dah = Number(row.dah || 0)
  const finalCommission = Number(row.final_commission || 0)
  const unlock = Number(row.volume_unlock_percentage || 0)

  const strengths = []
  const opportunities = []
  const focusAreas = []

  if (units >= 18) {
    strengths.push('Elite volume result with the full KPI accelerator unlocked.')
  } else if (units >= 15) {
    strengths.push('Strong sales volume with most of the KPI accelerator unlocked.')
    opportunities.push('A small lift in delivered units would unlock the full commission accelerator.')
    focusAreas.push('Protect daily appointment creation so the month finishes above 18 units.')
  } else if (units >= 12) {
    strengths.push('Solid unit result with partial KPI accelerator value unlocked.')
    opportunities.push('Moving from solid volume to strong volume would materially improve commission outcome.')
    focusAreas.push('Increase appointment volume and test drive conversion early in the month.')
  } else {
    opportunities.push('Unit volume needs attention because KPI bonuses are not unlocking below 12 units.')
    focusAreas.push('Build daily activity around appointments, test drives and firm follow-up.')
  }

  if (financePenetration >= 60) {
    strengths.push('Finance penetration is tracking at a strong level.')
  } else {
    opportunities.push('Finance penetration is below the target opportunity level.')
    focusAreas.push('Introduce finance earlier and position the business manager as part of the buying journey.')
  }

  if (financeIpur >= 1500) {
    strengths.push('Finance income per unit is contributing well to the month.')
  } else {
    opportunities.push('Finance IPUR has room to improve through better structure and earlier engagement.')
    focusAreas.push('Partner with the business manager before figures are finalised.')
  }

  if (aftercarePpv >= 1200) {
    strengths.push('Aftercare PPV shows strong ownership protection presentation.')
  } else {
    opportunities.push('Aftercare PPV is a clear upside area.')
    focusAreas.push('Build aftercare value before delivery pressure begins.')
  }

  if (accessoryGp >= 4000) {
    strengths.push('Accessory gross is adding meaningful value.')
  } else {
    opportunities.push('Accessory attachment appears underdeveloped.')
    focusAreas.push('Start accessory conversations during vehicle selection, not at delivery.')
  }

  if (signups > 0) {
    strengths.push('Sign-up activity is contributing to team process discipline.')
  }

  if (newLeads > 0 || testDrives > 0 || valuations > 0) {
    const testDriveRate = newLeads ? (testDrives / newLeads) * 100 : 0

    if (testDriveRate >= 40) {
      strengths.push('Lead-to-test-drive activity shows healthy customer engagement.')
    } else if (newLeads >= 5) {
      opportunities.push('Lead volume is present, but test drive conversion can improve.')
      focusAreas.push('Turn more lead conversations into confirmed test drive appointments.')
    }

    if (valuations > 0) {
      strengths.push('Valuation activity is supporting conquest and used-car stock opportunities.')
    }
  }

  if (googleReviews >= 5) {
    strengths.push('Customer advocacy is strong through Google review activity.')
  } else {
    opportunities.push('Google review activity can be improved.')
    focusAreas.push('Ask every happy delivery customer for a review before they leave.')
  }

  if (nps >= 85) {
    strengths.push('NPS result supports a strong customer experience story.')
  } else if (nps > 0) {
    opportunities.push('NPS suggests the delivery and follow-up rhythm can tighten.')
    focusAreas.push('Improve communication rhythm from sale through delivery.')
  }

  if (dah >= 85) {
    strengths.push('Drive Away Happy result is tracking positively.')
  } else if (dah > 0) {
    opportunities.push('Drive Away Happy score suggests delivery experience has room to improve.')
    focusAreas.push('Protect the final handover experience and remove delivery surprises.')
  }

  const uniqueStrengths = [...new Set(strengths)].slice(0, 5)
  const uniqueOpportunities = [...new Set(opportunities)].slice(0, 5)
  const uniqueFocus = [...new Set(focusAreas)].slice(0, 3)

  while (uniqueFocus.length < 3) {
    uniqueFocus.push('Maintain daily discipline and protect follow-up consistency.')
  }

  const summary = `${name} finished the period with ${units} units, ${Math.round(financePenetration)}% finance penetration and an estimated commission of ${formatMoney(finalCommission)}. The current KPI accelerator unlock is ${Math.round(unlock * 100)}%. The strongest opportunity for next month is ${uniqueFocus[0].toLowerCase()}`

  const managerLanguage = `${name} has a clear path to improve next month by focusing on ${uniqueFocus.join(', ').toLowerCase()}. The coaching conversation should stay practical, numbers-based and tied to daily behaviours rather than general motivation.`

  const salespersonLanguage = `The goal next month is not to change everything. The focus is to tighten the few behaviours that create the biggest lift: ${uniqueFocus.join(', ').toLowerCase()}.`

  const fullText = [
    `Performance Success Plan - ${name}`,
    '',
    `Units: ${units}`,
    `Final Commission: ${formatMoney(finalCommission)}`,
    `KPI Accelerator Unlock: ${Math.round(unlock * 100)}%`,
    `Finance Penetration: ${Math.round(financePenetration)}%`,
    `Finance IPUR: ${formatMoney(financeIpur)}`,
    `Aftercare PPV: ${formatMoney(aftercarePpv)}`,
    `Accessory GP: ${formatMoney(accessoryGp)}`,
    `Sign Ups: ${signups}`,
    `New Leads: ${newLeads}`,
    `Test Drives: ${testDrives}`,
    `Valuations: ${valuations}`,
    `Google Reviews: ${googleReviews}`,
    `NPS: ${nps}`,
    `DAH: ${dah}`,
    '',
    'Summary:',
    summary,
    '',
    'Strengths:',
    ...(uniqueStrengths.length ? uniqueStrengths.map((x) => `- ${x}`) : ['- No clear strengths detected yet.']),
    '',
    'Opportunities:',
    ...(uniqueOpportunities.length ? uniqueOpportunities.map((x) => `- ${x}`) : ['- No major gaps detected yet.']),
    '',
    'Top 3 Focus Areas:',
    ...uniqueFocus.map((x, i) => `${i + 1}. ${x}`),
    '',
    'Manager Coaching Language:',
    managerLanguage,
    '',
    'Salesperson-Friendly Language:',
    salespersonLanguage
  ].join('\n')

  return {
    summary,
    strengths: uniqueStrengths,
    opportunities: uniqueOpportunities,
    focusAreas: uniqueFocus,
    managerLanguage,
    salespersonLanguage,
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