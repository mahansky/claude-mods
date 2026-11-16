import type { EngineInterface, Register, ThemeSetArgs } from 'claude-code'

import { makeColors } from './make-colors.js'
import { buildRain } from './rain.js'

// Near-black grays with a faint green cast by night; pale mint paper by day.
const { theme, problems } = makeColors({
  label: 'Matrix rain',
  roles: { accent: '#1fbf5f', danger: '#e0484a', success: '#8bc34a', warning: '#d9a21b', pro: '#8f7ae6' },
  light: {
    roles: { accent: '#13803f' },
    gray: {
      anchors: {
        'surface-0': '#e8ece9',
        'surface-1': '#f0f3f1',
        'surface-2': '#f7f9f8',
        'surface-3': '#f7f9f8',
        'text-primary': '#0e1a12',
        'text-secondary': '#33443a',
        'text-muted': '#536559',
      },
    },
  },
  dark: {
    gray: {
      anchors: {
        'surface-0': '#0c0f0d',
        'surface-1': '#121613',
        'surface-2': '#171c18',
        'surface-3': '#1c221e',
        'text-primary': '#d9e7dd',
        'text-secondary': '#a8bcae',
        'text-muted': '#84988a',
      },
    },
  },
})

// The rain is a scene the app keeps a share of a CPU core busy for as long as
// it shows, whatever it draws, so it is a switch: /matrix on, /matrix off, or
// /matrix to flip it. Off keeps the colors and drops the backdrop, which costs
// nothing. The choice is kept in the mod's store, across sessions.
const SCENE = 'matrix-rain'
const KEY = 'rain'
const COMMAND = 'matrix'

const look = (rain: boolean): ThemeSetArgs =>
  rain
    ? {
        colors: theme,
        // Barely any frosting: below the strip the backdrop is plain surface-0, so
        // thin panels cost no readability, and the rain shows through at the top.
        backdrop: { scene: SCENE, glass: { blur: 0, opacity: 0.3 } },
      }
    : { colors: theme }

// On unless switched off.
const isOn = async ($: EngineInterface) => (await $.store.get(KEY)) !== false

async function apply($: EngineInterface) {
  try {
    const set = await $.theme.set(look(await isOn($)))

    if (!set.isDrawn) {
      $.ui.status(set.reason)
    }
  } catch (error) {
    $.ui.toast(`matrix-rain: ${String(error)}`)
  }
}

export const register: Register = on => {
  const svg = buildRain()

  on('session.start', async ($, e, next) => {
    const unpainted = problems.find(line => line.startsWith("Desktop won't paint"))

    if (unpainted !== undefined) {
      $.ui.toast(unpainted)
    }
    await $.command.register({
      name: COMMAND,
      description: 'Matrix rain: on, off, or no argument to toggle (it costs ~30% of a CPU core while on)',
    })
    await apply($)
    // On a hot reload the old copy unloads after this one starts and takes
    // the theme with it, so set it again once that has settled.
    $.clock.after(2000, () => void apply($))
    $.clock.after(6000, () => void apply($))

    return next(e)
  })

  // Each turn of the main conversation: picks up a switch made in another
  // session, and puts the theme back if anything cleared it.
  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      await apply($)
    }

    return next(e)
  })

  on('command.run', { command: COMMAND }, async ($, e) => {
    // A bare `/matrix` can arrive with no args at all.
    const arg = (e.args ?? '').trim().toLowerCase()
    if (arg !== '' && arg !== 'on' && arg !== 'off') {
      return { text: 'Usage: /matrix on, /matrix off, or /matrix to toggle.' }
    }
    const rain = arg === '' ? !(await isOn($)) : arg === 'on'
    await $.store.set(KEY, rain)
    await apply($)

    return {
      text: rain
        ? 'Matrix rain on. It keeps ~30% of a CPU core busy while it shows; /matrix off to stop it.'
        : 'Matrix rain off. Colors stay; /matrix on to bring the rain back.',
    }
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.scene !== SCENE || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={svg} alt="Green digital rain along the top edge" isInteractive />
  })
}
