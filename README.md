# claude-mods

Personal mods for Claude Code.

## matrix-rain

<img width="1511" height="329" alt="image" src="https://github.com/user-attachments/assets/bf4ee703-6638-4324-97df-238162c85b3c" />

A strip of the film's digital rain along the top of the Claude desktop window,
over green-tinted grays, in light and dark mode. Glyphs sit fixed on a grid
while each column's head prints its way down, on three depth layers; now and
then a stream runs all the way down the window. It draws in the desktop and
mobile apps; the terminal draws no themes.

Light on the machine: the glyphs never change, and only cover strips slide by
CSS transform, so the scene costs about a millisecond of CPU a second. Motion
stops when your system asks for reduced motion.

### Install

At the prompt of a terminal session:

```
/plugin install matrix-rain --marketplace mahansky/claude-mods
```

From a shell:

```
claude plugin install matrix-rain --marketplace mahansky/claude-mods
```

Answer `y` to add the marketplace, then pick the user scope. Installed at the
user scope, it loads in every new session, the desktop app's included.

In the desktop app, where `/plugin` does not run: click + next to the prompt
box, then Plugins, Add marketplace with `mahansky/claude-mods`, then Add plugin.

To update later: `claude plugin update matrix-rain@claude-mods`, then
`/reload-plugins` in any open session.

### Tuning

The knobs are constants at the top of `matrix-rain/hooks/rain.ts`: strip
height, layers (glyph size, density, trail length, speeds), runners and the
glyph set. The head highlight's strength is `--hlA` in the palette there.
