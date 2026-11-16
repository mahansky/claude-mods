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

const LOOK: ThemeSetArgs = {
  colors: theme,
  // Barely any frosting: below the strip the backdrop is plain surface-0, so
  // thin panels cost no readability, and the rain shows through at the top.
  backdrop: { scene: 'matrix-rain', glass: { blur: 0, opacity: 0.3 } },
}

async function apply($: EngineInterface) {
  try {
    const set = await $.theme.set(LOOK)

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
    await apply($)
    // On a hot reload the old copy unloads after this one starts and takes
    // the theme with it, so set it again once that has settled.
    $.clock.after(2000, () => void apply($))
    $.clock.after(6000, () => void apply($))

    return next(e)
  })

  // And each turn, like theme-examples, so nothing can leave it bare for long.
  on('prompt.submit', async ($, e, next) => {
    await apply($)

    return next(e)
  })

  on('ui.render', { component: 'Backdrop' }, ($, e, next) => {
    if (e.props.scene !== 'matrix-rain' || (e.surface !== 'desktop' && e.surface !== 'mobile')) {
      return next(e)
    }
    const { Svg } = $.ui.resolve(e)

    return <Svg source={svg} alt="Green digital rain along the top edge" isInteractive />
  })
}
