#!/usr/bin/env node
/*
 * Project integrity check.
 *
 * Verifies that the repository still matches what the README promises:
 * file structure, script wiring, the WebMCP tools, scenario invariants,
 * circuit strings, licensing, and a full engine walkthrough on the preview
 * adapter. Exits non-zero on the first broken promise.
 *
 * Run: npm run check
 */
import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const problems = [];
function check(cond, message) {
  if (!cond) problems.push(message);
}

/* ---------- structure ---------- */

const expectedFiles = [
  "README.md",
  "index.html",
  "src/scenario.js",
  "src/circuit-adapter.js",
  "src/diagnostic-engine.js",
  "src/workspace.js",
  "src/webmcp.js",
  "src/ui.js",
  "src/main.js",
  "src/styles.css",
  "tests/diagnostic-engine.test.js",
  "tests/editor-bridge.test.js",
  "scripts/server.mjs",
  "scripts/install-circuitjs.sh",
  "scripts/build-circuitjs-bridge.sh",
  "scripts/check-project.mjs",
  "vendor/circuitjs1/README.md",
  "vendor/circuitjs1/service-worker.js",
  "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/AgentBridge.java",
  "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/JSInterface.java",
  "circuitjs/README.md",
  "circuitjs/service-worker.js",
  "docs/preview-initial.png",
  "docs/preview-complete.png",
  "docs/agent-bridge.md",
  "UPSTREAM.md",
  "LICENSE",
  "package.json"
];
for (const f of expectedFiles) {
  check(existsSync(resolve(ROOT, f)), `missing file: ${f}`);
}

/* ---------- index.html wiring ---------- */

const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
for (const src of [
  "src/scenario.js",
  "src/circuit-adapter.js",
  "src/diagnostic-engine.js",
  "src/workspace.js",
  "src/webmcp.js",
  "src/ui.js",
  "src/main.js"
]) {
  check(html.includes(`src="${src}"`) || html.includes(`"${src}"`), `index.html does not load ${src}`);
}
check(html.includes("src/styles.css"), "index.html does not load src/styles.css");
check(html.includes("<h1>empeirik</h1>"), "index.html must use the empeirik product name");
check(html.includes('id="import-circuit"'), "workspace must expose Import");
check(html.includes('id="export-circuit"'), "workspace must expose Export");
check(html.includes('id="circuit-import-input"'), "Import must use a real local file input");
check(html.includes(".circuitjs,.txt,.xml"), "Import must advertise the three supported circuit file extensions");
for (const benchId of ["investigation-bench", "evidence-bench", "hypothesis-bench", "repair-bench"]) {
  check(html.includes(`id="${benchId}"`), `workspace must expose ${benchId}`);
}
for (const format of ["circuitjs", "text", "svg", "png"]) {
  check(html.includes(`data-export-format="${format}"`), `Export picker must expose ${format}`);
}
check(!html.includes("copy-prompt"), "the redundant prompt card must not remain in the page");
check(!html.includes("toggle-simulation"), "the outer duplicate simulation button must not remain");
check(!html.includes("simulator-status"), "the simulator noise strip must not remain");
check(!html.includes("Agent-enabled CircuitJS1"), "the redundant product tagline must not remain");
check(!html.includes("mode-switch"), "the workspace must not split building and diagnosis into UI modes");
check(!html.includes('id="webmcp-badge"'), "WebMCP status must not consume permanent UI space");
check(!html.includes("session-header"), "the redundant session status intro must not remain");
check(!html.includes("session-footer"), "licensing and upstream credits belong in project documentation, not the workspace");

/* ---------- package.json scripts ---------- */

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
check(pkg.name === "empeirik", "package.json name must be empeirik");
for (const scriptName of ["start", "test", "check", "install:circuitjs", "build:circuitjs-bridge"]) {
  check(typeof pkg.scripts[scriptName] === "string", `package.json missing script: ${scriptName}`);
}
check(pkg.license === "GPL-2.0-or-later", "package.json license must be GPL-2.0-or-later");

/* ---------- WebMCP tools ---------- */

