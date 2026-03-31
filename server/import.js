import pg from 'pg'
import { readFileSync } from 'fs'
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const { Pool } = pg

const pool = new Pool({
  user: process.env.PG_USER,
  host: 'localhost',
  database: 'nycrestaurants',
  password: process.env.PG_PASSWORD,
  port: 5432
})

const data = JSON.parse(readFileSync('./data.json', 'utf8'))

async function importData() {
  console.log(`Importing ${data.length} restaurants...`)

  for (const r of data) {
    await pool.query(
      `INSERT INTO restaurants (name, rating, rating_count, lat, lon, address, price, google_link)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [r.name, r.rating, r.ratingCount, r.lat, r.lon, r.address, r.price, r.googleLink]
    )
  }

  console.log('Done!')
  await pool.end()
}

importData()
