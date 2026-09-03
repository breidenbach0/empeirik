# Native CircuitJS1 agent bridge

## Architecture

```text
WebMCP tool
  -> workspace revision + work-log entry
    -> transactional JavaScript adapter
      -> CircuitJS1.editor native API
        -> the same CircuitJS1 Java objects used by its manual UI
```

The bridge is compiled into CircuitJS1. It does not synthesize mouse clicks or
draw a second canvas.

## Manual action mapping

| What a human does in CircuitJS1 | Native bridge operation | WebMCP tool |
| --- | --- | --- |
| Choose any item under Draw and drag it | `addElement` | `add_circuit_element` |
| Drag an element or its endpoints | `moveElement` | `move_circuit_element` |
| Split a wire from its context menu | `splitWire` | `split_circuit_wire` |
| Select one or many elements | `selectElements` | `select_circuit_elements` |
| Delete selected elements | `removeElements` | `remove_circuit_elements` |
| Open Edit and change any standard field | `setElementEditValue` | `edit_circuit_element` |
| Toggle a switch or move a slider | `setElementControl` | `set_circuit_element_control` |
| Add, edit, share, detach, or remove a property slider | `createAdjustable` / `updateAdjustable` / `removeAdjustable` | `configure_circuit_adjustable` |
| Run a File/Edit/Scopes/element/scope/Tools/zoom/view command | `invokeCommand` | `execute_circuit_command` |
| Toggle a display or editor option | `setOption` | `set_circuit_option` |
| Change speed/current/power sliders | `setControl` | `set_circuit_ui_control` |
| Pan or zoom the canvas | `setView` | `set_circuit_view` |
| Change Other Options | `setGlobalEditValue` | `set_global_circuit_property` |
| Configure scope traces, scale, FFT, XY, or trigger | `setScopeProperty` | `set_circuit_scope_property` |
| Undo or redo | native command manager | `undo_circuit_edit` / `redo_circuit_edit` |
| Reset transient state | `resetSimulation` | `reset_circuit_simulation` |
| Import or replace a full circuit | official `importCircuit` API | `load_circuit` |
| Inspect/export the circuit | native state + official export API | `get_circuit_editor_state` / `inspect_circuit` |

`get_circuit_capabilities` is generated from the running simulator. It returns
the exact element catalog and supported command/property names instead of
hard-coding a component list in empeirik.

## Atomic build example

```js
await window.Empeirik.tools.apply_circuit_actions({
  basedOnRevision: 0,
  summary: "Add and configure a 4.7 kOhm load.",
  actions: [
    {
      op: "add",
      ref: "load",
      type: "ResistorElm",
      x1: 256,
      y1: 160,
      x2: 336,
      y2: 160
    },
    {
      op: "edit",
      elementRef: "load",
      fieldIndex: 0,
      value: 4700
    },
    {
      op: "select",
      elementRefs: ["load"],
      mode: "replace"
    }
  ]
});
```

An `add` action may define `ref`. Later actions in the same batch can use
`elementRef`, `targetRef`, or `elementRefs`. The returned `references` object
contains the resulting numeric CircuitJS1 indices.

Before a batch starts, the adapter captures the complete CircuitJS export and
whether simulation is running. If action 37 of 50 fails, it imports that exact
snapshot, restores the run state, reports the failing action, does not advance
the workspace revision, and does not create a success entry in the work log.

## State and safety rules

- Read `get_workspace` before mutation and send its `basedOnRevision` value.
  Stale actions are rejected before CircuitJS1 changes.
- Element indices follow CircuitJS1's live order and can shift after removal.
  Batch references are safer when constructing a new circuit.
- Read `editFields` before setting a field. Numeric fields report
  `adjustable: true` when CircuitJS1 permits a property slider. The bridge uses
  CircuitJS1's own `getEditInfo`/`setEditValue` contract rather than maintaining
  a duplicate component schema.
- Numeric property values are SI values. Choice fields accept their numeric
  index or visible label; booleans accept true/false; action fields accept
  `"press"`.
- Simulation is evidence about the simulated model, not proof of physical
  hardware behavior.

## Permission boundary

The command manager can invoke every normal CircuitJS1 menu path. Browsers may
still block file dialogs, clipboard writes, downloads, print, or fullscreen
without a user gesture. Circuit import/export and SVG retrieval have direct
non-dialog APIs, so an agent can still create, inspect, preserve, and exchange
the actual circuit data.