const webmcp = require("../src/webmcp.js");
const expectedTools = [
  "get_workspace",
  "start_session",
  "inspect_circuit",
  "load_circuit",
  "restore_circuit_version",
  "measure_node",
  "set_simulation_running",
  "record_note",
  "finish_session",
  "get_circuit_capabilities",
  "get_circuit_editor_state",
  "add_circuit_element",
  "edit_circuit_element",
  "move_circuit_element",
  "remove_circuit_elements",
  "split_circuit_wire",
  "select_circuit_elements",
  "set_circuit_element_control",
  "execute_circuit_command",
  "configure_circuit_adjustable",
  "set_circuit_option",
  "set_circuit_ui_control",
  "set_circuit_view",
  "set_circuit_scope_property",
  "set_global_circuit_property",
  "apply_circuit_actions",
  "undo_circuit_edit",
  "redo_circuit_edit",
  "reset_circuit_simulation",
  "get_diagnostic_state",
  "inspect_component",
  "trace_signal_path",
  "request_measurement",
  "propose_hypothesis",
  "update_hypothesis",
  "stage_repair",
  "request_repair_simulation",
  "verify_device_behavior"
];
check(webmcp.TOOL_DEFINITIONS.length === expectedTools.length, `expected exactly ${expectedTools.length} WebMCP tools`);
check(
  JSON.stringify(webmcp.TOOL_DEFINITIONS.map((d) => d.name)) === JSON.stringify(expectedTools),
  "WebMCP tool names/order do not match the documented list"
);
const startSessionDefinition = webmcp.TOOL_DEFINITIONS.find((d) => d.name === "start_session");
check(!Object.prototype.hasOwnProperty.call(startSessionDefinition.inputSchema.properties, "mode"), "start_session must use one unified workflow");
check(JSON.stringify(startSessionDefinition.inputSchema.required) === JSON.stringify(["goal"]), "start_session must only require the user's goal");
for (const def of webmcp.TOOL_DEFINITIONS) {
  check(typeof def.description === "string" && def.description.length > 20, `tool ${def.name} needs a description`);
  check(typeof def.title === "string" && def.title.length > 3, `tool ${def.name} needs a human-readable title`);
  check(def.inputSchema && def.inputSchema.type === "object", `tool ${def.name} needs an object inputSchema`);
}
const webmcpSrc = readFileSync(resolve(ROOT, "src/webmcp.js"), "utf8");
check(
  webmcpSrc.includes("modelContext") && webmcpSrc.includes("registerTool"),
  "webmcp.js must register through document.modelContext.registerTool"
);

/* ---------- scenario invariants ---------- */

const scenarioApi = require("../src/scenario.js");
const scenario = scenarioApi.scenario;

const tp1 = scenarioApi.findTestPoint("tp-3v3");
const tp2 = scenarioApi.findTestPoint("tp-reset");
check(Boolean(tp1 && tp2), "scenario must define TP1 (tp-3v3) and TP2 (tp-reset)");

const faulted = scenario.preview.faulted;
const repaired = scenario.preview.repaired;
check(
  faulted["3V3"] >= tp1.expected.min && faulted["3V3"] <= tp1.expected.max,
  "faulted preview: 3V3 must read nominal"
);
check(
  faulted.RESET < tp2.expected.min,
  "faulted preview: RESET must read outside its expected range"
);
check(
  repaired.RESET >= tp2.expected.min && repaired.RESET <= tp2.expected.max,
  "repaired preview: RESET must read within its expected range"
);
check(faulted.board.mcuState === "inactive", "faulted board keeps the MCU inactive");
check(repaired.board.mcuState === "running", "repaired board runs the MCU");

const fault = scenario.hiddenFault;
check(fault.componentId === "c7", "hidden fault must target C7");
check(
  !JSON.stringify(scenario.preview).includes(fault.mode),
  "preview table must not echo the fault mode name"
);
check(!/reset timing branch holds|power rail is valid/i.test(scenario.case.brief), "initial case brief must not reveal the diagnostic answer");

/* ---------- circuit strings ---------- */

for (const branch of ["faulted", "repaired"]) {
  const cs = scenario.circuitStrings[branch];
  check(typeof cs === "string" && cs.length > 0, `circuit string missing for branch ${branch}`);
  check(cs.includes("207") && cs.includes("3V3") && cs.includes("RESET"), `${branch} circuit string needs labeled nodes 3V3 and RESET`);
  check(cs.split("\n")[0].startsWith("$"), `${branch} circuit string needs a '$' header line`);
}
const shortLine = /^r \d+ \d+ \d+ \d+ 0 240$/m;
check(
  shortLine.test(scenario.circuitStrings.faulted),
  "faulted circuit string must carry the 240 Ohm short path as a resistor line"
);
check(
  !shortLine.test(scenario.circuitStrings.repaired),
  "repaired circuit string must not carry the short path"
);

