/**
 * Builds public/world-continents.json: world country shapes (Natural Earth
 * 1:110m via world-atlas) merged into the app's six continent groups, with
 * coordinates rounded to keep the file small. Countries outside the app's
 * list are kept as plain land so the map still looks complete.
 *
 *   npm run world
 */
import countries from 'i18n-iso-countries'
import { readFileSync, writeFileSync } from 'node:fs'
import { merge } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import { COUNTRY_CODE, COUNTRY_CONTINENT } from '../src/lib/options.ts'

const topo = JSON.parse(readFileSync('node_modules/world-atlas/countries-110m.json', 'utf8')) as Topology
const obj = topo.objects.countries as GeometryCollection<{ name: string }>

const alpha2ToContinent = new Map<string, string>()
for (const [name, code] of Object.entries(COUNTRY_CODE)) alpha2ToContinent.set(code.toUpperCase(), COUNTRY_CONTINENT[name])
// Territories not in the app's list, grouped for a nicer map.
const EXTRA: Record<string, string> = { GL: 'North America', EH: 'Africa', NC: 'Oceania', FK: 'Latin America & Caribbean', TF: '' }

const groups = new Map<string, typeof obj.geometries>()
for (const g of obj.geometries) {
  if (g.properties?.name === 'Antarctica') continue
  const numeric = String(g.id ?? '').padStart(3, '0')
  const a2 = g.id !== undefined ? countries.numericToAlpha2(numeric) : undefined
  const continent = (a2 && (alpha2ToContinent.get(a2) ?? EXTRA[a2])) || (g.properties?.name === 'Kosovo' ? 'Europe' : '') || 'Other'
  if (!groups.has(continent)) groups.set(continent, [])
  groups.get(continent)!.push(g)
}

const round = (x: unknown): unknown => (Array.isArray(x) ? x.map(round) : typeof x === 'number' ? Math.round(x * 10) / 10 : x)
const features = [...groups].map(([name, geoms]) => {
  const geometry = merge(topo, geoms as never) as { type: string; coordinates: unknown }
  return { type: 'Feature', properties: { name }, geometry: { type: geometry.type, coordinates: round(geometry.coordinates) } }
})
writeFileSync('public/world-continents.json', JSON.stringify({ type: 'FeatureCollection', features }))
console.log(features.map((f) => `${f.properties.name}: ${groups.get(f.properties.name)!.length}`).join(', '))
