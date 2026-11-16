// The backdrop SVG, built once per load: the film's digital rain.
//
// How it moves, cheaply: the glyphs are static text that never changes. Each
// column has a cover strip painted in the ground colour, with a clear window
// for the head row and a trail that turns opaque again row by row above it.
// The strip slides down one row per tick with a CSS transform animation in
// whole steps, so a head appears to print its way down like a terminal. A
// transform is the one thing the renderer animates nearly for free; animating
// fills, opacities or gradients repaints every frame and the app drops a
// backdrop that costs that much.
//
// Frame: a wide viewBox pinned to the top with `slice`, so height is nearly
// always the binding side and the strip is a steady share of the window.
// The layers sit in a nested <svg> the height of the strip: the cover strips
// are tall, and without that clip each step repaints their whole height,
// most of the window, instead of the strip alone.
//
// No masks (the app's renderer drops masked art), and no CSS variables in SVG
// attributes (they only work inside CSS).

// ---- Knobs -----------------------------------------------------------------
const STRIP = 260 // viewBox units of rain before it has fully faded
const WIDTH = 2400 // viewBox width; wider windows crop the sides
const HEIGHT = 1000 // viewBox height
// Half-width katakana and digits. Nothing XML would read as markup (< > &).
const GLYPHS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789:=*+"'

// One shared clock (10 Hz still reads as stepping, like a terminal): every step of every column lands on a tick of it, so the
// scene changes at most this many times a second and the app redraws nothing
// in between. Free-running columns change on nearly every frame, which costs
// the app most of a CPU core.
const CLOCK = 10 // ticks per second
const TICK = 1 / CLOCK

// Three depth layers, far to near. `cell` is the grid pitch, `fill` the share
// of free columns that carry a stream (every head is drawn bright), `trail`
// the rows lit behind a head, `ticks` the clock ticks per row a stream may run
// at, `rest` the dark rows before a column runs again.
const LAYERS = [
  { font: 12, cell: 14, opacity: 0.35, fill: 0.6, trail: 14, rest: 6, ticks: [2, 3] },
  { font: 17, cell: 20, opacity: 0.7, fill: 0.6, trail: 13, rest: 5, ticks: [1, 2] },
  { font: 21, cell: 24, opacity: 0.95, fill: 0.3, trail: 11, rest: 6, ticks: [1, 1] },
]
// Runners: rare near-layer streams that run all the way down the window,
// each on its own period; together about one every ~15s.
const RUNNERS = [47, 59, 71, 83] // seconds between a runner's passes (whole seconds keep them on the clock)
const RUNNER_TICKS = 1 // clock ticks per row
const RUNNER_TRAIL = 16
// ---------------------------------------------------------------------------

function prng(seed: number) {
  let s = seed >>> 0

  return () => {
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5

    return (s >>> 0) / 4294967296
  }
}

const fmt = (n: number) => String(Math.round(n * 1000) / 1000)

const PALETTE = `:root{--bg:#e8ece9;--glyph:#13803f;--hl:#03240f;--hlA:.18}
@media (prefers-color-scheme: dark){:root{--bg:#0c0f0d;--glyph:#1fdc6a;--hl:#e4ffee;--hlA:.5}}`

// A cover strip's gradient, in its own box. The head row is clear; the
// `trail` rows above it step from clear to opaque; everything else is opaque.
// `top` is how far above the head row the strip reaches, `bottom` how far below.
function cover(id: string, cell: number, trail: number, top: number, bottom: number): string {
  const height = top + bottom
  const at = (y: number) => fmt((y + top) / height) // y relative to the head row's top
  let stops = `<stop offset="0" class="b"/><stop offset="${at(-trail * cell)}" class="b"/>`
  for (let i = trail; i >= 1; i -= 1) {
    const o = fmt(((i - 1) / trail) ** 1.3)
    stops += `<stop offset="${at(-i * cell)}" class="b" stop-opacity="${o}"/><stop offset="${at(-(i - 1) * cell)}" class="b" stop-opacity="${o}"/>`
  }
  stops += `<stop offset="${at(0)}" class="b" stop-opacity="0"/><stop offset="${at(cell)}" class="b" stop-opacity="0"/><stop offset="${at(cell)}" class="b"/><stop offset="1" class="b"/>`

  return `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>`
}

