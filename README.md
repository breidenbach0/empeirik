# empeirik

empeirik is a CircuitJS1-first workspace for building and diagnosing circuits
with a WebMCP-capable agent. The agent works on the same CircuitJS1 canvas as
the human; there is no duplicate schematic or hidden editor state.

You can start in either direction:

- Provide an existing circuit and describe the fault. The agent inspects it,
  requests or performs useful measurements, tests explanations, and proposes a
  repair.
- Describe what you want to build. The agent places and edits the components,
  runs the simulation, inspects the result, and iterates on the same canvas.

## Workspace rundown

### CircuitJS1 canvas

The canvas is the circuit source of truth. Manual edits and agent edits use the
same native CircuitJS1 element, property, menu, scope, simulation, and undo
systems, so both sides always see the same circuit.

### Work log

The Work log is the chronological audit trail for the session. It records who
inspected, changed, measured, approved, restored, or verified something and why.
It is not a second circuit model and it is not meant to be edited directly.

Circuit edits already use CircuitJS1 Undo/Redo, which the human can use from the
native toolbar and the agent can invoke through WebMCP. Before a whole circuit
is replaced, empeirik also saves the prior circuit as a restorable version.
Because later actions may depend on earlier ones, the Work log deliberately does
not put an ambiguous Restore button on every entry; ask the agent to undo the
last edit or restore a named circuit version instead.

### Investigation

Investigation collects what is currently being examined: circuit inspections,
signal-path traces, unresolved questions, and the next useful diagnostic step.
It answers, “What are we checking now, and why?”

### Evidence

Evidence contains concrete observations rather than guesses: simulated node
readings, human-performed hardware measurements, expected ranges, and recorded
findings. It answers, “What do we actually know?”

### Hypotheses

Hypotheses holds possible explanations for the observed behavior. Each
hypothesis is linked to evidence, has a current status, and keeps plausible
alternatives visible until the evidence rules them out.

### Repair bench

The Repair bench contains the proposed change, its rationale and supporting
evidence, the required human approval, and the result of the simulated repair.
Simulation verification is kept separate from any claim about physical
hardware.

Only one right-rail view is expanded at a time. They are focused views of the
same session activity, not separate workflows or modes.

## Agent coverage

empeirik registers 38 WebMCP tools:

- 9 session tools for goals, inspection, measurements, notes, circuit versions,
  simulation state, and completion.
- 20 native CircuitJS1 editor tools for components, properties, menus, view,
  scopes, controls, selection, undo, and redo.
- 9 guarded tools for the bundled hardware-diagnosis example.

The native bridge exposes the 144 component types in the pinned CircuitJS1
build. Larger edits can be applied as one atomic batch of up to 100 actions. If
one action fails, the bridge restores the exact circuit and run state from
before the batch. Workspace revisions reject stale agent actions.

## Background and theme

CircuitJS1's light-background option is themed to Empeirik cream and charcoal
and is the default for new visitors. The original black background remains
available through CircuitJS1's background setting. The agent can switch the
same option with `set_circuit_option` and `whiteBackground`; electrical signal
colors remain unchanged in both modes.

## Import and export

Humans use CircuitJS1's native File menu for import, export, printing, and
sharing. The outer workspace does not duplicate those controls. Agents use the
direct circuit load, inspection, text export, and SVG-rendering APIs without
opening browser dialogs.

Browser-owned file pickers, clipboard writes, downloads, printing, and
fullscreen may still require a human gesture.

## Run locally

The compiled CircuitJS1 bridge is included, so local startup only needs Node.js
18 or newer:

```bash
npm start
```

Open <http://localhost:4173/>.

To rebuild the native bridge from the pinned CircuitJS1 4.1.4 source:

```bash
npm run build:circuitjs-bridge
```

Rebuilding requires Git, network access, and JDK 17–21. It applies the GPL
source overlay under `vendor/circuitjs1` before compiling the browser runtime.

The tracked integrity check is:

```bash
npm run check
```

The deeper test harness is kept locally and ignored from the public repository.

## Live site

The public project is live at:

<https://breidenbach0.github.io/empeirik/>

The GitHub Pages workflow publishes the static application after every push to
`main`. The application and embedded CircuitJS1 runtime share one HTTPS origin,
so judges can use the URL in ChatGPT's in-app browser or a WebMCP-enabled Google
Chrome session.

## License and upstream

empeirik and its CircuitJS1 modifications are GPL-2.0-or-later. See
[UPSTREAM.md](UPSTREAM.md) for attribution and the pinned upstream revision.
