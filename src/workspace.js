/*
 * empeirik workspace session.
 *
 * This is the small, concrete layer shared by the page and WebMCP. It keeps
 * the user's goal and a chronological work log while CircuitJS1 remains the
 * source of truth for the circuit itself. It deliberately does not model a
 * second schematic or expose a separate "diagnostic state" UI.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.workspace = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  function WorkspaceError(code, message) {
    var err = new Error(message);
    err.code = code;
    err.isWorkspaceError = true;
    return err;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isCircuitDocument(value) {
    return /^(\$|<\?xml\b|<cir\b)/i.test(String(value || "").trim());
  }

  function initialState(scenario, mode, circuitName) {
    return {
      revision: 0,
      mode: mode || "diagnose",
      status: "ready",
      title: "New circuit session",
      goal: "",
      circuitName: circuitName || scenario.case.title,
      simulationRunning: true,
      measurements: [],
      versions: [],
      lastInspection: null,
      outcome: null,
      activity: [
        {
          revision: 0,
          actor: "system",
          kind: "workspace-ready",
          title: "CircuitJS1 workspace ready",
          detail: scenario.case.oneLine,
          at: new Date().toISOString()
        }
      ]
    };
  }

  function WorkspaceSession(options) {
    options = options || {};
    if (!options.adapter) throw new Error("WorkspaceSession requires a circuit adapter");
    if (!options.scenarioApi) throw new Error("WorkspaceSession requires the scenario module");
    this.adapter = options.adapter;
    this.scenarioApi = options.scenarioApi;
    this.scenario = options.scenarioApi.scenario;
    this.listeners = [];
    this.versionBodies = {};
    this.versionCounter = 0;
    this.measurementCounter = 0;
    this.state = initialState(this.scenario, "diagnose", this.scenario.case.title);
  }

  WorkspaceSession.prototype.getState = function () {
    return clone(this.state);
  };

  WorkspaceSession.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    return this.unsubscribe.bind(this, fn);
  };

  WorkspaceSession.prototype.unsubscribe = function (fn) {
    var index = this.listeners.indexOf(fn);
    if (index >= 0) this.listeners.splice(index, 1);
  };

  WorkspaceSession.prototype._emit = function (kind) {
    var snapshot = this.getState();
    for (var i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](snapshot, kind);
      } catch (e) {
        /* UI listeners never interrupt a tool action. */
      }
    }
  };

  WorkspaceSession.prototype._checkRevision = function (params) {
    if (!params || params.basedOnRevision === null ||
        typeof params.basedOnRevision === "undefined") return;
    if (params.basedOnRevision !== this.state.revision) {
      throw WorkspaceError(
        "STALE_REVISION",
        "Action was based on workspace revision " + params.basedOnRevision +
          " but the session is at revision " + this.state.revision +
          ". Read get_workspace and retry."
      );
    }
  };

  WorkspaceSession.prototype._bump = function () {
    this.state.revision += 1;
    return this.state.revision;
  };

  WorkspaceSession.prototype._record = function (actor, kind, title, detail) {
    this.state.activity.push({
      revision: this.state.revision,
      actor: actor || "agent",
      kind: kind,
      title: title,
      detail: detail || "",
      at: new Date().toISOString()
    });
  };

  WorkspaceSession.prototype._saveCurrentVersion = async function (label) {
    if (!this.adapter.exportCircuit) return null;
    var body = await this.adapter.exportCircuit();
    if (!body) return null;
    this.versionCounter += 1;
    var id = "v" + this.versionCounter;
    this.versionBodies[id] = body;
    this.state.versions.push({
      id: id,
      label: label || this.state.circuitName,
      savedAtRevision: this.state.revision,
      savedAt: new Date().toISOString()
    });
    if (this.state.versions.length > 8) {
      var removed = this.state.versions.shift();
      delete this.versionBodies[removed.id];
    }
    return id;
  };

  WorkspaceSession.prototype.reset = function (options) {
    options = options || {};
    var mode = options.mode || this.state.mode || "diagnose";
    var name = options.preserveCircuit
      ? this.state.circuitName
      : this.scenario.case.title;
    this.versionBodies = {};
    this.versionCounter = 0;
    this.measurementCounter = 0;
    this.state = initialState(this.scenario, mode, name);
    this._emit("workspace-reset");
    return this.getState();
  };

  WorkspaceSession.prototype.setMode = function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var mode = params.mode;
    if (mode !== "diagnose" && mode !== "build") {
      throw WorkspaceError("INVALID_MODE", "Mode must be 'diagnose' or 'build'.");
    }
    if (mode === this.state.mode) return this.getState();
    this.state.mode = mode;
    this._bump();
    this._record(
      (ctx && ctx.actor) || "human",
      "mode-changed",
      mode === "diagnose" ? "Switched to Diagnose" : "Switched to Build",
      mode === "diagnose"
        ? "Investigate the circuit currently open in CircuitJS1."
        : "Create and test a circuit directly in CircuitJS1."
    );
    this._emit("mode-changed");
    return this.getState();
  };

  WorkspaceSession.prototype.startSession = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var mode = params.mode || this.state.mode;
    if (mode !== "diagnose" && mode !== "build") {
      throw WorkspaceError("INVALID_MODE", "Mode must be 'diagnose' or 'build'.");
    }
    var goal = String(params.goal || "").trim();
    if (goal.length < 8) {
      throw WorkspaceError("GOAL_REQUIRED", "Describe what to diagnose or build.");
    }

    if (params.circuitText) {
      await this._saveCurrentVersion(this.state.circuitName);
      await this.adapter.importCircuit(String(params.circuitText));
    }

    this.state.mode = mode;
    this.state.status = "active";
    this.state.goal = goal;
    this.state.title = String(params.title || (mode === "diagnose"
      ? "Diagnose this circuit"
      : "Build this circuit"));
    if (params.circuitName) this.state.circuitName = String(params.circuitName);
    this.state.outcome = null;
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "session-started",
      mode === "diagnose" ? "Diagnosis started" : "Build started",
      goal
    );
    this._emit("session-started");
    return this.getState();
  };

  WorkspaceSession.prototype.getWorkspace = async function () {
    var circuit = this.adapter.getCircuitSnapshot
      ? await this.adapter.getCircuitSnapshot({ includeCircuitText: false })
      : { source: this.adapter.describe().mode };
    return {
      session: this.getState(),
      circuit: circuit,
      next:
        this.state.status === "ready"
          ? "Call start_session with mode 'diagnose' or 'build' and the user's goal."
          : "Inspect or change the CircuitJS1 circuit, then record concrete findings in the session."
    };
  };

  WorkspaceSession.prototype.inspectCircuit = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    if (!this.adapter.getCircuitSnapshot) {
      throw WorkspaceError("INSPECTION_UNAVAILABLE", "The active adapter cannot inspect circuits.");
    }
    var snapshot = await this.adapter.getCircuitSnapshot({ includeCircuitText: true });
    this.state.lastInspection = {
      elementCount: snapshot.elementCount,
      running: snapshot.running,
      source: snapshot.source,
      revision: this.state.revision + 1
    };
    this.state.simulationRunning = snapshot.running;
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "circuit-inspected",
      "Inspected " + this.state.circuitName,
      snapshot.elementCount + " elements · simulation " +
        (snapshot.running ? "running" : "paused") + " · " + snapshot.source
    );
    this._emit("circuit-inspected");
    snapshot.workspaceRevision = this.state.revision;
    return snapshot;
  };

  WorkspaceSession.prototype.getCircuitCapabilities = async function () {
    if (!this.adapter.getEditorCapabilities) {
      return {
        available: false,
        coverage: "circuit-text-only",
        reason: "The active simulator adapter has no native editor surface."
      };
    }
    return this.adapter.getEditorCapabilities();
  };

  WorkspaceSession.prototype.getCircuitEditorState = async function (params) {
    params = params || {};
    if (!this.adapter.getEditorState) {
      throw WorkspaceError(
        "EDITOR_BRIDGE_UNAVAILABLE",
        "The active simulator adapter cannot inspect CircuitJS1 editor state."
      );
    }
    var result = await this.adapter.getEditorState({
      includeCircuitText: params.includeCircuitText === true
    });
    result.workspaceRevision = this.state.revision;
    return result;
  };

  WorkspaceSession.prototype.applyCircuitActions = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    if (!this.adapter.applyEditorActions) {
      throw WorkspaceError(
        "EDITOR_BRIDGE_UNAVAILABLE",
        "The active simulator adapter cannot change CircuitJS1 through native editor actions."
      );
    }
    var actions = params.actions;
    if (!Array.isArray(actions) || actions.length === 0) {
      throw WorkspaceError("EDITOR_ACTIONS_REQUIRED", "Provide at least one CircuitJS1 editor action.");
    }
    var summary = String(params.summary || "").trim();
    if (summary.length < 4) {
      throw WorkspaceError("SUMMARY_REQUIRED", "Briefly describe what these circuit actions should do.");
    }
    var result = await this.adapter.applyEditorActions(actions, { includeCircuitText: false });
    if (result.state && typeof result.state.running === "boolean") {
      this.state.simulationRunning = result.state.running;
    }
    this.state.status = "active";
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      params.activityKind || "circuit-edited",
      String(params.activityTitle ||
        (actions.length === 1 ? "CircuitJS1 action applied" : actions.length + " CircuitJS1 actions applied")),
      summary
    );
    this._emit("circuit-edited");
    result.workspaceRevision = this.state.revision;
    return result;
  };

  WorkspaceSession.prototype.loadCircuit = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var circuitText = String(params.circuitText || "").trim();
    if (!isCircuitDocument(circuitText)) {
      throw WorkspaceError(
        "INVALID_CIRCUIT",
        "circuitText must be a complete CircuitJS legacy '$' export or XML '<cir>' export."
      );
    }
    if (circuitText.length > 250000) {
      throw WorkspaceError("CIRCUIT_TOO_LARGE", "Circuit text exceeds the 250 kB workspace limit.");
    }
    var savedVersion = null;
    if (params.preserveCurrent !== false) {
      savedVersion = await this._saveCurrentVersion(this.state.circuitName);
    }
    await this.adapter.importCircuit(circuitText);
    this.state.simulationRunning = true;
    this.state.circuitName = String(params.circuitName || "Agent-generated circuit");
    this.state.status = "active";
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "circuit-loaded",
      "Loaded " + this.state.circuitName,
      String(params.summary || "Circuit replaced in CircuitJS1.") +
        (savedVersion ? " Previous circuit saved as " + savedVersion + "." : "")
    );
    this._emit("circuit-loaded");
    return {
      workspaceRevision: this.state.revision,
      circuitName: this.state.circuitName,
      savedVersion: savedVersion,
      source: this.adapter.describe().mode
    };
  };

  WorkspaceSession.prototype.restoreVersion = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var id = String(params.versionId || "");
    var body = this.versionBodies[id];
    var meta = null;
    for (var i = 0; i < this.state.versions.length; i++) {
      if (this.state.versions[i].id === id) meta = this.state.versions[i];
    }
    if (!body || !meta) {
      throw WorkspaceError("UNKNOWN_VERSION", "No saved circuit version '" + id + "'.");
    }
    await this._saveCurrentVersion(this.state.circuitName);
    await this.adapter.importCircuit(body);
    this.state.simulationRunning = true;
    this.state.circuitName = meta.label;
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "version-restored",
      "Restored " + id,
      "CircuitJS1 now shows " + meta.label + "."
    );
    this._emit("version-restored");
    return { workspaceRevision: this.state.revision, versionId: id, circuitName: meta.label };
  };

  WorkspaceSession.prototype.measureNode = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var node = String(params.node || "").trim();
    if (!node) throw WorkspaceError("NODE_REQUIRED", "Name the labeled CircuitJS node to measure.");
    if (!this.adapter.readCurrentNodeVoltage) {
      throw WorkspaceError("MEASUREMENT_UNAVAILABLE", "The active adapter cannot read labeled nodes.");
    }
    var reading = await this.adapter.readCurrentNodeVoltage(node);
    this.measurementCounter += 1;
    var measurement = {
      id: "wm" + this.measurementCounter,
      node: node,
      value: reading.value,
      unit: reading.unit || "V",
      source: reading.source,
      reason: String(params.reason || ""),
      at: new Date().toISOString()
    };
    this.state.measurements.push(measurement);
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "node-measured",
      node + " = " + Number(reading.value).toFixed(3) + " " + measurement.unit,
      measurement.reason || "Read directly from the active CircuitJS1 simulation."
    );
    this._emit("node-measured");
    measurement.workspaceRevision = this.state.revision;
    return clone(measurement);
  };

  WorkspaceSession.prototype.setSimulationRunning = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    if (typeof params.running !== "boolean") {
      throw WorkspaceError("RUNNING_REQUIRED", "running must be true or false.");
    }
    await this.adapter.setSimulationRunning(params.running);
    this.state.simulationRunning = params.running;
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "simulation-changed",
      params.running ? "Simulation started" : "Simulation paused",
      String(params.reason || "CircuitJS1 run state changed.")
    );
    this._emit("simulation-changed");
    return { workspaceRevision: this.state.revision, running: params.running };
  };

  WorkspaceSession.prototype.recordNote = function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var kind = params.kind || "finding";
    if (["finding", "decision", "question", "next-step"].indexOf(kind) === -1) {
      throw WorkspaceError("INVALID_NOTE_KIND", "Unknown note kind '" + kind + "'.");
    }
    var title = String(params.title || "").trim();
    var detail = String(params.detail || "").trim();
    if (!title || !detail) {
      throw WorkspaceError("NOTE_REQUIRED", "A note needs both title and detail.");
    }
    this._bump();
    this._record((ctx && ctx.actor) || "agent", kind, title, detail);
    this._emit("note-recorded");
    return { workspaceRevision: this.state.revision, kind: kind, title: title };
  };

  WorkspaceSession.prototype.finishSession = function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var summary = String(params.summary || "").trim();
    if (summary.length < 8) {
      throw WorkspaceError("SUMMARY_REQUIRED", "Finish the session with a concrete summary.");
    }
    var outcome = params.outcome || "resolved";
    if (["resolved", "needs-hardware-test", "blocked"].indexOf(outcome) === -1) {
      throw WorkspaceError("INVALID_OUTCOME", "Unknown session outcome '" + outcome + "'.");
    }
    this.state.status = outcome === "resolved" ? "complete" : "paused";
    this.state.outcome = outcome;
    this._bump();
    this._record(
      (ctx && ctx.actor) || "agent",
      "session-finished",
      outcome === "resolved" ? "Session complete" : "Session paused",
      summary
    );
    this._emit("session-finished");
    return { workspaceRevision: this.state.revision, status: this.state.status, outcome: outcome };
  };

  return {
    WorkspaceSession: WorkspaceSession,
    WorkspaceError: WorkspaceError,
    createWorkspace: function (options) { return new WorkspaceSession(options); }
  };
});
