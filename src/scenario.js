/*
 * empeirik scenario: a deterministic hidden-fault case.
 *
 * This module is pure data. It must stay loadable in Node (tests, checks)
 * and in the browser without any DOM access.
 *
 * Hidden fault: C7 has an internal resistive short (~240 Ohm). The 3V3 rail
 * stays valid, but the RESET line is held at about 0.08 V, so U1 never
 * leaves reset. The fault is deliberately NOT exposed through any agent
 * tool; the agent has to earn it through measurements and reasoning.
 */
(function (root, factory) {
  var api = factory(root);
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
  root.EmpeirikModules = root.EmpeirikModules || {};
  root.EmpeirikModules.scenario = api;
})(typeof self !== "undefined" ? self : globalThis, function (root) {
  "use strict";

  var scenario = {
    case: {
      id: "controller-no-boot",
      title: "Environmental controller board",
      oneLine: "Power LED on, controller unresponsive, no status output.",
      brief:
        "Power LED on, controller unresponsive, no status output. The cause " +
        "has not been established.",
      safety:
        "Educational simulation of a low-voltage (3.3 V) board. Not guidance " +
        "for mains, high-energy, medical, or safety-critical hardware."
    },

    hiddenFault: {
      // Used by the preview adapter and the repair validation only.
      // No tool output includes this object.
      componentId: "c7",
      mode: "resistive-short",
      shortOhms: 240,
      summary:
        "C7 has an internal resistive short (about 240 Ohm) from RESET to " +
        "ground, holding RESET near 0.08 V."
    },

    // Only these proposed changes have a matching, testable simulation model.
    // Kept outside agent-visible state so the answer is not disclosed early.
    repairModels: [
      { componentId: "c7", action: "replace", branch: "repaired" }
    ],

    components: [
      {
        id: "v1",
        label: "V1",
        kind: "source",
        name: "3.3 V supply rail",
        spec: "3.3 V rail, +/-5% accepted (3.10-3.50 V at TP1)",
        role:
          "Main digital supply for the controller. Feeds the reset pull-up " +
          "and the MCU.",
        nets: ["3v3"],
        testPoints: ["tp-3v3"],
        inspection: {
          visual:
            "Power LED is lit. No discoloration near the regulator; the rail " +
            "does not sag under the nominal load.",
          reference:
            "If TP1 is in range, the supply is not the reason the " +
            "controller is inactive."
        }
      },
      {
        id: "r12",
        label: "R12",
        kind: "passive",
        name: "Reset pull-up resistor",
        spec: "10 kOhm +/-5%, 0603",
        role:
          "Pulls the RESET line up to 3V3 and charges C7 after power-up.",
        nets: ["3v3", "reset"],
        testPoints: ["tp-3v3", "tp-reset"],
        inspection: {
          visual:
            "Solder joints look clean; no scorching. Reads as a pull-up " +
            "from TP1 to TP2 with the board unpowered.",
          reference:
            "With C7 healthy, R12 charges the reset node with tau = " +
            "R x C = 1.0 ms."
        }
      },
      {
        id: "c7",
        label: "C7",
        kind: "passive",
        name: "Reset timing capacitor",
        spec: "100 nF X7R ceramic, 0603, 16 V",
        role:
          "Sets the power-on reset delay together with R12. After charging " +
          "it should draw no DC current.",
        nets: ["reset"],
        testPoints: ["tp-reset"],
        inspection: {
          visual:
            "No cracking, discoloration, or bulging; the '104' marking is " +
            "legible. Visual inspection alone cannot clear it.",
          reference:
            "Expected tau = R12 x C7 = 1.0 ms. A healthy ceramic capacitor " +
            "charges to the rail and then behaves as an open circuit for DC."
        }
      },
      {
        id: "u1",
        label: "U1",
        kind: "mcu",
        name: "Environmental controller MCU",
        spec: "3.3 V CMOS microcontroller; RESET released above 2.0 V (VIH)",
        role:
          "Samples the environment sensors and drives the status LED. It " +
          "starts only after RESET stays high through power-on.",
        nets: ["3v3", "reset", "status"],
        testPoints: ["tp-3v3", "tp-reset"],
        inspection: {
          visual:
            "Package shows no stress marks; supply pins probe continuous " +
            "to TP1. Die temperature feels ambient.",
          reference:
            "A stuck-low RESET with a valid rail keeps U1 inactive. A " +
            "clamped reset input is a possible, but less common, failure."
        }
      },
      {
        id: "led1",
        label: "LED1",
        kind: "indicator",
        name: "Status LED",
        spec: "Green, ~2.0 V forward, driven by U1 firmware heartbeat",
        role:
          "Blinks while the firmware runs; stays dark while U1 is held in " +
          "reset.",
        nets: ["status"],
        testPoints: [],
        inspection: {
          visual: "Dark during the fault. No physical damage.",
          reference:
            "LED1 is an output indicator: it reports U1 state, it does not " +
            "cause it."
        }
      }
    ],

    testPoints: [
      {
        id: "tp-3v3",
        label: "TP1",
        name: "3V3 rail test point",
        node: "3V3",
        netId: "3v3",
        measurementTypes: ["dc_voltage"],
        expected: { min: 3.1, max: 3.5, unit: "V" },
        whyItMatters:
          "Confirms the supply is valid before anything downstream is " +
          "suspected."
      },
      {
        id: "tp-reset",
        label: "TP2",
        name: "RESET line test point",
        node: "RESET",
        netId: "reset",
        measurementTypes: ["dc_voltage"],
        expected: { min: 2.8, max: 3.3, unit: "V" },
        whyItMatters:
          "A controller held in reset reads near 0 V here; a released line " +
          "reads near the rail."
      }
    ],

    nets: [
      {
        id: "3v3",
        label: "3V3",
        name: "3.3 V supply net",
        members: ["V1", "R12", "U1 (VDD)", "TP1"],
        path: {
          title: "3V3 supply distribution",
          steps: [
            {
              ref: "V1",
              detail: "Regulator output; validity is observable at TP1."
            },
            {
              ref: "TP1",
              detail: "Expected 3.10-3.50 V DC under nominal load."
            },
            {
              ref: "R12",
              detail: "Pull-up sources the reset timing branch from this rail."
            },
            {
              ref: "U1",
              detail: "VDD pin; MCU requires this rail plus a released RESET."
            }
          ]
        }
      },
      {
        id: "reset",
        label: "RESET",
        name: "Reset release net",
        members: ["R12", "C7", "U1 (nRESET)", "TP2"],
        path: {
          title: "Reset release path",
          steps: [
            {
              ref: "TP1 / 3V3",
              detail:
                "Supply rail feeds R12 (10 kOhm pull-up)."
            },
            {
              ref: "R12",
              detail:
                "Pull-up charges C7 through the RESET node; expected " +
                "tau = R12 x C7 = 1.0 ms."
            },
            {
              ref: "TP2 / RESET",
              detail:
                "RESET must rise above U1's release threshold (2.0 V) " +
                "within the boot window."
            },
            {
              ref: "C7",
              detail:
                "C7 is the only element from RESET to ground besides the U1 " +
                "input. A stuck-low RESET with a valid rail points here or " +
                "at U1."
            },
            {
              ref: "U1",
              detail:
                "If RESET stays high through power-on, U1 leaves reset and " +
                "starts the firmware heartbeat (LED1)."
            }
          ]
        }
      }
    ],

    /*
     * Deterministic readings used by the preview adapter. Values match the
     * physics of the hidden fault: 3.3 V * 240 / (10000 + 240) = 0.077 V.
     */
    preview: {
      faulted: {
        "3V3": 3.31,
        RESET: 0.08,
        board: { powerLed: "on", mcuState: "inactive", statusOutput: "off" }
      },
      repaired: {
        "3V3": 3.3,
        RESET: 3.29,
        board: { powerLed: "on", mcuState: "running", statusOutput: "blinking" }
      },
      timing: {
        // tau = R12 * C7 = 1.0 ms; t(threshold) = tau * ln(3.3 / (3.3 - 2.0))
        thresholdV: 2.0,
        timeConstantMs: 1.0,
        releaseTimeMs: 0.93,
        envelope: { minMs: 0.2, maxMs: 10 }
      }
    },

    verificationContract: {
      scope: "simulation-only",
      note:
        "Verification proves the repaired circuit meets its simulated-device " +
        "contract. It does not prove a physical repair.",
      checks: [
        {
          id: "supply-rail",
          label: "Repaired branch: 3V3 rail within 3.10-3.50 V",
          testPointId: "tp-3v3"
        },
        {
          id: "reset-released",
          label: "Repaired branch: RESET within 2.80-3.30 V after the reset interval",
          testPointId: "tp-reset"
        },
        {
          id: "boot-timing",
          label: "RESET crosses the 2.0 V release threshold within 0.2-10 ms"
        }
      ]
    },

    /*
     * CircuitJS1 circuit strings (same-origin runtime). Element codes:
     *   $  header, v = DC source, r = resistor, c = capacitor,
     *   w = wire, g = ground, 207 = labeled node (flags 4 = escaped label).
     * Labeled nodes "3V3" and "RESET" are what the JS bridge reads via
     * getNodeVoltage(). The faulted string carries the internal short as a
     * 240 Ohm path from RESET to ground, in parallel with C7.
     */
    circuitStrings: {
      faulted: [
        "$ 1 0.000005 10.200277308269968 85 5 43",
        "v 64 240 64 128 0 0 40 3.3 0 0.5",
        "w 64 128 176 128 0",
        "207 176 128 240 80 4 3V3",
        "r 176 128 304 128 0 10000",
        "w 304 128 416 128 0",
        "207 416 128 480 64 4 RESET",
        "c 416 128 416 240 0 1e-7 0 0",
        "w 416 128 496 128 0",
        "r 496 128 496 240 0 240",
        "g 64 240 64 256 0",
        "g 416 240 416 256 0",
        "g 496 240 496 256 0"
      ].join("\n"),
      repaired: [
        "$ 1 0.000005 10.200277308269968 85 5 43",
        "v 64 240 64 128 0 0 40 3.3 0 0.5",
        "w 64 128 176 128 0",
        "207 176 128 240 80 4 3V3",
        "r 176 128 304 128 0 10000",
        "w 304 128 416 128 0",
        "207 416 128 480 64 4 RESET",
        "c 416 128 416 240 0 1e-7 0 0",
        "g 64 240 64 256 0",
        "g 416 240 416 256 0"
      ].join("\n")
    }
  };

  function formatVoltage(v) {
    return v.toFixed(2) + " V";
  }

  function findTestPoint(id) {
    for (var i = 0; i < scenario.testPoints.length; i++) {
      if (scenario.testPoints[i].id === id) return scenario.testPoints[i];
    }
    return null;
  }

  function findComponent(idOrLabel) {
    var id = String(idOrLabel).toLowerCase();
    for (var i = 0; i < scenario.components.length; i++) {
      var c = scenario.components[i];
      if (c.id.toLowerCase() === id || c.label.toLowerCase() === id) return c;
    }
    return null;
  }

  function findNet(id) {
    var key = String(id).toLowerCase().replace(/^net[:#]?/, "");
    for (var i = 0; i < scenario.nets.length; i++) {
      if (scenario.nets[i].id.toLowerCase() === key ||
          scenario.nets[i].label.toLowerCase() === key) {
        return scenario.nets[i];
      }
    }
    return null;
  }

  return {
    scenario: scenario,
    formatVoltage: formatVoltage,
    findTestPoint: findTestPoint,
    findComponent: findComponent,
    findNet: findNet
  };
});
