import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { loadRestaurantData } from './server/loadRestaurants.mjs'

let cached = null
function getRestaurantPayload() {
  if (!cached) cached = loadRestaurantData()
  return cached
}

function apiDataJsonMiddleware(req, res, next) {
  const pathname = req.url?.split('?')[0] ?? ''
  if (pathname === '/api/meta') {
    const { rawData, restaurants } = getRestaurantPayload()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.end(
      JSON.stringify({
        source: 'data.json',
        rawRows: rawData.length,
        served: restaurants.length,
        servedBy: 'vite'
      })
    )
    return
  }
  if (pathname === '/api/restaurants') {
    const { restaurants } = getRestaurantPayload()
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Restaurant-Count', String(restaurants.length))
    res.setHeader('X-Data-Source', 'data.json')
    res.end(JSON.stringify(restaurants))
    return
  }
  next()
}

const apiPlugin = () => ({
  name: 'api-data-json',
  enforce: 'pre',
  configureServer(server) {
    server.middlewares.use(apiDataJsonMiddleware)
  },
  configurePreviewServer(server) {
    server.middlewares.use(apiDataJsonMiddleware)
  }
})

// https://vite.dev/config/
export default defineConfig({
  plugins: [apiPlugin(), react()]
})
