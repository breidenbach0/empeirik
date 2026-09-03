#!/usr/bin/env node
(function () {
  "use strict";

  var scenarioApi = require("../src/scenario.js");
  var adapterApi = require("../src/circuit-adapter.js");
  var workspaceApi = require("../src/workspace.js");
  var engineApi = require("../src/diagnostic-engine.js");
  var webmcpApi = require("../src/webmcp.js");

  var passed = 0;
  var failed = 0;

  function assert(condition, message) {
    if (!condition) throw new Error(message || "assertion failed");
  }

  function equal(actual, expected, message) {
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        (message || "values differ") + ": expected " + JSON.stringify(expected) +
          ", got " + JSON.stringify(actual)
      );
    }
  }

  async function test(name, fn) {
    try {
      await fn();
      passed += 1;
      console.log("  ok   " + name);
    } catch (error) {
      failed += 1;
      console.log("  FAIL " + name + " :: " + (error && error.message));
    }
  }

  function fakeSimulator() {
    var circuit = "$ 1 5e-6 10\nr 0 0 32 0 0 1000";
    var running = true;
    var calls = [];
    var elementCount = 1;
    var editor = {
      getCapabilities: function () {
        return { bridgeVersion: "1.0.0", elementTypes: [{ type: "ResistorElm", label: "Add Resistor" }] };
      },
      getState: function () {
        return {
          bridgeVersion: "1.0.0", circuit: circuit, running: running,
          elements: [], scopes: [], options: {}, canUndo: true, canRedo: false
        };
      },
      getGlobalEditInfo: function () { return [{ index: 0, name: "Time step", value: 5e-6 }]; },
      addElement: function (type, x1, y1, x2, y2) {
        calls.push(["add", type, x1, y1, x2, y2]);
        circuit += "\nr " + [x1, y1, x2, y2, 0, 1000].join(" ");
        return { index: elementCount++, type: type, editFields: [] };
      },
      moveElement: function () { calls.push(["move"].concat([].slice.call(arguments))); return {}; },
      splitWire: function (index, x, y) {
        calls.push(["split-wire", index, x, y]);
        circuit += "\nw " + [x, y, 64, 0, 0].join(" ");
        return { index: elementCount++, type: "WireElm", editFields: [] };
      },
      setElementEditValue: function () {
        calls.push(["edit"].concat([].slice.call(arguments)));
        if (arguments[2] === "explode") throw new Error("synthetic edit failure");
        circuit += " #edit";
        return {};
      },
      setGlobalEditValue: function () { calls.push(["global-edit"]); return []; },
      setElementControl: function () { calls.push(["element-control"]); return {}; },
      createAdjustable: function () {
        calls.push(["create-adjustable"].concat([].slice.call(arguments)));
        circuit += " #adjustable";
        return {};
      },
      updateAdjustable: function () {
        calls.push(["update-adjustable"].concat([].slice.call(arguments)));
        return {};
      },
      removeAdjustable: function () {
        calls.push(["remove-adjustable"].concat([].slice.call(arguments)));
        return {};
      },
      removeElements: function (indices) { calls.push(["remove", indices]); return indices.length; },
      selectElements: function (indices, mode) { calls.push(["select", indices, mode]); return indices.length; },
      invokeCommand: function () { calls.push(["command"].concat([].slice.call(arguments))); return {}; },
      setOption: function () { calls.push(["option"].concat([].slice.call(arguments))); return {}; },
      setControl: function () { calls.push(["ui-control"].concat([].slice.call(arguments))); return {}; },
      setView: function () { calls.push(["view"].concat([].slice.call(arguments))); return {}; },
      setScopeProperty: function () { calls.push(["scope"].concat([].slice.call(arguments))); return {}; },
      resetSimulation: function () { calls.push(["reset-simulation"]); return {}; }
    };
    return {
      editor: editor,
      calls: calls,
      exportCircuit: function () { return circuit; },
      importCircuit: function (value) { circuit = value; calls.push(["import", value]); },
      isRunning: function () { return running; },
      setSimRunning: function (value) { running = Boolean(value); calls.push(["run", running]); },
      getTime: function () { return 0; },
      getElements: function () { return []; },
      getNodeVoltage: function () { return 3.3; },
      circuit: function () { return circuit; }
    };
  }

  function liveAdapter() {
    var adapter = new adapterApi.CircuitJS1BridgeAdapter({ scenarioApi: scenarioApi });
    var sim = fakeSimulator();
    adapter.sim = sim;
    adapter.ready = true;
    return { adapter: adapter, sim: sim };
  }

  async function run() {
    console.log("empeirik editor-bridge tests\n");

    await test("capabilities report the complete native bridge catalog", async function () {
      var fixture = liveAdapter();
      var capabilities = await fixture.adapter.getEditorCapabilities();
      assert(capabilities.available, "bridge should be available");
      equal(capabilities.elementTypeCount, 1, "element count");
      var state = await fixture.adapter.getEditorState({ includeCircuitText: false });
      assert(!("circuit" in state), "raw circuit text is opt-in");
      equal(state.globalEditFields[0].name, "Time step", "global fields included");
    });

    await test("atomic batches resolve new-element aliases", async function () {
      var fixture = liveAdapter();
      var result = await fixture.adapter.applyEditorActions([
        { op: "add", ref: "load", type: "ResistorElm", x1: 0, y1: 0, x2: 64, y2: 0 },
        { op: "edit", elementRef: "load", fieldIndex: 0, value: 2200 },
        { op: "select", elementRefs: ["load"], mode: "replace" },
        { op: "option", name: "showValues", value: true }
      ], { includeCircuitText: false });
      equal(result.references.load, 1, "new element alias");
      equal(fixture.sim.calls[1].slice(0, 3), ["edit", 1, 0], "edit resolved alias");
      equal(fixture.sim.calls[2], ["select", [1], "replace"], "selection resolved alias");
      assert(result.changed, "batch changed circuit text");
    });

    await test("a failed batch restores the exact prior circuit and run state", async function () {
      var fixture = liveAdapter();
      var before = fixture.sim.circuit();
      fixture.sim.setSimRunning(false);
      var error = null;
      try {
        await fixture.adapter.applyEditorActions([
          { op: "add", ref: "r2", type: "ResistorElm", x1: 0, y1: 32, x2: 64, y2: 32 },
          { op: "edit", elementRef: "r2", fieldIndex: 0, value: "explode" }
        ]);
      } catch (caught) {
        error = caught;
      }
      assert(error, "batch must fail");
      equal(error.failedActionIndex, 1, "failure points to the second action");
      equal(fixture.sim.circuit(), before, "circuit was rolled back");
      equal(fixture.sim.isRunning(), false, "run state was rolled back");
    });

    await test("wire splitting and adjustable sliders use native actions and aliases", async function () {
      var fixture = liveAdapter();
      var result = await fixture.adapter.applyEditorActions([
        { op: "split-wire", elementIndex: 0, x: 32, y: 0, ref: "rightHalf" },
        {
          op: "create-adjustable", elementRef: "rightHalf", fieldIndex: 0,
          label: "Resistance", min: 100, max: 10000, step: 100, logarithmic: false
        },
        {
          op: "update-adjustable", adjustableIndex: 0,
          label: "Load", min: 200, max: 20000, step: 200,
          logarithmic: true, ownSlider: true
        },
        { op: "remove-adjustable", adjustableIndex: 0 }
      ], { includeCircuitText: false });
      equal(result.references.rightHalf, 1, "split wire alias");
      equal(fixture.sim.calls[0], ["split-wire", 0, 32, 0], "native split call");
      equal(fixture.sim.calls[1].slice(0, 4), ["create-adjustable", 1, 0, "Resistance"], "alias used by slider creation");
      equal(fixture.sim.calls[2][0], "update-adjustable", "native slider update call");
      equal(fixture.sim.calls[2].at(-1), -1, "own-slider detach sentinel");
      equal(fixture.sim.calls[3], ["remove-adjustable", 0], "native slider removal call");
      assert(result.changed, "bridge edits changed the circuit export");
    });

    await test("WebMCP editor tools share workspace revision and visible audit log", async function () {
      var fixture = liveAdapter();
      var workspace = new workspaceApi.WorkspaceSession({ scenarioApi: scenarioApi, adapter: fixture.adapter });
      var engine = new engineApi.DiagnosticEngine({
        scenarioApi: scenarioApi, adapter: fixture.adapter, loadBranch: false
      });
      var controller = webmcpApi.createWebMcpController({ engine: engine, workspace: workspace });
      var added = await controller.tools.add_circuit_element({
        type: "ResistorElm", x1: 0, y1: 0, x2: 64, y2: 0,
        summary: "Added the load resistor.", basedOnRevision: 0
      });
      equal(added.workspaceRevision, 1, "workspace revision after native edit");
      equal(workspace.state.activity[1].kind, "circuit-element-added", "activity type");
      var stale = null;
      try {
        await controller.tools.set_circuit_option({
          name: "showValues", value: true, summary: "Show values.", basedOnRevision: 0
        });
      } catch (caught) {
        stale = caught;
      }
      equal(stale && stale.code, "STALE_REVISION", "stale agent edit rejected");
      assert(controller.toolNames.indexOf("apply_circuit_actions") >= 0, "batch tool is registered");
    });

    console.log("\n" + passed + " passed, " + failed + " failed");
    if (failed) process.exit(1);
  }

  run().catch(function (error) {
    console.error(error);
    process.exit(1);
  });
})();
