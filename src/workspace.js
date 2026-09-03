/*
 * empeirik workspace session.
 *
 * CircuitJS1 is the circuit source of truth. This module stores only the
 * human/agent trail around that circuit: goals, investigations, evidence,
 * hypotheses, repair proposals, approvals, and restorable circuit versions.
 * It contains no bundled case or pre-filled diagnostic answer.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.workspace = api;
})(typeof self !== "undefined" ? self : globalThis, function () {
  "use strict";

  function WorkspaceError(code, message) {
    var error = new Error(message);
    error.code = code;
    error.isWorkspaceError = true;
    return error;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isCircuitDocument(value) {
    return /^(\$|<\?xml\b|<cir\b)/i.test(String(value || "").trim());
  }

  function cleanText(value) {
    return String(value || "").trim();
  }

  function requireText(value, code, message, minimum) {
    var text = cleanText(value);
    if (text.length < (minimum || 1)) throw WorkspaceError(code, message);
    return text;
  }

  function initialState(circuitName) {
    return {
      revision: 0,
      status: "ready",
      title: "New circuit session",
      goal: "",
      circuitName: circuitName || "Untitled circuit",
      simulationRunning: true,
      measurements: [],
      versions: [],
      lastInspection: null,
      outcome: null,
      investigations: [],
      evidence: [],
      hypotheses: [],
      repairs: [],
      humanTasks: [],
      activity: []
    };
  }

  function WorkspaceSession(options) {
    options = options || {};
    if (!options.adapter) throw new Error("WorkspaceSession requires a circuit adapter");
    this.adapter = options.adapter;
    this.listeners = [];
    this.versionBodies = {};
    this.repairPlans = {};
    this.versionCounter = 0;
    this.measurementCounter = 0;
    this.investigationCounter = 0;
    this.evidenceCounter = 0;
    this.hypothesisCounter = 0;
    this.repairCounter = 0;
    this.taskCounter = 0;
    this.state = initialState(options.circuitName);
  }

  WorkspaceSession.prototype.getState = function () {
    return clone(this.state);
  };

  WorkspaceSession.prototype.subscribe = function (listener) {
    this.listeners.push(listener);
    return this.unsubscribe.bind(this, listener);
  };

  WorkspaceSession.prototype.unsubscribe = function (listener) {
    var index = this.listeners.indexOf(listener);
    if (index >= 0) this.listeners.splice(index, 1);
  };

  WorkspaceSession.prototype._emit = function (kind) {
    if (this.listeners.length === 0) return;
    var snapshot = this.getState();
    for (var i = 0; i < this.listeners.length; i++) {
      try { this.listeners[i](snapshot, kind); } catch (error) { /* UI listeners cannot interrupt actions. */ }
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

  WorkspaceSession.prototype._entry = function (id, params, actor) {
    return {
      id: id,
      title: cleanText(params.title),
      detail: cleanText(params.detail),
      actor: actor || "agent",
      revision: this.state.revision,
      at: new Date().toISOString()
    };
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

  WorkspaceSession.prototype._findById = function (collection, id) {
    for (var i = 0; i < collection.length; i++) {
      if (collection[i].id === id) return collection[i];
    }
    return null;
  };

  WorkspaceSession.prototype._requireEvidenceIds = function (ids, minimum) {
    var values = Array.isArray(ids) ? ids.map(String) : [];
    values = values.filter(function (value, index) {
      return value && values.indexOf(value) === index;
    });
    if (values.length < minimum) {
      throw WorkspaceError(
        "EVIDENCE_REQUIRED",
        "Provide at least " + minimum + " evidence " + (minimum === 1 ? "item" : "items") + "."
      );
    }
    for (var i = 0; i < values.length; i++) {
      if (!this._findById(this.state.evidence, values[i]) &&
          !this._findById(this.state.measurements, values[i])) {
        throw WorkspaceError("UNKNOWN_EVIDENCE", "No evidence item '" + values[i] + "'.");
      }
    }
    return values;
  };

  WorkspaceSession.prototype.reset = function (options) {
    options = options || {};
    var name = options.preserveCircuit ? this.state.circuitName : "Untitled circuit";
    this.versionBodies = {};
    this.repairPlans = {};
    this.versionCounter = 0;
    this.measurementCounter = 0;
    this.investigationCounter = 0;
    this.evidenceCounter = 0;
    this.hypothesisCounter = 0;
    this.repairCounter = 0;
    this.taskCounter = 0;
    this.state = initialState(name);
    this._emit("workspace-reset");
    return this.getState();
  };

  WorkspaceSession.prototype.startSession = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var goal = requireText(
      params.goal,
      "GOAL_REQUIRED",
      "Describe what you want to build, inspect, or diagnose.",
      8
    );
    if (typeof params.circuitText !== "undefined") {
      var circuitText = cleanText(params.circuitText);
      if (!isCircuitDocument(circuitText)) {
        throw WorkspaceError("INVALID_CIRCUIT", "circuitText must be a complete CircuitJS legacy '$' or XML '<cir>' export.");
      }
      if (circuitText.length > 250000) {
        throw WorkspaceError("CIRCUIT_TOO_LARGE", "Circuit text exceeds the 250 kB workspace limit.");
      }
      await this._saveCurrentVersion(this.state.circuitName);
      await this.adapter.importCircuit(circuitText);
    }
    this.state.status = "active";
    this.state.goal = goal;
    this.state.title = cleanText(params.title) || "Circuit session";
    if (params.circuitName) this.state.circuitName = cleanText(params.circuitName);
    this.state.outcome = null;
    this._bump();
    this._record((context && context.actor) || "agent", "session-started", "Session started", goal);
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
      next: this.state.status === "ready"
        ? "Call start_session with the user's goal."
        : "Inspect or change CircuitJS1, then record the evidence and reasoning that matter."
    };
  };

  WorkspaceSession.prototype.inspectCircuit = async function (params, context) {
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
      (context && context.actor) || "agent",
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
      return { available: false, coverage: "circuit-text-only", reason: "No native editor surface." };
    }
    return this.adapter.getEditorCapabilities();
  };

  WorkspaceSession.prototype.getCircuitEditorState = async function (params) {
    params = params || {};
    if (!this.adapter.getEditorState) {
      throw WorkspaceError("EDITOR_BRIDGE_UNAVAILABLE", "The active adapter cannot inspect editor state.");
    }
    var result = await this.adapter.getEditorState({ includeCircuitText: params.includeCircuitText === true });
    result.workspaceRevision = this.state.revision;
    return result;
  };

  WorkspaceSession.prototype.applyCircuitActions = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    if (!this.adapter.applyEditorActions) {
      throw WorkspaceError("EDITOR_BRIDGE_UNAVAILABLE", "The active adapter cannot change CircuitJS1.");
    }
    var actions = params.actions;
    if (!Array.isArray(actions) || actions.length === 0) {
      throw WorkspaceError("EDITOR_ACTIONS_REQUIRED", "Provide at least one CircuitJS1 editor action.");
    }
    var summary = requireText(
      params.summary,
      "SUMMARY_REQUIRED",
      "Briefly describe what these circuit actions should do.",
      4
    );
    var result = await this.adapter.applyEditorActions(actions, { includeCircuitText: false });
    if (result.state && typeof result.state.running === "boolean") {
      this.state.simulationRunning = result.state.running;
    }
    this.state.status = "active";
    this._bump();
    this._record(
      (context && context.actor) || "agent",
      params.activityKind || "circuit-edited",
      cleanText(params.activityTitle) ||
        (actions.length === 1 ? "CircuitJS1 action applied" : actions.length + " CircuitJS1 actions applied"),
      summary
    );
    this._emit("circuit-edited");
    result.workspaceRevision = this.state.revision;
    return result;
  };

  WorkspaceSession.prototype.loadCircuit = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var circuitText = cleanText(params.circuitText);
    if (!isCircuitDocument(circuitText)) {
      throw WorkspaceError("INVALID_CIRCUIT", "circuitText must be a complete CircuitJS legacy '$' or XML '<cir>' export.");
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
    this.state.circuitName = cleanText(params.circuitName) || "Agent-generated circuit";
    this.state.status = "active";
    this._bump();
    var detail = cleanText(params.summary) || "Circuit replaced in CircuitJS1.";
    if (savedVersion) detail += " Previous circuit saved as " + savedVersion + ".";
    this._record((context && context.actor) || "agent", "circuit-loaded", "Loaded " + this.state.circuitName, detail);
    this._emit("circuit-loaded");
    return {
      workspaceRevision: this.state.revision,
      circuitName: this.state.circuitName,
      savedVersion: savedVersion,
      source: this.adapter.describe().mode
    };
  };

  WorkspaceSession.prototype.restoreVersion = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var id = cleanText(params.versionId);
    var body = this.versionBodies[id];
    var meta = this._findById(this.state.versions, id);
    if (!body || !meta) throw WorkspaceError("UNKNOWN_VERSION", "No saved circuit version '" + id + "'.");
    await this._saveCurrentVersion(this.state.circuitName);
    await this.adapter.importCircuit(body);
    this.state.simulationRunning = true;
    this.state.circuitName = meta.label;
    this._bump();
    this._record((context && context.actor) || "agent", "version-restored", "Restored " + id, "CircuitJS1 now shows " + meta.label + ".");
    this._emit("version-restored");
    return { workspaceRevision: this.state.revision, versionId: id, circuitName: meta.label };
  };

  WorkspaceSession.prototype.measureNode = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var node = requireText(params.node, "NODE_REQUIRED", "Name the labeled CircuitJS node to measure.");
    if (!this.adapter.readCurrentNodeVoltage) {
      throw WorkspaceError("MEASUREMENT_UNAVAILABLE", "The active adapter cannot read labeled nodes.");
    }
    var reading = await this.adapter.readCurrentNodeVoltage(node);
    this.measurementCounter += 1;
    var measurement = {
      id: "m" + this.measurementCounter,
      node: node,
      value: reading.value,
      unit: reading.unit || "V",
      source: reading.source,
      reason: cleanText(params.reason),
      actor: (context && context.actor) || "agent",
      revision: this.state.revision + 1,
      at: new Date().toISOString()
    };
    this.state.measurements.push(measurement);
    this._bump();
    this._record(
      measurement.actor,
      "node-measured",
      node + " = " + Number(reading.value).toFixed(3) + " " + measurement.unit,
      measurement.reason || "Read directly from the active CircuitJS1 simulation."
    );
    this._emit("node-measured");
    measurement.workspaceRevision = this.state.revision;
    return clone(measurement);
  };

  WorkspaceSession.prototype.setSimulationRunning = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    if (typeof params.running !== "boolean") throw WorkspaceError("RUNNING_REQUIRED", "running must be true or false.");
    await this.adapter.setSimulationRunning(params.running);
    this.state.simulationRunning = params.running;
    this._bump();
    this._record(
      (context && context.actor) || "agent",
      "simulation-changed",
      params.running ? "Simulation started" : "Simulation paused",
      cleanText(params.reason) || "CircuitJS1 run state changed."
    );
    this._emit("simulation-changed");
    return { workspaceRevision: this.state.revision, running: params.running };
  };

  WorkspaceSession.prototype.recordNote = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var kind = params.kind || "finding";
    if (["finding", "decision", "question", "next-step"].indexOf(kind) === -1) {
      throw WorkspaceError("INVALID_NOTE_KIND", "Unknown note kind '" + kind + "'.");
    }
    var title = requireText(params.title, "NOTE_REQUIRED", "A note needs both title and detail.");
    var detail = requireText(params.detail, "NOTE_REQUIRED", "A note needs both title and detail.");
    this._bump();
    this._record((context && context.actor) || "agent", kind, title, detail);
    this._emit("note-recorded");
    return { workspaceRevision: this.state.revision, kind: kind, title: title };
  };

  WorkspaceSession.prototype.recordInvestigation = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var title = requireText(params.title, "INVESTIGATION_REQUIRED", "An investigation needs a title and detail.");
    var detail = requireText(params.detail, "INVESTIGATION_REQUIRED", "An investigation needs a title and detail.");
    var kind = params.kind || "inspection";
    if (["inspection", "trace", "question", "next-step"].indexOf(kind) === -1) {
      throw WorkspaceError("INVALID_INVESTIGATION_KIND", "Unknown investigation kind '" + kind + "'.");
    }
    this.investigationCounter += 1;
    this._bump();
    var entry = this._entry("i" + this.investigationCounter, { title: title, detail: detail }, (context && context.actor) || "agent");
    entry.kind = kind;
    entry.subject = cleanText(params.subject);
    this.state.investigations.push(entry);
    this._record(entry.actor, "investigation-recorded", title, detail);
    this._emit("investigation-recorded");
    return clone(entry);
  };

  WorkspaceSession.prototype.recordEvidence = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var title = requireText(params.title, "EVIDENCE_REQUIRED", "Evidence needs a title and detail.");
    var detail = requireText(params.detail, "EVIDENCE_REQUIRED", "Evidence needs a title and detail.");
    var source = params.source || "simulation";
    if (["simulation", "hardware", "user", "documentation", "calculation"].indexOf(source) === -1) {
      throw WorkspaceError("INVALID_EVIDENCE_SOURCE", "Unknown evidence source '" + source + "'.");
    }
    this.evidenceCounter += 1;
    this._bump();
    var entry = this._entry("e" + this.evidenceCounter, { title: title, detail: detail }, (context && context.actor) || "agent");
    entry.source = source;
    if (params.value !== null && typeof params.value !== "undefined") entry.value = params.value;
    if (params.unit) entry.unit = cleanText(params.unit);
    if (params.subject) entry.subject = cleanText(params.subject);
    this.state.evidence.push(entry);
    this._record(entry.actor, "evidence-recorded", title, detail);
    this._emit("evidence-recorded");
    return clone(entry);
  };

  WorkspaceSession.prototype.proposeHypothesis = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var statement = requireText(params.statement, "HYPOTHESIS_REQUIRED", "Provide a concrete hypothesis.", 8);
    var evidenceIds = this._requireEvidenceIds(params.evidenceIds, 1);
    var alternatives = Array.isArray(params.alternatives) ? params.alternatives.map(function (alternative) {
      return {
        label: cleanText(typeof alternative === "string" ? alternative : alternative.label),
        status: (alternative && alternative.status) || "untested"
      };
    }).filter(function (alternative) { return alternative.label; }) : [];
    this.hypothesisCounter += 1;
    this._bump();
    var hypothesis = {
      id: "h" + this.hypothesisCounter,
      statement: statement,
      evidenceIds: evidenceIds,
      alternatives: alternatives,
      status: "provisional",
      note: cleanText(params.note),
      actor: (context && context.actor) || "agent",
      revision: this.state.revision,
      at: new Date().toISOString()
    };
    this.state.hypotheses.push(hypothesis);
    this._record(hypothesis.actor, "hypothesis-proposed", "Hypothesis proposed", statement);
    this._emit("hypothesis-proposed");
    return clone(hypothesis);
  };

  WorkspaceSession.prototype.updateHypothesis = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var hypothesis = this._findById(this.state.hypotheses, cleanText(params.hypothesisId));
    if (!hypothesis) throw WorkspaceError("UNKNOWN_HYPOTHESIS", "No hypothesis '" + cleanText(params.hypothesisId) + "'.");
    if (params.status) {
      if (["provisional", "supported", "rejected", "verified-in-simulation"].indexOf(params.status) === -1) {
        throw WorkspaceError("INVALID_HYPOTHESIS_STATUS", "Unknown hypothesis status '" + params.status + "'.");
      }
      hypothesis.status = params.status;
    }
    if (params.statement) hypothesis.statement = requireText(params.statement, "HYPOTHESIS_REQUIRED", "Provide a concrete hypothesis.", 8);
    if (params.evidenceIds) hypothesis.evidenceIds = this._requireEvidenceIds(params.evidenceIds, 1);
    if (Array.isArray(params.alternatives)) {
      hypothesis.alternatives = params.alternatives.map(function (alternative) {
        return {
          label: cleanText(typeof alternative === "string" ? alternative : alternative.label),
          status: (alternative && alternative.status) || "untested"
        };
      }).filter(function (alternative) { return alternative.label; });
    }
    if (typeof params.note !== "undefined") hypothesis.note = cleanText(params.note);
    this._bump();
    hypothesis.revision = this.state.revision;
    this._record((context && context.actor) || "agent", "hypothesis-updated", "Hypothesis " + hypothesis.status, hypothesis.statement);
    this._emit("hypothesis-updated");
    return clone(hypothesis);
  };

  WorkspaceSession.prototype.stageRepair = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var title = requireText(params.title, "REPAIR_REQUIRED", "A repair needs a title and rationale.");
    var rationale = requireText(params.rationale, "REPAIR_REQUIRED", "A repair needs a title and rationale.", 8);
    var evidenceIds = this._requireEvidenceIds(params.evidenceIds, 1);
    var hypothesisId = cleanText(params.hypothesisId);
    if (hypothesisId && !this._findById(this.state.hypotheses, hypothesisId)) {
      throw WorkspaceError("UNKNOWN_HYPOTHESIS", "No hypothesis '" + hypothesisId + "'.");
    }
    if (Array.isArray(params.actions) && params.actions.length === 0) {
      throw WorkspaceError("REPAIR_PLAN_EMPTY", "A repair action plan must contain at least one editor action.");
    }
    var actions = Array.isArray(params.actions) ? clone(params.actions) : null;
    var circuitText = cleanText(params.circuitText);
    if (actions && actions.length > 100) throw WorkspaceError("TOO_MANY_EDITOR_ACTIONS", "A repair may contain at most 100 editor actions.");
    if (circuitText && !isCircuitDocument(circuitText)) throw WorkspaceError("INVALID_CIRCUIT", "The repair circuitText is not a CircuitJS export.");
    if (circuitText.length > 250000) throw WorkspaceError("CIRCUIT_TOO_LARGE", "Repair circuit text exceeds 250 kB.");
    if (actions && circuitText) throw WorkspaceError("AMBIGUOUS_REPAIR_PLAN", "Provide actions or circuitText, not both.");
    this.repairCounter += 1;
    var id = "r" + this.repairCounter;
    this._bump();
    var repair = {
      id: id,
      title: title,
      rationale: rationale,
      evidenceIds: evidenceIds,
      hypothesisId: hypothesisId || null,
      planKind: actions ? "editor-actions" : circuitText ? "circuit-replacement" : "physical-only",
      actionCount: actions ? actions.length : 0,
      status: "staged",
      approvalStatus: "not-requested",
      result: null,
      actor: (context && context.actor) || "agent",
      revision: this.state.revision,
      at: new Date().toISOString()
    };
    this.repairPlans[id] = { actions: actions, circuitText: circuitText || null };
    this.state.repairs.push(repair);
    this._record(repair.actor, "repair-staged", title, rationale);
    this._emit("repair-staged");
    return clone(repair);
  };

  WorkspaceSession.prototype.requestRepairApproval = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var repair = this._findById(this.state.repairs, cleanText(params.repairId));
    if (!repair) throw WorkspaceError("UNKNOWN_REPAIR", "No repair '" + cleanText(params.repairId) + "'.");
    if (repair.planKind === "physical-only") throw WorkspaceError("SIMULATION_PLAN_REQUIRED", "This repair has no CircuitJS plan to approve.");
    if (repair.approvalStatus === "pending") throw WorkspaceError("APPROVAL_PENDING", "This repair already awaits approval.");
    this.taskCounter += 1;
    this._bump();
    var task = {
      id: "t" + this.taskCounter,
      type: "repair-approval",
      repairId: repair.id,
      status: "pending",
      instruction: cleanText(params.instruction) || "Approve simulating the staged repair: " + repair.title + "?",
      revision: this.state.revision,
      at: new Date().toISOString()
    };
    repair.approvalStatus = "pending";
    repair.revision = this.state.revision;
    this.state.humanTasks.push(task);
    this._record((context && context.actor) || "agent", "repair-approval-requested", "Repair approval requested", repair.title);
    this._emit("repair-approval-requested");
    return clone(task);
  };

  WorkspaceSession.prototype.resolveHumanTask = function (taskId, approved, context) {
    var task = this._findById(this.state.humanTasks, cleanText(taskId));
    if (!task || task.type !== "repair-approval") throw WorkspaceError("UNKNOWN_TASK", "No repair approval task '" + cleanText(taskId) + "'.");
    if (task.status !== "pending") throw WorkspaceError("TASK_ALREADY_DONE", "Task '" + task.id + "' is already resolved.");
    var repair = this._findById(this.state.repairs, task.repairId);
    task.status = approved ? "approved" : "declined";
    repair.approvalStatus = task.status;
    if (!approved) repair.status = "declined";
    this._bump();
    task.revision = this.state.revision;
    repair.revision = this.state.revision;
    this._record((context && context.actor) || "human", approved ? "repair-approved" : "repair-declined", approved ? "Repair simulation approved" : "Repair simulation declined", repair.title);
    this._emit(approved ? "repair-approved" : "repair-declined");
    return { workspaceRevision: this.state.revision, taskId: task.id, repairId: repair.id, approved: Boolean(approved) };
  };

  WorkspaceSession.prototype.applyStagedRepair = async function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var repair = this._findById(this.state.repairs, cleanText(params.repairId));
    if (!repair) throw WorkspaceError("UNKNOWN_REPAIR", "No repair '" + cleanText(params.repairId) + "'.");
    if (repair.approvalStatus !== "approved") throw WorkspaceError("REPAIR_NOT_APPROVED", "The human must approve this repair simulation first.");
    var plan = this.repairPlans[repair.id];
    if (!plan || (!plan.actions && !plan.circuitText)) throw WorkspaceError("SIMULATION_PLAN_REQUIRED", "This repair has no CircuitJS plan.");
    var result;
    if (plan.actions) {
      result = await this.adapter.applyEditorActions(plan.actions, { includeCircuitText: false });
    } else {
      var savedVersion = await this._saveCurrentVersion(this.state.circuitName);
      await this.adapter.importCircuit(plan.circuitText);
      result = { changed: true, actionCount: 1, savedVersion: savedVersion };
    }
    repair.status = "applied-in-simulation";
    this.state.status = "active";
    this._bump();
    repair.revision = this.state.revision;
    this._record((context && context.actor) || "agent", "repair-applied", "Repair applied in simulation", repair.title);
    this._emit("repair-applied");
    result.workspaceRevision = this.state.revision;
    result.repairId = repair.id;
    return result;
  };

  WorkspaceSession.prototype.recordRepairResult = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var repair = this._findById(this.state.repairs, cleanText(params.repairId));
    if (!repair) throw WorkspaceError("UNKNOWN_REPAIR", "No repair '" + cleanText(params.repairId) + "'.");
    var status = params.status;
    if (["verified-in-simulation", "failed-in-simulation", "needs-hardware-test"].indexOf(status) === -1) {
      throw WorkspaceError("INVALID_REPAIR_RESULT", "Unknown repair result '" + status + "'.");
    }
    if (status !== "needs-hardware-test" && repair.status !== "applied-in-simulation") {
      throw WorkspaceError("REPAIR_NOT_APPLIED", "Apply the approved repair in CircuitJS1 before recording a simulation result.");
    }
    var summary = requireText(params.summary, "SUMMARY_REQUIRED", "Record a concrete repair result.", 8);
    this._bump();
    repair.status = status;
    repair.result = { status: status, summary: summary, revision: this.state.revision, at: new Date().toISOString() };
    repair.revision = this.state.revision;
    if (status === "verified-in-simulation" && repair.hypothesisId) {
      var hypothesis = this._findById(this.state.hypotheses, repair.hypothesisId);
      if (hypothesis) {
        hypothesis.status = "verified-in-simulation";
        hypothesis.revision = this.state.revision;
      }
    }
    this._record((context && context.actor) || "agent", "repair-result-recorded", "Repair " + status.replace(/-/g, " "), summary);
    this._emit("repair-result-recorded");
    return clone(repair);
  };

  WorkspaceSession.prototype.finishSession = function (params, context) {
    params = params || {};
    this._checkRevision(params);
    var summary = requireText(params.summary, "SUMMARY_REQUIRED", "Finish the session with a concrete summary.", 8);
    var outcome = params.outcome || "resolved";
    if (["resolved", "needs-hardware-test", "blocked"].indexOf(outcome) === -1) {
      throw WorkspaceError("INVALID_OUTCOME", "Unknown session outcome '" + outcome + "'.");
    }
    this.state.status = outcome === "resolved" ? "complete" : "paused";
    this.state.outcome = outcome;
    this._bump();
    this._record((context && context.actor) || "agent", "session-finished", outcome === "resolved" ? "Session complete" : "Session paused", summary);
    this._emit("session-finished");
    return { workspaceRevision: this.state.revision, status: this.state.status, outcome: outcome };
  };

  return {
    WorkspaceSession: WorkspaceSession,
    WorkspaceError: WorkspaceError,
    createWorkspace: function (options) { return new WorkspaceSession(options); }
  };
});
