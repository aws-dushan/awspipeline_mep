/**
 * Build the brand assets from `public/brand/logo-source.png`.
 *
 * Produces:
 *   mark.svg        vector, two colour-separated traces (navy + orange)
 *   mark-light.svg  the same, with the navy lifted to white for dark surfaces
 *   mark.png        cleanly matted raster fallback
 *   mark-light.png  ditto, for dark surfaces
 *
 * The source is a raster on an opaque white plate. Two things matter:
 *
 *  1. Removing white by simple thresholding leaves a pale fringe, because the
 *     antialiased edge pixels are genuine blends of ink and white. Solving
 *     each pixel for its true colour and alpha (un-matting) removes the halo.
 *
 *  2. Tracing is done per colour, so the result is a real vector with flat
 *     fills rather than an image embedded in an SVG wrapper.
 *
 *   node scripts/build-logo.mjs
 */
import { chromium } from 'playwright'
import { trace } from 'potrace'
import { readFileSync, writeFileSync } from 'node:fs'
import { promisify } from 'node:util'

const traceAsync = promisify(trace)

const ORANGE = '#E8681A'
const NAVY = '#302078'
const SOURCE = 'public/brand/logo-source.png'
const SCALE = 4 // trace at 1024px so curves keep their detail

const browser = await chromium.launch()
const page = await browser.newPage()

const b64 = readFileSync(SOURCE).toString('base64')

const layers = await page.evaluate(
  async ({ src, scale }) => {
    const img = new Image()
    img.src = src
    await img.decode()

    const size = img.width * scale
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, size, size)
    const { data } = ctx.getImageData(0, 0, size, size)

    /** Find the artwork bounds so the mark is not padded with empty space. */
    let minX = size, minY = size, maxX = 0, maxY = 0
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = (y * size + x) * 4
        if (Math.min(data[i], data[i + 1], data[i + 2]) < 230) {
          if (x < minX) minX = x
          if (y < minY) minY = y
          if (x > maxX) maxX = x
          if (y > maxY) maxY = y
        }
      }
    }
    const w = maxX - minX + 1
    const h = maxY - minY + 1
    const side = Math.max(w, h)
    const offX = minX - (side - w) / 2
    const offY = minY - (side - h) / 2

    const makeCanvas = () => {
      const t = document.createElement('canvas')
      t.width = side
      t.height = side
      return t
    }

    /**
     * Black-on-white mask for one ink, for potrace. `pick` decides whether a
     * pixel belongs to this layer; coverage comes from how far the pixel is
     * from white, so antialiased edges trace smoothly.
     */
    const mask = (pick) => {
      const t = makeCanvas()
      const tctx = t.getContext('2d')
      const out = tctx.createImageData(side, side)
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const sx = Math.round(offX + x)
          const sy = Math.round(offY + y)
          let value = 255
          if (sx >= 0 && sy >= 0 && sx < size && sy < size) {
            const i = (sy * size + sx) * 4
            const r = data[i], g = data[i + 1], b = data[i + 2]
            const coverage = 1 - Math.min(r, g, b) / 255
            if (coverage > 0.04 && pick(r, g, b)) {
              value = Math.round(255 * (1 - coverage))
            }
          }
          const o = (y * side + x) * 4
          out.data[o] = out.data[o + 1] = out.data[o + 2] = value
          out.data[o + 3] = 255
        }
      }
      tctx.putImageData(out, 0, 0)
      return t.toDataURL('image/png')
    }

    const isOrange = (r, g, b) => r > 120 && r > g + 35 && g >= b - 10
    const isNavy = (r, g, b) => !isOrange(r, g, b)

    /**
     * Un-matted RGBA: recover each pixel's true colour and alpha assuming it
     * was composited over white. This is what kills the pale fringe.
     */
    const unmatte = (lift) => {
      const t = makeCanvas()
      const tctx = t.getContext('2d')
      const out = tctx.createImageData(side, side)
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const sx = Math.round(offX + x)
          const sy = Math.round(offY + y)
          const o = (y * side + x) * 4
          if (sx < 0 || sy < 0 || sx >= size || sy >= size) {
            out.data[o + 3] = 0
            continue
          }
          const i = (sy * size + sx) * 4
          const r = data[i], g = data[i + 1], b = data[i + 2]
          const alpha = 1 - Math.min(r, g, b) / 255
          if (alpha <= 0.01) {
            out.data[o + 3] = 0
            continue
          }
          // src = (px - white * (1 - a)) / a
          let cr = (r - 255 * (1 - alpha)) / alpha
          let cg = (g - 255 * (1 - alpha)) / alpha
          let cb = (b - 255 * (1 - alpha)) / alpha
          if (lift && !isOrange(cr, cg, cb)) {
            cr = cg = cb = 255
          }
          out.data[o] = Math.max(0, Math.min(255, Math.round(cr)))
          out.data[o + 1] = Math.max(0, Math.min(255, Math.round(cg)))
          out.data[o + 2] = Math.max(0, Math.min(255, Math.round(cb)))
          out.data[o + 3] = Math.round(alpha * 255)
        }
      }
      tctx.putImageData(out, 0, 0)
      return t.toDataURL('image/png')
    }

    return {
      side,
      orangeMask: mask(isOrange),
      navyMask: mask(isNavy),
      png: unmatte(false),
      pngLight: unmatte(true),
    }
  },
  { src: `data:image/png;base64,${b64}`, scale: SCALE },
)

