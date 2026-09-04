#!/usr/bin/env node
/* Repository-level integrity checks for the static empeirik application. */
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const problems = [];

function check(condition, message) {
  if (!condition) problems.push(message);
}

const expectedFiles = [
  "README.md",
  "index.html",
  "assets/empeirik-logo.png",
  "src/circuit-adapter.js",
  "src/workspace.js",
  "src/webmcp.js",
  "src/ui.js",
  "src/main.js",
  "src/styles.css",
  "src/circuitjs-theme.css",
  "scripts/server.mjs",
  "scripts/build-circuitjs-bridge.sh",
  "scripts/build-pages.mjs",
  ".github/workflows/pages.yml",
  "vendor/circuitjs1/empeirik-canvas-theme.patch",
  "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/AgentBridge.java",
  "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/JSInterface.java",
  "circuitjs/circuitjs.html",
  "circuitjs/circuitjs1/circuits/blank.txt",
  "UPSTREAM.md",
  "LICENSE",
  "package.json"
];
for (const file of expectedFiles) check(existsSync(resolve(ROOT, file)), `missing file: ${file}`);
check(!existsSync(resolve(ROOT, "src/scenario.js")), "sample scenario must not ship");
check(!existsSync(resolve(ROOT, "src/diagnostic-engine.js")), "sample diagnostic engine must not ship");

const html = readFileSync(resolve(ROOT, "index.html"), "utf8");
for (const source of [
  "src/circuit-adapter.js",
  "src/workspace.js",
  "src/webmcp.js",
  "src/ui.js",
  "src/main.js"
]) {
  check(html.includes(`src="${source}"`), `index.html does not load ${source}`);
}
check(!html.includes("scenario.js") && !html.includes("diagnostic-engine.js"), "index.html must not load sample data modules");
check(html.includes('href="assets/empeirik-logo.png"'), "index.html must use the supplied Empeirik PNG as favicon");
const favicon = readFileSync(resolve(ROOT, "assets/empeirik-logo.png"));
check(favicon.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), "favicon must be a valid PNG");
check(html.includes("<title>Circuit workspace</title>"), "browser title must describe the workspace without product chrome");
check(!html.includes('class="topbar"') && !html.includes("<h1>"), "visible project header and name must stay removed");
for (const benchId of ["investigation-bench", "evidence-bench", "hypothesis-bench", "repair-bench"]) {
  check(html.includes(`id="${benchId}"`), `workspace must expose ${benchId}`);
}
check(/data-bench="work-log" open/.test(html), "Work log must be open by default");
for (const removed of ["new-session", "import-circuit", "export-circuit", "copy-prompt", "toggle-simulation", "simulator-status", "mode-switch", "webmcp-badge", "session-header", "session-footer"]) {
  check(!html.includes(removed), `removed UI chrome returned: ${removed}`);
}

const pkg = JSON.parse(readFileSync(resolve(ROOT, "package.json"), "utf8"));
check(pkg.name === "empeirik", "package.json name must be empeirik");
check(pkg.license === "GPL-2.0-or-later", "package.json license must be GPL-2.0-or-later");
for (const script of ["start", "check", "build:pages", "build:circuitjs-bridge"]) {
  check(typeof pkg.scripts[script] === "string", `package.json missing script: ${script}`);
}

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
  "record_investigation",
  "record_evidence",
  "propose_hypothesis",
  "update_hypothesis",
  "stage_repair",
  "request_repair_approval",
  "apply_staged_repair",
  "record_repair_result"
];
check(webmcp.TOOL_DEFINITIONS.length === expectedTools.length, `expected exactly ${expectedTools.length} WebMCP tools`);
check(JSON.stringify(webmcp.TOOL_DEFINITIONS.map((definition) => definition.name)) === JSON.stringify(expectedTools), "WebMCP tools do not match the documented surface");
for (const definition of webmcp.TOOL_DEFINITIONS) {
  check(definition.title && definition.title.length > 3, `tool ${definition.name} needs a title`);
  check(definition.description && definition.description.length > 20, `tool ${definition.name} needs a description`);
  check(definition.inputSchema?.type === "object", `tool ${definition.name} needs an object schema`);
}

const runtimeSources = ["src/circuit-adapter.js", "src/workspace.js", "src/webmcp.js", "src/ui.js", "src/main.js"]
  .map((file) => readFileSync(resolve(ROOT, file), "utf8"))
  .join("\n");
