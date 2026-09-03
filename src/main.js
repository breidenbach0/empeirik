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

  function applyCircuitJsTheme(iframe) {
    try {
      var frameDocument = iframe.contentDocument;
      if (!frameDocument || !frameDocument.head) return false;
      if (frameDocument.getElementById("empeirik-circuitjs-theme")) return true;
      var theme = frameDocument.createElement("link");
      theme.id = "empeirik-circuitjs-theme";
      theme.rel = "stylesheet";
      theme.href = new URL("src/circuitjs-theme.css", root.document.baseURI).href;
      theme.addEventListener("load", function () {
        iframe.dataset.themeReady = "true";
        delete iframe.dataset.themeError;
      });
      theme.addEventListener("error", function () {
        iframe.dataset.themeError = "true";
      });
      frameDocument.head.appendChild(theme);
      return true;
    } catch (error) {
      iframe.dataset.themeError = "true";
      return false;
    }
  }

  async function boot() {
    var runtimePresent = await probeRuntime();
    var adapter;

    if (runtimePresent) {
      var slot = document.getElementById("circuitjs-slot");
      slot.innerHTML = "";
      var iframe = document.createElement("iframe");
      iframe.id = "circuitjs-frame";
      iframe.title = "CircuitJS1 live circuit simulator";
      slot.appendChild(iframe);
      adapter = new M.circuitAdapter.CircuitJS1BridgeAdapter();
      iframe.addEventListener("load", function () {
        applyCircuitJsTheme(iframe);
      });
      var connection = adapter.connect(iframe);
      iframe.src = "circuitjs/circuitjs.html?startCircuit=blank.txt";
      await connection;
      applyCircuitJsTheme(iframe);
    } else {
      adapter = new M.circuitAdapter.CircuitTextAdapter();
    }

    var workspace = new M.workspace.WorkspaceSession({ adapter: adapter });
    var ui;

    function renderAll() {
      ui.render({
        workspace: workspace.getState()
      });
    }

    ui = M.ui.createUI({
      handlers: {
        approveRepair: function (taskId) {
          return workspace.resolveHumanTask(taskId, true, { actor: "human" });
        },
        declineRepair: function (taskId) {
          return workspace.resolveHumanTask(taskId, false, { actor: "human" });
        }
      }
    });

    var controller = M.webmcp.createWebMcpController({
      workspace: workspace,
      adapter: adapter
    });

    workspace.subscribe(renderAll);

    ui.init();
    renderAll();

    var registration = await controller.register();

    root.Empeirik = {
      workspace: workspace,
      adapter: adapter,
      controller: controller,
      tools: controller.tools,
      toolDefinitions: controller.toolDefinitions,
      registration: registration,
      resetSession: function () {
        return workspace.reset({ preserveCircuit: true });
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
