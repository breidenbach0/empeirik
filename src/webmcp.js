/*
 * WebMCP surface.
 *
 * Defines empeirik's circuit-workspace and scenario-diagnostic tools and
 * registers them through
 * document.modelContext.registerTool (the WebMCP imperative API) when the
 * browser supports it. When it does not, the same handlers stay available on
 * window.Empeirik.tools so the workflow is testable in any browser.
 *
 * Tool handlers are the only path agent actions take into the engine, keeping
 * the visible circuit and work log aligned with WebMCP actions.
 *
 * This module splits cleanly into data (TOOL_DEFINITIONS, loadable without
 * a DOM, used by scripts/check-project.mjs) and a controller created per
 * page load.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.webmcp = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var REVISION_HINT =
    "Include basedOnRevision with the revision you last read; actions " +
    "based on a stale revision are rejected.";

  var WORKSPACE_REVISION_HINT =
    "Include basedOnRevision from get_workspace when changing the workspace; " +
    "stale actions are rejected.";

  var WORKSPACE_TOOL_DEFINITIONS = [
    {
      name: "get_workspace",
      title: "Read circuit workspace",
      description:
        "Read the active circuit session, CircuitJS1 connection, " +
        "circuit summary, measurements, saved versions, and visible work log. " +
        "Use this first.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "start_session",
      title: "Start circuit session",
      description:
        "Start a circuit session using the user's goal. The same workspace " +
        "supports building, inspection, simulation, and diagnosis. " +
        "Optionally load a complete CircuitJS export supplied by the user. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          goal: { type: "string", description: "What should be built, inspected, or diagnosed" },
          title: { type: "string" },
          circuitName: { type: "string" },
          circuitText: { type: "string", description: "Optional complete CircuitJS legacy '$' or XML '<cir>' export" },
          basedOnRevision: { type: "integer" }
        },
        required: ["goal"]
      }
    },
    {
      name: "inspect_circuit",
      title: "Inspect CircuitJS1 circuit",
      description:
        "Read the current CircuitJS export and a plain list of live elements, " +
        "including labels and available electrical values. Use this before " +
        "reasoning about or editing the circuit. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: { basedOnRevision: { type: "integer" } }
      }
    },
    {
      name: "load_circuit",
      title: "Load circuit in CircuitJS1",
      description:
        "Load a complete CircuitJS export into the visible simulator. The current circuit is saved " +
        "as a restorable version by default. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          circuitText: { type: "string", description: "Complete CircuitJS legacy '$' or XML '<cir>' export" },
          circuitName: { type: "string" },
          summary: { type: "string", description: "What was created or changed" },
          preserveCurrent: { type: "boolean", default: true },
          basedOnRevision: { type: "integer" }
        },
        required: ["circuitText", "summary"]
      }
    },
    {
      name: "restore_circuit_version",
      title: "Restore circuit version",
      description:
        "Restore a circuit version listed by get_workspace. The circuit being " +
        "replaced is saved first, so this is reversible. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          versionId: { type: "string", description: "Saved version id, for example v1" },
          basedOnRevision: { type: "integer" }
        },
        required: ["versionId"]
      }
    },
    {
      name: "measure_node",
      title: "Measure labeled node",
      description:
        "Use the CircuitJS1 bridge to read the voltage of a labeled node in " +
        "the active simulation. This is the fast simulation shortcut; use " +
        "request_measurement instead for a real human-performed board check. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          node: { type: "string", description: "Exact CircuitJS labeled-node name" },
          reason: { type: "string", description: "Why this reading matters" },
          basedOnRevision: { type: "integer" }
        },
        required: ["node", "reason"]
      }
    },
    {
      name: "set_simulation_running",
      title: "Start or pause simulation",
      description:
        "Start or pause the active CircuitJS1 simulation and record why. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          running: { type: "boolean" },
          reason: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["running"]
      }
    },
    {
      name: "record_note",
      title: "Record session note",
      description:
        "Put a concrete finding, decision, question, or next step in the visible " +
        "session feed. Use this to explain reasoning without creating a separate " +
        "abstract state screen. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          kind: { type: "string", enum: ["finding", "decision", "question", "next-step"] },
          title: { type: "string" },
          detail: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["kind", "title", "detail"]
      }
    },
    {
      name: "finish_session",
      title: "Finish circuit session",
      description:
        "Finish or pause the current session with a concrete result and a clear " +
        "simulation-versus-hardware boundary. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          outcome: { type: "string", enum: ["resolved", "needs-hardware-test", "blocked"] },
          summary: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["outcome", "summary"]
      }
    }
  ];

  var EDITOR_TOOL_DEFINITIONS = [
    {
      name: "get_circuit_capabilities",
      title: "Discover CircuitJS1 controls",
      description:
        "Read the native editor bridge version, every CircuitJS1 element type " +
        "available in this build, menu command groups, option names, UI controls, " +
        "scope properties, and browser-gesture limitations. Use this before an " +
        "unfamiliar edit.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: { type: "object", properties: {} }
    },
    {
      name: "get_circuit_editor_state",
      title: "Read complete CircuitJS1 editor state",
      description:
        "Read the live native CircuitJS1 editor state: every element with position, " +
        "properties and controls; global properties; options; view; scopes; run " +
        "state; and undo/redo availability. Set includeCircuitText only when the raw " +
        "CircuitJS export is needed.",
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: { includeCircuitText: { type: "boolean", default: false } }
      }
    },
    {
      name: "add_circuit_element",
      title: "Place CircuitJS1 element",
      description:
        "Place any element type returned by get_circuit_capabilities directly on " +
        "the CircuitJS1 grid. Returns the element index and its editable fields. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          type: { type: "string", description: "CircuitJS class name or displayed element label" },
          x1: { type: "integer" }, y1: { type: "integer" },
          x2: { type: "integer" }, y2: { type: "integer" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["type", "x1", "y1", "x2", "y2", "summary"]
      }
    },
    {
      name: "edit_circuit_element",
      title: "Edit CircuitJS1 element property",
      description:
        "Set any generic CircuitJS1 element Edit dialog field by fieldIndex. Read " +
        "the element's editFields first; numeric values use SI units, choices accept " +
        "an index or label, booleans accept true/false, and action fields accept " +
        "'press'. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          elementIndex: { type: "integer", minimum: 0 },
          fieldIndex: { type: "integer", minimum: 0 },
          value: { description: "Number, boolean, string, choice index/label, or 'press'" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["elementIndex", "fieldIndex", "value", "summary"]
      }
    },
    {
      name: "move_circuit_element",
      title: "Move CircuitJS1 element",
      description:
        "Set both endpoints of an existing CircuitJS1 element; coordinates snap to " +
        "the active grid. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          elementIndex: { type: "integer", minimum: 0 },
          x1: { type: "integer" }, y1: { type: "integer" },
          x2: { type: "integer" }, y2: { type: "integer" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["elementIndex", "x1", "y1", "x2", "y2", "summary"]
      }
    },
    {
      name: "remove_circuit_elements",
      title: "Remove CircuitJS1 elements",
      description:
        "Remove one or more live CircuitJS1 elements by index. The native CircuitJS1 " +
        "undo stack can restore the edit. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          elementIndices: { type: "array", minItems: 1, items: { type: "integer", minimum: 0 } },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["elementIndices", "summary"]
      }
    },
    {
      name: "split_circuit_wire",
      title: "Split CircuitJS1 wire",
      description:
        "Split a WireElm or RoutedWireElm at a chosen circuit-grid point, exactly " +
        "like the wire context-menu action but without depending on mouse position. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          elementIndex: { type: "integer", minimum: 0 }, x: { type: "integer" }, y: { type: "integer" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["elementIndex", "x", "y", "summary"]
      }
    },
    {
      name: "select_circuit_elements",
      title: "Select CircuitJS1 elements",
      description:
        "Replace, add, remove, or toggle the current CircuitJS1 selection. This lets " +
        "the next rotate, mirror, cut, copy, or duplicate command operate on exactly " +
        "the intended elements. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          elementIndices: { type: "array", items: { type: "integer", minimum: 0 } },
          mode: { type: "string", enum: ["replace", "add", "remove", "toggle"], default: "replace" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["elementIndices", "summary"]
      }
    },
    {
      name: "set_circuit_element_control",
      title: "Operate CircuitJS1 switch or slider",
      description:
        "Set a live element control returned in the element's controls array, such " +
        "as switch-position, a built-in slider, or an adjustable property slider. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          elementIndex: { type: "integer", minimum: 0 }, controlId: { type: "string" },
          value: { type: "number" }, summary: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["elementIndex", "controlId", "value", "summary"]
      }
    },
    {
      name: "execute_circuit_command",
      title: "Execute CircuitJS1 menu command",
      description:
        "Execute a real CircuitJS1 command from the File, Edit, Scopes, element, " +
        "scope, Tools, zoom, or view command groups. Targeted commands accept an " +
        "elementIndex and/or scopeIndex plus plotIndex. Browser file pickers, " +
        "clipboard writes, downloads, printing, and fullscreen may require a user " +
        "gesture; use load_circuit or inspect APIs for non-dialog alternatives. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          menu: { type: "string" }, item: { type: "string" },
          elementIndex: { type: "integer", minimum: 0 },
          scopeIndex: { type: "integer", minimum: 0 }, plotIndex: { type: "integer", minimum: 0 },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["menu", "item", "summary"]
      }
    },
    {
      name: "configure_circuit_adjustable",
      title: "Configure CircuitJS1 adjustable slider",
      description:
        "Create, update, or remove the adjustable property sliders available from " +
        "an element's Add Sliders dialog. For create, provide elementIndex, " +
        "fieldIndex, min, and max. For update/remove, provide adjustableIndex from " +
        "the element controls. An update can share another primary slider with " +
        "sharedAdjustableIndex or detach with ownSlider. Step defaults to continuous (0); logarithmic ranges " +
        "require a positive minimum. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["create", "update", "remove"] },
          elementIndex: { type: "integer", minimum: 0 }, fieldIndex: { type: "integer", minimum: 0 },
          adjustableIndex: { type: "integer", minimum: 0 }, label: { type: "string" },
          min: { type: "number" }, max: { type: "number" }, step: { type: "number", minimum: 0, default: 0 },
          logarithmic: { type: "boolean", default: false },
          sharedAdjustableIndex: { type: "integer", minimum: 0 },
          ownSlider: { type: "boolean", default: false },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["action", "summary"]
      }
    },
    {
      name: "set_circuit_option",
      title: "Set CircuitJS1 option",
      description:
        "Set any boolean CircuitJS1 display/editor option listed by " +
        "get_circuit_capabilities, including current/voltage/power display, values, " +
        "grid, toolbar, crosshair, resistor/gate style, background, current direction, " +
        "editing lock, and mouse-wheel editing. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" }, value: { type: "boolean" }, summary: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["name", "value", "summary"]
      }
    },
    {
      name: "set_circuit_ui_control",
      title: "Set CircuitJS1 simulation control",
      description:
        "Set simulationSpeed, currentSpeed, or powerBrightness to the same raw " +
        "scrollbar value used by the CircuitJS1 UI. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string", enum: ["simulationSpeed", "currentSpeed", "powerBrightness"] },
          value: { type: "integer" }, summary: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["name", "value", "summary"]
      }
    },
    {
      name: "set_circuit_view",
      title: "Set CircuitJS1 pan and zoom",
      description:
        "Set CircuitJS1 canvas scale and translation directly. Scale must be between " +
        "0.2 and 2.5. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          scale: { type: "number", minimum: 0.2, maximum: 2.5 },
          translateX: { type: "number" }, translateY: { type: "number" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["scale", "translateX", "translateY", "summary"]
      }
    },
    {
      name: "set_circuit_scope_property",
      title: "Configure CircuitJS1 scope",
      description:
        "Set any native scope property listed by get_circuit_capabilities, including " +
        "label, speed, position, scale, plot position, divisions, trigger, persistence, " +
        "AC coupling, traces, spectrum, transistor traces, and XY plots. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          scopeIndex: { type: "integer", minimum: 0 }, property: { type: "string" },
          value: { description: "Property value; booleans, numbers, and strings are accepted" },
          plotIndex: { type: "integer", minimum: 0 }, summary: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["scopeIndex", "property", "value", "summary"]
      }
    },
    {
      name: "set_global_circuit_property",
      title: "Edit global CircuitJS1 property",
      description:
        "Set any field from globalEditFields in get_circuit_editor_state, equivalent " +
        "to CircuitJS1's Other Options dialog. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          fieldIndex: { type: "integer", minimum: 0 }, value: { description: "Field value" },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["fieldIndex", "value", "summary"]
      }
    },
    {
      name: "apply_circuit_actions",
      title: "Apply atomic CircuitJS1 action batch",
      description:
        "Apply up to 100 native CircuitJS1 actions as one WebMCP operation. This is " +
        "the fastest way to build or revise a circuit. Supported op values are add, " +
        "move, split-wire, edit, global-edit, element-control, create-adjustable, " +
        "update-adjustable, remove-adjustable, remove, select, command, option, " +
        "ui-control, view, scope, reset-simulation, and run. Add and split-wire actions may assign " +
        "a ref; later actions in the same batch may use elementRef, targetRef, or " +
        "elementRefs. If any action fails, the exact pre-batch circuit and run state " +
        "are restored. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          actions: {
            type: "array", minItems: 1, maxItems: 100,
            items: {
              type: "object",
              properties: {
                op: { type: "string", enum: ["add", "move", "split-wire", "edit", "global-edit", "element-control", "create-adjustable", "update-adjustable", "remove-adjustable", "remove", "select", "command", "option", "ui-control", "view", "scope", "reset-simulation", "run"] },
                ref: { type: "string" }, elementRef: { type: "string" }, targetRef: { type: "string" },
                elementRefs: { type: "array", items: { type: "string" } },
                elementIndex: { type: "integer", minimum: 0 }, targetIndex: { type: "integer", minimum: 0 },
                elementIndices: { type: "array", items: { type: "integer", minimum: 0 } },
                type: { type: "string" }, x1: { type: "integer" }, y1: { type: "integer" },
                x2: { type: "integer" }, y2: { type: "integer" },
                x: { type: "integer" }, y: { type: "integer" },
                fieldIndex: { type: "integer", minimum: 0 }, value: {}, controlId: { type: "string" },
                adjustableIndex: { type: "integer", minimum: 0 }, label: { type: "string" },
                min: { type: "number" }, max: { type: "number" }, step: { type: "number", minimum: 0 },
                logarithmic: { type: "boolean" }, sharedAdjustableIndex: { type: "integer", minimum: 0 },
                ownSlider: { type: "boolean" },
                mode: { type: "string" }, menu: { type: "string" }, item: { type: "string" },
                name: { type: "string" }, scopeIndex: { type: "integer", minimum: 0 },
                plotIndex: { type: "integer", minimum: 0 }, property: { type: "string" },
                scale: { type: "number" }, translateX: { type: "number" }, translateY: { type: "number" },
                running: { type: "boolean" }
              },
              required: ["op"]
            }
          },
          summary: { type: "string" }, basedOnRevision: { type: "integer" }
        },
        required: ["actions", "summary"]
      }
    },
    {
      name: "undo_circuit_edit",
      title: "Undo CircuitJS1 edit",
      description: "Execute CircuitJS1's native Undo command. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: { reason: { type: "string" }, basedOnRevision: { type: "integer" } }
      }
    },
    {
      name: "redo_circuit_edit",
      title: "Redo CircuitJS1 edit",
      description: "Execute CircuitJS1's native Redo command. " + WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: { reason: { type: "string" }, basedOnRevision: { type: "integer" } }
      }
    },
    {
      name: "reset_circuit_simulation",
      title: "Reset CircuitJS1 simulation",
      description:
        "Reset simulation time and transient state without replacing the circuit. " +
        WORKSPACE_REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: { reason: { type: "string" }, basedOnRevision: { type: "integer" } }
      }
    }
  ];

  var DIAGNOSTIC_TOOL_DEFINITIONS = [
    {
      name: "get_diagnostic_state",
      title: "Read example diagnosis",
      description:
        "Bundled environmental-controller example only. Read its revision, phase, " +
        "measurements (readings appear only after the human performs them), " +
        "hypotheses, staged repair, verification, pending human tasks, and " +
        "audit timeline. Use get_workspace first for every session. " + REVISION_HINT,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          basedOnRevision: { type: "integer", description: "Revision you last read (optional sanity check)" }
        }
      }
    },
    {
      name: "inspect_component",
      title: "Inspect example component",
      description:
        "Bundled environmental-controller example only. Inspect a board component: role, spec, expected behavior, visual " +
        "inspection notes, and any collected evidence touching it. Does not " +
        "reveal hidden faults. " + REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          componentId: { type: "string", description: "Designator or id, e.g. 'c7' or 'C7'" },
          basedOnRevision: { type: "integer" }
        },
        required: ["componentId"]
      }
    },
    {
      name: "trace_signal_path",
      title: "Trace example signal path",
      description:
        "Bundled environmental-controller example only. Trace a signal path on the board (currently '3v3' supply " +
        "distribution and 'reset' release path) step by step. " +
        REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          netId: { type: "string", enum: ["3v3", "reset"] },
          basedOnRevision: { type: "integer" }
        },
        required: ["netId"]
      }
    },
    {
      name: "request_measurement",
      title: "Request human measurement",
      description:
        "Bundled environmental-controller example only. Ask the human to perform a measurement at a test point. Creates a " +
        "visible human task and does NOT return the reading: only the human " +
        "can perform a measurement. Explain why the measurement matters in " +
        "the rationale. " + REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          testPointId: { type: "string", enum: ["tp-3v3", "tp-reset"] },
          measurementType: { type: "string", enum: ["dc_voltage"] },
          rationale: { type: "string", description: "Why this measurement matters now" },
          basedOnRevision: { type: "integer" }
        },
        required: ["testPointId"]
      }
    },
    {
      name: "propose_hypothesis",
      title: "Propose diagnostic hypothesis",
      description:
        "Bundled environmental-controller example only. Propose a cause hypothesis. Must cite at least one existing, " +
        "performed measurement ID and stays explicitly provisional. List " +
        "alternative explanations to keep the search honest. " +
        REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          statement: { type: "string" },
          evidence: { type: "array", items: { type: "string" }, description: "Measurement IDs, e.g. ['m1','m2']" },
          alternatives: {
            type: "array",
            description: "Alternative causes considered",
            items: { type: "object", properties: { label: { type: "string" } }, required: ["label"] }
          },
          basedOnRevision: { type: "integer" }
        },
        required: ["statement", "evidence"]
      }
    },
    {
      name: "update_hypothesis",
      title: "Update diagnostic hypothesis",
      description:
        "Bundled environmental-controller example only. Update your own hypothesis: mark it rejected, refine alternatives " +
        "(untested/excluded), or add notes. 'confirmed-in-simulation' can " +
        "only be set by a passing verification. " + REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          hypothesisId: { type: "string" },
          status: { type: "string", enum: ["provisional", "rejected", "confirmed-in-simulation"] },
          alternatives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                status: { type: "string", enum: ["untested", "excluded"] }
              },
              required: ["label"]
            }
          },
          note: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["hypothesisId"]
      }
    },
    {
      name: "stage_repair",
      title: "Stage example repair",
      description:
        "Bundled environmental-controller example only. Stage a repair on the original faulted branch. Requires a " +
        "rationale and at least two performed measurements as evidence. " +
        "Staging does not simulate anything and the faulted branch stays " +
        "preserved. " + REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          componentId: { type: "string" },
          action: { type: "string", enum: ["replace", "reflow", "clean", "rework"] },
          newPart: { type: "string" },
          rationale: { type: "string" },
          evidence: { type: "array", items: { type: "string" } },
          hypothesisId: { type: "string" },
          basedOnRevision: { type: "integer" }
        },
        required: ["componentId", "rationale", "evidence"]
      }
    },
    {
      name: "request_repair_simulation",
      title: "Request repair simulation",
      description:
        "Bundled environmental-controller example only. Ask the human for permission to simulate the staged repair on a " +
        "separate branch. Nothing is simulated until the human approves. " +
        REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          repairId: { type: "string" },
          basedOnRevision: { type: "integer" }
        }
      }
    },
    {
      name: "verify_device_behavior",
      title: "Verify example behavior",
      description:
        "Bundled environmental-controller example only. Verify the repaired branch against the explicit simulated-device " +
        "contract (supply rail, reset release level, boot timing). The " +
        "result is labelled simulation-only and never claims the physical " +
        "repair is proven. " + REVISION_HINT,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      inputSchema: {
        type: "object",
        properties: {
          basedOnRevision: { type: "integer" }
        }
      }
    }
  ];

  var TOOL_DEFINITIONS = WORKSPACE_TOOL_DEFINITIONS
    .concat(EDITOR_TOOL_DEFINITIONS)
    .concat(DIAGNOSTIC_TOOL_DEFINITIONS);

  function createWebMcpController(options) {
    options = options || {};
    var engine = options.engine;
    if (!engine) throw new Error("createWebMcpController requires an engine");
    var workspace = options.workspace;
    if (!workspace) throw new Error("createWebMcpController requires a workspace");
    var onLog = typeof options.onLog === "function" ? options.onLog : function () {};
    var registration = { registered: false, mode: "preview", count: 0 };

    function applyEditorActions(args, actions, title, kind, fallbackSummary) {
      args = args || {};
      return workspace.applyCircuitActions({
        actions: actions,
        summary: String(args.summary || args.reason || fallbackSummary || "CircuitJS1 editor changed."),
        basedOnRevision: args.basedOnRevision,
        activityTitle: title,
        activityKind: kind || "circuit-edited"
      }, { actor: "agent" });
    }

    var handlers = {
      get_workspace: function () {
        return workspace.getWorkspace().then(function (result) {
          result.pendingHumanActions = engine.getDiagnosticState().humanTasks.filter(function (task) {
            return task.status === "pending";
          });
          return result;
        });
      },
      start_session: function (args) {
        return workspace.startSession(args, { actor: "agent" });
      },
      inspect_circuit: function (args) {
        return workspace.inspectCircuit(args, { actor: "agent" });
      },
      load_circuit: function (args) {
        return workspace.loadCircuit(args, { actor: "agent" });
      },
      restore_circuit_version: function (args) {
        return workspace.restoreVersion(args, { actor: "agent" });
      },
      measure_node: function (args) {
        return workspace.measureNode(args, { actor: "agent" });
      },
      set_simulation_running: function (args) {
        return workspace.setSimulationRunning(args, { actor: "agent" });
      },
      record_note: function (args) {
        return workspace.recordNote(args, { actor: "agent" });
      },
      finish_session: function (args) {
        return workspace.finishSession(args, { actor: "agent" });
      },
      get_circuit_capabilities: function () {
        return workspace.getCircuitCapabilities();
      },
      get_circuit_editor_state: function (args) {
        return workspace.getCircuitEditorState(args);
      },
      add_circuit_element: function (args) {
        return applyEditorActions(args, [{
          op: "add", type: args.type,
          x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2
        }], "Element placed in CircuitJS1", "circuit-element-added");
      },
      edit_circuit_element: function (args) {
        return applyEditorActions(args, [{
          op: "edit", elementIndex: args.elementIndex,
          fieldIndex: args.fieldIndex, value: args.value
        }], "Element property changed", "circuit-element-edited");
      },
      move_circuit_element: function (args) {
        return applyEditorActions(args, [{
          op: "move", elementIndex: args.elementIndex,
          x1: args.x1, y1: args.y1, x2: args.x2, y2: args.y2
        }], "Element moved in CircuitJS1", "circuit-element-moved");
      },
      remove_circuit_elements: function (args) {
        return applyEditorActions(args, [{
          op: "remove", elementIndices: args.elementIndices
        }], "Elements removed from CircuitJS1", "circuit-elements-removed");
      },
      split_circuit_wire: function (args) {
        return applyEditorActions(args, [{
          op: "split-wire", elementIndex: args.elementIndex, x: args.x, y: args.y
        }], "Wire split in CircuitJS1", "circuit-wire-split");
      },
      select_circuit_elements: function (args) {
        return applyEditorActions(args, [{
          op: "select", elementIndices: args.elementIndices, mode: args.mode
        }], "CircuitJS1 selection changed", "circuit-selection-changed");
      },
      set_circuit_element_control: function (args) {
        return applyEditorActions(args, [{
          op: "element-control", elementIndex: args.elementIndex,
          controlId: args.controlId, value: args.value
        }], "Element control changed", "circuit-control-changed");
      },
      execute_circuit_command: function (args) {
        return applyEditorActions(args, [{
          op: "command", menu: args.menu, item: args.item,
          targetIndex: args.elementIndex,
          scopeIndex: args.scopeIndex, plotIndex: args.plotIndex
        }], "CircuitJS1 command executed", "circuit-command");
      },
      configure_circuit_adjustable: function (args) {
        if (["create", "update", "remove"].indexOf(args.action) === -1) {
          var error = new Error("action must be create, update, or remove");
          error.code = "INVALID_ADJUSTABLE_ACTION";
          throw error;
        }
        var op = args.action === "create"
          ? "create-adjustable"
          : args.action === "update" ? "update-adjustable" : "remove-adjustable";
        return applyEditorActions(args, [{
          op: op,
          elementIndex: args.elementIndex,
          fieldIndex: args.fieldIndex,
          adjustableIndex: args.adjustableIndex,
          label: args.label,
          min: args.min,
          max: args.max,
          step: args.step,
          logarithmic: args.logarithmic,
          sharedAdjustableIndex: args.sharedAdjustableIndex,
          ownSlider: args.ownSlider
        }], "Adjustable slider changed", "circuit-adjustable-changed");
      },
      set_circuit_option: function (args) {
        return applyEditorActions(args, [{
          op: "option", name: args.name, value: args.value
        }], "CircuitJS1 option changed", "circuit-option-changed");
      },
      set_circuit_ui_control: function (args) {
        return applyEditorActions(args, [{
          op: "ui-control", name: args.name, value: args.value
        }], "Simulation control changed", "circuit-control-changed");
      },
      set_circuit_view: function (args) {
        return applyEditorActions(args, [{
          op: "view", scale: args.scale,
          translateX: args.translateX, translateY: args.translateY
        }], "CircuitJS1 view changed", "circuit-view-changed");
      },
      set_circuit_scope_property: function (args) {
        return applyEditorActions(args, [{
          op: "scope", scopeIndex: args.scopeIndex, property: args.property,
          value: args.value, plotIndex: args.plotIndex
        }], "Scope changed in CircuitJS1", "circuit-scope-changed");
      },
      set_global_circuit_property: function (args) {
        return applyEditorActions(args, [{
          op: "global-edit", fieldIndex: args.fieldIndex, value: args.value
        }], "Global CircuitJS1 property changed", "circuit-option-changed");
      },
      apply_circuit_actions: function (args) {
        return applyEditorActions(
          args, args.actions, "CircuitJS1 action batch applied", "circuit-batch-applied"
        );
      },
      undo_circuit_edit: function (args) {
        return applyEditorActions(
          args, [{ op: "command", menu: "edit", item: "undo" }],
          "CircuitJS1 edit undone", "circuit-undo", "Undid the previous CircuitJS1 edit."
        );
      },
      redo_circuit_edit: function (args) {
        return applyEditorActions(
          args, [{ op: "command", menu: "edit", item: "redo" }],
          "CircuitJS1 edit redone", "circuit-redo", "Redid the next CircuitJS1 edit."
        );
      },
      reset_circuit_simulation: function (args) {
        return applyEditorActions(
          args, [{ op: "reset-simulation" }],
          "CircuitJS1 simulation reset", "simulation-reset", "Reset simulation time and transient state."
        );
      },
      get_diagnostic_state: function () {
        return engine.getDiagnosticState();
      },
      inspect_component: function (args) {
        return engine.inspectComponent(args, { actor: "agent" });
      },
      trace_signal_path: function (args) {
        return engine.traceSignalPath(args, { actor: "agent" });
      },
      request_measurement: function (args) {
        return engine.requestMeasurement(args, { actor: "agent" });
      },
      propose_hypothesis: function (args) {
        return engine.proposeHypothesis(args, { actor: "agent" });
      },
      update_hypothesis: function (args) {
        return engine.updateHypothesis(args, { actor: "agent" });
      },
      stage_repair: function (args) {
        return engine.stageRepair(args, { actor: "agent" });
      },
      request_repair_simulation: function (args) {
        return engine.requestRepairSimulation(args, { actor: "agent" });
      },
      verify_device_behavior: function (args) {
        return engine.verifyDeviceBehavior(args, { actor: "agent" });
      }
    };

    function log(entry) {
      entry.at = new Date().toISOString();
      entry.revision = {
        workspace: workspace.state.revision,
        diagnostic: engine.state.revision
      };
      onLog(entry);
      return entry;
    }

    /*
     * The single funnel for tool execution. Demo steps, the console API,
     * and real WebMCP calls all pass through here, so the visible tool log
     * covers every agent action.
     */
    async function invoke(name, args, via) {
      var entry = { tool: name, args: args || {}, via: via || "webmcp", ok: null };
      if (!handlers[name]) {
        entry.ok = false;
        entry.error = { code: "UNKNOWN_TOOL", message: "Unknown tool '" + name + "'" };
        log(entry);
        return { ok: false, error: entry.error };
      }
      try {
        var result = await handlers[name](args || {});
        entry.ok = true;
        entry.result = result;
        log(entry);
        return { ok: true, result: result };
      } catch (err) {
        entry.ok = false;
        entry.error = {
          code: err.code || "ENGINE_ERROR",
          message: err.message || String(err)
        };
        if (typeof err.failedActionIndex === "number") {
          entry.error.failedActionIndex = err.failedActionIndex;
        }
        if (err.failedOperation) entry.error.failedOperation = err.failedOperation;
        log(entry);
        return { ok: false, error: entry.error };
      }
    }

    // Tools exposed for manual testing always return the raw payload or
    // throw, matching the README console examples.
    var tools = {};
    Object.keys(handlers).forEach(function (name) {
      tools[name] = async function (args) {
        var wrapped = await invoke(name, args, "console");
        if (!wrapped.ok) {
          var err = new Error(wrapped.error.message);
          Object.keys(wrapped.error).forEach(function (key) {
            err[key] = wrapped.error[key];
          });
          throw err;
        }
        return wrapped.result;
      };
    });

    async function register() {
      var ctx = root.document ? root.document.modelContext : null;
      if (!ctx || typeof ctx.registerTool !== "function") {
        registration.registered = false;
        registration.mode = "preview";
        registration.count = 0;
        return registration;
      }
      var registeredCount = 0;
      for (var i = 0; i < TOOL_DEFINITIONS.length; i++) {
        var def = TOOL_DEFINITIONS[i];
        var tool = {
          name: def.name,
          title: def.title,
          description: def.description,
          inputSchema: def.inputSchema,
          annotations: def.annotations,
          execute: function (args) {
            return invoke(this.name, args, "webmcp");
          }.bind({ name: def.name })
        };
        try {
          await ctx.registerTool(tool);
          registeredCount += 1;
        } catch (e) {
          registration.error = String(e && e.message ? e.message : e);
        }
      }
      registration.registered = registeredCount === TOOL_DEFINITIONS.length;
      registration.mode = registration.registered ? "registered" : "partial";
      registration.count = registeredCount;
      return registration;
    }

    return {
      toolDefinitions: TOOL_DEFINITIONS,
      toolNames: TOOL_DEFINITIONS.map(function (d) { return d.name; }),
      tools: tools,
      invoke: invoke,
      register: register,
      getRegistration: function () {
        return JSON.parse(JSON.stringify(registration));
      }
    };
  }

  return {
    WORKSPACE_TOOL_DEFINITIONS: WORKSPACE_TOOL_DEFINITIONS,
    EDITOR_TOOL_DEFINITIONS: EDITOR_TOOL_DEFINITIONS,
    DIAGNOSTIC_TOOL_DEFINITIONS: DIAGNOSTIC_TOOL_DEFINITIONS,
    TOOL_DEFINITIONS: TOOL_DEFINITIONS,
    createWebMcpController: createWebMcpController
  };
});