for (const sampleMarker of ["Environmental controller", "tp-reset", "tp-3v3", "C7 short", "hiddenFault", "circuitStrings.faulted", "Bundled environmental-controller example"]) {
  check(!runtimeSources.includes(sampleMarker), `sample marker remains in runtime: ${sampleMarker}`);
}

const adapterSource = readFileSync(resolve(ROOT, "src/circuit-adapter.js"), "utf8");
check(adapterSource.includes("oncircuitjsloaded"), "adapter must use CircuitJS1's documented load handshake");
check(adapterSource.includes("getNodeVoltage"), "adapter must expose live node reads");
check(adapterSource.includes("applyEditorActions"), "adapter must expose atomic editor actions");
check(adapterSource.includes("EDITOR_ROLLBACK_FAILED"), "adapter must guard rollback failures");
check(!adapterSource.includes("DeterministicPreviewAdapter"), "deterministic sample adapter must be removed");

const nativeBridge = readFileSync(resolve(ROOT, "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/AgentBridge.java"), "utf8");
for (const token of ["app.constructElement", "editable.getEditInfo", "app.commands.menuPerformed", "splitWire", "createAdjustable", "updateAdjustable", "removeAdjustable", "beginBatch", "commitBatch", "cancelBatch", "atomicBatchUndo", "$wnd.CircuitJS1.editor"]) {
  check(nativeBridge.includes(token), `native bridge missing ${token}`);
}
check(!nativeBridge.includes("ce.dump()"), "read-only inspection must not invoke a side-effecting dump");
const nativeEntry = readFileSync(resolve(ROOT, "vendor/circuitjs1/src/com/lushprojects/circuitjs1/client/JSInterface.java"), "utf8");
check(nativeEntry.includes("agentBridge.install()"), "CircuitJS1 must install the agent bridge");

