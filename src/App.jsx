import DeckGL from '@deck.gl/react'
import { PolygonLayer } from '@deck.gl/layers'
import Map, { Layer } from 'react-map-gl/mapbox'
import 'mapbox-gl/dist/mapbox-gl.css'
import { useState, useEffect, useMemo } from 'react'
import './App.css'
import 'katex/dist/katex.min.css'
import katex from 'katex'

const INITIAL_VIEW_STATE = {
  longitude: -73.9857,
  latitude: 40.7484,
  zoom: 15.5,
  pitch: 45,
  bearing: 0
}

const BUILDING_EXTRUSION_LAYER = {
  id: 'midtown-3d-buildings-transparent',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'fill-extrusion',
  minzoom: 15,
  paint: {
    'fill-extrusion-color': '#7fb1d1',
    'fill-extrusion-height': ['get', 'height'],
    'fill-extrusion-base': ['get', 'min_height'],
    // Keep walls visible enough to perceive real 3D massing, but still see-through.
    'fill-extrusion-opacity': 0.08,
    'fill-extrusion-vertical-gradient': false,
    // Draw extrusion edge lines directly on the 3D geometry.
    'fill-extrusion-line-width': 0.8
  }
}

const BUILDING_ROOF_OUTLINE_LAYER = {
  id: 'midtown-3d-building-roof-outlines',
  source: 'composite',
  'source-layer': 'building',
  filter: ['==', 'extrude', 'true'],
  type: 'line',
  minzoom: 15,
  layout: {
    'line-elevation-reference': 'ground',
    'line-z-offset': ['get', 'height']
  },
  paint: {
    'line-color': '#9fc2d8',
    'line-width': 1.1,
    'line-opacity': 0.55
  }
}

// Red → yellow (2→3.5) → green (3.5→5). Below 2 stays fully red.
const RATING_COLOR_MIN = 0
const RATING_COLOR_MAX = 5
const RATING_RED_CLAMP_BELOW = 3
const RATING_COLOR_MID = 4

const COLOR_RED = [255, 25, 35]
const COLOR_YELLOW = [255, 235, 45]
const COLOR_GREEN = [30, 220, 75]

const lerpRgb = (a, b, t) => [
  Math.round(a[0] + (b[0] - a[0]) * t),
  Math.round(a[1] + (b[1] - a[1]) * t),
  Math.round(a[2] + (b[2] - a[2]) * t)
]

const getColumnColor = (rating) => {
  if (!Number.isFinite(rating)) return [128, 128, 60, 235]
  const r0 = Math.min(RATING_COLOR_MAX, Math.max(RATING_COLOR_MIN, rating))

  if (r0 < RATING_RED_CLAMP_BELOW) {
    return [...COLOR_RED, 235]
  }
  if (r0 <= RATING_COLOR_MID) {
    const t = (r0 - RATING_RED_CLAMP_BELOW) / (RATING_COLOR_MID - RATING_RED_CLAMP_BELOW)
    return [...lerpRgb(COLOR_RED, COLOR_YELLOW, t), 235]
  }
  const t = (r0 - RATING_COLOR_MID) / (RATING_COLOR_MAX - RATING_COLOR_MID)
  return [...lerpRgb(COLOR_YELLOW, COLOR_GREEN, t), 235]
}

/** At or below floor = flat min height; above floor, extra height ∝ (rating − floor)³ up to max at 5★. */
const RATING_HEIGHT_FLOOR = 2
const RATING_HEIGHT_MIN_M = 20
const RATING_HEIGHT_MAX_M = 200
const RATING_MAX = 5
const RATING_HEIGHT_EXPONENT = 3

const getPopularityMultiplier = (ratingCount) => {
  const count = Math.max(1, ratingCount || 1)
  const raw = Math.log10(count) / 2
  return Math.min(2, Math.max(0.5, raw))
}

const getRatingElevationMeters = (rating, ratingCount) => {
  const r = Math.min(RATING_MAX, Math.max(1, Number.isFinite(rating) ? rating : 3))

  if (r <= RATING_HEIGHT_FLOOR) {
    return RATING_HEIGHT_MIN_M * getPopularityMultiplier(ratingCount)
  }

  const normalizedRating = (r - RATING_HEIGHT_FLOOR) / (RATING_MAX - RATING_HEIGHT_FLOOR)
  const curvedHeight = Math.pow(normalizedRating, RATING_HEIGHT_EXPONENT)
  const heightRange = RATING_HEIGHT_MAX_M - RATING_HEIGHT_MIN_M
  const baseHeight = RATING_HEIGHT_MIN_M + curvedHeight * heightRange

  return baseHeight * getPopularityMultiplier(ratingCount);
}

const METERS_PER_DEG_LAT = 111320
// Manhattan avenues are about 29deg east of true north (~61deg from +longitude axis).
const MANHATTAN_GRID_ANGLE_DEGREES = 61
const RATING_PRISM_SIZE_METERS = 6
const RATING_PRISM_CENTER_OFFSET_METERS = { along: 5, across: 4 }

const createOrientedBoxFootprint = (longitude, latitude, orientation, widthMeters, depthMeters) => {
  const theta = (orientation * Math.PI) / 180
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)
  const halfW = widthMeters / 2
  const halfD = depthMeters / 2

  const localCorners = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD]
  ]

  return localCorners.map(([x, y]) => {
    const rotatedX = x * cosTheta - y * sinTheta
    const rotatedY = x * sinTheta + y * cosTheta
    const dLat = rotatedY / METERS_PER_DEG_LAT
    const dLng = rotatedX / (METERS_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180))
    return [longitude + dLng, latitude + dLat]
  })
}

