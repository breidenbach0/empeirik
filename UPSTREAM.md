# Upstream attribution

empeirik depends on, embeds, or interoperates with the following upstream
projects. Their authors' work is what makes the live simulation possible; this
project would not exist without them.

## CircuitJS1

- Project: CircuitJS1 electronic circuit simulator
- Original author: Paul Falstad — <http://www.falstad.com/>
- Current source used by empeirik: Paul Falstad — <https://github.com/pfalstad/circuitjs1>
- Original GWT port and maintenance: Iain Sharp (sharpie7)
- License: GNU General Public License, version 2 — <https://www.gnu.org/licenses/old-licenses/gpl-2.0.html>

CircuitJS1 began as a Java applet written by Paul Falstad and was ported to
GWT/JavaScript by Iain Sharp. empeirik serves it same-origin and carries a
small GPL-compatible source overlay that adds a native agent editor API. The
overlay is intentionally narrow: `AgentBridge.java` and the public
`JSInterface.java` entry point. All circuit rendering, simulation, element
construction, property edits, commands, options, scopes, and undo behavior
still execute inside CircuitJS1.

### How the runtime is obtained

`npm run build:circuitjs-bridge` (also available as `npm run
install:circuitjs`) checks out the official source at the pinned commit:

- Repository: <https://github.com/pfalstad/circuitjs1>
- Commit: `c0b264e462fb8935c09b0e2a4dfa884debbde6b5`
- Upstream version at that commit: `4.1.4js`

The script overlays the files under `vendor/circuitjs1`, runs upstream's Gradle
`makeSite` task, and installs the result into `./circuitjs`, so the simulator
runs same-origin at `circuitjs/circuitjs.html`. The older
`npm run install:circuitjs:official` command remains available to install the
unmodified offline ZIP for comparison, but that runtime intentionally does not
provide granular agent editing.

### Documented JavaScript interface used by empeirik

empeirik embeds `circuitjs.html` in an iframe and speaks to the simulator
through the interface documented by the upstream project:

- Documentation: <http://www.falstad.com/circuit/doc/js-interface.html>
- Source of the interface: `src/com/lushprojects/circuitjs1/client/` in the
  `pfalstad/circuitjs1` repository.

Calls used by the adapter:

- `iframe.contentWindow.oncircuitjsloaded` — load handshake.
- `CircuitJS1.importCircuit(circuitString, false)` — load example branches or
  an agent-built CircuitJS export.
- `CircuitJS1.exportCircuit()` / `CircuitJS1.getElements()` — inspect and
  preserve the live circuit.
- `CircuitJS1.getNodeVoltage(nodeName)` — read any labeled simulation node.
- `CircuitJS1.setSimRunning(boolean)` / `CircuitJS1.isRunning()`.

empeirik adds `CircuitJS1.editor`, which exposes:

- A dynamic catalog of every element registered by the current CircuitJS1
  build.
- Native add, remove, move, select, and generic property-edit operations.
- Switches, built-in sliders, and user-created adjustable sliders.
- The CircuitJS1 command manager for Edit, File, Scopes, element, scope, Tools,
  zoom, and view commands.
- Display/editor options, simulation controls, canvas pan/zoom, global
  properties, complete scope configuration, simulation reset, and native
  undo/redo.

The outer adapter and native bridge add atomic multi-action batches: they
snapshot the exact CircuitJS export, run state, and native undo history,
execute the batch as one undoable edit, and restore the snapshot if any action
fails. Browser-owned actions such as file pickers, clipboard writes, downloads,
printing, and fullscreen can still require a user gesture; direct circuit
import/export and SVG APIs cover the useful non-dialog forms.

When the runtime is absent, empeirik falls back to a circuit-text adapter for
import, export, and structural inspection. It never invents simulated readings;
live building and measurement correctly require the real CircuitJS1 runtime.

## WebMCP

- Proposal: Web Model Context Protocol (WebMCP)
- Chrome documentation: <https://developer.chrome.com/docs/ai/webmcp/>
- Imperative API reference: <https://developer.chrome.com/docs/ai/webmcp/imperative-api/>

empeirik registers nine general circuit-workspace tools, twenty native
CircuitJS1 editor tools, and nine stricter example-diagnostic tools through
`document.modelContext.registerTool` when a WebMCP-capable browser is present,
and exposes the same handlers through `window.Empeirik.tools` otherwise.

## License compatibility note

empeirik is distributed under GPL-2.0-or-later (see `LICENSE`) so that it
can be distributed together with CircuitJS1 under compatible terms.