const styles = readFileSync(resolve(ROOT, "src/styles.css"), "utf8");
check(styles.includes("--divider: 1px solid var(--charcoal)"), "outer circuit dividers must share one 1px token");
const panelStackRule = styles.match(/\.panel-stack\s*\{[^}]*\}/s)?.[0] || "";
check(!panelStackRule.includes("border-top"), "right rail must not add a duplicate circuit-edge divider");
check(!styles.includes(".topbar") && styles.includes("height: 100dvh"), "workspace must fill the viewport after removing the header");
const palette = [...new Set((styles.match(/#[0-9a-fA-F]{6}/g) || []).map((color) => color.toLowerCase()))].sort();
check(JSON.stringify(palette) === JSON.stringify(["#3f3d3a", "#d8794d", "#f7f3eb"].sort()), "outer UI must use only the logo palette");
const circuitTheme = readFileSync(resolve(ROOT, "src/circuitjs-theme.css"), "utf8");
check(circuitTheme.includes("border: 0 !important") && circuitTheme.includes("border-bottom: 1px solid var(--cjs-charcoal)"), "CircuitJS1 stacked chrome must use single 1px seams");

const mainSource = readFileSync(resolve(ROOT, "src/main.js"), "utf8");
check(mainSource.includes("circuitjs.html?startCircuit=blank.txt"), "new sessions must open CircuitJS1's blank circuit");
check(!/scenario|loadExample|faulted|repaired/.test(mainSource), "entry point must not load sample state");
const uiSource = readFileSync(resolve(ROOT, "src/ui.js"), "utf8");
check(uiSource.includes("work-log-empty"), "empty Work log must render a real empty state");
check(uiSource.includes("renderInvestigation") && uiSource.includes("renderEvidence") && uiSource.includes("renderHypotheses") && uiSource.includes("renderRepairBench"), "all session benches must render");

const pagesBuild = readFileSync(resolve(ROOT, "scripts/build-pages.mjs"), "utf8");
check(pagesBuild.includes('"assets"'), "Pages build must publish the favicon asset");
check(pagesBuild.includes(".nojekyll"), "Pages build must disable Jekyll");
check(pagesBuild.includes("contentVersion") && pagesBuild.includes("Cache-coherent asset versions"), "Pages build must content-version runtime assets");
const pagesWorkflow = readFileSync(resolve(ROOT, ".github/workflows/pages.yml"), "utf8");
for (const action of ["actions/configure-pages@v5", "actions/upload-pages-artifact@v4", "actions/deploy-pages@v4", "npm run build:pages"]) {
  check(pagesWorkflow.includes(action), `Pages workflow is missing ${action}`);
}

const adapterApi = require("../src/circuit-adapter.js");
const workspaceApi = require("../src/workspace.js");
const mockAdapter = {
  circuit: adapterApi.BLANK_CIRCUIT,
  running: true,
  describe() { return { mode: "test" }; },
  async exportCircuit() { return this.circuit; },
  async importCircuit(text) { this.circuit = text; this.running = true; },
  async getCircuitSnapshot(options = {}) {
    const snapshot = { source: "test", editorAvailable: true, running: this.running, time: 0, elementCount: 0, elements: [] };
    if (options.includeCircuitText) snapshot.circuitText = this.circuit;
    return snapshot;
  },
  async setSimulationRunning(value) { this.running = value; },
  async readCurrentNodeVoltage() { return { value: 3.3, unit: "V", source: "test" }; },
  async getEditorCapabilities() { return { available: true }; },
  async getEditorState() { return { running: this.running, elements: [] }; },
  async applyEditorActions(actions) {
    this.circuit += `\n# ${actions.length}`;
    return { actionCount: actions.length, changed: true, state: { running: this.running, elements: [] } };
  }
};
const workspace = new workspaceApi.WorkspaceSession({ adapter: mockAdapter });
check(workspace.state.revision === 0 && workspace.state.activity.length === 0, "workspace must start completely empty");
for (const collection of ["measurements", "investigations", "evidence", "hypotheses", "repairs", "humanTasks"]) {
  check(workspace.state[collection].length === 0, `${collection} must start empty`);
}

await workspace.startSession({ goal: "Diagnose the active circuit", basedOnRevision: 0 }, { actor: "agent" });
await workspace.recordInvestigation({ kind: "inspection", title: "Inspect input", detail: "Trace the source path.", basedOnRevision: 1 }, { actor: "agent" });
const evidence = workspace.recordEvidence({ title: "Input is stable", detail: "Simulation reads 3.3 V.", source: "simulation", value: 3.3, unit: "V", basedOnRevision: 2 }, { actor: "agent" });
const hypothesis = workspace.proposeHypothesis({ statement: "The downstream stage is open.", evidenceIds: [evidence.id], alternatives: ["A loading fault"], basedOnRevision: 3 }, { actor: "agent" });
const repair = workspace.stageRepair({ title: "Reconnect downstream stage", rationale: "The measured input is stable.", evidenceIds: [evidence.id], hypothesisId: hypothesis.id, actions: [{ op: "add", type: "WireElm", x1: 0, y1: 0, x2: 16, y2: 0 }], basedOnRevision: 4 }, { actor: "agent" });
const task = workspace.requestRepairApproval({ repairId: repair.id, basedOnRevision: 5 }, { actor: "agent" });
let guarded = false;
try { await workspace.applyStagedRepair({ repairId: repair.id, basedOnRevision: 6 }, { actor: "agent" }); } catch (error) { guarded = error.code === "REPAIR_NOT_APPROVED"; }
check(guarded, "staged repair must reject application before human approval");
workspace.resolveHumanTask(task.id, true, { actor: "human" });
await workspace.applyStagedRepair({ repairId: repair.id, basedOnRevision: 7 }, { actor: "agent" });
workspace.recordRepairResult({ repairId: repair.id, status: "verified-in-simulation", summary: "The simulated output now meets the target.", basedOnRevision: 8 }, { actor: "agent" });
check(workspace.state.hypotheses[0].status === "verified-in-simulation", "verified repair must update its linked hypothesis");
check(workspace.state.revision === 9 && workspace.state.activity.length === 9, "general workflow must produce one revision and log event per successful action");

const license = readFileSync(resolve(ROOT, "LICENSE"), "utf8");
check(license.includes("GNU GENERAL PUBLIC LICENSE"), "LICENSE must contain GPLv2");
const upstream = readFileSync(resolve(ROOT, "UPSTREAM.md"), "utf8");
check(/falstad/i.test(upstream), "UPSTREAM.md must credit CircuitJS1");

if (problems.length) {
  console.error("check-project: FAILED");
  for (const problem of problems) console.error("  - " + problem);
  process.exit(1);
}

console.log("check-project: OK");
console.log(`  files: ${expectedFiles.length}, tools: ${expectedTools.length}, blank startup: verified`);
console.log("  general investigation-to-repair workflow: verified");
