// Coffee roulette helpers. The real draw runs in the database (public.coffee_draw);
// this is the same algorithm in TypeScript for the demo, plus date helpers.

/** Today in Oxford as YYYY-MM-DD. */
export function londonToday(now = new Date()) {
  return now.toLocaleDateString('en-CA', { timeZone: 'Europe/London' })
}

export const addDays = (ymd: string, days: number) => {
  const d = new Date(`${ymd}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The round open for sign-ups: this week's Sunday (Oxford time). */
export function openRound(now = new Date()) {
  const today = londonToday(now)
  const isoDow = new Date(`${today}T12:00:00Z`).getUTCDay() || 7
  return addDays(today, 7 - isoDow)
}

/** Sunday 20:00 Oxford time, as an instant. */
export function drawAt(round: string) {
  const guess = new Date(`${round}T20:00:00Z`)
  const londonHour = Number(
    guess.toLocaleString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hour12: false }),
  )
  return new Date(guess.getTime() - (londonHour - 20) * 3600_000)
}

/** Monday to Sunday of the week a round's coffees happen in. */
export function coffeeWeek(round: string) {
  return { from: addDays(round, 1), to: addDays(round, 7) }
}

export const fmtDay = (
  ymd: string,
  opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' },
) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' })

/**
 * Minimum-cost grouping of people 0..n-1 into pairs (one group of three if n is odd).
 * cost(i, j) should be level(i→j)² + level(j→i)² (+ penalties). Greedy start with
 * random tie-breaks, then partner swaps between pairs while the total goes down.
 */
export function matchGroups(n: number, cost: (i: number, j: number) => number, random = Math.random): number[][] {
  if (n < 2) return []
  const m = n + (n % 2) // index n is a placeholder when n is odd
  const c = (i: number, j: number) => (i >= n || j >= n ? 0 : cost(i, j))
  const pairs: [number, number, number, number][] = []
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) pairs.push([c(i, j), random(), i, j])
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const mate = new Array<number>(m).fill(-1)
  for (const [, , i, j] of pairs)
    if (mate[i] < 0 && mate[j] < 0) {
      mate[i] = j
      mate[j] = i
    }
  for (let sweep = 0, improved = true; improved && sweep < 100; sweep++) {
    improved = false
    for (let a = 0; a < m; a++)
      for (let x = a + 1; x < m; x++) {
        const b = mate[a]
        const y = mate[x]
        if (x === b || b < a || y < x) continue
        const cur = c(a, b) + c(x, y)
        if (c(a, x) + c(b, y) < cur) {
          ;[mate[a], mate[x], mate[b], mate[y]] = [x, a, y, b]
          improved = true
        } else if (c(a, y) + c(b, x) < cur) {
          ;[mate[a], mate[y], mate[b], mate[x]] = [y, a, x, b]
          improved = true
        }
      }
  }
  const extra = m > n ? mate[n] : -1
  const groups: number[][] = []
  for (let i = 0; i < n; i++) {
    const j = mate[i]
    if (j > i && j < n && i !== extra && j !== extra) groups.push([i, j])
  }
  if (extra >= 0) {
    let best = 0
    groups.forEach((g, k) => {
      if (c(extra, g[0]) + c(extra, g[1]) < c(extra, groups[best][0]) + c(extra, groups[best][1])) best = k
    })
    groups[best].push(extra)
  }
  return groups
}