// A layer's cover, as one repeating tile `period` tall: a trail stepping from
// near opaque (top) to clear, the clear head row with its highlight, then
// opaque to the end. Sliding the tiled cover down exactly one period and
// jumping back is seamless, so a whole layer moves under one animation.
function tile(id: string, cell: number, trail: number, period: number, opacity: number): string {
  const at = (y: number) => fmt(y / period)
  const head = trail * cell
  let stops = ''
  for (let i = trail; i >= 1; i -= 1) {
    const o = fmt(((i - 1) / trail) ** 1.3)
    const y = (trail - i) * cell
    stops += `<stop offset="${at(y)}" class="b" stop-opacity="${o}"/><stop offset="${at(y + cell)}" class="b" stop-opacity="${o}"/>`
  }
  stops += `<stop offset="${at(head)}" class="b" stop-opacity="0"/><stop offset="${at(head + cell)}" class="b" stop-opacity="0"/><stop offset="${at(head + cell)}" class="b"/><stop offset="1" class="b"/>`

  return (
    `<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient>` +
    `<pattern id="${id}" patternUnits="userSpaceOnUse" width="${cell}" height="${period}">` +
    `<rect width="${cell}" height="${period}" fill="url(#${id}g)"/>` +
    `<ellipse class="hl" opacity="${opacity}" cx="${cell / 2}" cy="${head + cell * 0.62}" rx="${cell * 0.42}" ry="${cell * 0.5}"/></pattern>`
  )
}