const offsetPointAlongGrid = (longitude, latitude, orientation, alongMeters, acrossMeters) => {
  const theta = (orientation * Math.PI) / 180
  const cosTheta = Math.cos(theta)
  const sinTheta = Math.sin(theta)

  // "Along" follows one street axis, "across" follows the orthogonal street axis.
  const dxMeters = alongMeters * cosTheta - acrossMeters * sinTheta
  const dyMeters = alongMeters * sinTheta + acrossMeters * cosTheta

  const dLat = dyMeters / METERS_PER_DEG_LAT
  const dLng = dxMeters / (METERS_PER_DEG_LAT * Math.cos((latitude * Math.PI) / 180))
  return [longitude + dLng, latitude + dLat]
}

const API_BASE = import.meta.env.VITE_API_URL ?? ''

function App() {
  const mapboxToken = import.meta.env.VITE_MAPBOX_TOKEN
  const [restaurants, setRestaurants] = useState([])
  const [loadStatus, setLoadStatus] = useState('loading')
  const [showAbout, setShowAbout] = useState(false) // for button
  useEffect(() => {
    setLoadStatus('loading')
    fetch(`${API_BASE}/api/restaurants`, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const n = res.headers.get('X-Restaurant-Count')
        if (n) console.info(`[restaurants] X-Restaurant-Count: ${n}`)
        return res.json()
      })
      .then((data) => {
        const list = Array.isArray(data) ? data : []
        setRestaurants(list)
        setLoadStatus('ok')
        console.info(`[restaurants] loaded ${list.length} rows`)
      })
      .catch((err) => {
        console.error('Failed to load restaurants:', err)
        setLoadStatus('error')
      })
  }, [])

  const validRestaurants = useMemo(
    () =>
      restaurants.filter(
        (d) =>
          Number.isFinite(d.lat) &&
          Number.isFinite(d.lon) &&
          Number.isFinite(d.rating) &&
          d.rating >= 1 &&
          d.rating <= 5
      ),
    [restaurants]
  )

  const layers = [
    new PolygonLayer({
      id: 'restaurant-rating-boxes',
      data: validRestaurants,
      extruded: true,
      wireframe: true,
      stroked: true,
      pickable: true,
      getPolygon: (d) => {
        const [shiftedLng, shiftedLat] = offsetPointAlongGrid(
          d.lon,
          d.lat,
          MANHATTAN_GRID_ANGLE_DEGREES,
          RATING_PRISM_CENTER_OFFSET_METERS.along,
          RATING_PRISM_CENTER_OFFSET_METERS.across
        )
        return createOrientedBoxFootprint(
          shiftedLng,
          shiftedLat,
          MANHATTAN_GRID_ANGLE_DEGREES,
          RATING_PRISM_SIZE_METERS,
          RATING_PRISM_SIZE_METERS
        )
      },
      getElevation: (d) => getRatingElevationMeters(d.rating, d.ratingCount),
      getFillColor: (d) => getColumnColor(d.rating),
      getLineColor: [255, 255, 255, 255],
      getLineWidth: 2,
      lineWidthMinPixels: 2
    })
  ]

  return (
    <>
      <DeckGL initialViewState={INITIAL_VIEW_STATE} controller layers={layers}>
        <Map
          mapboxAccessToken={mapboxToken}
          mapStyle="mapbox://styles/mapbox/dark-v11"
          antialias
          reuseMaps
        >
          <Layer {...BUILDING_EXTRUSION_LAYER} />
          <Layer {...BUILDING_ROOF_OUTLINE_LAYER} />
        </Map>
      </DeckGL>
  
      <button className="about-button" onClick={() => setShowAbout(prev => !prev)}>
        {showAbout ? 'Close' : 'About'}
      </button>
  
      {showAbout && (
        <div className="about-modal">
          <h2>NYC Restaurant Map</h2>
          <p>A 3D visualization of restaurant ratings across Manhattan. </p>
          <p>The height of the bars is not linear. Rather, it is calculated by the follow equation: </p>

          <p
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(
                String.raw`h(r, n) = s(r) \cdot p(n)`,
                { displayMode: true, throwOnError: false, fleqn: true }
              )
            }}
          />

          <p>where s is the rating scalar</p>
          <p
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(
                  String.raw`s(r) = \begin{cases} 12 & \text{if } r \leq 2 \\ 12 + 188 \cdot \left(\dfrac{r-2}{3}\right)^3 & \text{if } r > 2 \end{cases}`,
                  { displayMode: true, throwOnError: false, fleqn: true }
                )
              }}
            />

          <p>and p is the popularity multiplier</p>
          <p
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(
                String.raw`p(n) = \text{clamp}\left(\frac{\log_{10}(n)}{2},\ 0.5,\ 2\right)`,
                { displayMode: true, throwOnError: false, fleqn: true }
              )
            }}
          />
          <p>Hence the height is scaled exponentially with respect to rating and logarithmically with respect to the number of ratings. </p>
          <p>The color of the bars depends soley on the rating. The gradient is green at 5, yellow at 4, and red at 3.</p>
          <p>Data pulled from Google Places API 03/29/2026</p>
        </div>
      )}
  
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          zIndex: 10,
          padding: '6px 10px',
          borderRadius: 6,
          background: 'rgba(0,0,0,0.55)',
          color: '#e8e8e8',
          fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
          pointerEvents: 'none',
          maxWidth: 280
        }}
      >
        {loadStatus === 'loading' && 'Loading restaurants…'}
        {loadStatus === 'error' && 'Could not load /api/restaurants.'}
        {loadStatus === 'ok' && (
          <>{validRestaurants.length.toLocaleString()} restaurants</>
        )}
      </div>
    </>
  )
}

export default App
