import express from 'express'
import cors from 'cors'
import pg from 'pg'
const { Pool } = pg
import dotenv from 'dotenv'
dotenv.config({ path: '../.env' })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
})

pool.connect((err, client, release) => {
  if (err) {
    console.error('Connection error:', err)
  } else {
    console.log('Connected to Supabase successfully')
    release()
  }
})

const app = express()
app.use(cors({
    origin: ['http://localhost:5173', 'https://nycrestaurantvisualizer.netlify.app/']
  }))

app.get('/api/restaurants', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM restaurants')
    console.log('Row count:', result.rows.length)
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
   } catch (err) {
     console.error('Database error:', err.message)
     res.status(500).json({ error: err.message })
   }
})

app.listen(3001, () => {
  console.log('Server running on port 3001')
})