await browser.close()

const toBuffer = (dataUrl) => Buffer.from(dataUrl.split(',')[1], 'base64')

writeFileSync('public/brand/mark.png', toBuffer(layers.png))
writeFileSync('public/brand/mark-light.png', toBuffer(layers.pngLight))

/** Pull just the path data out of potrace's SVG wrapper. */
async function tracePaths(dataUrl) {
  const svg = await traceAsync(toBuffer(dataUrl), {
    threshold: 200,
    turdSize: 2,
    optCurve: true,
    optTolerance: 0.2,
    alphaMax: 1,
  })
  return [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1])
}

const [orangePaths, navyPaths] = await Promise.all([
  tracePaths(layers.orangeMask),
  tracePaths(layers.navyMask),
])

function buildSvg({ navyFill }) {
  const size = layers.side
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="AWS Distribution">
${orangePaths.map((d) => `  <path fill="${ORANGE}" fill-rule="evenodd" d="${d}"/>`).join('\n')}
${navyPaths.map((d) => `  <path fill="${navyFill}" fill-rule="evenodd" d="${d}"/>`).join('\n')}
</svg>
`
}

writeFileSync('public/brand/mark.svg', buildSvg({ navyFill: NAVY }))
writeFileSync('public/brand/mark-light.svg', buildSvg({ navyFill: '#FFFFFF' }))

/* -------------------------------------------------------------------------- */
/*  Favicons                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The tab icon gets a little breathing room around the mark. Browsers render
 * favicons at 16-32px, and artwork that touches the edges reads as a smudge.
 */
const PAD = 0.08
function buildIconSvg({ navyFill }) {
  const size = layers.side
  const box = size * (1 + PAD * 2)
  const offset = size * PAD
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${box} ${box}" width="${box}" height="${box}" role="img" aria-label="AWS Distribution">
  <g transform="translate(${offset} ${offset})">
${orangePaths.map((d) => `    <path fill="${ORANGE}" fill-rule="evenodd" d="${d}"/>`).join('\n')}
${navyPaths.map((d) => `    <path fill="${navyFill}" fill-rule="evenodd" d="${d}"/>`).join('\n')}
  </g>
</svg>
`
}

const iconSvg = buildIconSvg({ navyFill: NAVY })
writeFileSync('public/favicon.svg', iconSvg)

// PNG fallbacks: Safari and most OS "add to home screen" paths ignore SVG
// favicons, and a browser that cannot use the SVG should not fall back to a
// default globe.
const iconBrowser = await chromium.launch()
const iconPage = await iconBrowser.newPage()
const rasters = await iconPage.evaluate(async ({ svg, sizes }) => {
  const blobUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`
  const img = new Image()
  img.src = blobUrl
  await img.decode()

  const out = {}
  for (const size of sizes) {
    const c = document.createElement('canvas')
    c.width = size
    c.height = size
    const ctx = c.getContext('2d')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, 0, 0, size, size)
    out[size] = c.toDataURL('image/png')
  }
  return out
}, { svg: iconSvg, sizes: [32, 192, 180] })
await iconBrowser.close()

writeFileSync('public/favicon-32.png', toBuffer(rasters[32]))
writeFileSync('public/icon-192.png', toBuffer(rasters[192]))
writeFileSync('public/apple-icon.png', toBuffer(rasters[180]))

console.log(`traced at ${layers.side}px`)
console.log(`  orange paths: ${orangePaths.length}`)
console.log(`  navy paths:   ${navyPaths.length}`)
console.log('wrote brand/mark.svg, brand/mark-light.svg')
console.log('wrote favicon.svg, favicon-32.png, icon-192.png, apple-icon.png')
