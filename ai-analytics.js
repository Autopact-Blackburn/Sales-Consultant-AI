export function generateSalespersonInsights(metrics = {}) {

  const insights = []

  const focusAreas = []

  const strengths = []

  const {

    salesperson_name = 'Salesperson',

    units = 0,

    finance_penetration = 0,

    finance_ipur = 0,

    aftercare_ppv = 0,

    accessory_gp = 0,

    google_reviews = 0,

    nps = 0,

    dah = 0,

    final_commission = 0

  } = metrics

  // =========================================
  // UNITS
  // =========================================

  if (units >= 18) {

    strengths.push(
      'Elite unit performance this month.'
    )

  } else if (units >= 15) {

    strengths.push(
      'Strong volume month with solid consistency.'
    )

  } else if (units < 10) {

    focusAreas.push(
      'Increase outbound activity and appointment generation.'
    )

  }

  // =========================================
  // FINANCE PENETRATION
  // =========================================

  if (finance_penetration >= 65) {

    strengths.push(
      'Excellent finance penetration performance.'
    )

  } else if (finance_penetration < 40) {

    focusAreas.push(
      'Focus on finance conversations earlier in the sales process.'
    )

  }

  // =========================================
  // FINANCE IPUR
  // =========================================

  if (finance_ipur >= 1800) {

    strengths.push(
      'Strong finance income per unit result.'
    )

  } else if (finance_ipur < 1000) {

    focusAreas.push(
      'Work with the business manager to improve finance structure quality.'
    )

  }

  // =========================================
  // AFTERCARE
  // =========================================

  if (aftercare_ppv >= 1200) {

    strengths.push(
      'Excellent aftercare presentation and value building.'
    )

  } else if (aftercare_ppv < 600) {

    focusAreas.push(
      'Spend more time presenting protection products and ownership benefits.'
    )

  }

  // =========================================
  // ACCESSORY GP
  // =========================================

  if (accessory_gp >= 5000) {

    strengths.push(
      'Strong accessory attachment and gross generation.'
    )

  } else if (accessory_gp < 2000) {

    focusAreas.push(
      'Improve accessory presentation during vehicle handover.'
    )

  }

  // =========================================
  // REVIEWS
  // =========================================

  if (google_reviews >= 5) {

    strengths.push(
      'Excellent customer advocacy through Google reviews.'
    )

  } else if (google_reviews < 2) {

    focusAreas.push(
      'Ask every happy customer for a Google review before delivery.'
    )

  }

  // =========================================
  // NPS
  // =========================================

  if (nps >= 85) {

    strengths.push(
      'Outstanding customer experience results.'
    )

  } else if (nps < 70) {

    focusAreas.push(
      'Focus on communication consistency throughout the ownership journey.'
    )

  }

  // =========================================
  // DAH
  // =========================================

  if (dah >= 85) {

    strengths.push(
      'Excellent Drive Away Happy performance.'
    )

  }

  // =========================================
  // FALLBACKS
  // =========================================

  if (!strengths.length) {

    strengths.push(
      'Solid contribution across multiple areas this month.'
    )

  }

  if (!focusAreas.length) {

    focusAreas.push(
      'Maintain consistency and continue refining process discipline.'
    )

  }

  // =========================================
  // SUMMARY
  // =========================================

  let summary = `

    ${salesperson_name} delivered ${units} units this month
    with a final commission outcome of
    $${Number(final_commission || 0).toLocaleString()}.

  `

  if (strengths.length) {

    summary += `
      Key strengths included ${strengths
        .slice(0, 2)
        .join(' and ')
      }.
    `

  }

  if (focusAreas.length) {

    summary += `
      The biggest opportunity next month is to focus on
      ${focusAreas[0].toLowerCase()}.
    `

  }

  // =========================================
  // RETURN
  // =========================================

  return {

    summary: summary.trim(),

    strengths,

    focusAreas,

    insights

  }

}