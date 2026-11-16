import { expect, test } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'

// /matrix as the person types it, with `args` the text after the name.
const matrix = (args = '') => ({
  command: 'matrix',
  args,
  origin: { kind: 'composer' as const },
  presentation: { isFullscreen: false, columns: 100 },
})

// The engine side: a store in memory. (The test kit has no $.theme, so what
// the mod sets as the theme is not checked here; the mod catches that call.)
function engine(on: Parameters<TestBody>[1]) {
  const store = new Map<string, unknown>()
  on('store.get', (_, e) => ({ value: store.get(e.key) }))
  on('store.set', (_, e) => {
    store.set(e.key, e.value)
    return { value: undefined }
  })
  on('command.register', () => ({ value: { command: 'matrix' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('command.run', () => ({ text: '' }))
  on('ui.toast', () => ({ value: undefined }))

  return store
}

test('/matrix off is remembered; /matrix on brings it back', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const off = await $.command.run(matrix('off'))
  expect(off.text).toContain('Matrix rain off')
  expect(store.get('rain')).toBe(false)

  const back = await $.command.run(matrix('ON'))
  expect(back.text).toContain('Matrix rain on')
  expect(store.get('rain')).toBe(true)
})

test('/matrix with no argument toggles, starting from on', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  expect((await $.command.run(matrix())).text).toContain('off')
  expect(store.get('rain')).toBe(false)
  expect((await $.command.run(matrix())).text).toContain('on')
  expect(store.get('rain')).toBe(true)
})

test('a choice stored in an earlier session is what toggling starts from', async ($, on) => {
  const store = engine(on)
  store.set('rain', false)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  await $.command.run(matrix())
  expect(store.get('rain')).toBe(true)
})

test('an unknown argument changes nothing and says how to use it', async ($, on) => {
  const store = engine(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const reply = await $.command.run(matrix('sideways'))
  expect(reply.text).toContain('Usage')
  expect(store.has('rain')).toBe(false)
})
