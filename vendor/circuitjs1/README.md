# empeirik CircuitJS1 source overlay

This directory contains the small source overlay used to build empeirik's
native CircuitJS1 editor bridge.

The build starts from `pfalstad/circuitjs1` commit
`c0b264e462fb8935c09b0e2a4dfa884debbde6b5` (CircuitJS1 4.1.4js), then replaces
`JSInterface.java`, adds `AgentBridge.java`, and applies
`empeirik-canvas-theme.patch`. The rest of CircuitJS1 remains upstream source.

`AgentBridge.java` deliberately calls the same Java objects used by the human
UI: the element factory, generic `Editable` fields, `CommandManager`, option
menu items, sliders, canvas transform, `ScopeManager`, and `UndoManager`. This
keeps agent edits and manual edits on one CircuitJS1 canvas and one source of
truth. Agent batches preserve one pre-edit snapshot, so a batch of up to 100
actions is reverted by one native Undo command and failed batches restore the
previous undo/redo history.

The canvas patch changes CircuitJS1's light-background mode to Empeirik cream
and charcoal, makes that mode the default for new visitors, and preserves the
native black-background option. It does not replace CircuitJS1's electrical
signal colors.

Build and install the runtime with:

```bash
npm run build:circuitjs-bridge
```

Browser-owned operations—file pickers, clipboard writes, downloads, print,
and fullscreen—may still require a user gesture. Circuit import/export and SVG
retrieval have direct non-dialog API equivalents.