export function buildRain(): string {
  const rand = prng(0x5eed1999)
  const pick = () => GLYPHS[Math.floor(rand() * GLYPHS.length)] ?? '0'
  const glyphs = (rows: number) => {
    let chars = ''
    for (let r = 0; r < rows; r += 1) chars += pick()
    return chars
  }
  const column = (chars: string, cell: number, x: number, cls = '') => {
    const xs = Array.from(chars, () => '0').join(' ')
    const ys = Array.from(chars, (_, r) => (r + 1) * cell).join(' ')

    // Mirrored, like the film's glyphs.
    return `<text${cls ? ` class="${cls}"` : ''} transform="translate(${x} 0) scale(-1 1)" x="${xs}" y="${ys}">${chars}</text>`
  }
  // The head highlight: a small soft spot behind the head glyph that rides
  // the cover, brightening the glyph without a visible blob. (A bright copy
  // clipped to the head row looks crisper but costs ~150x more to draw.)
  const head = (cell: number, x: number) =>
    `<ellipse class="hl" cx="${x}" cy="${cell * 0.62}" rx="${cell * 0.42}" ry="${cell * 0.5}"/>`
  let css = `.b{stop-color:var(--bg)}text{font-family:ui-monospace,Menlo,monospace;text-anchor:middle;fill:var(--glyph)}`
  css += `.hl{fill:url(#hl)}`
  css += `@media (prefers-reduced-motion: reduce){.mv,.run{display:none}.L text{fill-opacity:.15}}`
  let defs = `<radialGradient id="hl"><stop offset="0" style="stop-color:var(--hl);stop-opacity:var(--hlA)"/><stop offset=".55" style="stop-color:var(--hl);stop-opacity:calc(var(--hlA) * .3)"/><stop offset="1" style="stop-color:var(--hl);stop-opacity:0"/></radialGradient>`


  // Columns of nearer layers claim their x span first; a farther column that
  // would sit under a nearer one's cover is left out, so no cover hides
  // another layer's glyphs.
  const taken: Array<[number, number]> = []
  const isFree = (a: number, b: number) => taken.every(([c, d]) => b <= c || a >= d)
  const near = LAYERS[LAYERS.length - 1]!

  // Runners first: they cover a full-height column.
  const runRows = Math.ceil(HEIGHT / near.cell) + 1
  const runSteps = runRows + RUNNER_TRAIL + 1
  // The cover reaches far enough above the head to hide the whole column
  // even once the head has gone past the bottom.
  const runTop = (runSteps + 1) * near.cell
  const runBottom = (runRows + 2) * near.cell
  defs += cover('cr', near.cell, RUNNER_TRAIL, runTop, runBottom)
  let runners = ''
  RUNNERS.forEach((cycle, i) => {
    const x = Math.round((WIDTH * (0.3 + rand() * 0.4)) / near.cell) * near.cell + near.cell / 2
    taken.push([x - near.cell / 2, x + near.cell / 2])
    const active = fmt((100 * runSteps * RUNNER_TICKS * TICK) / cycle)
    const travel = runSteps * near.cell
    css += `@keyframes r${i}{0%{transform:translateY(0);animation-timing-function:steps(${runSteps},end)}${active}%{transform:translateY(${travel}px)}100%{transform:translateY(${travel}px)}}`
    const runDelay = Math.floor(rand() * cycle * CLOCK) * TICK
    css += `.r${i}{animation:r${i} ${cycle}s linear infinite;animation-delay:-${runDelay.toFixed(6)}s}`
    const chars = glyphs(runRows)
    runners +=
      `<g class="run">${column(chars, near.cell, x)}` +
      `<g class="r${i}"><rect x="${x - near.cell / 2}" y="${-runTop}" width="${near.cell}" height="${runTop + runBottom}" fill="url(#cr)"/>` +
      `${head(near.cell, x)}</g></g>`
  })
  css += `.run text{font-size:${near.font}px}`

  // Layers, nearest claiming first, drawn far to near. A column's phase is a
  // fixed offset of its stripe of the layer's tiled cover, and columns of one
  // speed share one animation, so the whole scene runs about ten. (One
  // animation per column cost the app ~30% of a core: it does work for every
  // running animation on every frame.)
  const drawn: string[] = []
  for (let li = LAYERS.length - 1; li >= 0; li -= 1) {
    const L = LAYERS[li]!
    const { cell } = L
    const rows = Math.ceil(STRIP / cell) + 1
    const steps = rows + L.trail + 1 + L.rest
    const period = steps * cell
    defs += tile(`c${li}`, cell, L.trail, period, L.opacity)
    // Each glyph and highlight is faded itself: opacity on a group makes the
    // renderer paint it off-screen and blend it back on every update.
    css += `.L${li} text{font-size:${L.font}px;fill-opacity:${L.opacity}}`
    css += `@keyframes m${li}{from{transform:translateY(0)}to{transform:translateY(${period}px)}}`

    let text = ''
    const covers: string[] = L.ticks.map(() => '')
    for (let x = cell / 2; x < WIDTH; x += cell) {
      const span: [number, number] = [x - cell / 2, x + cell / 2]
      if (!isFree(...span) || rand() >= L.fill) continue
      taken.push(span)
      const si = Math.floor(rand() * L.ticks.length)
      const phase = Math.floor(rand() * steps) * cell
      text += column(glyphs(rows), cell, x)
      // Tall enough to cover the column at every point of the slide.
      covers[si] += `<rect transform="translate(0 ${phase})" x="${x - cell / 2}" y="${-2 * period}" width="${cell}" height="${2 * period + STRIP + cell}" fill="url(#c${li})"/>`
    }
    let moving = ''
    L.ticks.forEach((ticks, si) => {
      if (covers[si] === '') return
      css += `.s${li}${si}{animation:m${li} ${(steps * ticks * TICK).toFixed(6)}s steps(${steps},end) infinite}`
      moving += `<g class="mv s${li}${si}">${covers[si]}</g>`
    })
    drawn.unshift(`<g class="L L${li}">${text}${moving}</g>`)
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMin slice">
<style>
${PALETTE}
svg{background:var(--bg)}
.f0{stop-color:var(--bg);stop-opacity:0}.f1{stop-color:var(--bg);stop-opacity:.2}.f2{stop-color:var(--bg);stop-opacity:1}
${css}
</style>
<defs>${defs}<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${STRIP}">
<stop offset="0" class="f0"/><stop offset=".55" class="f1"/><stop offset="1" class="f2"/>
</linearGradient></defs>
<rect width="${WIDTH}" height="${HEIGHT}" style="fill:var(--bg)"/>
<svg x="0" y="0" width="${WIDTH}" height="${STRIP}" overflow="hidden">
${drawn.join('\n')}
</svg>
<rect width="${WIDTH}" height="${STRIP}" fill="url(#fade)"/>
<rect y="${STRIP}" width="${WIDTH}" height="${HEIGHT - STRIP}" style="fill:var(--bg)"/>
${runners}
</svg>`
}
