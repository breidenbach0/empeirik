/*
 * empeirik entry point.
 *
 * The page has one work surface: CircuitJS1 on the left and a single
 * human/agent session feed on the right. The user's request determines what
 * happens; the workspace does not split building and diagnosis into modes.
 */
(function (root) {
  "use strict";

  var M = root.EmpeirikModules;

  function probeRuntime() {
    return fetch("circuitjs/circuitjs.html", { method: "HEAD" })
      .then(function (response) { return response.ok; })
      .catch(function () { return false; });
  }

  async function boot() {
    var scenarioApi = M.scenario;
    var runtimePresent = await probeRuntime();
    var adapter;

    if (runtimePresent) {
      var slot = document.getElementById("circuitjs-slot");
      slot.innerHTML = "";
      var iframe = document.createElement("iframe");
      iframe.id = "circuitjs-frame";
      iframe.title = "CircuitJS1 live circuit simulator";
      slot.appendChild(iframe);
      adapter = new M.circuitAdapter.CircuitJS1BridgeAdapter({ scenarioApi: scenarioApi });
      iframe.src = "circuitjs/circuitjs.html?lang=en";
      await adapter.connect(iframe);
    } else {
      adapter = new M.circuitAdapter.DeterministicPreviewAdapter({ scenarioApi: scenarioApi });
    }

    var engine = new M.diagnosticEngine.DiagnosticEngine({
      scenarioApi: scenarioApi,
      adapter: adapter,
      loadBranch: false
    });
    await adapter.loadBranch("faulted");

    var workspace = new M.workspace.WorkspaceSession({
      scenarioApi: scenarioApi,
      adapter: adapter
    });
    var ui;

    function renderAll() {
      ui.render({
        workspace: workspace.getState(),
        diagnostic: engine.getDiagnosticState()
      });
    }

    ui = M.ui.createUI({
      handlers: {
        newSession: function () {
          engine.reset({ loadBranch: false });
          workspace.reset({ preserveCircuit: true });
          renderAll();
        },
        importCircuit: async function (file) {
          var result = await workspace.loadCircuit({
            circuitText: file.circuitText,
            circuitName: file.circuitName || "Imported circuit",
            summary: "Imported from a local circuit file.",
            preserveCurrent: true,
            basedOnRevision: workspace.state.revision
          }, { actor: "human" });
          engine.reset({ loadBranch: false });
          return result;
        },
        getCircuitText: function () {
          return adapter.exportCircuit();
        },
        performMeasurement: function (taskId) {
          return engine.performMeasurement({ taskId: taskId }, { actor: "human" });
        },
        approveRepair: function (taskId) {
          return engine.approveRepairSimulation({ taskId: taskId }, { actor: "human" });
        },
        declineRepair: function (taskId) {
          return engine.declineRepairSimulation({ taskId: taskId }, { actor: "human" });
        }
      }
    });

    var controller = M.webmcp.createWebMcpController({
      engine: engine,
      workspace: workspace,
      adapter: adapter,
      onLog: function (entry) {
        ui.setLastCall(entry);
      }
    });

    engine.subscribe(renderAll);
    workspace.subscribe(renderAll);

    ui.init();
    renderAll();

    var registration = await controller.register();

    root.Empeirik = {
      engine: engine,
      workspace: workspace,
      adapter: adapter,
      controller: controller,
      tools: controller.tools,
      toolDefinitions: controller.toolDefinitions,
      registration: registration,
      resetSession: function () {
        engine.reset({ loadBranch: false });
        return workspace.reset({ preserveCircuit: true });
      },
      loadExample: async function () {
        engine.reset({ loadBranch: false });
        workspace.reset({ preserveCircuit: false });
        await adapter.loadBranch("faulted");
        return workspace.getState();
      }
    };
  }

  function start() {
    boot().catch(function (error) {
      console.error("[empeirik] failed to start:", error);
    });
  }

  if (root.document && root.document.readyState !== "loading") start();
  else root.addEventListener("DOMContentLoaded", start);
})(window);
