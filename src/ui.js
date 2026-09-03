/*
 * empeirik single-workspace UI.
 *
 * CircuitJS1 is the only circuit canvas. Diagnostic facts, successful
 * workspace changes, and human approvals share one chronological work log;
 * expandable benches provide focused views of that same session data.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.ui = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var doc = root.document;

  function el(id) {
    return doc.getElementById(id);
  }

  function escapeHtml(value) {
    return String(value === null || typeof value === "undefined" ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatTime(iso) {
    var date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function createUI(options) {
    options = options || {};
    var handlers = options.handlers || {};
    var toastTimer = null;
    var currentCircuitName = "circuit";

    function callHandler(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (typeof handlers[name] !== "function") return Promise.resolve();
      try {
        return Promise.resolve(handlers[name].apply(null, args)).catch(function (error) {
          notify(error && error.message ? error.message : String(error), "error");
          if (error && typeof error === "object") error.empeirikNotified = true;
          throw error;
        });
      } catch (error) {
        notify(error && error.message ? error.message : String(error), "error");
        if (error && typeof error === "object") error.empeirikNotified = true;
        return Promise.reject(error);
      }
    }

    function safeFilename(value) {
      var name = String(value || "circuit")
        .trim()
        .replace(/\.(circuitjs|txt|xml)$/i, "")
        .replace(/[^a-z0-9_-]+/gi, "-")
        .replace(/^-+|-+$/g, "");
      return name || "circuit";
    }

    function closeExportMenu() {
      var menu = el("export-menu");
      menu.hidden = true;
      el("export-circuit").setAttribute("aria-expanded", "false");
    }

    function toggleExportMenu() {
      var menu = el("export-menu");
      var opening = menu.hidden;
      menu.hidden = !opening;
      el("export-circuit").setAttribute("aria-expanded", opening ? "true" : "false");
      if (opening) {
        var first = menu.querySelector("button[data-export-format]");
        if (first) first.focus();
      }
    }

    function downloadBlob(content, mimeType, extension) {
      var blob = content instanceof root.Blob
        ? content
        : new root.Blob([content], { type: mimeType });
      var url = root.URL.createObjectURL(blob);
      var link = doc.createElement("a");
      link.href = url;
      link.download = safeFilename(currentCircuitName) + "." + extension;
      doc.body.appendChild(link);
      link.click();
      link.remove();
      root.setTimeout(function () { root.URL.revokeObjectURL(url); }, 0);
    }

    function svgToPngBlob(svg) {
      return new Promise(function (resolve, reject) {
        var source = new root.Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        var url = root.URL.createObjectURL(source);
        var image = new root.Image();
        image.addEventListener("load", function () {
          var width = image.naturalWidth || image.width || 1200;
          var height = image.naturalHeight || image.height || 800;
          var scale = Math.min(2, 2800 / Math.max(width, height));
          var canvas = doc.createElement("canvas");
          canvas.width = Math.max(1, Math.round(width * scale));
          canvas.height = Math.max(1, Math.round(height * scale));
          var context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          root.URL.revokeObjectURL(url);
          canvas.toBlob(function (blob) {
            if (blob) resolve(blob);
            else reject(new Error("The browser could not render the PNG export."));
          }, "image/png");
        });
        image.addEventListener("error", function () {
          root.URL.revokeObjectURL(url);
          reject(new Error("The CircuitJS1 SVG could not be rendered as PNG."));
        });
        image.src = url;
      });
    }

    function exportCircuit(format, button) {
      var imageFormat = format === "svg" || format === "png";
      button.disabled = true;
      return callHandler(imageFormat ? "getCircuitSvg" : "getCircuitText").then(function (data) {
        if (!data) throw new Error("CircuitJS1 returned an empty export.");
        if (format === "png") {
          return svgToPngBlob(data).then(function (blob) {
            downloadBlob(blob, "image/png", "png");
          });
        }
        if (format === "svg") {
          downloadBlob(data, "image/svg+xml;charset=utf-8", "svg");
        } else if (format === "text") {
          downloadBlob(data, "text/plain;charset=utf-8", "txt");
        } else {
          downloadBlob(data, "text/plain;charset=utf-8", "circuitjs");
        }
      }).then(function () {
        closeExportMenu();
        notify("Circuit exported as ." + (format === "text" ? "txt" : format));
      }, function (error) {
        if (!error || !error.empeirikNotified) {
          notify(error && error.message ? error.message : "Could not export the circuit.", "error");
        }
      }).then(function () {
        button.disabled = false;
      });
    }

    function readFile(file) {
      if (file && typeof file.text === "function") return file.text();
      return new Promise(function (resolve, reject) {
        var reader = new root.FileReader();
        reader.addEventListener("load", function () { resolve(String(reader.result || "")); });
        reader.addEventListener("error", function () {
          reject(reader.error || new Error("Could not read the selected circuit file."));
        });
        reader.readAsText(file);
      });
    }

    function notify(message, tone) {
      var toast = el("toast");
      toast.textContent = message;
      toast.className = "toast is-visible" + (tone === "error" ? " is-error" : "");
      if (toastTimer) root.clearTimeout(toastTimer);
      toastTimer = root.setTimeout(function () {
        toast.className = "toast";
      }, 2600);
    }

    function bindEvents() {
      el("new-session").addEventListener("click", function () {
        callHandler("newSession");
      });
      el("import-circuit").addEventListener("click", function () {
        el("circuit-import-input").click();
      });
      el("circuit-import-input").addEventListener("change", function (event) {
        var input = event.currentTarget;
        var file = input.files && input.files[0];
        if (!file) return;
        if (!/\.(circuitjs|txt|xml)$/i.test(file.name)) {
          notify("Import a .circuitjs, .txt, or .xml circuit file.", "error");
          input.value = "";
          return;
        }
        if (file.size > 250000) {
          notify("Circuit imports are limited to 250 kB.", "error");
          input.value = "";
          return;
        }
        var button = el("import-circuit");
        button.disabled = true;
        readFile(file).then(function (text) {
          return callHandler("importCircuit", {
            circuitText: text,
            circuitName: file.name
          }).then(function () {
            notify("Circuit imported");
          }, function () {});
        }, function (error) {
          notify(error && error.message ? error.message : "Could not read the circuit file.", "error");
        }).then(function () {
          input.value = "";
          button.disabled = false;
        });
      });
      el("export-circuit").addEventListener("click", function () {
        toggleExportMenu();
      });
      var exportButtons = el("export-menu").querySelectorAll("button[data-export-format]");
      for (var i = 0; i < exportButtons.length; i++) {
        exportButtons[i].addEventListener("click", function (event) {
          var button = event.currentTarget;
          exportCircuit(button.getAttribute("data-export-format"), button);
        });
      }
      doc.addEventListener("click", function (event) {
        var menu = el("export-menu");
        if (menu.hidden || menu.contains(event.target) || event.target === el("export-circuit")) return;
        closeExportMenu();
      });
      doc.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && !el("export-menu").hidden) {
          closeExportMenu();
          el("export-circuit").focus();
        }
      });
      var benches = doc.querySelectorAll("details.bench");
      for (var j = 0; j < benches.length; j++) {
        benches[j].addEventListener("toggle", function (event) {
          if (!event.currentTarget.open) return;
          for (var index = 0; index < benches.length; index++) {
            if (benches[index] !== event.currentTarget) benches[index].open = false;
          }
        });
      }
    }

    function init() {
      bindEvents();
    }

    function renderPending(diagnostic) {
      var tasks = diagnostic.humanTasks.filter(function (task) {
        return task.status === "pending";
      });
      var section = el("pending-section");
      section.hidden = tasks.length === 0;
      el("pending-count").textContent = String(tasks.length);
      el("pending-actions").innerHTML = tasks.map(function (task) {
        var buttons = task.type === "measurement"
          ? '<button class="button button-solid" data-action="measure" data-task="' +
            escapeHtml(task.id) + '" type="button">Perform measurement</button>'
          : '<div class="approval-actions">' +
            '<button class="button button-solid" data-action="approve" data-task="' +
            escapeHtml(task.id) + '" type="button">Approve simulation</button>' +
            '<button class="button button-quiet" data-action="decline" data-task="' +
            escapeHtml(task.id) + '" type="button">Decline</button></div>';
        return '<article class="pending-card">' +
          '<span class="pending-label">Human decision</span>' +
          '<p>' + escapeHtml(task.instruction) + "</p>" + buttons + "</article>";
      }).join("");

      var buttons = el("pending-actions").querySelectorAll("button[data-action]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", function (event) {
          var button = event.currentTarget;
          var action = button.getAttribute("data-action");
          var taskId = button.getAttribute("data-task");
          button.disabled = true;
          callHandler(action === "measure"
            ? "performMeasurement"
            : action === "approve"
              ? "approveRepair"
              : "declineRepair", taskId);
        });
      }
    }

    function humanActor(actor) {
      return actor === "human" ? "You" : actor === "agent" ? "Agent" : "System";
    }

    function formatReading(value) {
      var number = Number(value);
      if (!isFinite(number)) return String(value || "");
      var digits = Math.abs(number) < 0.1 ? 3 : 2;
      return number.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
    }

    function renderInvestigation(workspace, diagnostic) {
      var allowed = {
        "circuit-inspected": true,
        "component-inspected": true,
        "path-traced": true,
        question: true,
        "next-step": true
      };
      var events = workspace.activity.concat(diagnostic.timeline).filter(function (event) {
        return event.revision > 0 && allowed[event.kind];
      }).sort(function (a, b) {
        return new Date(a.at).getTime() - new Date(b.at).getTime();
      });
      el("investigation-count").textContent = String(events.length);
      el("investigation-bench").innerHTML = events.length ? events.map(function (event) {
        return '<article class="bench-item">' +
          '<div class="bench-meta"><span>' + escapeHtml(humanActor(event.actor)) +
          '</span><time>' + escapeHtml(formatTime(event.at)) + '</time></div>' +
          '<h4>' + escapeHtml(event.title) + '</h4>' +
          (event.detail ? '<p>' + escapeHtml(event.detail) + '</p>' : '') +
        '</article>';
      }).join("") : '<p class="bench-empty">Component inspections, circuit reads, and signal traces will collect here.</p>';
    }

    function renderEvidence(workspace, diagnostic) {
      var evidence = [];
      for (var i = 0; i < workspace.measurements.length; i++) {
        var simulated = workspace.measurements[i];
        evidence.push({
          id: simulated.id,
          title: simulated.node,
          value: formatReading(simulated.value) + " " + simulated.unit,
          status: "Simulation",
          detail: simulated.reason || "Read from the active CircuitJS1 simulation."
        });
      }
      for (var j = 0; j < diagnostic.measurements.length; j++) {
        var measured = diagnostic.measurements[j];
        var expected = measured.expectedRange
          ? "Expected " + formatReading(measured.expectedRange.min) + "–" +
            formatReading(measured.expectedRange.max) + " " + measured.expectedRange.unit + "."
          : measured.rationale;
        evidence.push({
          id: measured.id,
          title: measured.label,
          value: measured.performed ? formatReading(measured.value) + " " + measured.unit : "Awaiting measurement",
          status: measured.performed ? measured.classification : "Requested",
          detail: expected || "Waiting for the human measurement."
        });
      }
      var findingEvents = workspace.activity.filter(function (event) {
        return event.kind === "finding";
      });
      for (var k = 0; k < findingEvents.length; k++) {
        evidence.push({
          id: "Finding",
          title: findingEvents[k].title,
          value: "Recorded",
          status: humanActor(findingEvents[k].actor),
          detail: findingEvents[k].detail
        });
      }
      el("evidence-count").textContent = String(evidence.length);
      el("evidence-bench").innerHTML = evidence.length ? evidence.map(function (item) {
        return '<article class="bench-item">' +
          '<div class="bench-meta"><span>' + escapeHtml(item.id) + '</span><span>' +
            escapeHtml(item.status) + '</span></div>' +
          '<h4>' + escapeHtml(item.title) + '<span class="bench-value">' +
            escapeHtml(item.value) + '</span></h4>' +
          (item.detail ? '<p>' + escapeHtml(item.detail) + '</p>' : '') +
        '</article>';
      }).join("") : '<p class="bench-empty">Measurements and concrete findings will collect here.</p>';
    }

    function renderHypotheses(diagnostic) {
      var hypotheses = diagnostic.hypotheses || [];
      el("hypothesis-count").textContent = String(hypotheses.length);
      el("hypothesis-bench").innerHTML = hypotheses.length ? hypotheses.map(function (hypothesis) {
        var alternatives = (hypothesis.alternatives || []).map(function (alternative) {
          return alternative.label + " (" + alternative.status + ")";
        });
        return '<article class="bench-item">' +
          '<div class="bench-meta"><span>' + escapeHtml(hypothesis.id) + '</span><span>' +
            escapeHtml(hypothesis.status) + '</span></div>' +
          '<h4>' + escapeHtml(hypothesis.statement) + '</h4>' +
          '<p>Evidence: ' + escapeHtml((hypothesis.evidence || []).join(", ") || "none") + '</p>' +
          (alternatives.length ? '<p class="bench-secondary">Alternatives: ' +
            escapeHtml(alternatives.join(" · ")) + '</p>' : '') +
          (hypothesis.note ? '<p class="bench-secondary">' + escapeHtml(hypothesis.note) + '</p>' : '') +
        '</article>';
      }).join("") : '<p class="bench-empty">Evidence-backed explanations will collect here without hiding alternatives.</p>';
    }

    function renderRepairBench(diagnostic) {
      var repair = diagnostic.repair;
      var verification = diagnostic.verification;
      var state = verification && verification.status === "passed"
        ? "Verified"
        : repair ? repair.approvalStatus || "Staged" : "Empty";
      el("repair-state").textContent = state;
      if (!repair) {
        el("repair-bench").innerHTML = '<p class="bench-empty">A staged change, its evidence, approval, and simulation result will appear here.</p>';
        return;
      }
      var html = '<article class="bench-item">' +
        '<div class="bench-meta"><span>' + escapeHtml(repair.id) + '</span><span>' +
          escapeHtml(repair.approvalStatus) + '</span></div>' +
        '<h4>' + escapeHtml(repair.action + " " + repair.componentLabel) + '</h4>' +
        (repair.newPart ? '<p>' + escapeHtml(repair.newPart) + '</p>' : '') +
        '<p class="bench-secondary">' + escapeHtml(repair.rationale) + '</p>' +
        '<p class="bench-secondary">Evidence: ' + escapeHtml((repair.evidence || []).join(", ")) +
          ' · original branch ' + escapeHtml(diagnostic.branches.faulted.preserved ? "preserved" : "not preserved") + '</p>' +
      '</article>';
      if (verification) {
        var checks = verification.checks || [];
        var passed = checks.filter(function (check) { return check.passed; }).length;
        html += '<article class="bench-item">' +
          '<div class="bench-meta"><span>Verification</span><span>' +
            escapeHtml(verification.scope) + '</span></div>' +
          '<h4>Simulation contract ' + escapeHtml(verification.status) + '</h4>' +
          (checks.length ? '<p>' + escapeHtml(passed + "/" + checks.length + " checks passed.") + '</p>' : '') +
          (verification.note ? '<p class="bench-secondary">' + escapeHtml(verification.note) + '</p>' : '') +
        '</article>';
      }
      el("repair-bench").innerHTML = html;
    }

    function eventKindLabel(kind) {
      var labels = {
        "node-measured": "SIMULATION",
        "measurement-performed": "HARDWARE CHECK",
        "measurement-requested": "REQUEST",
        finding: "FINDING",
        decision: "DECISION",
        question: "QUESTION",
        "next-step": "NEXT STEP",
        "circuit-loaded": "CIRCUIT",
        "version-restored": "CIRCUIT",
        "repair-staged": "PROPOSED CHANGE",
        "simulation-approval-requested": "APPROVAL",
        "repair-simulated": "SIMULATION",
        "verified-in-simulation": "VERIFIED"
      };
      return labels[kind] || String(kind || "update").replace(/-/g, " ").toUpperCase();
    }

    function renderFeed(workspace, diagnostic) {
      var feed = el("session-feed");
      var stayAtLatest = feed.childElementCount === 0 ||
        feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
      var events = workspace.activity.slice();
      for (var i = 0; i < diagnostic.timeline.length; i++) {
        if (diagnostic.timeline[i].revision > 0) events.push(diagnostic.timeline[i]);
      }
      events.sort(function (a, b) {
        return new Date(a.at).getTime() - new Date(b.at).getTime();
      });
      el("work-log-count").textContent = String(events.length);
      feed.innerHTML = events.map(function (event) {
        var actor = event.actor === "human"
          ? "You"
          : event.actor === "agent"
            ? "Agent"
            : "System";
        return '<article class="feed-event actor-' + escapeHtml(event.actor) + '">' +
          '<div class="feed-rail"><span></span></div>' +
          '<div class="feed-body">' +
            '<div class="feed-meta">' +
              '<span class="feed-actor">' + actor + "</span>" +
              '<span class="feed-kind">' + escapeHtml(eventKindLabel(event.kind)) + "</span>" +
              '<time>' + escapeHtml(formatTime(event.at)) + "</time>" +
            "</div>" +
            '<h4>' + escapeHtml(event.title) + "</h4>" +
            (event.detail ? '<p>' + escapeHtml(event.detail) + "</p>" : "") +
          "</div>" +
        "</article>";
      }).join("");
      if (stayAtLatest) feed.scrollTop = feed.scrollHeight;
    }

    function render(payload) {
      var workspace = payload.workspace;
      var diagnostic = payload.diagnostic;
      currentCircuitName = workspace.circuitName;
      el("circuit-title").textContent = workspace.circuitName;
      renderPending(diagnostic);
      renderFeed(workspace, diagnostic);
      renderInvestigation(workspace, diagnostic);
      renderEvidence(workspace, diagnostic);
      renderHypotheses(diagnostic);
      renderRepairBench(diagnostic);
    }

    return {
      init: init,
      render: render,
      notify: notify
    };
  }

  return { createUI: createUI };
});
