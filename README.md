# empeirik

empeirik is a CircuitJS1-first workspace where a WebMCP agent can inspect,
build, edit, simulate, and diagnose the same circuit the human sees. There is no
second schematic or abstract diagnostic canvas: CircuitJS1 remains the source of
truth and the session panel is one chronological human/agent work log.

## Run

```bash
npm run build:circuitjs-bridge
npm start
```

Open <http://localhost:4173/>.

The repository currently includes a compiled bridge runtime. Rebuilding checks
out the pinned official CircuitJS1 source, applies the GPL source overlay under
`vendor/circuitjs1`, and recompiles the web simulator. A JDK 17-21, Git, Node.js,
and network access are required for a fresh bridge build.

## What the agent can do

empeirik registers 38 WebMCP tools:

- 9 session/workspace tools for Diagnose and Build workflows.
- 20 native CircuitJS1 editor tools.
- 9 guarded tools for the bundled hardware-diagnosis example.

The native bridge exposes all 144 component types in the pinned CircuitJS1
build, every generic element property, element placement/removal/movement and
wire splitting, selection, switches and configurable sliders, menu commands,
options, global properties, simulation controls, canvas pan/zoom, scopes,
reset, and undo/redo.

For larger builds, `apply_circuit_actions` accepts up to 100 actions in one
call. New elements can be named with temporary references and used by later
actions in the same batch. The adapter snapshots the complete circuit and run
state first, and restores both if any action fails.

See [docs/agent-bridge.md](docs/agent-bridge.md) for the exact manual-to-agent
mapping and examples.

## Test

```bash
npm test
npm run check
```

The checks cover the diagnosis state machine, stale revision protection,
native-editor action routing, aliases, atomic rollback, WebMCP registration,
source-overlay invariants, and licensing.

## Browser-owned limits

File-picker dialogs, clipboard writes, downloads, printing, and fullscreen may
require a real user gesture because the browser owns those permissions. The
useful data operations have direct alternatives: `load_circuit`,
`inspect_circuit`, `CircuitJS1.exportCircuit()`, and
`CircuitJS1.getCircuitAsSVG()`.

empeirik and its CircuitJS1 modifications are GPL-2.0-or-later. See
[UPSTREAM.md](UPSTREAM.md) for attribution and the pinned upstream revision.
