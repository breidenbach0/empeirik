/*
 * Circuit adapters.
 *
 * Two interchangeable implementations behind one interface:
 *
 *   readNodeVoltage(node, branch) -> { value, unit, source }
 *   loadBranch(branch)            -> void (switches the simulated circuit)
 *   estimateResetRelease(branch)  -> { thresholdV, timeConstantMs, releaseTimeMs, source }
 *   getEditorCapabilities()       -> native editor coverage and element catalog
 *   getEditorState()              -> CircuitJS1 editor state
 *   applyEditorActions(actions)   -> atomic, verified native editor mutations
 *
 * - DeterministicPreviewAdapter returns the scenario's documented readings,
 *   so the entire workflow runs before the ~100 MB upstream runtime is
 *   installed.
 *
 * - CircuitJS1BridgeAdapter speaks the documented CircuitJS1 JavaScript
 *   interface through a same-origin iframe:
 *     iframe.contentWindow.oncircuitjsloaded
 *     CircuitJS1.importCircuit(circuitString, false)
 *     CircuitJS1.getNodeVoltage(nodeName)
 *     CircuitJS1.setSimRunning(bool) / isRunning() / getTime()
 *   Docs: http://www.falstad.com/circuit/doc/js-interface.html
 *
 * The bridge is defensive: if anything goes wrong it falls back to the
 * preview values and reports the degraded source, never blocking the
 * diagnostic workflow.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.circuitAdapter = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var SCENARIO_API = root.EmpeirikModules
    ? root.EmpeirikModules.scenario
    : null;

  function previewTiming(scenario, branch) {
    var t = scenario.preview.timing;
    if (branch === "repaired") {
      return {
        thresholdV: t.thresholdV,
        timeConstantMs: t.timeConstantMs,
        releaseTimeMs: t.releaseTimeMs,
        settledHigh: true,
        source: "deterministic-preview"
      };
    }
    return {
      thresholdV: t.thresholdV,
      timeConstantMs: t.timeConstantMs,
      releaseTimeMs: null,
      settledHigh: false,
      source: "deterministic-preview"
    };
  }

  function previewElements(circuitText) {
    var names = {
      r: "resistor",
      c: "capacitor",
      l: "inductor",
      v: "voltage-source",
      i: "current-source",
      d: "diode",
      w: "wire",
      g: "ground",
      s: "switch",
      207: "labeled-node"
    };
    return String(circuitText || "").split("\n").filter(function (line) {
      return line && line.charAt(0) !== "$" && line.charAt(0) !== "#";
    }).map(function (line, index) {
      var code = line.trim().split(/\s+/)[0];
      return { index: index, type: names[code] || code, exportLine: line };
    });
  }

  function adapterError(code, message, extras) {
    var error = new Error(message);
    error.code = code;
    if (extras) {
      Object.keys(extras).forEach(function (key) { error[key] = extras[key]; });
    }
    return error;
  }

  function copyBridgeValue(value) {
    if (value === null || typeof value === "undefined") return value;
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (error) {
      return value;
    }
  }

  function requireFiniteNumber(value, name) {
    var number = Number(value);
    if (value === null || value === "" || !Number.isFinite(number)) {
      throw adapterError("INVALID_EDITOR_ARGUMENT", name + " must be a finite number.");
    }
    return number;
  }

  function requireInteger(value, name, minimum) {
    var number = requireFiniteNumber(value, name);
    if (Math.floor(number) !== number || (typeof minimum === "number" && number < minimum)) {
      throw adapterError(
        "INVALID_EDITOR_ARGUMENT",
        name + " must be " + (typeof minimum === "number" ? "an integer of at least " + minimum : "an integer") + "."
      );
    }
    return number;
  }

  function isCircuitDocument(value) {
    return /^(\$|<\?xml\b|<cir\b)/i.test(String(value || "").trim());
  }

  function DeterministicPreviewAdapter(options) {
    options = options || {};
    this.scenarioApi = options.scenarioApi || SCENARIO_API;
    this.scenario = this.scenarioApi.scenario;
    this.mode = "preview";
    this.branch = "faulted";
    this.running = true;
    this.currentCircuit = this.scenario.circuitStrings.faulted;
  }

  DeterministicPreviewAdapter.prototype.describe = function () {
    return {
      mode: "preview",
      label: "Deterministic preview",
      detail:
        "Running the scenario's documented readings. Install CircuitJS1 " +
        "(npm run install:circuitjs) for the live simulator."
    };
  };

  DeterministicPreviewAdapter.prototype.loadBranch = async function (branch) {
    this.branch = branch;
    this.currentCircuit = this.scenario.circuitStrings[branch] || this.currentCircuit;
  };

  DeterministicPreviewAdapter.prototype.readNodeVoltage = async function (node, branch) {
    var table = this.scenario.preview[branch] || this.scenario.preview.faulted;
    if (typeof table[node] !== "number") {
      throw new Error("Preview adapter has no reading for node '" + node + "'.");
    }
    return {
      value: table[node],
      unit: "V",
      source: "deterministic-preview"
    };
  };

  DeterministicPreviewAdapter.prototype.estimateResetRelease = async function (branch) {
    return previewTiming(this.scenario, branch);
  };

  DeterministicPreviewAdapter.prototype.exportCircuit = async function () {
    return this.currentCircuit;
  };

  DeterministicPreviewAdapter.prototype.importCircuit = async function (circuitText) {
    this.currentCircuit = String(circuitText || "");
    if (this.currentCircuit === this.scenario.circuitStrings.faulted) {
      this.branch = "faulted";
    } else if (this.currentCircuit === this.scenario.circuitStrings.repaired) {
      this.branch = "repaired";
    } else {
      this.branch = "custom";
    }
    this.running = true;
  };

  DeterministicPreviewAdapter.prototype.getElements = async function () {
    return previewElements(this.currentCircuit);
  };

  DeterministicPreviewAdapter.prototype.getCircuitSnapshot = async function (options) {
    options = options || {};
    var elements = await this.getElements();
    var snapshot = {
      source: "deterministic-preview",
      editorAvailable: false,
      running: this.running,
      time: null,
      elementCount: elements.length,
      elements: elements
    };
    if (options.includeCircuitText) snapshot.circuitText = this.currentCircuit;
    return snapshot;
  };

  DeterministicPreviewAdapter.prototype.readCurrentNodeVoltage = async function (node) {
    var table = this.scenario.preview[this.branch];
    if (!table || typeof table[node] !== "number") {
      throw new Error(
        "CircuitJS1 is required to measure arbitrary labeled nodes; the preview " +
        "adapter only knows the bundled example."
      );
    }
    return { value: table[node], unit: "V", source: "deterministic-preview" };
  };

  DeterministicPreviewAdapter.prototype.setSimulationRunning = async function (running) {
    this.running = Boolean(running);
  };

  DeterministicPreviewAdapter.prototype.getEditorCapabilities = async function () {
    return {
      available: false,
      coverage: "circuit-text-only",
      reason:
        "The deterministic preview can load complete CircuitJS exports, but native " +
        "element-by-element editing requires the bundled empeirik CircuitJS1 bridge."
    };
  };

  DeterministicPreviewAdapter.prototype.getEditorState = async function () {
    throw adapterError(
      "EDITOR_BRIDGE_UNAVAILABLE",
      "Native CircuitJS1 editing is unavailable in deterministic preview mode."
    );
  };

  DeterministicPreviewAdapter.prototype.applyEditorActions = async function () {
    throw adapterError(
      "EDITOR_BRIDGE_UNAVAILABLE",
      "Install or build the empeirik CircuitJS1 runtime before using editor actions."
    );
  };

  /* ------------------------------------------------------------------ */

  function CircuitJS1BridgeAdapter(options) {
    options = options || {};
    this.scenarioApi = options.scenarioApi || SCENARIO_API;
    this.scenario = this.scenarioApi.scenario;
    this.iframe = options.iframe || null;
    this.sim = null;
    this.mode = "circuitjs";
    this.branch = "faulted";
    this.branchVerified = false;
    this.degraded = false;
    this.ready = false;
    this.editorAvailable = false;
    this.lastCircuitText = this.scenario.circuitStrings.faulted;
  }

  CircuitJS1BridgeAdapter.prototype._simOrNull = function () {
    try {
      var w = this.iframe && this.iframe.contentWindow;
      if (w && w.CircuitJS1) return w.CircuitJS1;
    } catch (e) {
      /* cross-origin or torn down; treated as not ready */
    }
    return null;
  };

  CircuitJS1BridgeAdapter.prototype._waitForSim = function (timeoutMs) {
    var self = this;
    timeoutMs = timeoutMs || 20000;
    return new Promise(function (resolve) {
      var started = Date.now();
      function poll() {
        var sim = self._simOrNull();
        if (sim) {
          self.sim = sim;
          self.ready = true;
          resolve(true);
          return;
        }
        if (Date.now() - started > timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(poll, 120);
      }
      poll();
    });
  };

  CircuitJS1BridgeAdapter.prototype._sleep = function (ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  };

  CircuitJS1BridgeAdapter.prototype.describe = function () {
    var nativeEditor = this.sim && this.sim.editor;
    return {
      mode: "circuitjs",
      label: this.degraded ? "CircuitJS1 degraded" : "CircuitJS1 connected",
      detail: this.degraded
        ? "Runtime present but the bridge did not answer; preview values are used."
        : nativeEditor
          ? "Native agent bridge connected: CircuitJS1 elements, properties, controls, menus, view, and scopes are directly editable."
          : "Live simulation connected, but this runtime lacks the native editor bridge."
    };
  };

  CircuitJS1BridgeAdapter.prototype.connect = async function (iframe) {
    this.iframe = iframe;
    var self = this;
    // The documented handshake: register oncircuitjsloaded after load.
    iframe.addEventListener("load", function () {
      try {
        iframe.contentWindow.oncircuitjsloaded = function () {
          self.sim = self._simOrNull();
          if (self.sim) self.ready = true;
        };
      } catch (e) {
        /* same-origin violation; polling is the fallback */
      }
    });
    var ok = await this._waitForSim();
    if (!ok) {
      this.degraded = true;
      return false;
    }
    try {
      this.sim.setSimRunning(true);
      this.editorAvailable = Boolean(this.sim.editor);
    } catch (e) {
      this.degraded = true;
      return false;
    }
    return true;
  };

  /*
   * The 3V3 rail sits at ~3.3 V on both branches of this scenario, so a
   * near-zero reading can only mean the runtime has not actually loaded
   * our circuit (e.g. importCircuit raced the GWT startup). That makes it
   * a safe "did the import stick?" probe.
   */
  CircuitJS1BridgeAdapter.prototype._railOk = function () {
    try {
      var v = this.sim.getNodeVoltage("3V3");
      return typeof v === "number" && isFinite(v) && Math.abs(v) > 0.5;
    } catch (e) {
      return false;
    }
  };

  CircuitJS1BridgeAdapter.prototype.loadBranch = async function (branch) {
    this.branch = branch;
    this.lastCircuitText = this.scenario.circuitStrings[branch] || this.lastCircuitText;
    this.branchVerified = false;
    if (!this.sim) {
      this.degraded = true;
      return;
    }
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        this.sim.importCircuit(this.scenario.circuitStrings[branch], false);
        this.sim.setSimRunning(true);
      } catch (e) {
        this.degraded = true;
        return;
      }
      // Let the transient settle (5 tau at tau = 1 ms is reached quickly).
      await this._sleep(1200);
      if (this._railOk()) {
        this.branchVerified = true;
        this.degraded = false;
        return;
      }
      // Import raced the runtime startup; retry after another beat.
    }
    this.degraded = true;
  };

  CircuitJS1BridgeAdapter.prototype.readNodeVoltage = async function (node, branch) {
    if (branch !== this.branch || !this.branchVerified) {
      await this.loadBranch(branch);
    }
    if (this.sim && !this.degraded) {
      try {
        var v = this.sim.getNodeVoltage(node);
        if (typeof v === "number" && isFinite(v)) {
          return { value: v, unit: "V", source: "circuitjs1" };
        }
      } catch (e) {
        this.degraded = true;
      }
    }
    var table = this.scenario.preview[branch];
    return {
      value: table[node],
      unit: "V",
      source: "preview-fallback"
    };
  };

  CircuitJS1BridgeAdapter.prototype.estimateResetRelease = async function (branch) {
    var t = this.scenario.preview.timing;
    this.branchVerified = false;
    if (this.sim && !this.degraded) {
      try {
        // Re-import resets sim time; sample the RESET node until it crosses
        // the release threshold.
        this.sim.importCircuit(this.scenario.circuitStrings[branch], false);
        this.sim.setSimRunning(true);
        var prev = null;
        for (var i = 0; i < 60; i++) {
          var now = this.sim.getTime();
          var v = this.sim.getNodeVoltage("RESET");
          if (typeof v === "number" && prev && v >= t.thresholdV && prev.v < t.thresholdV) {
            var frac = (t.thresholdV - prev.v) / (v - prev.v);
            var cross = prev.t + frac * (now - prev.t);
            this.branch = branch;
            this.branchVerified = true;
            return {
              thresholdV: t.thresholdV,
              timeConstantMs: t.timeConstantMs,
              releaseTimeMs: cross * 1000,
              settledHigh: true,
              source: "circuitjs1"
            };
          }
          if (typeof v === "number") prev = { t: now, v: v };
          await this._sleep(40);
        }
      } catch (e) {
        this.degraded = true;
      }
    }
    return previewTiming(this.scenario, branch);
  };

  CircuitJS1BridgeAdapter.prototype.exportCircuit = async function () {
    if (this.sim) {
      try {
        var exported = this.sim.exportCircuit();
        if (typeof exported === "string" && exported.length) {
          this.lastCircuitText = exported;
          return exported;
        }
      } catch (e) {
        this.degraded = true;
      }
    }
    return this.lastCircuitText;
  };

  CircuitJS1BridgeAdapter.prototype.exportCircuitSvg = function () {
    var sim = this.sim;
    if (!sim || typeof sim.getCircuitAsSVG !== "function") {
      return Promise.reject(new Error("SVG export requires the connected CircuitJS1 runtime."));
    }
    return new Promise(function (resolve, reject) {
      var previousHook = sim.onsvgrendered;
      var settled = false;
      var timer = root.setTimeout(function () {
        finish(new Error("CircuitJS1 did not finish the SVG export."));
      }, 5000);

      function restoreHook() {
        if (sim.onsvgrendered === handleSvg) sim.onsvgrendered = previousHook;
      }

      function finish(error, svg) {
        if (settled) return;
        settled = true;
        root.clearTimeout(timer);
        restoreHook();
        if (error) reject(error);
        else resolve(String(svg));
      }

      function handleSvg(api, svg) {
        if (typeof previousHook === "function") {
          try { previousHook(api, svg); } catch (e) { /* external hook */ }
        }
        if (typeof svg !== "string" || svg.indexOf("<svg") === -1) {
          finish(new Error("CircuitJS1 returned an invalid SVG export."));
          return;
        }
        finish(null, svg);
      }

      sim.onsvgrendered = handleSvg;
      try {
        var immediate = sim.getCircuitAsSVG();
        if (typeof immediate === "string" && immediate.indexOf("<svg") !== -1) {
          finish(null, immediate);
        }
      } catch (error) {
        finish(error);
      }
    });
  };

  CircuitJS1BridgeAdapter.prototype.importCircuit = async function (circuitText) {
    var text = String(circuitText || "").trim();
    if (!isCircuitDocument(text)) {
      throw new Error("CircuitJS circuit text must be a legacy '$' export or an XML '<cir>' export.");
    }
    if (!this.sim) {
      throw new Error("CircuitJS1 is not connected; an arbitrary circuit cannot be loaded.");
    }
    this.sim.importCircuit(text, false);
    this.sim.setSimRunning(true);
    this.lastCircuitText = text;
    this.branch = text === this.scenario.circuitStrings.faulted
      ? "faulted"
      : text === this.scenario.circuitStrings.repaired
        ? "repaired"
        : "custom";
    this.branchVerified = true;
    this.degraded = false;
    await this._sleep(220);
  };

  CircuitJS1BridgeAdapter.prototype.getElements = async function () {
    if (!this.sim) return previewElements(this.lastCircuitText);
    var raw;
    try {
      raw = this.sim.getElements();
    } catch (e) {
      this.degraded = true;
      return previewElements(this.lastCircuitText);
    }
    var items = [];
    var length = raw && typeof raw.length === "number" ? raw.length : 0;
    for (var i = 0; i < length; i++) {
      var element = raw[i];
      var item = { index: i, type: "unknown" };
      try { item.type = String(element.getType()); } catch (e1) { /* optional */ }
      try {
        var label = element.getLabelName();
        if (label) item.label = String(label);
      } catch (e2) { /* only labeled-node elements implement this */ }
      try {
        var info = element.getInfo();
        if (info && typeof info.length === "number") {
          item.info = [];
          for (var j = 0; j < info.length; j++) item.info.push(String(info[j]));
        }
      } catch (e3) { /* optional */ }
      try { item.voltage = Number(element.getVoltageDiff()); } catch (e4) { /* optional */ }
      try { item.current = Number(element.getCurrent()); } catch (e5) { /* optional */ }
      try { item.posts = Number(element.getPostCount()); } catch (e6) { /* optional */ }
      items.push(item);
    }
    return items;
  };

  CircuitJS1BridgeAdapter.prototype.getCircuitSnapshot = async function (options) {
    options = options || {};
    var circuitText = await this.exportCircuit();
    var elements = await this.getElements();
    var running = false;
    var time = null;
    if (this.sim) {
      try { running = Boolean(this.sim.isRunning()); } catch (e1) { /* optional */ }
      try { time = Number(this.sim.getTime()); } catch (e2) { /* optional */ }
    }
    var snapshot = {
      source: this.degraded ? "circuitjs1-degraded" : "circuitjs1",
      editorAvailable: Boolean(this.sim && this.sim.editor),
      running: running,
      time: time,
      elementCount: elements.length,
      elements: elements
    };
    if (options.includeCircuitText) snapshot.circuitText = circuitText;
    return snapshot;
  };

  CircuitJS1BridgeAdapter.prototype.readCurrentNodeVoltage = async function (node) {
    if (!this.sim) throw new Error("CircuitJS1 is not connected.");
    var value = this.sim.getNodeVoltage(String(node));
    if (typeof value !== "number" || !isFinite(value)) {
      throw new Error("CircuitJS1 did not return a numeric voltage for node '" + node + "'.");
    }
    return { value: value, unit: "V", source: "circuitjs1" };
  };

  CircuitJS1BridgeAdapter.prototype.setSimulationRunning = async function (running) {
    if (!this.sim) throw new Error("CircuitJS1 is not connected.");
    this.sim.setSimRunning(Boolean(running));
  };

  CircuitJS1BridgeAdapter.prototype._editorOrThrow = function () {
    var sim = this.sim || this._simOrNull();
    if (!sim) {
      throw adapterError("EDITOR_BRIDGE_UNAVAILABLE", "CircuitJS1 is not connected.");
    }
    if (!sim.editor || typeof sim.editor.getCapabilities !== "function") {
      throw adapterError(
        "EDITOR_BRIDGE_UNAVAILABLE",
        "This CircuitJS1 runtime exposes simulation reads but not the empeirik native editor bridge. Run npm run build:circuitjs-bridge."
      );
    }
    this.sim = sim;
    this.editorAvailable = true;
    return sim.editor;
  };

  CircuitJS1BridgeAdapter.prototype.getEditorCapabilities = async function () {
    var sim = this.sim || this._simOrNull();
    if (!sim || !sim.editor || typeof sim.editor.getCapabilities !== "function") {
      return {
        available: false,
        coverage: sim ? "official-read-api" : "disconnected",
        reason: sim
          ? "The installed runtime does not include the empeirik native editor bridge."
          : "CircuitJS1 is not connected."
      };
    }
    var result = copyBridgeValue(sim.editor.getCapabilities());
    result.available = true;
    result.elementTypeCount = result.elementTypes ? result.elementTypes.length : 0;
    return result;
  };

  CircuitJS1BridgeAdapter.prototype.getEditorState = async function (options) {
    options = options || {};
    var editor = this._editorOrThrow();
    var state = copyBridgeValue(editor.getState());
    state.globalEditFields = copyBridgeValue(editor.getGlobalEditInfo());
    if (options.includeCircuitText === false) delete state.circuit;
    return state;
  };

  CircuitJS1BridgeAdapter.prototype._resolveElementIndex = function (action, refs, key) {
    key = key || "elementIndex";
    var refKey = key === "targetIndex" ? "targetRef" : "elementRef";
    if (action[refKey]) {
      if (typeof refs[action[refKey]] !== "number") {
        throw adapterError(
          "UNKNOWN_ELEMENT_REF",
          "No element reference '" + action[refKey] + "' has been created in this action batch."
        );
      }
      return refs[action[refKey]];
    }
    var value = action[key];
    if (typeof value !== "number" || value < 0 || Math.floor(value) !== value) {
      throw adapterError("ELEMENT_INDEX_REQUIRED", key + " must be a non-negative integer.");
    }
    return value;
  };

  CircuitJS1BridgeAdapter.prototype._resolveElementIndices = function (action, refs) {
    var indices = Array.isArray(action.elementIndices) ? action.elementIndices.slice() : [];
    var elementRefs = Array.isArray(action.elementRefs) ? action.elementRefs : [];
    for (var i = 0; i < elementRefs.length; i++) {
      if (typeof refs[elementRefs[i]] !== "number") {
        throw adapterError("UNKNOWN_ELEMENT_REF", "Unknown element reference '" + elementRefs[i] + "'.");
      }
      indices.push(refs[elementRefs[i]]);
    }
    indices = indices.map(function (value) {
      var number = Number(value);
      if (number < 0 || Math.floor(number) !== number) {
        throw adapterError("INVALID_ELEMENT_INDEX", "Element indices must be non-negative integers.");
      }
      return number;
    });
    return indices.filter(function (value, index) { return indices.indexOf(value) === index; });
  };

  CircuitJS1BridgeAdapter.prototype._executeEditorAction = function (editor, action, refs) {
    var op = String(action.op || "");
    var index;
    var result;
    if (op === "add") {
      result = editor.addElement(
        String(action.type || ""), Number(action.x1), Number(action.y1),
        Number(action.x2), Number(action.y2)
      );
      result = copyBridgeValue(result);
      if (action.ref) {
        if (refs[action.ref] !== undefined) {
          throw adapterError("DUPLICATE_ELEMENT_REF", "Element reference '" + action.ref + "' is already in use.");
        }
        refs[action.ref] = result.index;
      }
      return result;
    }
    if (op === "move") {
      index = this._resolveElementIndex(action, refs);
      return copyBridgeValue(editor.moveElement(
        index, Number(action.x1), Number(action.y1), Number(action.x2), Number(action.y2)
      ));
    }
    if (op === "split-wire") {
      index = this._resolveElementIndex(action, refs);
      result = copyBridgeValue(editor.splitWire(
        index, requireInteger(action.x, "x"), requireInteger(action.y, "y")
      ));
      if (action.ref) {
        if (refs[action.ref] !== undefined) {
          throw adapterError("DUPLICATE_ELEMENT_REF", "Element reference '" + action.ref + "' is already in use.");
        }
        refs[action.ref] = result.index;
      }
      return result;
    }
    if (op === "edit") {
      index = this._resolveElementIndex(action, refs);
      return copyBridgeValue(editor.setElementEditValue(index, Number(action.fieldIndex), action.value));
    }
    if (op === "global-edit") {
      return copyBridgeValue(editor.setGlobalEditValue(Number(action.fieldIndex), action.value));
    }
    if (op === "element-control") {
      index = this._resolveElementIndex(action, refs);
      return copyBridgeValue(editor.setElementControl(index, String(action.controlId || ""), Number(action.value)));
    }
    if (op === "create-adjustable") {
      index = this._resolveElementIndex(action, refs);
      return copyBridgeValue(editor.createAdjustable(
        index, requireInteger(action.fieldIndex, "fieldIndex", 0), String(action.label || ""),
        requireFiniteNumber(action.min, "min"), requireFiniteNumber(action.max, "max"),
        action.step == null ? 0 : requireFiniteNumber(action.step, "step"),
        Boolean(action.logarithmic),
        action.sharedAdjustableIndex == null
          ? -1
          : requireInteger(action.sharedAdjustableIndex, "sharedAdjustableIndex", 0)
      ));
    }
    if (op === "update-adjustable") {
      return copyBridgeValue(editor.updateAdjustable(
        requireInteger(action.adjustableIndex, "adjustableIndex", 0), String(action.label || ""),
        requireFiniteNumber(action.min, "min"), requireFiniteNumber(action.max, "max"),
        action.step == null ? 0 : requireFiniteNumber(action.step, "step"),
        Boolean(action.logarithmic),
        action.ownSlider === true
          ? -1
          : action.sharedAdjustableIndex == null
            ? -2
            : requireInteger(action.sharedAdjustableIndex, "sharedAdjustableIndex", 0)
      ));
    }
    if (op === "remove-adjustable") {
      return copyBridgeValue(editor.removeAdjustable(
        requireInteger(action.adjustableIndex, "adjustableIndex", 0)
      ));
    }
    if (op === "remove" || op === "select") {
      var indices = this._resolveElementIndices(action, refs);
      if (op === "select") {
        return editor.selectElements(indices, String(action.mode || "replace"));
      }
      result = editor.removeElements(indices);
      var removed = indices.slice().sort(function (a, b) { return a - b; });
      Object.keys(refs).forEach(function (name) {
        if (removed.indexOf(refs[name]) !== -1) {
          delete refs[name];
          return;
        }
        var shift = removed.filter(function (removedIndex) { return removedIndex < refs[name]; }).length;
        refs[name] -= shift;
      });
      return result;
    }
    if (op === "command") {
      var targetIndex = (action.targetRef || typeof action.targetIndex !== "undefined")
        ? this._resolveElementIndex(action, refs, "targetIndex")
        : -1;
      return copyBridgeValue(editor.invokeCommand(
        String(action.menu || "main"), String(action.item || ""), targetIndex,
        action.scopeIndex == null ? -1 : Number(action.scopeIndex),
        action.plotIndex == null ? -1 : Number(action.plotIndex)
      ));
    }
    if (op === "option") {
      return copyBridgeValue(editor.setOption(String(action.name || ""), Boolean(action.value)));
    }
    if (op === "ui-control") {
      return copyBridgeValue(editor.setControl(String(action.name || ""), Number(action.value)));
    }
    if (op === "view") {
      return copyBridgeValue(editor.setView(
        Number(action.scale), Number(action.translateX), Number(action.translateY)
      ));
    }
    if (op === "scope") {
      return copyBridgeValue(editor.setScopeProperty(
        Number(action.scopeIndex), String(action.property || ""), action.value,
        action.plotIndex == null ? -1 : Number(action.plotIndex)
      ));
    }
    if (op === "reset-simulation") return copyBridgeValue(editor.resetSimulation());
    if (op === "run") {
      this.sim.setSimRunning(Boolean(action.running));
      return { running: Boolean(this.sim.isRunning()) };
    }
    throw adapterError("UNKNOWN_EDITOR_OPERATION", "Unknown CircuitJS editor operation '" + op + "'.");
  };

  CircuitJS1BridgeAdapter.prototype.applyEditorActions = async function (actions, options) {
    options = options || {};
    if (!Array.isArray(actions) || actions.length === 0) {
      throw adapterError("EDITOR_ACTIONS_REQUIRED", "Provide at least one CircuitJS editor action.");
    }
    if (actions.length > 100) {
      throw adapterError("TOO_MANY_EDITOR_ACTIONS", "One atomic batch may contain at most 100 editor actions.");
    }
    var editor = this._editorOrThrow();
    var before = this.sim.exportCircuit();
    var wasRunning = Boolean(this.sim.isRunning());
    var refs = {};
    var results = [];
    for (var i = 0; i < actions.length; i++) {
      try {
        results.push(this._executeEditorAction(editor, actions[i] || {}, refs));
      } catch (cause) {
        try {
          this.sim.importCircuit(before, false);
          this.sim.setSimRunning(wasRunning);
        } catch (rollbackError) {
          throw adapterError(
            "EDITOR_ROLLBACK_FAILED",
            "CircuitJS action " + (i + 1) + " failed and the previous circuit could not be restored: " +
              (rollbackError.message || String(rollbackError)),
            { failedActionIndex: i, failedOperation: actions[i] && actions[i].op }
          );
        }
        throw adapterError(
          cause.code || "EDITOR_ACTION_FAILED",
          "CircuitJS action " + (i + 1) + " (" + String(actions[i] && actions[i].op) + ") failed: " +
            (cause.message || String(cause)),
          { failedActionIndex: i, failedOperation: actions[i] && actions[i].op }
        );
      }
    }
    var after = this.sim.exportCircuit();
    this.lastCircuitText = after;
    this.branch = after === this.scenario.circuitStrings.faulted
      ? "faulted"
      : after === this.scenario.circuitStrings.repaired ? "repaired" : "custom";
    this.branchVerified = true;
    this.degraded = false;
    var state = copyBridgeValue(editor.getState());
    state.globalEditFields = copyBridgeValue(editor.getGlobalEditInfo());
    if (options.includeCircuitText === false) delete state.circuit;
    return {
      actionCount: actions.length,
      changed: before !== after,
      references: refs,
      results: results,
      state: state
    };
  };

  /* ------------------------------------------------------------------ */

  /*
   * Factory used by the browser entry point. Probes for the same-origin
   * runtime at <runtimeBase>circuitjs.html and picks the bridge when
   * present. Never throws: on any probe failure the preview adapter keeps
   * the workflow alive.
   */
  async function createCircuitAdapter(options) {
    options = options || {};
    var scenarioApi = options.scenarioApi || SCENARIO_API;
    var runtimeBase = options.runtimeBase || "circuitjs/";
    var probe = options.probe || (
      typeof fetch === "function"
        ? function () {
            return fetch(runtimeBase + "circuitjs.html", { method: "HEAD" })
              .then(function (r) { return r.ok; })
              .catch(function () { return false; });
          }
        : function () { return Promise.resolve(false); }
    );

    var runtimePresent = await probe();
    if (!runtimePresent) {
      return new DeterministicPreviewAdapter({ scenarioApi: scenarioApi });
    }
    var adapter = new CircuitJS1BridgeAdapter({ scenarioApi: scenarioApi });
    if (options.iframe) {
      await adapter.connect(options.iframe);
    }
    // The iframe may be mounted later; loadBranch/connect can run then.
    return adapter;
  }

  return {
    DeterministicPreviewAdapter: DeterministicPreviewAdapter,
    CircuitJS1BridgeAdapter: CircuitJS1BridgeAdapter,
    createCircuitAdapter: createCircuitAdapter
  };
});
