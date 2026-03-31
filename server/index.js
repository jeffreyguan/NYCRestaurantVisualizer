import express from 'express'
import cors from 'cors'
import pg from 'pg'
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

const app = express()
app.use(cors({
    origin: 'http://localhost:5173'
  }))

app.get('/api/restaurants', async (req, res) => {
    const result = await pool.query('SELECT * FROM restaurants')
    const restaurants = result.rows.map(r => ({
        name: r.name,
        rating: parseFloat(r.rating),
        ratingCount: parseInt(r.rating_count),
        lat: parseFloat(r.lat),
        lon: parseFloat(r.lon),
        address: r.address,
        price: r.price,
        googleLink: r.google_link
    }))
    res.json(restaurants)
  })

app.listen(3001, () => {
  console.log('Server running on port 3001')
})
