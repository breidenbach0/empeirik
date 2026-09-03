/*
 * empeirik single-workspace UI.
 *
 * CircuitJS1 is the only circuit canvas. Diagnostic facts, agent actions,
 * human approvals, and tool calls are rendered as one chronological session.
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

    function copyText(text, message) {
      if (root.navigator && root.navigator.clipboard && root.navigator.clipboard.writeText) {
        return root.navigator.clipboard.writeText(text).then(function () {
          notify(message || "Copied");
        });
      }
      var input = doc.createElement("textarea");
      input.value = text;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      doc.body.appendChild(input);
      input.select();
      doc.execCommand("copy");
      input.remove();
      notify(message || "Copied");
      return Promise.resolve();
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
        callHandler("getCircuitText").then(function (text) {
          if (text) return copyText(text, "Circuit export copied");
        });
      });
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
      el("circuit-title").textContent = workspace.circuitName;
      el("workspace-revision").textContent = "REV " + workspace.revision;
      renderPending(diagnostic);
      renderFeed(workspace, diagnostic);
    }

    function setLastCall(entry) {
      if (!entry) {
        el("last-call").textContent = "No tool calls yet.";
        el("tool-status").textContent = "None yet";
        return;
      }
      el("tool-status").textContent = entry.ok ? entry.tool : entry.tool + " failed";
      var shown = {
        tool: entry.tool,
        via: entry.via,
        arguments: entry.args,
        ok: entry.ok
      };
      if (entry.ok) shown.result = entry.result;
      else shown.error = entry.error;
      var text = JSON.stringify(shown, null, 2);
      if (text.length > 4800) text = text.slice(0, 4800) + "\n… output truncated";
      el("last-call").textContent = text;
    }

    return {
      init: init,
      render: render,
      notify: notify,
      setLastCall: setLastCall
    };
  }

  return { createUI: createUI };
});
