#!/usr/bin/env node
/*
 * Node-based tests for the empeirik diagnostic state machine.
 *
 * Run: npm test
 *
 * Covers the behaviours the README promises:
 *   - measurement request versus human execution
 *   - measurement classification
 *   - stale revision rejection without mutation
 *   - evidence requirements for hypotheses
 *   - minimum evidence requirements for repairs
 *   - branch preservation
 *   - repair simulation (with human approval)
 *   - simulation-contract verification
 * plus the full eleven-step guided walkthrough and guard-rail errors.
 */
(function () {
  "use strict";

  var scenarioApi = require("../src/scenario.js");
  var adapterApi = require("../src/circuit-adapter.js");
  var engineApi = require("../src/diagnostic-engine.js");
  var workspaceApi = require("../src/workspace.js");

  var passed = 0;
  var failed = 0;
  var failures = [];

  function assert(cond, msg) {
    if (!cond) throw new Error(msg || "assertion failed");
  }

  function assertEq(actual, expected, msg) {
    if (actual !== expected) {
      throw new Error(
        (msg || "assertEq") + ": expected " + JSON.stringify(expected) +
        ", got " + JSON.stringify(actual)
      );
    }
  }

  function test(name, fn) {
    return Promise.resolve()
      .then(fn)
      .then(function () {
        passed += 1;
        console.log("  ok   " + name);
      })
      .catch(function (e) {
        failed += 1;
        failures.push({ name: name, error: e });
        console.log("  FAIL " + name + " :: " + (e && e.message));
      });
  }

  async function expectErrorCode(code, promise) {
    try {
      await promise;
    } catch (e) {
      if (e.code !== code) {
        throw new Error("expected error " + code + ", got " + e.code + " (" + e.message + ")");
      }
      return e;
    }
    throw new Error("expected error " + code + ", but the call succeeded");
  }

  function freshEngine() {
    var adapter = new adapterApi.DeterministicPreviewAdapter({ scenarioApi: scenarioApi });
    var engine = new engineApi.DiagnosticEngine({ scenarioApi: scenarioApi, adapter: adapter });
    return { engine: engine, adapter: adapter };
  }

  /* Helpers that walk the canonical happy path. */
  async function requestAndPerform(engine, testPointId, rationale) {
    var req = await engine.requestMeasurement(
      { testPointId: testPointId, measurementType: "dc_voltage", rationale: rationale },
      { actor: "agent" }
    );
    return engine.performMeasurement({ taskId: req.taskId }, { actor: "human" });
  }

  async function runFullWalkthrough(engine) {
    var out = {};
    out.m1 = await requestAndPerform(
      engine, "tp-3v3", "Confirm the supply before checking anything downstream."
    );
    out.m2 = await requestAndPerform(
      engine, "tp-reset", "Rail is valid; check the reset release branch."
    );
    out.trace = await engine.traceSignalPath({ netId: "reset" }, { actor: "agent" });
    out.h1 = await engine.proposeHypothesis(
      {
        statement: "C7 has an internal resistive short holding RESET low.",
        evidence: ["m1", "m2"],
        alternatives: [
          { label: "R12 pull-up open" },
          { label: "U1 nRESET input clamped low" }
        ]
      },
      { actor: "agent" }
    );
    out.inspect = await engine.inspectComponent({ componentId: "c7" }, { actor: "agent" });
    out.repair = await engine.stageRepair(
      {
        componentId: "c7",
        action: "replace",
        newPart: "100 nF X7R 0603 16 V",
        rationale: "Supply valid at TP1 while RESET is stuck at 0.08 V; C7 is the only low-side element besides the U1 input.",
        evidence: ["m1", "m2"],
        hypothesisId: "h1"
      },
      { actor: "agent" }
    );
    out.approval = await engine.requestRepairSimulation({}, { actor: "agent" });
    var task = engine.state.humanTasks.filter(function (t) {
      return t.type === "repair-approval" && t.status === "pending";
    })[0];
    out.simulation = await engine.approveRepairSimulation(
      { taskId: task.id }, { actor: "human" }
    );
    out.verification = await engine.verifyDeviceBehavior({}, { actor: "agent" });
    return out;
  }

  var tests = [];

  /* ---------------- 1. request vs execution ---------------- */

  tests.push(function () {
    return test("measurement request creates a human task and hides the reading", async function () {
      var f = freshEngine();
      var e = f.engine;
      var req = await e.requestMeasurement(
        { testPointId: "tp-3v3", measurementType: "dc_voltage", rationale: "check supply" },
        { actor: "agent" }
      );
      assertEq(req.status, "pending-human-action", "request status");
      assert(!("value" in req), "request result must not contain a value");
      var m = e.state.measurements[0];
      assertEq(m.performed, false, "measurement starts unperformed");
      assertEq(e.state.humanTasks.length, 1, "one pending human task");
      assertEq(e.state.humanTasks[0].type, "measurement", "task type");
      assertEq(e.state.humanTasks[0].status, "pending", "task pending");

      // The agent cannot perform the measurement.
      await expectErrorCode(
        "ACTOR_FORBIDDEN",
        e.performMeasurement({ taskId: req.taskId }, { actor: "agent" })
      );
      assertEq(e.state.humanTasks[0].status, "pending", "task still pending");

      // Only the human reveals the reading.
      var reading = await e.performMeasurement({ taskId: req.taskId }, { actor: "human" });
      assertEq(reading.value, 3.31, "TP1 preview reading");
      assertEq(e.state.humanTasks[0].status, "done", "task done after human action");
    });
  });

  /* ---------------- 2. classification ---------------- */

  tests.push(function () {
    return test("measurements are classified against expected ranges", async function () {
      var f = freshEngine();
      var e = f.engine;
      var m1 = await requestAndPerform(e, "tp-3v3", "supply check");
      var m2 = await requestAndPerform(e, "tp-reset", "reset check");
      assertEq(m1.classification, "nominal", "3.31 V in 3.10-3.50 V is nominal");
      assertEq(m2.classification, "deviation", "0.08 V outside 2.80-3.30 V is a deviation");
      assertEq(e.state.measurements[0].id, "m1", "measurement ids are sequential");
      assertEq(e.state.measurements[1].id, "m2", "measurement ids are sequential");
    });
  });

  /* ---------------- 3. stale revisions ---------------- */

  tests.push(function () {
    return test("stale basedOnRevision is rejected without mutation", async function () {
      var f = freshEngine();
      var e = f.engine;
      assertEq(e.state.revision, 0, "case opens at revision 0");
      await e.requestMeasurement(
        { testPointId: "tp-3v3", basedOnRevision: 0, rationale: "ok" },
        { actor: "agent" }
      );
      assertEq(e.state.revision, 1, "request bumps revision");
      var before = JSON.stringify(e.state);
      await expectErrorCode(
        "STALE_REVISION",
        e.requestMeasurement(
          { testPointId: "tp-reset", basedOnRevision: 0, rationale: "stale" },
          { actor: "agent" }
        )
      );
      assertEq(
        JSON.stringify(e.state), before,
        "a rejected stale action must not mutate any state"
      );
      // Retrying on the current revision succeeds.
      await e.requestMeasurement(
        { testPointId: "tp-reset", basedOnRevision: 1, rationale: "fresh" },
        { actor: "agent" }
      );
      assertEq(e.state.revision, 2, "fresh action bumps revision");
    });
  });

  /* ---------------- 4. hypothesis evidence ---------------- */

  tests.push(function () {
    return test("hypotheses must cite existing, performed measurements", async function () {
      var f = freshEngine();
      var e = f.engine;
      await expectErrorCode(
        "INSUFFICIENT_EVIDENCE",
        e.proposeHypothesis(
          { statement: "Supply is somehow broken.", evidence: [] },
          { actor: "agent" }
        )
      );
      await expectErrorCode(
        "UNKNOWN_MEASUREMENT",
        e.proposeHypothesis(
          { statement: "C7 is shorted somehow.", evidence: ["m99"] },
          { actor: "agent" }
        )
      );
      // Requested but not yet performed cannot be cited either.
      await e.requestMeasurement(
        { testPointId: "tp-3v3", rationale: "x" }, { actor: "agent" }
      );
      await expectErrorCode(
        "EVIDENCE_NOT_READY",
        e.proposeHypothesis(
          { statement: "C7 is shorted somehow.", evidence: ["m1"] },
          { actor: "agent" }
        )
      );
      // Perform the outstanding request, then the same citation is valid.
      await e.performMeasurement({ taskId: "t1" }, { actor: "human" });
      var h = await e.proposeHypothesis(
        { statement: "Rail is valid; fault is downstream of TP1.", evidence: ["m1"] },
        { actor: "agent" }
      );
      assertEq(h.status, "provisional", "fresh hypotheses are explicitly provisional");
    });
  });

  /* ---------------- 5. repair minimum evidence ---------------- */

  tests.push(function () {
    return test("repairs need a rationale and at least two measurements", async function () {
      var f = freshEngine();
      var e = f.engine;
      await requestAndPerform(e, "tp-3v3", "supply");
      await requestAndPerform(e, "tp-reset", "reset");
      await expectErrorCode(
        "RATIONALE_REQUIRED",
        e.stageRepair(
          { componentId: "c7", evidence: ["m1", "m2"] }, { actor: "agent" }
        )
      );
      await expectErrorCode(
        "INSUFFICIENT_EVIDENCE",
        e.stageRepair(
          { componentId: "c7", rationale: "not enough evidence yet", evidence: ["m1"] },
          { actor: "agent" }
        )
      );
      var r = await e.stageRepair(
        {
          componentId: "c7",
          rationale: "Rail valid while RESET is stuck low; C7 is the prime suspect.",
          evidence: ["m1", "m2"]
        },
        { actor: "agent" }
      );
      assertEq(r.approvalStatus, "not-requested", "staging does not simulate anything");
      await expectErrorCode(
        "REPAIR_ALREADY_STAGED",
        e.stageRepair(
          {
            componentId: "u1",
            rationale: "second repair while one is staged",
            evidence: ["m1", "m2"]
          },
          { actor: "agent" }
        )
      );
    });
  });

  /* ---------------- 6+7. approval, simulation, preservation ---------------- */

  tests.push(function () {
    return test("repair simulation requires human approval and preserves branches", async function () {
      var f = freshEngine();
      var e = f.engine;
      await expectErrorCode(
        "REPAIR_NOT_STAGED",
        e.requestRepairSimulation({}, { actor: "agent" })
      );
      await requestAndPerform(e, "tp-3v3", "supply");
      await requestAndPerform(e, "tp-reset", "reset");
      await e.stageRepair(
        {
          componentId: "c7",
          rationale: "Two readings bracket the reset branch.",
          evidence: ["m1", "m2"]
        },
        { actor: "agent" }
      );
      var approval = await e.requestRepairSimulation({}, { actor: "agent" });
      assertEq(approval.status, "pending-human-approval", "approval status");
      var task = e.state.humanTasks.filter(function (t) {
        return t.type === "repair-approval";
      })[0];
      assertEq(task.status, "pending", "approval task pending");

      // The agent cannot approve its own repair.
      await expectErrorCode(
        "ACTOR_FORBIDDEN",
        e.approveRepairSimulation({ taskId: task.id }, { actor: "agent" })
      );
      assertEq(e.state.repair.approvalStatus, "pending", "still pending after agent attempt");

      var sim = await e.approveRepairSimulation({ taskId: task.id }, { actor: "human" });
      assertEq(e.state.activeBranch, "repaired", "approved repair activates the repaired branch");
      assertEq(e.state.repair.approvalStatus, "approved", "approval recorded");
      assertEq(sim.faultedBranchPreserved, true, "faulted branch reported preserved");
      assertEq(e.state.branches.faulted.preserved, true, "engine marks faulted branch preserved");
      assertEq(e.state.repair.originalBranchPreserved, true, "repair record keeps the original");
      assertEq(e.state.phase, "repair", "phase moves to repair");
      // The original branch still reads faulted values.
      var faulted = await f.adapter.readNodeVoltage("RESET", "faulted");
      assertEq(faulted.value, 0.08, "faulted branch readings remain available");
      // Second approval attempt is refused.
      await expectErrorCode(
        "TASK_ALREADY_DONE",
        e.approveRepairSimulation({ taskId: task.id }, { actor: "human" })
      );
    });
  });

  /* ---------------- 8. verification ---------------- */

  tests.push(function () {
    return test("verification is an explicit, simulation-only contract", async function () {
      var f = freshEngine();
      var e = f.engine;
      await requestAndPerform(e, "tp-3v3", "supply");
      await requestAndPerform(e, "tp-reset", "reset");
      await expectErrorCode(
        "REPAIR_NOT_SIMULATED",
        e.verifyDeviceBehavior({}, { actor: "agent" })
      );
      await e.stageRepair(
        { componentId: "c7", rationale: "bracketed by two readings", evidence: ["m1", "m2"] },
        { actor: "agent" }
      );
      await expectErrorCode(
        "REPAIR_NOT_SIMULATED",
        e.verifyDeviceBehavior({}, { actor: "agent" })
      );
      await e.requestRepairSimulation({}, { actor: "agent" });
      var task = e.state.humanTasks.filter(function (t) {
        return t.type === "repair-approval";
      })[0];
      await e.approveRepairSimulation({ taskId: task.id }, { actor: "human" });

      var v = await e.verifyDeviceBehavior({}, { actor: "agent" });
      var verification = v.verification;
      assertEq(verification.status, "passed", "preview branch passes its contract");
      assertEq(verification.scope, "simulation-only", "scope label");
      assertEq(verification.checks.length, 3, "three separate checks");
      verification.checks.forEach(function (c) {
        assertEq(c.passed, true, "check '" + c.id + "' passes");
      });
      assert(
        /simulation/i.test(v.disclaimer),
        "result carries the simulation-only disclaimer"
      );
      assertEq(e.state.phase, "verified", "phase reaches verified");
    });
  });

  /* ---------------- full walkthrough ---------------- */

  tests.push(function () {
    return test("the eleven-step walkthrough reaches a verified, auditable state", async function () {
      var f = freshEngine();
      var e = f.engine;
      var out = await runFullWalkthrough(e);

      assertEq(e.state.revision, 11, "each of the 11 steps bumps the revision once");
      assertEq(e.state.timeline.length, 12, "12 events including the system case-open");
      assertEq(e.state.phase, "verified", "final phase");

      var actors = e.state.timeline.map(function (t) { return t.actor; });
      assertEq(
        actors.join(","),
        "system,agent,human,agent,human,agent,agent,agent,agent,agent,human,agent",
        "timeline alternates actors exactly as the demo does"
      );

      assertEq(out.m1.value, 3.31, "m1 TP1 reading");
      assertEq(out.m2.value, 0.08, "m2 TP2 reading");
      assertEq(out.h1.hypothesisId, "h1", "hypothesis id");

      var h1 = e.state.hypotheses[0];
      assertEq(h1.status, "confirmed-in-simulation", "hypothesis confirmed by verification");
      h1.alternatives.forEach(function (a) {
        assertEq(a.status, "excluded", "alternatives excluded after passing simulation");
      });

      assertEq(e.state.verification.hypothesisId, "h1", "verification references the hypothesis");
      assertEq(
        e.state.repair.simulation.readings.RESET.value, 3.29,
        "repaired branch RESET reading"
      );
      assertEq(e.state.board.mcuState, "running", "MCU leaves reset on the repaired branch");
      assertEq(e.state.board.statusOutput, "blinking", "status LED blinks after repair");
    });
  });

  /* ---------------- guard rails ---------------- */

  tests.push(function () {
    return test("guard rails reject unknown entities and illegal transitions", async function () {
      var f = freshEngine();
      var e = f.engine;
      await expectErrorCode(
        "UNKNOWN_TEST_POINT",
        e.requestMeasurement({ testPointId: "tp-999" }, { actor: "agent" })
      );
      await expectErrorCode(
        "UNSUPPORTED_MEASUREMENT",
        e.requestMeasurement(
          { testPointId: "tp-3v3", measurementType: "continuity" }, { actor: "agent" }
        )
      );
      await expectErrorCode(
        "UNKNOWN_COMPONENT",
        e.inspectComponent({ componentId: "x99" }, { actor: "agent" })
      );
      await expectErrorCode(
        "UNKNOWN_NET",
        e.traceSignalPath({ netId: "does-not-exist" }, { actor: "agent" })
      );
      await e.requestMeasurement(
        { testPointId: "tp-3v3", rationale: "first" }, { actor: "agent" }
      );
      await expectErrorCode(
        "MEASUREMENT_PENDING",
        e.requestMeasurement(
          { testPointId: "tp-3v3", rationale: "duplicate" }, { actor: "agent" }
        )
      );
      await expectErrorCode(
        "UNKNOWN_HYPOTHESIS",
        e.updateHypothesis({ hypothesisId: "h9", status: "rejected" }, { actor: "agent" })
      );
      // Clear the outstanding task, then gather evidence for the hypothesis.
      await e.performMeasurement({ taskId: "t1" }, { actor: "human" });
      await requestAndPerform(e, "tp-reset", "reset");
      await requestAndPerform(e, "tp-reset", "reset");
      await e.proposeHypothesis(
        { statement: "C7 short holds RESET low.", evidence: ["m1", "m2"] },
        { actor: "agent" }
      );
      await expectErrorCode(
        "VERIFICATION_REQUIRED",
        e.updateHypothesis(
          { hypothesisId: "h1", status: "confirmed-in-simulation" }, { actor: "agent" }
        )
      );
    });
  });

  /* ---------------- state hygiene ---------------- */

  tests.push(function () {
    return test("agent-visible state never contains the hidden fault", async function () {
      var f = freshEngine();
      var e = f.engine;
      await runFullWalkthrough(e);
      var snapshot = JSON.stringify(e.getDiagnosticState());
      assert(
        snapshot.indexOf("resistive-short") === -1,
        "state must not leak the fault mode"
      );
      assert(
        snapshot.indexOf("shortOhms") === -1,
        "state must not leak the fault parameter"
      );
      assert(
        snapshot.indexOf("240") === -1,
        "state must not leak the short resistance value"
      );
    });
  });

  /* ---------------- repair-model correctness ---------------- */

  tests.push(function () {
    return test("a staged repair must match the circuit branch that will be simulated", async function () {
      var f = freshEngine();
      var e = f.engine;
      await requestAndPerform(e, "tp-3v3", "supply");
      await requestAndPerform(e, "tp-reset", "reset");
      await expectErrorCode(
        "UNSUPPORTED_REPAIR_MODEL",
        e.stageRepair(
          {
            componentId: "u1",
            action: "replace",
            rationale: "Test that an unrelated component cannot select the known repaired branch.",
            evidence: ["m1", "m2"]
          },
          { actor: "agent" }
        )
      );
      assertEq(e.state.repair, null, "unsupported repair leaves no staged repair");

      var staged = await e.stageRepair(
        {
          componentId: "c7",
          action: "replace",
          rationale: "Two readings isolate the reset timing path.",
          evidence: ["m1", "m2"]
        },
        { actor: "agent" }
      );
      await expectErrorCode(
        "REPAIR_MISMATCH",
        e.requestRepairSimulation({ repairId: "r999" }, { actor: "agent" })
      );
      assertEq(staged.repairId, "r1", "supported model is staged normally");
    });
  });

  tests.push(function () {
    return test("the human can decline a proposed repair simulation", async function () {
      var f = freshEngine();
      var e = f.engine;
      await requestAndPerform(e, "tp-3v3", "supply");
      await requestAndPerform(e, "tp-reset", "reset");
      await e.stageRepair(
        {
          componentId: "c7",
          rationale: "Two readings isolate the reset timing path.",
          evidence: ["m1", "m2"]
        },
        { actor: "agent" }
      );
      await e.requestRepairSimulation({ repairId: "r1" }, { actor: "agent" });
      var task = e.state.humanTasks.filter(function (item) {
        return item.type === "repair-approval" && item.status === "pending";
      })[0];
      var declined = await e.declineRepairSimulation(
        { taskId: task.id, reason: "Try a non-invasive test first." },
        { actor: "human" }
      );
      assertEq(declined.status, "declined", "decline result");
      assertEq(e.state.activeBranch, "faulted", "declining never changes the active circuit");
      assertEq(e.state.repair.approvalStatus, "declined", "decision is visible in state");
    });
  });

  /* ---------------- generic CircuitJS workspace ---------------- */

  tests.push(function () {
    return test("workspace uses one session for building, diagnosis, and circuit restore", async function () {
      var adapter = new adapterApi.DeterministicPreviewAdapter({ scenarioApi: scenarioApi });
      var workspace = new workspaceApi.WorkspaceSession({
        scenarioApi: scenarioApi,
        adapter: adapter
      });
      var started = await workspace.startSession(
        {
          goal: "Build and verify a healthy reset-release circuit.",
          basedOnRevision: 0
        },
        { actor: "agent" }
      );
      assertEq(typeof started.mode, "undefined", "workspace does not expose a build/diagnose mode");
      assertEq(started.status, "active", "session becomes active");

      var loaded = await workspace.loadCircuit(
        {
          circuitText: scenarioApi.scenario.circuitStrings.repaired,
          circuitName: "Healthy reset circuit",
          summary: "Removed the modeled leakage path.",
          basedOnRevision: workspace.state.revision
        },
        { actor: "agent" }
      );
      assertEq(loaded.savedVersion, "v1", "the original circuit is preserved");
      var measured = await workspace.measureNode(
        {
          node: "RESET",
          reason: "Verify that reset reaches a valid logic high.",
          basedOnRevision: workspace.state.revision
        },
        { actor: "agent" }
      );
      assertEq(measured.value, 3.29, "workspace reads the active simulated circuit");

      var inspected = await workspace.inspectCircuit(
        { basedOnRevision: workspace.state.revision },
        { actor: "agent" }
      );
      assert(inspected.circuitText.indexOf("RESET") !== -1, "inspection returns CircuitJS text");
      assert(inspected.elementCount > 0, "inspection returns concrete circuit elements");

      await workspace.restoreVersion(
        { versionId: "v1", basedOnRevision: workspace.state.revision },
        { actor: "agent" }
      );
      var original = await workspace.measureNode(
        {
          node: "RESET",
          reason: "Confirm the original version was restored.",
          basedOnRevision: workspace.state.revision
        },
        { actor: "agent" }
      );
      assertEq(original.value, 0.08, "restore returns to the preserved original circuit");
    });
  });

  /* ---------------- run ---------------- */

  (async function () {
    console.log("empeirik diagnostic-engine tests\n");
    for (var i = 0; i < tests.length; i++) {
      await tests[i]();
    }
    console.log("\n" + passed + " passed, " + failed + " failed");
    if (failed) {
      process.exit(1);
    }
  })().catch(function (e) {
    console.error("test runner crashed:", e);
    process.exit(1);
  });
})();