const adapterSrc = readFileSync(resolve(ROOT, "src/circuit-adapter.js"), "utf8");
check(adapterSrc.includes("oncircuitjsloaded"), "adapter must use the documented oncircuitjsloaded handshake");
check(adapterSrc.includes("importCircuit"), "adapter must use importCircuit");
check(adapterSrc.includes("getNodeVoltage"), "adapter must use getNodeVoltage");
check(adapterSrc.includes("exportCircuitSvg") && adapterSrc.includes("getCircuitAsSVG"), "adapter must expose native CircuitJS1 SVG export");
check(adapterSrc.includes("applyEditorActions"), "adapter must expose atomic CircuitJS1 editor actions");
check(adapterSrc.includes("EDITOR_ROLLBACK_FAILED"), "adapter must guard failed editor-action rollback");

const nativeBridge = readFileSync(
  resolve(ROOT, "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/AgentBridge.java"),
  "utf8"
);
check(nativeBridge.includes("app.constructElement"), "native bridge must use CircuitJS1's real element factory");
check(nativeBridge.includes("editable.getEditInfo"), "native bridge must expose generic CircuitJS1 edit fields");
check(nativeBridge.includes("app.commands.menuPerformed"), "native bridge must route real CircuitJS1 commands");
check(nativeBridge.includes("splitWire"), "native bridge must expose deterministic wire splitting");
check(nativeBridge.includes("createAdjustable"), "native bridge must create configurable property sliders");
check(nativeBridge.includes("adjustable: adjustable"), "editable fields must report adjustable-slider eligibility");
check(nativeBridge.includes("driver.execute()"), "adjustable controls must update every property sharing the slider");
check(nativeBridge.includes("updateAdjustable"), "native bridge must update configurable property sliders");
check(nativeBridge.includes("removeAdjustable"), "native bridge must remove configurable property sliders");
check(nativeBridge.includes("$wnd.CircuitJS1.editor"), "native bridge must install CircuitJS1.editor");
check(!nativeBridge.includes("ce.dump()"), "read-only element inspection must not call side-effecting legacy dump methods");
const nativeEntry = readFileSync(
  resolve(ROOT, "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/JSInterface.java"),
  "utf8"
);
check(nativeEntry.includes("agentBridge.install()"), "CircuitJS1 load hook must install the editor bridge");

/* ---------- engine walkthrough ---------- */

const adapterApi = require("../src/circuit-adapter.js");
const engineApi = require("../src/diagnostic-engine.js");
const adapter = new adapterApi.DeterministicPreviewAdapter({ scenarioApi });
const engine = new engineApi.DiagnosticEngine({ scenarioApi, adapter });

check(engine.state.revision === 0, "engine opens at revision 0");
check(engine.state.scenarioId === scenario.case.id, "engine opens the scenario case");
check(engine.state.timeline.length === 1 && engine.state.timeline[0].actor === "system", "case-open event recorded");

async function walkthrough() {
  const req = async (tp) => {
    const r = await engine.requestMeasurement(
      { testPointId: tp, measurementType: "dc_voltage", rationale: "check" },
      { actor: "agent" }
    );
    await engine.performMeasurement({ taskId: r.taskId }, { actor: "human" });
  };
  await req("tp-3v3");
  await req("tp-reset");
  await engine.traceSignalPath({ netId: "reset" }, { actor: "agent" });
  await engine.proposeHypothesis(
    { statement: "C7 short holds RESET low.", evidence: ["m1", "m2"] },
    { actor: "agent" }
  );
  await engine.inspectComponent({ componentId: "c7" }, { actor: "agent" });
  await engine.stageRepair(
    { componentId: "c7", rationale: "bracketed by two readings", evidence: ["m1", "m2"] },
    { actor: "agent" }
  );
  await engine.requestRepairSimulation({}, { actor: "agent" });
  const task = engine.state.humanTasks.find((t) => t.type === "repair-approval" && t.status === "pending");
  await engine.approveRepairSimulation({ taskId: task.id }, { actor: "human" });
  const v = await engine.verifyDeviceBehavior({}, { actor: "agent" });
  return v;
}

const result = await walkthrough();
check(result.verification.status === "passed", "preview walkthrough must verify");
check(engine.state.phase === "verified", "walkthrough must reach the verified phase");
check(engine.state.branches.faulted.preserved === true, "faulted branch must be preserved");
check(engine.state.revision === 11, `expected revision 11 after the walkthrough, got ${engine.state.revision}`);

