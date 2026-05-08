/**
 * ai.js — Dealership Performance Intelligence
 * Generates salesperson coaching insights (PSP) from monthly metrics.
 */

export function generateSalespersonInsights(row = {}) {
  const name = row.salesperson_name || 'Sales Consultant'

  const units             = Number(row.units               || 0)
  const signups           = Number(row.signups             || 0)
  const financePen        = Number(row.finance_penetration || 0)
  const financeIpur       = Number(row.finance_ipur        || 0)
  const aftercarePpv      = Number(row.aftercare_ppv       || 0)
  const accessoryGp       = Number(row.accessory_gp        || 0)
  const newLeads          = Number(row.new_leads           || 0)
  const testDrives        = Number(row.test_drives         || 0)
  const valuations        = Number(row.valuations          || 0)
  const googleReviews     = Number(row.google_reviews      || 0)
  const nps               = Number(row.nps                 || 0)
  const dah               = Number(row.dah                 || 0)
  const finalCommission   = Number(row.final_commission    || 0)
  const unlock            = Number(row.volume_unlock_percentage || 0)

  const strengths     = []
  const opportunities = []
  const focusAreas    = []

  // ── UNITS / VOLUME ──────────────────────────────────────
  if (units >= 18) {
    strengths.push('Elite volume result — the full KPI accelerator is unlocked.')
  } else if (units >= 15) {
    strengths.push('Strong sales volume with most of the KPI accelerator unlocked.')
    opportunities.push('A small lift in units would unlock the full commission accelerator.')
    focusAreas.push('Protect daily appointment creation to finish above 18 units.')
  } else if (units >= 12) {
    strengths.push('Solid unit result with partial KPI accelerator value unlocked.')
    opportunities.push('Moving from solid to strong volume would materially improve commission.')
    focusAreas.push('Increase appointment volume and test drive conversion early in the month.')
  } else {
    opportunities.push('Unit volume needs attention — KPI bonuses are not unlocking below 12 units.')
    focusAreas.push('Build daily activity around appointments, test drives and firm follow-up.')
  }

  // ── FINANCE PENETRATION ──────────────────────────────────
  if (financePen >= 60) {
    strengths.push('Finance penetration is tracking at a strong level.')
  } else if (financePen >= 40) {
    opportunities.push('Finance penetration is just below the strong threshold — a few more deals would unlock the next bonus tier.')
    focusAreas.push('Introduce finance earlier and position the business manager as part of the buying journey.')
  } else {
    opportunities.push('Finance penetration is below target — a significant improvement opportunity.')
    focusAreas.push('Start the finance conversation at test drive, not at signing.')
  }

  // ── FINANCE IPUR ─────────────────────────────────────────
  if (financeIpur >= 1500) {
    strengths.push('Finance income per unit is contributing strongly to the month.')
  } else if (financeIpur >= 1100) {
    opportunities.push('Finance IPUR is close to the next bonus tier — better product mix and earlier engagement would help.')
    focusAreas.push('Partner with the business manager before figures are finalised to improve product penetration.')
  } else if (financeIpur > 0) {
    opportunities.push('Finance IPUR has clear room to improve through better structure.')
    focusAreas.push('Ensure every finance customer is presented the full product suite.')
  }

  // ── AFTERCARE PPV ─────────────────────────────────────────
  if (aftercarePpv >= 800) {
    strengths.push('Aftercare PPV is excellent — ownership protection is being presented consistently.')
  } else if (aftercarePpv >= 400) {
    strengths.push('Aftercare PPV shows a reasonable ownership protection presentation.')
    opportunities.push('Pushing aftercare PPV above $800 would unlock the top bonus tier.')
    focusAreas.push('Build aftercare value into the vehicle presentation, not just at delivery.')
  } else {
    opportunities.push('Aftercare PPV is a clear upside area — the bonus pool contribution is significant.')
    focusAreas.push('Build aftercare value before delivery pressure begins — make it part of the sale story.')
  }

  // ── ACCESSORY GP ─────────────────────────────────────────
  if (accessoryGp >= 500) {
    strengths.push('Accessory gross is adding meaningful value per unit.')
  } else {
    opportunities.push('Accessory attachment is underdeveloped relative to the bonus opportunity.')
    focusAreas.push('Start accessory conversations during vehicle selection, not at delivery.')
  }

  // ── SIGN UPS ─────────────────────────────────────────────
  if (signups >= 23) {
    strengths.push('Sign-up count above target — the $250 bonus is secured.')
  } else if (signups > 0) {
    strengths.push('Sign-up activity is contributing to team process discipline.')
    if (signups < 20) {
      opportunities.push(`${23 - signups} more sign-ups needed to unlock the sign-up bonus.`)
      focusAreas.push('Focus on capturing every sign-up in the system — this is process, not extra work.')
    }
  }

  // ── LEADS / TEST DRIVES ───────────────────────────────────
  if (newLeads > 0 || testDrives > 0 || valuations > 0) {
    const tdRate = newLeads ? (testDrives / newLeads) * 100 : 0
    if (tdRate >= 40) {
      strengths.push('Lead-to-test-drive conversion shows healthy customer engagement.')
    } else if (newLeads >= 5) {
      opportunities.push('Lead volume is present but test drive conversion can improve.')
      focusAreas.push('Turn more lead conversations into confirmed test drive appointments.')
    }
    if (valuations > 0) {
      strengths.push('Valuation activity is supporting conquest and used-car stock opportunities.')
    }
  }

  // ── CUSTOMER EXPERIENCE ───────────────────────────────────
  if (googleReviews >= 5) {
    strengths.push('Customer advocacy is strong — Google review activity is excellent.')
  } else if (googleReviews > 0) {
    opportunities.push(`${5 - googleReviews} more Google reviews would strengthen the customer advocacy bonus.`)
    focusAreas.push('Ask every happy delivery customer for a Google review before they leave the dealership.')
  } else {
    opportunities.push('Google review activity needs attention — this is a straightforward bonus to capture.')
    focusAreas.push('Ask every happy delivery customer for a Google review before they leave.')
  }

  if (nps >= 85) {
    strengths.push('NPS result supports a strong customer experience story.')
  } else if (nps >= 70) {
    opportunities.push('NPS suggests the delivery and follow-up rhythm can be tightened.')
    focusAreas.push('Improve communication rhythm from sale through to delivery.')
  } else if (nps > 0) {
    opportunities.push('NPS is below target — a process review of the delivery experience is worthwhile.')
    focusAreas.push('Audit the hand-over experience and remove any delivery surprises.')
  }

  if (dah >= 85) {
    strengths.push('Drive Away Happy score is tracking positively.')
  } else if (dah > 0) {
    opportunities.push('Drive Away Happy score suggests delivery experience has room to improve.')
    focusAreas.push('Protect the final handover experience and eliminate delivery-day surprises.')
  }

  // ── DEDUPE & CAP ─────────────────────────────────────────
  const uniqueStrengths     = [...new Set(strengths)].slice(0, 5)
  const uniqueOpportunities = [...new Set(opportunities)].slice(0, 5)
  const uniqueFocus         = [...new Set(focusAreas)].slice(0, 3)

  while (uniqueFocus.length < 3) {
    uniqueFocus.push('Maintain daily discipline and protect follow-up consistency.')
  }

  // ── NARRATIVE TEXT ────────────────────────────────────────
  const summary = `${name} finished the period with ${units} units delivered, ${Math.round(financePen)}% finance penetration and an estimated commission of ${fmt(finalCommission)}. The current KPI accelerator unlock sits at ${Math.round(unlock * 100)}%. The strongest single opportunity for next month is: ${uniqueFocus[0].toLowerCase()}.`

  const managerLanguage = `${name} has a clear path to improve next month by focusing on ${uniqueFocus.join(', ').toLowerCase()}. The coaching conversation should stay practical, numbers-based and tied to daily behaviours rather than general motivation.`

  const salespersonLanguage = `The goal next month is not to change everything — it's to tighten the few behaviours that create the biggest lift: ${uniqueFocus.join(', ').toLowerCase()}.`

  const fullText = [
    `Performance Success Plan — ${name}`,
    '',
    `Units:                  ${units}`,
    `Final Commission:       ${fmt(finalCommission)}`,
    `KPI Unlock:             ${Math.round(unlock * 100)}%`,
    `Finance Penetration:    ${Math.round(financePen)}%`,
    `Finance IPUR:           ${fmt(financeIpur)}`,
    `Aftercare PPV:          ${fmt(aftercarePpv)}`,
    `Accessory GP:           ${fmt(accessoryGp)}`,
    `Sign Ups:               ${signups}`,
    `New Leads:              ${newLeads}`,
    `Test Drives:            ${testDrives}`,
    `Valuations:             ${valuations}`,
    `Google Reviews:         ${googleReviews}`,
    `NPS:                    ${nps}`,
    `DAH:                    ${dah}`,
    '',
    'Summary:',
    summary,
    '',
    'Strengths:',
    ...(uniqueStrengths.length ? uniqueStrengths.map(x => `  • ${x}`) : ['  • Building this month.']),
    '',
    'Opportunities:',
    ...(uniqueOpportunities.length ? uniqueOpportunities.map(x => `  • ${x}`) : ['  • No major gaps detected.']),
    '',
    'Top 3 Focus Areas for Next Month:',
    ...uniqueFocus.map((x, i) => `  ${i + 1}. ${x}`),
    '',
    'Manager Coaching Language:',
    managerLanguage,
    '',
    'Salesperson-Friendly Language:',
    salespersonLanguage
  ].join('\n')

  return { summary, strengths: uniqueStrengths, opportunities: uniqueOpportunities, focusAreas: uniqueFocus, managerLanguage, salespersonLanguage, fullText }
}

function fmt(value) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(Number(value || 0))
}
