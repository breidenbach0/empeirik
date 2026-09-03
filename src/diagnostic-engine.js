/*
 * empeirik diagnostic engine.
 *
 * A deterministic state machine that mediates every human and agent action.
 * The engine enforces the workflow constraints that make the diagnosis
 * auditable:
 *
 *   - request_measurement creates a visible human task and never returns a
 *     reading; only the human can perform the measurement.
 *   - a hypothesis must cite existing, performed measurement IDs.
 *   - a repair needs a rationale and at least two performed measurements.
 *   - a repair simulation needs explicit human approval.
 *   - the original faulted branch is always preserved.
 *   - verification is labelled simulation-only.
 *   - mutating actions accept basedOnRevision; stale actions are rejected
 *     without touching state.
 *
 * The engine is DOM-free so the Node test suite can drive it directly with a
 * preview adapter.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.diagnosticEngine = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var SCENARIO_API = root.EmpeirikModules
    ? root.EmpeirikModules.scenario
    : null;

  function DiagnosticError(code, message) {
    var err = new Error(message);
    err.code = code;
    err.isDiagnosticError = true;
    return err;
  }

  function initialState() {
    return {
      scenarioId: null,
      revision: 0,
      phase: "investigation", // investigation | repair | verified
      measurements: [],
      hypotheses: [],
      humanTasks: [],
      repair: null,
      verification: null,
      activeBranch: "faulted",
      branches: {
        faulted: { label: "Original faulted branch", available: true, preserved: true },
        repaired: { label: "Repair branch", available: false, preserved: false }
      },
      board: { powerLed: "on", mcuState: "inactive", statusOutput: "off" },
      timeline: [],
      counters: { measurement: 0, task: 0, hypothesis: 0, repair: 0 }
    };
  }

  function DiagnosticEngine(options) {
    options = options || {};
    var scenarioApi = options.scenarioApi || SCENARIO_API;
    if (!scenarioApi) {
      throw new Error("DiagnosticEngine requires the scenario module");
    }
    this.scenarioApi = scenarioApi;
    this.scenario = scenarioApi.scenario;
    this.adapter = options.adapter || null;
    this.listeners = [];
    this.state = null;
    this._bootstrap({ loadBranch: options.loadBranch !== false });
  }

  DiagnosticEngine.prototype._bootstrap = function (options) {
    options = options || {};
    this.state = initialState();
    this.state.scenarioId = this.scenario.case.id;
    this.state.board = this._previewBoard("faulted");
    this._record("system", "case-opened", "Example circuit opened", this.scenario.case.brief, 0);
    if (options.loadBranch !== false && this.adapter && this.adapter.loadBranch) {
      this.adapter.loadBranch("faulted");
    }
    this._emit("case-opened");
  };

  DiagnosticEngine.prototype._previewBoard = function (branch) {
    var p = this.scenario.preview[branch] || {};
    return {
      powerLed: (p.board && p.board.powerLed) || "off",
      mcuState: (p.board && p.board.mcuState) || "unknown",
      statusOutput: (p.board && p.board.statusOutput) || "unknown"
    };
  };

  DiagnosticEngine.prototype.reset = function (options) {
    this._bootstrap(options);
    return this.getDiagnosticState();
  };

  DiagnosticEngine.prototype.subscribe = function (fn) {
    this.listeners.push(fn);
    return this.unsubscribe.bind(this, fn);
  };

  DiagnosticEngine.prototype.unsubscribe = function (fn) {
    var i = this.listeners.indexOf(fn);
    if (i >= 0) this.listeners.splice(i, 1);
  };

  DiagnosticEngine.prototype._emit = function (kind) {
    for (var i = 0; i < this.listeners.length; i++) {
      try {
        this.listeners[i](this.getDiagnosticState(), kind);
      } catch (e) {
        /* listener errors never affect the engine */
      }
    }
  };

  DiagnosticEngine.prototype._record = function (actor, kind, title, detail, atRevision) {
    // Events are stamped with the revision that exists after the action.
    this.state.timeline.push({
      revision: typeof atRevision === "number" ? atRevision : this.state.revision,
      actor: actor,
      kind: kind,
      title: title,
      detail: detail || "",
      at: new Date().toISOString()
    });
  };

  DiagnosticEngine.prototype._checkRevision = function (params) {
    if (
      params &&
      typeof params.basedOnRevision !== "undefined" &&
      params.basedOnRevision !== null
    ) {
      if (params.basedOnRevision !== this.state.revision) {
        throw DiagnosticError(
          "STALE_REVISION",
          "Action was based on revision " + params.basedOnRevision +
            " but the case is at revision " + this.state.revision +
            ". Re-read the state and retry."
        );
      }
    }
  };

  DiagnosticEngine.prototype._nextId = function (kind) {
    this.state.counters[kind] += 1;
    var prefix = { measurement: "m", task: "t", hypothesis: "h", repair: "r" }[kind];
    return prefix + this.state.counters[kind];
  };

  DiagnosticEngine.prototype._bump = function () {
    this.state.revision += 1;
    return this.state.revision;
  };

  DiagnosticEngine.prototype._findMeasurement = function (id) {
    for (var i = 0; i < this.state.measurements.length; i++) {
      if (this.state.measurements[i].id === id) return this.state.measurements[i];
    }
    return null;
  };

  DiagnosticEngine.prototype._findTask = function (id) {
    for (var i = 0; i < this.state.humanTasks.length; i++) {
      if (this.state.humanTasks[i].id === id) return this.state.humanTasks[i];
    }
    return null;
  };

  DiagnosticEngine.prototype._requireHuman = function (ctx, action) {
    if (!ctx || ctx.actor !== "human") {
      throw DiagnosticError(
        "ACTOR_FORBIDDEN",
        "Only the human can " + action + ". The agent requests; the human executes."
      );
    }
  };

  DiagnosticEngine.prototype._collectEvidence = function (ids, min, what) {
    if (!Array.isArray(ids) || ids.length < min) {
      throw DiagnosticError(
        "INSUFFICIENT_EVIDENCE",
        what + " requires at least " + min + " measurement ID" +
          (min === 1 ? "" : "s") + "."
      );
    }
    var seen = {};
    var collected = [];
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (seen[id]) continue;
      seen[id] = true;
      var m = this._findMeasurement(id);
      if (!m) {
        throw DiagnosticError(
          "UNKNOWN_MEASUREMENT",
          "Cited measurement '" + id + "' does not exist."
        );
      }
      if (!m.performed) {
        throw DiagnosticError(
          "EVIDENCE_NOT_READY",
          "Cited measurement '" + id + "' has not been performed by the human yet."
        );
      }
      collected.push(m.id);
    }
    if (collected.length < min) {
      throw DiagnosticError(
        "INSUFFICIENT_EVIDENCE",
        what + " requires at least " + min + " distinct performed measurements."
      );
    }
    return collected;
  };

  /* ------------------------------------------------------------------ *
   * Reads
   * ------------------------------------------------------------------ */

  DiagnosticEngine.prototype.getDiagnosticState = function () {
    var s = this.state;
    // Deep enough copy for safe handoff to renderers and tools.
    return JSON.parse(JSON.stringify(s));
  };

  /* ------------------------------------------------------------------ *
   * Measurements
   * ------------------------------------------------------------------ */

  DiagnosticEngine.prototype.requestMeasurement = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var tp = this.scenarioApi.findTestPoint(params.testPointId);
    if (!tp) {
      throw DiagnosticError(
        "UNKNOWN_TEST_POINT",
        "Unknown test point '" + params.testPointId + "'."
      );
    }
    var type = params.measurementType || "dc_voltage";
    if (tp.measurementTypes.indexOf(type) === -1) {
      throw DiagnosticError(
        "UNSUPPORTED_MEASUREMENT",
        "Test point " + tp.label + " supports: " + tp.measurementTypes.join(", ") + "."
      );
    }
    for (var i = 0; i < this.state.humanTasks.length; i++) {
      var t = this.state.humanTasks[i];
      if (t.status === "pending" && t.type === "measurement" && t.testPointId === tp.id) {
        throw DiagnosticError(
          "MEASUREMENT_PENDING",
          "A measurement at " + tp.label + " is already waiting for the human (task " + t.id + ")."
        );
      }
    }
    var mId = this._nextId("measurement");
    var tId = this._nextId("task");
    this.state.measurements.push({
      id: mId,
      testPointId: tp.id,
      label: tp.label,
      node: tp.node,
      measurementType: type,
      rationale: params.rationale || "",
      performed: false,
      branchAtRequest: this.state.activeBranch,
      requestedRevision: this.state.revision + 1
    });
    this.state.humanTasks.push({
      id: tId,
      type: "measurement",
      measurementId: mId,
      testPointId: tp.id,
      status: "pending",
      instruction:
        "Probe " + tp.label + " (" + tp.name + ") with the DMM on the " +
        this.state.activeBranch + " branch and record the reading.",
      createdRevision: this.state.revision + 1
    });
    this._bump();
    this._record(
      "agent",
      "measurement-requested",
      tp.label + " " + type.replace("_", " ") + " requested",
      params.rationale || "No rationale supplied.",
      this.state.revision
    );
    this._emit("measurement-requested");
    return {
      measurementId: mId,
      taskId: tId,
      status: "pending-human-action",
      note:
        "Measurement requested. The human performs it; the reading is not " +
        "available to the agent until the human records it."
    };
  };

  DiagnosticEngine.prototype.performMeasurement = async function (params, ctx) {
    params = params || {};
    this._requireHuman(ctx, "perform a measurement");
    var task = this._findTask(params.taskId);
    if (!task || task.type !== "measurement") {
      throw DiagnosticError("UNKNOWN_TASK", "No measurement task '" + params.taskId + "'.");
    }
    if (task.status !== "pending") {
      throw DiagnosticError("TASK_ALREADY_DONE", "Task '" + task.id + "' is already resolved.");
    }
    var m = this._findMeasurement(task.measurementId);
    var tp = this.scenarioApi.findTestPoint(m.testPointId);
    var reading = await this.adapter.readNodeVoltage(tp.node, this.state.activeBranch);
    var within = reading.value >= tp.expected.min && reading.value <= tp.expected.max;
    m.performed = true;
    m.value = reading.value;
    m.unit = tp.expected.unit;
    m.expectedRange = { min: tp.expected.min, max: tp.expected.max, unit: tp.expected.unit };
    m.classification = within ? "nominal" : "deviation";
    m.source = reading.source;
    m.performedRevision = this.state.revision + 1;
    task.status = "done";
    task.resolvedRevision = this.state.revision + 1;
    this._bump();
    this._record(
      "human",
      "measurement-performed",
      tp.label + " measured: " + reading.value.toFixed(2) + " " + tp.expected.unit +
        " (" + (within ? "within range" : "outside range") + ")",
      "Expected " + tp.expected.min.toFixed(2) + "-" + tp.expected.max.toFixed(2) +
        " " + tp.expected.unit + ". Source: " + reading.source + ".",
      this.state.revision
    );
    this._emit("measurement-performed");
    return {
      measurementId: m.id,
      testPointId: tp.id,
      label: tp.label,
      value: m.value,
      unit: m.unit,
      expectedRange: m.expectedRange,
      classification: m.classification,
      source: m.source
    };
  };

  /* ------------------------------------------------------------------ *
   * Investigation reads that are recorded as agent actions
   * ------------------------------------------------------------------ */

  DiagnosticEngine.prototype.inspectComponent = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var c = this.scenarioApi.findComponent(params.componentId);
    if (!c) {
      throw DiagnosticError(
        "UNKNOWN_COMPONENT",
        "Unknown component '" + params.componentId + "'."
      );
    }
    var related = [];
    for (var i = 0; i < this.state.measurements.length; i++) {
      var m = this.state.measurements[i];
      if (m.performed && c.testPoints.indexOf(m.testPointId) !== -1) {
        related.push(m.id);
      }
    }
    this._bump();
    this._record(
      "agent",
      "component-inspected",
      c.label + " inspected (" + c.name + ")",
      c.inspection.reference,
      this.state.revision
    );
    this._emit("component-inspected");
    return {
      componentId: c.id,
      label: c.label,
      kind: c.kind,
      name: c.name,
      spec: c.spec,
      role: c.role,
      nets: c.nets,
      visualInspection: c.inspection.visual,
      referenceBehavior: c.inspection.reference,
      relatedEvidence: related
    };
  };

  DiagnosticEngine.prototype.traceSignalPath = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var net = this.scenarioApi.findNet(params.netId || params.signalId || "reset");
    if (!net || !net.path) {
      throw DiagnosticError(
        "UNKNOWN_NET",
        "No traceable signal path for net '" + (params.netId || params.signalId) + "'."
      );
    }
    this._bump();
    this._record(
      "agent",
      "path-traced",
      net.path.title + " traced",
      net.members.join(" -> "),
      this.state.revision
    );
    this._emit("path-traced");
    return {
      netId: net.id,
      label: net.label,
      name: net.name,
      members: net.members,
      steps: net.path.steps
    };
  };

  /* ------------------------------------------------------------------ *
   * Hypotheses
   * ------------------------------------------------------------------ */

  DiagnosticEngine.prototype.proposeHypothesis = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    if (!params.statement || String(params.statement).trim().length < 8) {
      throw DiagnosticError(
        "INVALID_STATEMENT",
        "A hypothesis needs a meaningful statement."
      );
    }
    var evidence = this._collectEvidence(params.evidence, 1, "A hypothesis");
    var alternatives = [];
    if (Array.isArray(params.alternatives)) {
      for (var i = 0; i < params.alternatives.length; i++) {
        var a = params.alternatives[i];
        alternatives.push({
          label: typeof a === "string" ? a : a.label,
          status: "untested"
        });
      }
    }
    var hId = this._nextId("hypothesis");
    this.state.hypotheses.push({
      id: hId,
      statement: params.statement,
      status: "provisional",
      evidence: evidence,
      alternatives: alternatives,
      note: params.note || "",
      proposedRevision: this.state.revision + 1
    });
    this._bump();
    this._record(
      "agent",
      "hypothesis-proposed",
      "Hypothesis " + hId + ": " + params.statement + " (status: provisional)",
      "Evidence: " + evidence.join(", ") + ". Alternatives considered: " +
        (alternatives.length
          ? alternatives.map(function (x) { return x.label; }).join("; ")
          : "none stated"),
      this.state.revision
    );
    this._emit("hypothesis-proposed");
    return { hypothesisId: hId, status: "provisional", evidence: evidence };
  };

  DiagnosticEngine.prototype.updateHypothesis = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var h = null;
    for (var i = 0; i < this.state.hypotheses.length; i++) {
      if (this.state.hypotheses[i].id === params.hypothesisId) {
        h = this.state.hypotheses[i];
        break;
      }
    }
    if (!h) {
      throw DiagnosticError(
        "UNKNOWN_HYPOTHESIS",
        "Unknown hypothesis '" + params.hypothesisId + "'."
      );
    }
    if (h.status === "rejected" && params.status && params.status !== "rejected") {
      throw DiagnosticError(
        "INVALID_STATUS_TRANSITION",
        "A rejected hypothesis cannot be revived; propose a new one."
      );
    }
    if (params.status === "confirmed-in-simulation") {
      var v = this.state.verification;
      if (!v || v.status !== "passed" || v.hypothesisId !== h.id) {
        throw DiagnosticError(
          "VERIFICATION_REQUIRED",
          "Only a passing simulation-contract verification can confirm a hypothesis."
        );
      }
    }
    if (params.status) {
      h.status = params.status;
    }
    if (Array.isArray(params.alternatives)) {
      h.alternatives = params.alternatives.map(function (a) {
        return {
          label: typeof a === "string" ? a : a.label,
          status: (a && a.status) || "untested"
        };
      });
    }
    if (typeof params.note === "string") {
      h.note = params.note;
    }
    this._bump();
    this._record(
      "agent",
      "hypothesis-updated",
      "Hypothesis " + h.id + " updated (status: " + h.status + ")",
      params.note || "",
      this.state.revision
    );
    this._emit("hypothesis-updated");
    return { hypothesisId: h.id, status: h.status };
  };

  /* ------------------------------------------------------------------ *
   * Repair branch
   * ------------------------------------------------------------------ */

  DiagnosticEngine.prototype.stageRepair = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    if (this.state.repair) {
      throw DiagnosticError(
        "REPAIR_ALREADY_STAGED",
        "A repair is already staged. Simulate or discard it first."
      );
    }
    if (this.state.activeBranch !== "faulted") {
      throw DiagnosticError(
        "WRONG_BRANCH",
        "Repairs are staged against the original faulted branch."
      );
    }
    var c = this.scenarioApi.findComponent(params.componentId);
    if (!c) {
      throw DiagnosticError(
        "UNKNOWN_COMPONENT",
        "Unknown component '" + params.componentId + "'."
      );
    }
    if (!params.rationale || String(params.rationale).trim().length < 8) {
      throw DiagnosticError(
        "RATIONALE_REQUIRED",
        "A repair requires an explicit rationale."
      );
    }
    var evidence = this._collectEvidence(params.evidence, 2, "A repair");
    var action = params.action || "replace";
    var repairModel = null;
    var models = this.scenario.repairModels || [];
    for (var modelIndex = 0; modelIndex < models.length; modelIndex++) {
      if (models[modelIndex].componentId === c.id && models[modelIndex].action === action) {
        repairModel = models[modelIndex];
        break;
      }
    }
    if (!repairModel) {
      throw DiagnosticError(
        "UNSUPPORTED_REPAIR_MODEL",
        "No simulated repair model exists for " + action + " " + c.label +
          ". Load an explicit edited circuit with load_circuit instead."
      );
    }
    var hId = params.hypothesisId || null;
    if (hId) {
      var hFound = this.state.hypotheses.some(function (h) { return h.id === hId; });
      if (!hFound) {
        throw DiagnosticError(
          "UNKNOWN_HYPOTHESIS",
          "Unknown hypothesis '" + hId + "'."
        );
      }
    }
    var rId = this._nextId("repair");
    this.state.repair = {
      id: rId,
      componentId: c.id,
      componentLabel: c.label,
      componentName: c.name,
      action: action,
      newPart: params.newPart || (action === "replace" ? "100 nF X7R 0603 16 V" : ""),
      rationale: params.rationale,
      evidence: evidence,
      hypothesisId: hId,
      simulationBranch: repairModel.branch,
      approvalStatus: "not-requested",
      simulation: null,
      stagedRevision: this.state.revision + 1,
      originalBranchPreserved: true
    };
    this._bump();
    this._record(
      "agent",
      "repair-staged",
      "Repair staged: " + action + " " + c.label +
        " (" + this.state.repair.newPart + ")",
      "Rationale: " + params.rationale + " Evidence: " + evidence.join(", "),
      this.state.revision
    );
    this._emit("repair-staged");
    return {
      repairId: rId,
      approvalStatus: "not-requested",
      note:
        "Staged only. Simulating the repaired branch requires explicit human " +
        "approval; the original faulted branch stays preserved."
    };
  };

  DiagnosticEngine.prototype.requestRepairSimulation = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var r = this.state.repair;
    if (!r) {
      throw DiagnosticError("REPAIR_NOT_STAGED", "Stage a repair before requesting a simulation.");
    }
    if (params.repairId && params.repairId !== r.id) {
      throw DiagnosticError(
        "REPAIR_MISMATCH",
        "Requested repair '" + params.repairId + "' does not match staged repair '" + r.id + "'."
      );
    }
    if (r.simulation) {
      throw DiagnosticError("REPAIR_ALREADY_SIMULATED", "This repair has already been simulated.");
    }
    if (r.approvalStatus === "pending") {
      throw DiagnosticError("APPROVAL_PENDING", "Human approval is already pending.");
    }
    var tId = this._nextId("task");
    this.state.humanTasks.push({
      id: tId,
      type: "repair-approval",
      repairId: r.id,
      status: "pending",
      instruction:
        "Approve simulating the repair branch (" + r.action + " " + r.componentLabel +
        "). The faulted branch is preserved either way.",
      createdRevision: this.state.revision + 1
    });
    r.approvalStatus = "pending";
    this._bump();
    this._record(
      "agent",
      "simulation-approval-requested",
      "Approval requested: simulate repair branch " + r.id,
      "The human decides whether the repaired branch may be simulated.",
      this.state.revision
    );
    this._emit("simulation-approval-requested");
    return { repairId: r.id, taskId: tId, status: "pending-human-approval" };
  };

  DiagnosticEngine.prototype.approveRepairSimulation = async function (params, ctx) {
    params = params || {};
    this._requireHuman(ctx, "approve a repair simulation");
    var task = this._findTask(params.taskId);
    if (!task || task.type !== "repair-approval") {
      throw DiagnosticError("UNKNOWN_TASK", "No repair-approval task '" + params.taskId + "'.");
    }
    if (task.status !== "pending") {
      throw DiagnosticError("TASK_ALREADY_DONE", "Task '" + task.id + "' is already resolved.");
    }
    var r = this.state.repair;
    if (!r || r.id !== task.repairId) {
      throw DiagnosticError("REPAIR_NOT_STAGED", "The staged repair no longer matches the task.");
    }
    if (r.simulation) {
      throw DiagnosticError("REPAIR_ALREADY_SIMULATED", "This repair has already been simulated.");
    }
    // Switch the active branch. The faulted branch is preserved by design.
    var simulationBranch = r.simulationBranch || "repaired";
    this.state.activeBranch = simulationBranch;
    this.state.branches[simulationBranch].available = true;
    this.state.branches.faulted.preserved = true;
    await this.adapter.loadBranch(simulationBranch);
    var readings = {};
    var nodes = ["3V3", "RESET"];
    for (var i = 0; i < nodes.length; i++) {
      var reading = await this.adapter.readNodeVoltage(nodes[i], simulationBranch);
      readings[nodes[i]] = {
        value: reading.value,
        unit: "V",
        source: reading.source
      };
    }
    var timing = await this.adapter.estimateResetRelease(simulationBranch);
    r.approvalStatus = "approved";
    r.simulation = {
      approvedBy: "human",
      approvedRevision: this.state.revision + 1,
      branch: simulationBranch,
      readings: readings,
      timing: timing
    };
    task.status = "done";
    task.resolvedRevision = this.state.revision + 1;
    this.state.board = this._previewBoard(simulationBranch);
    this.state.phase = "repair";
    this._bump();
    this._record(
      "human",
      "repair-simulated",
      "Repair branch approved and simulated (faulted branch preserved)",
      "RESET on the repaired branch: " + readings.RESET.value.toFixed(2) + " V. " +
        "Reset release at about " + timing.releaseTimeMs.toFixed(2) + " ms.",
      this.state.revision
    );
    this._emit("repair-simulated");
    return {
      repairId: r.id,
      branch: simulationBranch,
      readings: readings,
      timing: timing,
      faultedBranchPreserved: true
    };
  };

  DiagnosticEngine.prototype.declineRepairSimulation = async function (params, ctx) {
    params = params || {};
    this._requireHuman(ctx, "decline a repair simulation");
    var task = this._findTask(params.taskId);
    if (!task || task.type !== "repair-approval") {
      throw DiagnosticError("UNKNOWN_TASK", "No repair-approval task '" + params.taskId + "'.");
    }
    if (task.status !== "pending") {
      throw DiagnosticError("TASK_ALREADY_DONE", "Task '" + task.id + "' is already resolved.");
    }
    var r = this.state.repair;
    if (!r || r.id !== task.repairId) {
      throw DiagnosticError("REPAIR_NOT_STAGED", "The staged repair no longer matches the task.");
    }
    task.status = "declined";
    task.resolvedRevision = this.state.revision + 1;
    r.approvalStatus = "declined";
    this._bump();
    this._record(
      "human",
      "repair-simulation-declined",
      "Repair simulation declined",
      String(params.reason || "The original circuit remains active and unchanged."),
      this.state.revision
    );
    this._emit("repair-simulation-declined");
    return { repairId: r.id, status: "declined", activeBranch: this.state.activeBranch };
  };

  /* ------------------------------------------------------------------ *
   * Simulation-contract verification
   * ------------------------------------------------------------------ */

  DiagnosticEngine.prototype.verifyDeviceBehavior = async function (params, ctx) {
    params = params || {};
    this._checkRevision(params);
    var r = this.state.repair;
    if (!r || !r.simulation) {
      throw DiagnosticError(
        "REPAIR_NOT_SIMULATED",
        "Verify only after the human approves and the repaired branch is simulated."
      );
    }
    var contract = this.scenario.verificationContract;
    var tp3v3 = this.scenarioApi.findTestPoint("tp-3v3");
    var tpReset = this.scenarioApi.findTestPoint("tp-reset");
    var readings = {};
    var nodes = ["3V3", "RESET"];
    for (var i = 0; i < nodes.length; i++) {
      var reading = await this.adapter.readNodeVoltage(nodes[i], r.simulation.branch);
      readings[nodes[i]] = reading.value;
    }
    var timing = await this.adapter.estimateResetRelease(r.simulation.branch);

    function inRange(v, tp) {
      return v >= tp.expected.min && v <= tp.expected.max;
    }

    var checks = [
      {
        id: "supply-rail",
        label: contract.checks[0].label,
        passed: inRange(readings["3V3"], tp3v3),
        detail:
          "3V3 = " + readings["3V3"].toFixed(2) + " V; expected " +
          tp3v3.expected.min.toFixed(2) + "-" + tp3v3.expected.max.toFixed(2) + " V."
      },
      {
        id: "reset-released",
        label: contract.checks[1].label,
        passed: inRange(readings.RESET, tpReset),
        detail:
          "RESET = " + readings.RESET.toFixed(2) + " V; expected " +
          tpReset.expected.min.toFixed(2) + "-" + tpReset.expected.max.toFixed(2) + " V."
      },
      {
        id: "boot-timing",
        label: contract.checks[2].label,
        passed:
          timing.releaseTimeMs >= this.scenario.preview.timing.envelope.minMs &&
          timing.releaseTimeMs <= this.scenario.preview.timing.envelope.maxMs,
        detail:
          "RESET crosses " + this.scenario.preview.timing.thresholdV.toFixed(1) +
          " V at " + timing.releaseTimeMs.toFixed(2) + " ms; envelope " +
          this.scenario.preview.timing.envelope.minMs + "-" +
          this.scenario.preview.timing.envelope.maxMs + " ms."
      }
    ];
    var passed = checks.every(function (c) { return c.passed; });

    var hypothesisId = r.hypothesisId;
    if (!hypothesisId) {
      for (var h = 0; h < this.state.hypotheses.length; h++) {
        var hyp = this.state.hypotheses[h];
        if (hyp.status !== "provisional") continue;
        var overlaps = hyp.evidence.some(function (id) {
          return r.evidence.indexOf(id) !== -1;
        });
        if (overlaps && !hypothesisId) hypothesisId = hyp.id;
      }
    }

    this.state.verification = {
      status: passed ? "passed" : "failed",
      scope: contract.scope,
      note: contract.note,
      checks: checks,
      hypothesisId: hypothesisId || null,
      revision: this.state.revision + 1
    };

    if (passed && hypothesisId) {
      for (var k = 0; k < this.state.hypotheses.length; k++) {
        var hh = this.state.hypotheses[k];
        if (hh.id !== hypothesisId) continue;
        hh.status = "confirmed-in-simulation";
        for (var a = 0; a < hh.alternatives.length; a++) {
          if (hh.alternatives[a].status === "untested") {
            hh.alternatives[a].status = "excluded";
          }
        }
        if (!hh.note) {
          hh.note = "Alternatives excluded by the passing repair-branch simulation.";
        }
      }
    }

    if (passed) {
      this.state.phase = "verified";
    }
    this._bump();
    this._record(
      "agent",
      "verified-in-simulation",
      "Simulated-device contract verified (" +
        checks.filter(function (c) { return c.passed; }).length + "/" + checks.length +
        " checks passed)",
      passed
        ? "Scope: simulation-only. This does not prove a physical repair."
        : "Failing checks: " +
            checks.filter(function (c) { return !c.passed; })
              .map(function (c) { return c.id; }).join(", "),
      this.state.revision
    );
    this._emit("verified-in-simulation");
    return {
      verification: JSON.parse(JSON.stringify(this.state.verification)),
      disclaimer:
        "Verified in simulation only. empeirik does not claim the " +
        "physical repair is proven."
    };
  };

  return {
    DiagnosticEngine: DiagnosticEngine,
    DiagnosticError: DiagnosticError,
    createEngine: function (options) {
      return new DiagnosticEngine(options);
    }
  };
});