/* ---------- single-workspace wiring (static) ---------- */

const mainSrc = readFileSync(resolve(ROOT, "src/main.js"), "utf8");
check(mainSrc.includes("WorkspaceSession"), "main.js must create the unified workspace session");
check(mainSrc.includes("circuitjs-frame"), "main.js must mount CircuitJS1 as the primary canvas");
check(mainSrc.includes('circuitjs/circuitjs.html"'), "main.js must mount the default CircuitJS1 page");
check(!mainSrc.includes("circuitjs.html?lang="), "CircuitJS1 must use its browser or saved language preference");
check(mainSrc.includes("root.Empeirik"), "main.js must expose the empeirik browser API");
check(mainSrc.includes("getCircuitSvg"), "main.js must wire CircuitJS1 image export");
check(!mainSrc.includes("DEMO_STEPS"), "main.js must not hard-code the old guided demo");
check(!mainSrc.includes("setLastCall"), "main.js must not wire the removed raw tool-call inspector");

const uiSrc = readFileSync(resolve(ROOT, "src/ui.js"), "utf8");
check(uiSrc.includes("createUI"), "ui.js must export createUI");
check(uiSrc.includes('callHandler("importCircuit"'), "Import must load the selected circuit through the workspace");
check(!uiSrc.includes("setModeUI") && !uiSrc.includes("WebMCP preview"), "UI code must not retain removed mode or WebMCP status chrome");
check(!uiSrc.includes("setLastCall") && !uiSrc.includes("workspace-revision"), "UI code must not retain raw call or visible revision chrome");
check(uiSrc.includes("renderInvestigation") && uiSrc.includes("renderEvidence") && uiSrc.includes("renderHypotheses") && uiSrc.includes("renderRepairBench"), "UI must render all four expandable benches");
check(uiSrc.includes("svgToPngBlob") && uiSrc.includes("downloadBlob"), "UI must provide downloadable image and circuit exports");
const styles = readFileSync(resolve(ROOT, "src/styles.css"), "utf8");
check(styles.includes(".session-body") && styles.includes("minmax(190px, 1.1fr) minmax(210px, 0.9fr)"), "session panel must keep fixed work-log and bench rows");
check(styles.includes('"activity"') && styles.includes("grid-area: activity"), "hidden session rows must not displace the work-log viewport");
check(styles.includes(".session-feed") && styles.includes("overflow-y: auto") && styles.includes("mask-image"), "work log must be an internally scrolling masked viewport");
check(styles.includes(".bench-section") && styles.includes(".bench summary"), "diagnostic benches must be expandable beneath the work log");
const palette = Array.from(new Set((styles.match(/#[0-9a-fA-F]{6}/g) || []).map((color) => color.toLowerCase()))).sort();
check(JSON.stringify(palette) === JSON.stringify(["#3f3d3a", "#d8794d", "#f7f3eb"].sort()), "outer workspace must use only the logo's charcoal, orange, and cream colors");
check(!html.includes("Guided view"), "the duplicate guided canvas must not remain in the page");
check(!html.includes("Diagnostic state"), "the abstract diagnostic-state screen must not remain in the page");
check(!html.includes("Collaboration console"), "the separate collaboration console must not remain in the page");
check(!html.includes("workspace-revision") && !html.includes("Latest WebMCP call") && !html.includes("tool-details"), "revision and raw tool-call debug chrome must not remain in the page");

/* ---------- licensing ---------- */

const license = readFileSync(resolve(ROOT, "LICENSE"), "utf8");
check(license.includes("GNU GENERAL PUBLIC LICENSE"), "LICENSE must contain the GPLv2 text");
check(license.includes("version 2 or (at your option) any later version"), "LICENSE must state GPL-2.0-or-later");
const upstream = readFileSync(resolve(ROOT, "UPSTREAM.md"), "utf8");
check(upstream.includes("Falstad") || upstream.includes("falstad"), "UPSTREAM.md must credit CircuitJS1");

/* ---------- report ---------- */

if (problems.length) {
  console.error("check-project: FAILED");
  for (const p of problems) console.error("  - " + p);
  process.exit(1);
} else {
  console.log("check-project: OK");
  console.log(`  files: ${expectedFiles.length}, tools: ${expectedTools.length}, one CircuitJS-first workspace`);
  console.log("  engine walkthrough on preview adapter: verified in simulation");
}
