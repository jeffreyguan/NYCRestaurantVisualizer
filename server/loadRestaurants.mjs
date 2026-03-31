import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function loadRestaurantData() {
  const rawData = JSON.parse(readFileSync(join(__dirname, 'data.json'), 'utf8'))
  const restaurants = rawData
    .map((row) => ({
      name: row.name,
      rating: typeof row.rating === 'number' ? row.rating : parseFloat(row.rating),
      lat: typeof row.lat === 'number' ? row.lat : parseFloat(row.lat),
      lon: typeof row.lon === 'number' ? row.lon : parseFloat(row.lon),
      address: row.address,
      price: row.price,
      ratingCount: row.ratingCount
    }))
    .filter(
      (r) =>
        Number.isFinite(r.rating) &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lon) &&
        r.rating >= 1 &&
        r.rating <= 5
    )
  return { rawData, restaurants }
}
