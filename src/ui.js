/*
 * empeirik single-workspace UI.
 *
 * CircuitJS1 is the only circuit canvas. The right rail renders empty states
 * until real agent or human activity fills the shared workspace session.
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

  function actorLabel(actor) {
    return actor === "human" ? "You" : actor === "agent" ? "Agent" : "System";
  }

  function formatReading(value) {
    var number = Number(value);
    if (!isFinite(number)) return String(value === null || typeof value === "undefined" ? "" : value);
    var digits = Math.abs(number) < 0.1 ? 3 : 2;
    return number.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
  }

  function createUI(options) {
    options = options || {};
    var handlers = options.handlers || {};
    var toastTimer = null;

    function notify(message, tone) {
      var toast = el("toast");
      toast.textContent = message;
      toast.className = "toast is-visible" + (tone === "error" ? " is-error" : "");
      if (toastTimer) root.clearTimeout(toastTimer);
      toastTimer = root.setTimeout(function () { toast.className = "toast"; }, 2600);
    }

    function callHandler(name) {
      var args = Array.prototype.slice.call(arguments, 1);
      if (typeof handlers[name] !== "function") return Promise.resolve();
      try {
        return Promise.resolve(handlers[name].apply(null, args)).catch(function (error) {
          notify(error && error.message ? error.message : String(error), "error");
          throw error;
        });
      } catch (error) {
        notify(error && error.message ? error.message : String(error), "error");
        return Promise.reject(error);
      }
    }

    function bindEvents() {
      var benches = doc.querySelectorAll("details.bench");
      for (var i = 0; i < benches.length; i++) {
        benches[i].addEventListener("toggle", function (event) {
          if (!event.currentTarget.open) return;
          for (var index = 0; index < benches.length; index++) {
            if (benches[index] !== event.currentTarget) benches[index].open = false;
          }
        });
      }
    }

    function renderPending(workspace) {
      var tasks = workspace.humanTasks.filter(function (task) { return task.status === "pending"; });
      var section = el("pending-section");
      section.hidden = tasks.length === 0;
      el("pending-count").textContent = String(tasks.length);
      el("pending-actions").innerHTML = tasks.map(function (task) {
        return '<article class="pending-card">' +
          '<span class="pending-label">Human decision</span>' +
          '<p>' + escapeHtml(task.instruction) + '</p>' +
          '<div class="approval-actions">' +
            '<button class="button button-solid" data-action="approve" data-task="' + escapeHtml(task.id) + '" type="button">Approve simulation</button>' +
            '<button class="button button-quiet" data-action="decline" data-task="' + escapeHtml(task.id) + '" type="button">Decline</button>' +
          '</div>' +
        '</article>';
      }).join("");

      var buttons = el("pending-actions").querySelectorAll("button[data-action]");
      for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", function (event) {
          var button = event.currentTarget;
          button.disabled = true;
          callHandler(
            button.getAttribute("data-action") === "approve" ? "approveRepair" : "declineRepair",
            button.getAttribute("data-task")
          );
        });
      }
    }

    function benchItem(item, right, title, detail, secondary) {
      return '<article class="bench-item">' +
        '<div class="bench-meta"><span>' + escapeHtml(item) + '</span><span>' + escapeHtml(right || "") + '</span></div>' +
        '<h4>' + escapeHtml(title) + '</h4>' +
        (detail ? '<p>' + escapeHtml(detail) + '</p>' : '') +
        (secondary ? '<p class="bench-secondary">' + escapeHtml(secondary) + '</p>' : '') +
      '</article>';
    }

    function renderInvestigation(workspace) {
      var entries = workspace.investigations.slice();
      workspace.activity.filter(function (event) {
        return event.kind === "circuit-inspected";
      }).forEach(function (event) {
        entries.push({
          id: "Inspection",
          kind: "inspection",
          title: event.title,
          detail: event.detail,
          actor: event.actor,
          at: event.at
        });
      });
      entries.sort(function (a, b) { return new Date(a.at).getTime() - new Date(b.at).getTime(); });
      el("investigation-count").textContent = String(entries.length);
      el("investigation-bench").innerHTML = entries.length ? entries.map(function (entry) {
        return benchItem(entry.id, entry.kind, entry.title, entry.detail, actorLabel(entry.actor) + " · " + formatTime(entry.at));
      }).join("") : '<p class="bench-empty">Component inspections, circuit reads, and signal traces will collect here.</p>';
    }

    function renderEvidence(workspace) {
      var entries = workspace.evidence.map(function (item) {
        var value = typeof item.value === "undefined" ? "" : formatReading(item.value) + (item.unit ? " " + item.unit : "");
        return {
          id: item.id,
          status: item.source,
          title: item.title + (value ? " — " + value : ""),
          detail: item.detail,
          actor: item.actor,
          at: item.at
        };
      });
      workspace.measurements.forEach(function (measurement) {
        entries.push({
          id: measurement.id,
          status: "simulation",
          title: measurement.node + " — " + formatReading(measurement.value) + " " + measurement.unit,
          detail: measurement.reason || "Read from CircuitJS1.",
          actor: measurement.actor,
          at: measurement.at
        });
      });
      entries.sort(function (a, b) { return new Date(a.at).getTime() - new Date(b.at).getTime(); });
      el("evidence-count").textContent = String(entries.length);
      el("evidence-bench").innerHTML = entries.length ? entries.map(function (entry) {
        return benchItem(entry.id, entry.status, entry.title, entry.detail, actorLabel(entry.actor) + " · " + formatTime(entry.at));
      }).join("") : '<p class="bench-empty">Measurements and concrete findings will collect here.</p>';
    }

    function renderHypotheses(workspace) {
      var hypotheses = workspace.hypotheses;
      el("hypothesis-count").textContent = String(hypotheses.length);
      el("hypothesis-bench").innerHTML = hypotheses.length ? hypotheses.map(function (hypothesis) {
        var alternatives = (hypothesis.alternatives || []).map(function (alternative) {
          return alternative.label + " (" + alternative.status + ")";
        });
        return benchItem(
          hypothesis.id,
          hypothesis.status,
          hypothesis.statement,
          "Evidence: " + hypothesis.evidenceIds.join(", "),
          alternatives.length ? "Alternatives: " + alternatives.join(" · ") : hypothesis.note
        );
      }).join("") : '<p class="bench-empty">Evidence-backed explanations will collect here without hiding alternatives.</p>';
    }

    function renderRepairBench(workspace) {
      var repairs = workspace.repairs;
      el("repair-state").textContent = String(repairs.length);
      el("repair-bench").innerHTML = repairs.length ? repairs.map(function (repair) {
        var detail = repair.rationale + " Evidence: " + repair.evidenceIds.join(", ") + ".";
        var result = repair.result ? repair.result.summary :
          repair.planKind === "physical-only" ? "Physical repair only; no simulation plan staged." :
            repair.actionCount ? repair.actionCount + " CircuitJS1 actions staged." : "Circuit replacement staged.";
        return benchItem(repair.id, repair.status, repair.title, detail, "Approval: " + repair.approvalStatus + " · " + result);
      }).join("") : '<p class="bench-empty">A staged change, its evidence, approval, and result will appear here.</p>';
    }

    function eventKindLabel(kind) {
      var labels = {
        "node-measured": "SIMULATION",
        "evidence-recorded": "EVIDENCE",
        "investigation-recorded": "INVESTIGATION",
        "hypothesis-proposed": "HYPOTHESIS",
        "hypothesis-updated": "HYPOTHESIS",
        "repair-staged": "PROPOSED CHANGE",
        "repair-approval-requested": "APPROVAL",
        "repair-approved": "APPROVED",
        "repair-declined": "DECLINED",
        "repair-applied": "SIMULATION",
        "repair-result-recorded": "RESULT",
        finding: "FINDING",
        decision: "DECISION",
        question: "QUESTION",
        "next-step": "NEXT STEP",
        "circuit-loaded": "CIRCUIT",
        "version-restored": "CIRCUIT"
      };
      return labels[kind] || String(kind || "update").replace(/-/g, " ").toUpperCase();
    }

    function renderFeed(workspace) {
      var feed = el("session-feed");
      var stayAtLatest = feed.childElementCount === 0 ||
        feed.scrollHeight - feed.scrollTop - feed.clientHeight < 48;
      var events = workspace.activity.slice().sort(function (a, b) {
        return new Date(a.at).getTime() - new Date(b.at).getTime();
      });
      el("work-log-count").textContent = String(events.length);
      feed.innerHTML = events.length ? events.map(function (event) {
        return '<article class="feed-event actor-' + escapeHtml(event.actor) + '">' +
          '<div class="feed-rail"><span></span></div>' +
          '<div class="feed-body">' +
            '<div class="feed-meta">' +
              '<span class="feed-actor">' + escapeHtml(actorLabel(event.actor)) + '</span>' +
              '<span class="feed-kind">' + escapeHtml(eventKindLabel(event.kind)) + '</span>' +
              '<time>' + escapeHtml(formatTime(event.at)) + '</time>' +
            '</div>' +
            '<h4>' + escapeHtml(event.title) + '</h4>' +
            (event.detail ? '<p>' + escapeHtml(event.detail) + '</p>' : '') +
          '</div>' +
        '</article>';
      }).join("") : '<p class="bench-empty work-log-empty">Circuit changes, measurements, and decisions will appear here.</p>';
      if (stayAtLatest) feed.scrollTop = feed.scrollHeight;
    }

    function render(payload) {
      var workspace = payload.workspace;
      renderPending(workspace);
      renderFeed(workspace);
      renderInvestigation(workspace);
      renderEvidence(workspace);
      renderHypotheses(workspace);
      renderRepairBench(workspace);
    }

    return {
      init: function () { bindEvents(); },
      render: render,
      notify: notify
    };
  }

  return { createUI: createUI };
});
