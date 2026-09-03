# empeirik CircuitJS1 runtime

This directory contains or receives the compiled CircuitJS1 web runtime with
empeirik's native editor bridge.

Build it reproducibly from the pinned upstream source with:

```bash
npm run build:circuitjs-bridge
```

To install an unmodified upstream runtime for comparison instead:

```bash
npm run install:circuitjs:official -- /path/to/circuitjs1-win.zip
```

The bridge build checks out a pinned `pfalstad/circuitjs1` revision, applies the
two Java source files in `vendor/circuitjs1`, runs the upstream Gradle build,
and copies the resulting site here. After installation, `circuitjs.html` must
exist here and `CircuitJS1.editor.getCapabilities()` must answer from the
same-origin iframe.

Attribution and licensing details live in `UPSTREAM.md`.
