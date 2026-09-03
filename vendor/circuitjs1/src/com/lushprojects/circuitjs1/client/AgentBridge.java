/*
 * empeirik agent/editor bridge.
 *
 * This deliberately sits inside CircuitJS1 instead of simulating canvas clicks.
 * It exposes the same element factory, edit metadata, command manager, options,
 * controls, scope model, and undo manager used by the human UI.  The outer
 * The empeirik WebMCP layer supplies revision checks, audit logging, and
 * human-readable semantic tools.
 */
package com.lushprojects.circuitjs1.client;

import java.util.ArrayList;
import java.util.Collections;

import com.google.gwt.core.client.JavaScriptObject;
import com.google.gwt.core.client.JsArray;
import com.google.gwt.core.client.JsArrayString;
import com.google.gwt.user.client.ui.TextBox;

class AgentBridge {
    private final CirSim app;

    AgentBridge(CirSim app) {
	this.app = app;
    }

    private native JsArray<JavaScriptObject> newArray() /*-{
	return [];
    }-*/;

    private native JsArrayString newStringArray() /*-{
	return [];
    }-*/;

    private native JavaScriptObject makeElementType(String type, String label) /*-{
	return { type: type, label: label };
    }-*/;

    private native JavaScriptObject makeNumberField(int index, String name, double value,
	    double min, double max, boolean positive, boolean nonNegative,
	    boolean dimensionless, boolean adjustable) /*-{
	return {
	    index: index,
	    name: name,
	    kind: "number",
	    value: value,
	    min: min,
	    max: max,
	    positive: positive,
	    nonNegative: nonNegative,
	    dimensionless: dimensionless,
	    adjustable: adjustable,
	    writable: true
	};
    }-*/;

    private native JavaScriptObject makeStringField(int index, String name, String kind,
	    String value, boolean color) /*-{
	return {
	    index: index,
	    name: name,
	    kind: kind,
	    value: value,
	    color: color,
	    writable: true
	};
    }-*/;

    private native JavaScriptObject makeBooleanField(int index, String name, boolean value) /*-{
	return { index: index, name: name, kind: "boolean", value: value, writable: true };
    }-*/;

    private native JavaScriptObject makeChoiceField(int index, String name, int selected,
	    JsArrayString choices) /*-{
	return {
	    index: index,
	    name: name,
	    kind: "choice",
	    value: selected,
	    choices: choices,
	    writable: true
	};
    }-*/;

    private native JavaScriptObject makeActionField(int index, String name, String label) /*-{
	return {
	    index: index,
	    name: name,
	    kind: "action",
	    label: label,
	    value: "press",
	    writable: true
	};
    }-*/;

    private native JavaScriptObject makeUnsupportedField(int index, String name, String kind) /*-{
	return {
	    index: index,
	    name: name,
	    kind: kind,
	    writable: false,
	    reason: "This field is backed by a browser file or custom widget; use circuit import/export or invokeCommand for its UI."
	};
    }-*/;

    private native JavaScriptObject makeControl(String id, String kind, String label,
	    double value, double min, double max, int adjustableIndex) /*-{
	return {
	    id: id,
	    kind: kind,
	    label: label,
	    value: value,
	    min: min,
	    max: max,
	    adjustableIndex: adjustableIndex
	};
    }-*/;

    private native JavaScriptObject makeAdjustableControl(String id, String label,
	    double value, double min, double max, int adjustableIndex, int fieldIndex,
	    double step, boolean logarithmic, int sharedAdjustableIndex) /*-{
	return {
	    id: id,
	    kind: "adjustable",
	    label: label,
	    value: value,
	    min: min,
	    max: max,
	    adjustableIndex: adjustableIndex,
	    fieldIndex: fieldIndex,
	    step: step,
	    logarithmic: logarithmic,
	    sharedAdjustableIndex: sharedAdjustableIndex < 0 ? null : sharedAdjustableIndex
	};
    }-*/;

    private native JavaScriptObject makeElementState(int index, String type,
	    int x1, int y1, int x2, int y2, boolean selected, String dump,
	    JsArrayString info, JsArray<JavaScriptObject> fields,
	    JsArray<JavaScriptObject> controls) /*-{
	var state = {
	    id: "e" + index,
	    index: index,
	    type: type,
	    position: { x1: x1, y1: y1, x2: x2, y2: y2 },
	    selected: selected,
	    info: info,
	    editFields: fields,
	    controls: controls
	};
	if (dump != null)
	    state.dump = dump;
	return state;
    }-*/;

    private native JavaScriptObject makePlotState(int index, int elementIndex, int value,
	    int units, boolean acCoupled, double manualScale, int manualPosition) /*-{
	return {
	    index: index,
	    elementIndex: elementIndex,
	    elementId: elementIndex < 0 ? null : "e" + elementIndex,
	    value: value,
	    units: units,
	    acCoupled: acCoupled,
	    manualScale: manualScale,
	    manualPosition: manualPosition
	};
    }-*/;

    private native JavaScriptObject makeScopeState(int index, String label, int position,
	    int speed, boolean manualScale, int divisions, boolean showVoltage,
	    boolean showCurrent, boolean showScale, boolean showMax, boolean showMin,
	    boolean showP2P, boolean showFrequency, boolean showRms, boolean showAverage,
	    boolean showDutyCycle, boolean showElementInfo, boolean fft, boolean logSpectrum,
	    boolean phaseAngle, boolean plot2d, boolean plotXY, int triggerMode,
	    int triggerEdge, double triggerLevel, double trailPersistence,
	    JsArray<JavaScriptObject> plots) /*-{
	return {
	    id: "scope" + index,
	    index: index,
	    label: label,
	    position: position,
	    speed: speed,
	    manualScale: manualScale,
	    divisions: divisions,
	    display: {
		voltage: showVoltage,
		current: showCurrent,
		scale: showScale,
		max: showMax,
		min: showMin,
		peakToPeak: showP2P,
		frequency: showFrequency,
		rms: showRms,
		average: showAverage,
		dutyCycle: showDutyCycle,
		elementInfo: showElementInfo
	    },
	    spectrum: { enabled: fft, logarithmic: logSpectrum, phaseAngle: phaseAngle },
	    plot2d: { enabled: plot2d, xy: plotXY, trailPersistence: trailPersistence },
	    trigger: { mode: triggerMode, edge: triggerEdge, level: triggerLevel },
	    plots: plots
	};
    }-*/;

    private native JavaScriptObject makeOptionsState(boolean showCurrent, boolean showVoltage,
	    boolean showPower, boolean showValues, boolean smallGrid, boolean toolbar,
	    boolean crosshair, boolean europeanResistors, boolean iecGates,
	    boolean whiteBackground, boolean conventionalCurrent, boolean editingDisabled,
	    boolean mouseWheelEdit, int simulationSpeed, int currentSpeed,
	    int powerBrightness, double scale, double translateX, double translateY) /*-{
	return {
	    display: {
		showCurrent: showCurrent,
		showVoltage: showVoltage,
		showPower: showPower,
		showValues: showValues,
		whiteBackground: whiteBackground,
		conventionalCurrent: conventionalCurrent
	    },
	    editor: {
		smallGrid: smallGrid,
		toolbar: toolbar,
		crosshair: crosshair,
		europeanResistors: europeanResistors,
		iecGates: iecGates,
		editingDisabled: editingDisabled,
		mouseWheelEdit: mouseWheelEdit
	    },
	    controls: {
		simulationSpeed: simulationSpeed,
		currentSpeed: currentSpeed,
		powerBrightness: powerBrightness
	    },
	    view: { scale: scale, translateX: translateX, translateY: translateY }
	};
    }-*/;

    private native JavaScriptObject makeEditorState(String circuit, boolean running,
	    double time, double maxTimeStep, String mouseMode, boolean canUndo,
	    boolean canRedo, JavaScriptObject options, JsArray<JavaScriptObject> elements,
	    JsArray<JavaScriptObject> scopes) /*-{
	return {
	    bridgeVersion: "1.0.0",
	    circuit: circuit,
	    running: running,
	    time: time,
	    maxTimeStep: maxTimeStep,
	    mouseMode: mouseMode,
	    canUndo: canUndo,
	    canRedo: canRedo,
	    options: options,
	    elements: elements,
	    scopes: scopes
	};
    }-*/;

    private native JavaScriptObject makeCapabilities(JsArray<JavaScriptObject> elementTypes) /*-{
	return {
	    bridgeVersion: "1.0.0",
	    coverage: "native-editor",
	    elementTypes: elementTypes,
	    elementOperations: [
		"add", "remove", "move", "split-wire", "select", "edit-property",
		"set-control", "configure-adjustable", "toggle"
	    ],
	    commandGroups: {
		file: ["newblankcircuit", "importfromtext", "importfromlocalfile", "importfromdropbox", "exportasurl", "exportaslocalfile", "exportastext", "exportasimage", "copypng", "exportassvg", "createsubcircuit", "dcanalysis", "recover", "print", "about"],
		edit: ["undo", "redo", "cut", "copy", "paste", "duplicate", "selectAll", "search", "centercircuit", "rotate", "mirror"],
		zoom: ["zoomin", "zoomout", "zoom100"],
		scopes: ["stackAll", "unstackAll", "combineAll", "separateAll"],
		element: ["edit", "viewInScope", "viewInFloatScope", "cut", "copy", "delete", "duplicate", "flip", "rotate", "mirror", "split", "sliders"],
		scope: ["dock", "undock", "remove", "removeplot", "speed2", "speed1/2", "maxscale", "stack", "unstack", "combine", "selecty", "reset", "exportcsv", "properties"],
		tools: ["convertWires", "subcircuits", "createTest"],
		view: ["fullscreen"]
	    },
	    optionNames: [
		"showCurrent", "showVoltage", "showPower", "showValues", "smallGrid",
		"toolbar", "crosshair", "europeanResistors", "iecGates",
		"whiteBackground", "conventionalCurrent", "editingDisabled", "mouseWheelEdit"
	    ],
	    controlNames: ["simulationSpeed", "currentSpeed", "powerBrightness"],
	    scopeProperties: [
		"label", "speed", "position", "manualScale", "manualScaleValue",
		"plotPosition", "divisions", "triggerMode", "triggerEdge", "triggerLevel",
		"trailPersistence", "selectedPlot", "acCoupled", "showvoltage",
		"showcurrent", "showscale", "showpeak", "shownegpeak", "showp2p",
		"showfreq", "showfft", "logspectrum", "showrms", "showaverage",
		"showduty", "showphaseangle", "showelminfo", "showpower", "showib",
		"showic", "showie", "showvbe", "showvbc", "showvce", "showvcevsic",
		"showvvsi", "plotxy", "showresistance", "showcharge"
	    ],
	    notes: [
		"Browser file pickers, clipboard writes, downloads, printing, and fullscreen may still require a user gesture.",
		"Use importCircuit/exportCircuit/getCircuitAsSVG as non-dialog equivalents for file operations."
	    ]
	};
    }-*/;

    JsArray<JavaScriptObject> getElementTypes() {
	JsArray<JavaScriptObject> result = newArray();
	if (app.classToLabelMap == null)
	    return result;
	ArrayList<String> names = new ArrayList<String>(app.classToLabelMap.keySet());
	Collections.sort(names);
	for (String name : names) {
	    if ("Select".equals(name) || name.startsWith("Drag"))
		continue;
	    result.push(makeElementType(name, app.classToLabelMap.get(name)));
	}
	return result;
    }

    JavaScriptObject getCapabilities() {
	return makeCapabilities(getElementTypes());
    }

    private CircuitElm requireElement(int index) {
	if (index < 0 || index >= app.elmList.size())
	    throw new IllegalArgumentException("No circuit element at index " + index);
	return app.getElm(index);
    }

    private Scope requireScope(int index) {
	if (index < 0 || index >= app.scopeManager.scopeCount)
	    throw new IllegalArgumentException("No docked scope at index " + index);
	return app.scopeManager.scopes[index];
    }

    private JsArrayString getInfo(CircuitElm ce) {
	JsArrayString result = newStringArray();
	String arr[] = new String[20];
	ce.getInfo(arr);
	for (int i = 0; i < arr.length && arr[i] != null; i++)
	    result.push(arr[i]);
	return result;
    }

    private JsArrayString getChoices(Choice choice) {
	JsArrayString result = newStringArray();
	for (int i = 0; i < choice.getItemCount(); i++)
	    result.push(choice.getItemText(i));
	return result;
    }

    private JsArray<JavaScriptObject> getEditableFields(Editable editable) {
	JsArray<JavaScriptObject> result = newArray();
	for (int i = 0; i < 100; i++) {
	    EditInfo ei = editable.getEditInfo(i);
	    if (ei == null)
		break;
	    String name = ei.name == null ? "" : ei.name;
	    if (ei.checkbox != null)
		result.push(makeBooleanField(i, ei.checkbox.getText(), ei.checkbox.getState()));
	    else if (ei.choice != null)
		result.push(makeChoiceField(i, name, ei.choice.getSelectedIndex(), getChoices(ei.choice)));
	    else if (ei.button != null && ei.loadFile == null)
		result.push(makeActionField(i, name, ei.button.getText()));
	    else if (ei.textArea != null)
		result.push(makeStringField(i, name, "textarea", ei.textArea.getText(), false));
	    else if (ei.widget != null || ei.loadFile != null)
		result.push(makeUnsupportedField(i, name, ei.loadFile != null ? "file" : "custom-widget"));
	    else if (ei.text != null)
		result.push(makeStringField(i, name, "text", ei.text, ei.isColor));
	    else
		result.push(makeNumberField(i, name, ei.value, ei.minVal, ei.maxVal,
			ei.positive, ei.nonNegative, ei.dimensionless,
			ei.canCreateAdjustable()));
	}
	return result;
    }

    JsArray<JavaScriptObject> getElementEditInfo(int index) {
	return getEditableFields(requireElement(index));
    }

    JsArray<JavaScriptObject> getGlobalEditInfo() {
	return getEditableFields(new EditOptions(app, app.sim));
    }

    private void applyEditableValue(Editable editable, int fieldIndex, String value) {
	EditInfo ei = editable.getEditInfo(fieldIndex);
	if (ei == null)
	    throw new IllegalArgumentException("No editable field " + fieldIndex);
	if (ei.checkbox != null) {
	    if (!"true".equalsIgnoreCase(value) && !"false".equalsIgnoreCase(value))
		throw new IllegalArgumentException("Boolean field requires true or false");
	    ei.checkbox.setState(Boolean.parseBoolean(value));
	} else if (ei.choice != null) {
	    int selected = -1;
	    try {
		selected = Integer.parseInt(value);
	    } catch (Exception ex) {
		for (int i = 0; i < ei.choice.getItemCount(); i++)
		    if (ei.choice.getItemText(i).equalsIgnoreCase(value))
			selected = i;
	    }
	    if (selected < 0 || selected >= ei.choice.getItemCount())
		throw new IllegalArgumentException("Unknown choice '" + value + "'");
	    ei.choice.select(selected);
	} else if (ei.button != null) {
	    if (ei.loadFile != null)
		throw new IllegalArgumentException("Browser file fields require file content through a host integration");
	    if (!"press".equalsIgnoreCase(value) && !"true".equalsIgnoreCase(value))
		throw new IllegalArgumentException("Action field requires value 'press'");
	} else if (ei.textArea != null) {
	    ei.textArea.setText(value);
	} else if (ei.widget != null) {
	    throw new IllegalArgumentException("Custom widget fields are not directly writable");
	} else if (ei.text != null) {
	    ei.textf = new TextBox();
	    ei.textf.setText(value);
	} else {
	    double number;
	    try {
		number = Double.parseDouble(value);
	    } catch (Exception ex) {
		throw new IllegalArgumentException("Numeric field requires a finite SI value");
	    }
	    if (Double.isNaN(number) || Double.isInfinite(number))
		throw new IllegalArgumentException("Numeric field requires a finite SI value");
	    if (ei.positive && number <= 0)
		throw new IllegalArgumentException("Field must be positive");
	    if (ei.nonNegative && number < 0)
		throw new IllegalArgumentException("Field must not be negative");
	    ei.value = number;
	}
	editable.setEditValue(fieldIndex, ei);
	if (ei.error != null)
	    throw new IllegalArgumentException(ei.error);
    }

    JavaScriptObject setElementEditValue(int index, int fieldIndex, String value) {
	CircuitElm ce = requireElement(index);
	app.undoManager.pushUndo();
	applyEditableValue(ce, fieldIndex, value);
	app.needAnalyze();
	markChanged();
	return getElementState(index);
    }

    JsArray<JavaScriptObject> setGlobalEditValue(int fieldIndex, String value) {
	applyEditableValue(new EditOptions(app, app.sim), fieldIndex, value);
	app.needAnalyze();
	app.repaint();
	return getGlobalEditInfo();
    }

    private JsArray<JavaScriptObject> getControls(int elementIndex, CircuitElm ce) {
	JsArray<JavaScriptObject> result = newArray();
	if (ce instanceof SwitchElm) {
	    SwitchElm se = (SwitchElm)ce;
	    result.push(makeControl("switch-position", "integer", "Switch position",
		    se.position, 0, se.posCount - 1, -1));
	}
	Scrollbar slider = null;
	if (ce instanceof PotElm)
	    slider = ((PotElm)ce).slider;
	else if (ce instanceof VarRailElm)
	    slider = ((VarRailElm)ce).slider;
	else if (ce instanceof LDRElm)
	    slider = ((LDRElm)ce).slider;
	else if (ce instanceof ThermistorNTCElm)
	    slider = ((ThermistorNTCElm)ce).slider;
	if (slider != null)
	    result.push(makeControl("slider", "range", "Built-in slider", slider.getValue(), 0, 100, -1));
	for (int i = 0; i < app.adjustables.size(); i++) {
	    Adjustable adj = app.adjustables.get(i);
	    if (adj.elm == ce) {
		EditInfo ei = ce.getEditInfo(adj.editItem);
		double currentValue = ei == null ? adj.minValue : ei.value;
		result.push(makeAdjustableControl("adjustable:" + i, adj.sliderText,
			currentValue, adj.minValue, adj.maxValue, i, adj.editItem,
			adj.sliderStep, adj.logarithmic,
			adj.sharedSlider == null ? -1 : app.adjustables.indexOf(adj.sharedSlider)));
	    }
	}
	return result;
    }

    private void setAdjustableSliderValue(Adjustable adj, double value) {
	Adjustable driver = adj.sharedSlider == null ? adj : adj.sharedSlider;
	if (driver.slider == null)
	    throw new IllegalArgumentException("Adjustable slider is not available");
	int sliderPosition = adj.valueToSliderPosition(value);
	driver.settingValue = true;
	driver.slider.setValue(sliderPosition);
	driver.settingValue = false;
	// This is the same command path a manual slider movement uses. It updates
	// both the primary adjustable and every property sharing that slider.
	driver.execute();
    }

    JavaScriptObject setElementControl(int index, String controlId, double value) {
	CircuitElm ce = requireElement(index);
	if ("switch-position".equals(controlId)) {
	    if (!(ce instanceof SwitchElm))
		throw new IllegalArgumentException("Element has no switch-position control");
	    SwitchElm se = (SwitchElm)ce;
	    int requested = (int)value;
	    if (requested != value || requested < 0 || requested >= se.posCount)
		throw new IllegalArgumentException("Switch position is out of range");
	    app.undoManager.pushUndo();
	    int guard = se.posCount + 1;
	    while (se.position != requested && guard-- > 0)
		se.toggle();
	} else if ("slider".equals(controlId)) {
	    Scrollbar slider = null;
	    if (ce instanceof PotElm)
		slider = ((PotElm)ce).slider;
	    else if (ce instanceof VarRailElm)
		slider = ((VarRailElm)ce).slider;
	    else if (ce instanceof LDRElm)
		slider = ((LDRElm)ce).slider;
	    else if (ce instanceof ThermistorNTCElm)
		 slider = ((ThermistorNTCElm)ce).slider;
	    if (slider == null)
		throw new IllegalArgumentException("Element has no built-in slider");
	    if (value < 0 || value > 100)
		throw new IllegalArgumentException("Built-in slider value must be between 0 and 100");
	    app.undoManager.pushUndo();
	    slider.setValue((int)value);
	} else if (controlId.startsWith("adjustable:")) {
	    int adjustableIndex;
	    try {
		adjustableIndex = Integer.parseInt(controlId.substring(11));
	    } catch (Exception ex) {
		throw new IllegalArgumentException("Invalid adjustable control id '" + controlId + "'");
	    }
	    if (adjustableIndex < 0 || adjustableIndex >= app.adjustables.size())
		throw new IllegalArgumentException("No adjustable control " + controlId);
	    Adjustable adj = app.adjustables.get(adjustableIndex);
	    if (adj.elm != ce)
		throw new IllegalArgumentException("Adjustable does not belong to element " + index);
	    if (value < adj.minValue || value > adj.maxValue)
		throw new IllegalArgumentException("Adjustable value is out of range");
	    app.undoManager.pushUndo();
	    setAdjustableSliderValue(adj, value);
	} else {
	    throw new IllegalArgumentException("Unknown element control '" + controlId + "'");
	}
	app.needAnalyze();
	markChanged();
	return getElementState(index);
    }

    JavaScriptObject createAdjustable(int elementIndex, int fieldIndex, String label,
	    double min, double max, double step, boolean logarithmic, int sharedAdjustableIndex) {
	CircuitElm ce = requireElement(elementIndex);
	EditInfo ei = ce.getEditInfo(fieldIndex);
	if (ei == null || !ei.canCreateAdjustable())
	    throw new IllegalArgumentException("Element field " + fieldIndex + " cannot have an adjustable slider");
	if (app.findAdjustable(ce, fieldIndex) != null)
	    throw new IllegalArgumentException("Element field already has an adjustable slider");
	if (min >= max)
	    throw new IllegalArgumentException("Adjustable minimum must be less than maximum");
	if (step < 0)
	    throw new IllegalArgumentException("Adjustable step must not be negative");
	if (logarithmic && min <= 0)
	    throw new IllegalArgumentException("A logarithmic adjustable requires a positive minimum");
	Adjustable shared = null;
	if (sharedAdjustableIndex >= 0) {
	    if (sharedAdjustableIndex >= app.adjustables.size())
		throw new IllegalArgumentException("No adjustable control at index " + sharedAdjustableIndex);
	    shared = app.adjustables.get(sharedAdjustableIndex);
	    if (shared.sharedSlider != null)
		throw new IllegalArgumentException("An adjustable can only share a primary slider");
	}
	app.undoManager.pushUndo();
	Adjustable adj = new Adjustable(ce, fieldIndex);
	adj.sliderText = label == null || label.trim().length() == 0 ? ei.name : label.trim();
	adj.minValue = min;
	adj.maxValue = max;
	adj.sliderStep = step;
	adj.logarithmic = logarithmic;
	adj.sharedSlider = shared;
	if (shared == null)
	    adj.createSlider(app, ei.value);
	app.adjustables.add(adj);
	Adjustable.reorderAdjustables();
	markChanged();
	return getElementState(app.locateElm(ce));
    }

    JavaScriptObject updateAdjustable(int adjustableIndex, String label,
	    double min, double max, double step, boolean logarithmic,
	    int sharedAdjustableIndex) {
	if (adjustableIndex < 0 || adjustableIndex >= app.adjustables.size())
	    throw new IllegalArgumentException("No adjustable control at index " + adjustableIndex);
	if (min >= max)
	    throw new IllegalArgumentException("Adjustable minimum must be less than maximum");
	if (step < 0)
	    throw new IllegalArgumentException("Adjustable step must not be negative");
	if (logarithmic && min <= 0)
	    throw new IllegalArgumentException("A logarithmic adjustable requires a positive minimum");
	Adjustable adj = app.adjustables.get(adjustableIndex);
	EditInfo ei = adj.elm.getEditInfo(adj.editItem);
	double currentValue = ei == null ? min : ei.value;
	Adjustable requestedShared = null;
	if (sharedAdjustableIndex >= 0) {
	    if (sharedAdjustableIndex >= app.adjustables.size())
		throw new IllegalArgumentException("No adjustable control at index " + sharedAdjustableIndex);
	    requestedShared = app.adjustables.get(sharedAdjustableIndex);
	    if (requestedShared == adj)
		throw new IllegalArgumentException("An adjustable cannot share itself");
	    if (requestedShared.sharedSlider != null)
		throw new IllegalArgumentException("An adjustable can only share a primary slider");
	    if (adj.sliderBeingShared())
		throw new IllegalArgumentException("A slider used by other adjustables cannot itself become shared");
	}
	app.undoManager.pushUndo();
	// -2 keeps the current sharing arrangement, -1 creates an independent
	// slider, and a non-negative index shares that primary slider.
	if (sharedAdjustableIndex != -2 && requestedShared != adj.sharedSlider) {
	    if (adj.sharedSlider == null)
		adj.deleteSlider(app);
	    adj.sharedSlider = requestedShared;
	    if (requestedShared == null)
		adj.createSlider(app, currentValue);
	}
	adj.sliderText = label == null || label.trim().length() == 0 ? adj.sliderText : label.trim();
	adj.minValue = min;
	adj.maxValue = max;
	adj.sliderStep = step;
	adj.logarithmic = logarithmic;
	if (adj.label != null)
	    adj.label.setText(adj.sliderText);
	if (adj.slider != null)
	    adj.slider.setStepSize(step * 100 / (max - min));
	if (adj.sharedSlider != null)
	    // Preserve the primary slider's position when a property joins it.
	    adj.sharedSlider.execute();
	else
	    setAdjustableSliderValue(adj, Math.max(min, Math.min(max, currentValue)));
	Adjustable.reorderAdjustables();
	markChanged();
	return getElementState(app.locateElm(adj.elm));
    }

    JavaScriptObject removeAdjustable(int adjustableIndex) {
	if (adjustableIndex < 0 || adjustableIndex >= app.adjustables.size())
	    throw new IllegalArgumentException("No adjustable control at index " + adjustableIndex);
	Adjustable adj = app.adjustables.get(adjustableIndex);
	if (adj.sliderBeingShared())
	    throw new IllegalArgumentException("Remove or reconfigure shared adjustables before removing their primary slider");
	CircuitElm ce = adj.elm;
	app.undoManager.pushUndo();
	adj.deleteSlider(app);
	app.adjustables.remove(adj);
	Adjustable.reorderAdjustables();
	markChanged();
	return getElementState(app.locateElm(ce));
    }

    JavaScriptObject getElementState(int index) {
	CircuitElm ce = requireElement(index);
	return makeElementState(index, ce.getClassName(), ce.x, ce.y, ce.x2, ce.y2,
		ce.selected, null, getInfo(ce), getEditableFields(ce), getControls(index, ce));
    }

    JsArray<JavaScriptObject> getElementStates() {
	JsArray<JavaScriptObject> result = newArray();
	for (int i = 0; i < app.elmList.size(); i++)
	    result.push(getElementState(i));
	return result;
    }

    private String resolveElementType(String requested) {
	if (requested == null)
	    return null;
	String trimmed = requested.trim();
	if (app.classToLabelMap != null) {
	    for (String type : app.classToLabelMap.keySet()) {
		String label = app.classToLabelMap.get(type);
		String shortLabel = label == null ? "" : label;
		if (shortLabel.toLowerCase().startsWith("add "))
		    shortLabel = shortLabel.substring(4);
		if (type.equalsIgnoreCase(trimmed) || shortLabel.equalsIgnoreCase(trimmed) ||
			(label != null && label.equalsIgnoreCase(trimmed)))
		    return type;
	    }
	}
	return trimmed;
    }

    JavaScriptObject addElement(String requestedType, int x1, int y1, int x2, int y2) {
	String type = resolveElementType(requestedType);
	CircuitElm ce = app.constructElement(type, app.snapGrid(x1), app.snapGrid(y1));
	if (ce == null)
	    throw new IllegalArgumentException("Unknown CircuitJS element type '" + requestedType + "'");
	app.undoManager.pushUndo();
	ce.drag(app.snapGrid(x2), app.snapGrid(y2));
	if (ce.creationFailed()) {
	    ce.delete();
	    throw new IllegalArgumentException("Element endpoints must create a non-zero component");
	}
	app.mouse.splitAt(ce.x, ce.y);
	app.mouse.splitAt(ce.x2, ce.y2);
	app.elmList.addElement(ce);
	ce.draggingDone();
	app.mouse.clearSelection();
	ce.setSelected(true);
	app.needAnalyze();
	markChanged();
	return getElementState(app.elmList.size() - 1);
    }

    JavaScriptObject setElementPosition(int index, int x1, int y1, int x2, int y2) {
	CircuitElm ce = requireElement(index);
	int sx1 = app.snapGrid(x1);
	int sy1 = app.snapGrid(y1);
	int sx2 = app.snapGrid(x2);
	int sy2 = app.snapGrid(y2);
	if (sx1 == sx2 && sy1 == sy2)
	    throw new IllegalArgumentException("Element endpoints must create a non-zero component");
	app.undoManager.pushUndo();
	ce.setPosition(sx1, sy1, sx2, sy2);
	app.mouse.splitAt(ce.x, ce.y);
	app.mouse.splitAt(ce.x2, ce.y2);
	app.needAnalyze();
	markChanged();
	return getElementState(index);
    }

    JavaScriptObject splitWire(int index, int x, int y) {
	CircuitElm ce = requireElement(index);
	if (!(ce instanceof WireElm))
	    throw new IllegalArgumentException("Element " + index + " is not a wire");
	WireElm wire = (WireElm)ce;
	int sx = app.snapGrid(x);
	int sy = app.snapGrid(y);
	if (!wire.pointOnWireInterior(sx, sy))
	    throw new IllegalArgumentException("Split point must be inside the selected wire");
	app.undoManager.pushUndo();
	WireElm newWire = wire.split(sx, sy);
	if (newWire == null)
	    throw new IllegalArgumentException("CircuitJS1 could not split this wire at the requested point");
	app.elmList.addElement(newWire);
	app.needAnalyze();
	markChanged();
	return getElementState(app.elmList.size() - 1);
    }

    int removeElements(String csvIndices) {
	boolean remove[] = new boolean[app.elmList.size()];
	String parts[] = csvIndices == null || csvIndices.length() == 0 ? new String[0] : csvIndices.split(",");
	for (String part : parts) {
	    int index = Integer.parseInt(part.trim());
	    requireElement(index);
	    remove[index] = true;
	}
	int requestedCount = 0;
	for (boolean shouldRemove : remove)
	    if (shouldRemove)
		requestedCount++;
	if (requestedCount == 0)
	    return 0;
	app.undoManager.pushUndo();
	int count = 0;
	for (int i = remove.length - 1; i >= 0; i--) {
	    if (!remove[i])
		continue;
	    CircuitElm ce = app.elmList.get(i);
	    if (ce.isMouseElm())
		app.mouse.setMouseElm(null);
	    ce.delete();
	    app.elmList.removeElementAt(i);
	    count++;
	}
	if (count > 0) {
	    app.scopeManager.deleteUnusedScopeElms();
	    app.needAnalyze();
	    markChanged();
	}
	return count;
    }

    int setSelection(String csvIndices, String mode) {
	boolean requested[] = new boolean[app.elmList.size()];
	String parts[] = csvIndices == null || csvIndices.length() == 0 ? new String[0] : csvIndices.split(",");
	for (String part : parts) {
	    int index = Integer.parseInt(part.trim());
	    requireElement(index);
	    requested[index] = true;
	}
	if ("replace".equals(mode))
	    app.mouse.clearSelection();
	for (int i = 0; i < requested.length; i++) {
	    if (!requested[i])
		continue;
	    CircuitElm ce = app.getElm(i);
	    if ("remove".equals(mode))
		ce.setSelected(false);
	    else if ("toggle".equals(mode))
		ce.setSelected(!ce.selected);
	    else
		ce.setSelected(true);
	}
	int count = 0;
	for (CircuitElm ce : app.elmList)
	    if (ce.selected)
		count++;
	app.repaint();
	return count;
    }

    JavaScriptObject invokeCommand(String menu, String item, int targetIndex,
	    int scopeIndex, int plotIndex) {
	CircuitElm target = targetIndex >= 0 ? requireElement(targetIndex) : null;
	app.mouse.menuElm = target;
	app.mouse.setMouseElm(target);
	app.scopeManager.menuScope = scopeIndex;
	app.scopeManager.menuPlot = plotIndex;
	try {
	    app.commands.menuPerformed(menu, item);
	} finally {
	    app.mouse.menuElm = null;
	    app.mouse.setMouseElm(null);
	    app.scopeManager.menuScope = -1;
	    app.scopeManager.menuPlot = -1;
	}
	return getEditorState();
    }

    private CheckboxMenuItem getOptionItem(String name) {
	if ("showCurrent".equals(name)) return app.menus.dotsCheckItem;
	if ("showVoltage".equals(name)) return app.menus.voltsCheckItem;
	if ("showPower".equals(name)) return app.menus.powerCheckItem;
	if ("showValues".equals(name)) return app.menus.showValuesCheckItem;
	if ("smallGrid".equals(name)) return app.menus.smallGridCheckItem;
	if ("toolbar".equals(name)) return app.menus.toolbarCheckItem;
	if ("crosshair".equals(name)) return app.menus.crossHairCheckItem;
	if ("europeanResistors".equals(name)) return app.menus.euroResistorCheckItem;
	if ("iecGates".equals(name)) return app.menus.euroGatesCheckItem;
	if ("whiteBackground".equals(name)) return app.menus.printableCheckItem;
	if ("conventionalCurrent".equals(name)) return app.menus.conventionCheckItem;
	if ("editingDisabled".equals(name)) return app.menus.noEditCheckItem;
	if ("mouseWheelEdit".equals(name)) return app.menus.mouseWheelEditCheckItem;
	throw new IllegalArgumentException("Unknown CircuitJS option '" + name + "'");
    }

    JavaScriptObject setOption(String name, boolean value) {
	CheckboxMenuItem item = getOptionItem(name);
	if (item.getState() != value)
	    item.execute();
	app.repaint();
	return getOptions();
    }

    JavaScriptObject getOptions() {
	return makeOptionsState(
		app.menus.dotsCheckItem.getState(), app.menus.voltsCheckItem.getState(),
		app.menus.powerCheckItem.getState(), app.menus.showValuesCheckItem.getState(),
		app.menus.smallGridCheckItem.getState(), app.menus.toolbarCheckItem.getState(),
		app.menus.crossHairCheckItem.getState(), app.menus.euroResistorCheckItem.getState(),
		app.menus.euroGatesCheckItem.getState(), app.menus.printableCheckItem.getState(),
		app.menus.conventionCheckItem.getState(), app.menus.noEditCheckItem.getState(),
		app.menus.mouseWheelEditCheckItem.getState(), app.ui.speedBar.getValue(),
		app.ui.currentBar.getValue(), app.ui.powerBar.getValue(), app.transform[0],
		app.transform[4], app.transform[5]);
    }

    JavaScriptObject setControl(String name, int value) {
	if ("simulationSpeed".equals(name))
	    app.ui.speedBar.setValue(value);
	else if ("currentSpeed".equals(name))
	    app.ui.currentBar.setValue(value);
	else if ("powerBrightness".equals(name))
	    app.ui.powerBar.setValue(value);
	else
	    throw new IllegalArgumentException("Unknown CircuitJS control '" + name + "'");
	app.repaint();
	return getOptions();
    }

    JavaScriptObject setView(double scale, double translateX, double translateY) {
	if (scale < .2 || scale > 2.5)
	    throw new IllegalArgumentException("View scale must be between 0.2 and 2.5");
	app.transform[0] = app.transform[3] = scale;
	app.transform[4] = translateX;
	app.transform[5] = translateY;
	app.repaint();
	return getOptions();
    }

    JsArray<JavaScriptObject> getScopes() {
	JsArray<JavaScriptObject> result = newArray();
	for (int i = 0; i < app.scopeManager.scopeCount; i++) {
	    Scope s = app.scopeManager.scopes[i];
	    JsArray<JavaScriptObject> plots = newArray();
	    for (int p = 0; p < s.plots.size(); p++) {
		ScopePlot plot = s.plots.get(p);
		plots.push(makePlotState(p, app.locateElm(plot.elm), plot.value, plot.units,
			plot.acCoupled, plot.manScale, plot.manVPosition));
	    }
	    result.push(makeScopeState(i, s.getScopeLabelOrText(), s.position, s.speed,
		    s.manualScale, s.manDivisions, s.showV, s.showI, s.showScale,
		    s.showMax, s.showMin, s.showP2P, s.showFreq, s.showRMS,
		    s.showAverage, s.showDutyCycle, s.showElmInfo, s.fftPlot.enabled,
		    s.fftPlot.logSpectrum, s.fftPlot.showPhaseAngle, s.plot2d.enabled,
		    s.plot2d.plotXY, s.trigger.mode, s.trigger.edge, s.trigger.level,
		    s.plot2d.trailPersistence, plots));
	}
	return result;
    }

    JavaScriptObject setScopeProperty(int scopeIndex, String property, String value, int plotIndex) {
	Scope s = requireScope(scopeIndex);
	boolean handled = true;
	// Validate all references before creating an undo entry.
	if (("manualScaleValue".equals(property) || "plotPosition".equals(property) ||
		"acCoupled".equals(property)) && (plotIndex < 0 || plotIndex >= s.plots.size()))
	    throw new IllegalArgumentException("Scope plot index is out of range");
	app.undoManager.pushUndo();
	if ("label".equals(property))
	    s.setText(value.length() == 0 ? null : value);
	else if ("speed".equals(property)) {
	    int speed = Integer.parseInt(value);
	    if (speed < 1 || speed > 1024)
		throw new IllegalArgumentException("Scope speed must be between 1 and 1024");
	    s.speed = speed;
	    s.resetGraph(true);
	} else if ("position".equals(property))
	    s.position = Integer.parseInt(value);
	else if ("manualScale".equals(property))
	    s.setManualScale(Boolean.parseBoolean(value), true);
	else if ("manualScaleValue".equals(property))
	    s.setManualScaleValue(plotIndex, Double.parseDouble(value));
	else if ("plotPosition".equals(property))
	    s.setPlotPosition(plotIndex, Integer.parseInt(value));
	else if ("divisions".equals(property))
	    s.setManDivisions(Integer.parseInt(value));
	else if ("triggerMode".equals(property)) {
	    int mode = "freerun".equalsIgnoreCase(value) ? ScopeTrigger.TRIGGER_FREERUN :
		    "normal".equalsIgnoreCase(value) ? ScopeTrigger.TRIGGER_NORMAL :
		    "auto".equalsIgnoreCase(value) ? ScopeTrigger.TRIGGER_AUTO : Integer.parseInt(value);
	    s.setTriggerMode(mode);
	} else if ("triggerEdge".equals(property)) {
	    s.trigger.edge = "rising".equalsIgnoreCase(value) ? ScopeTrigger.TRIGGER_EDGE_RISING :
		    "falling".equalsIgnoreCase(value) ? ScopeTrigger.TRIGGER_EDGE_FALLING : Integer.parseInt(value);
	    s.resetGraph();
	} else if ("triggerLevel".equals(property)) {
	    s.trigger.level = Double.parseDouble(value);
	    s.resetGraph();
	} else if ("trailPersistence".equals(property))
	    s.plot2d.trailPersistence = Integer.parseInt(value);
	else if ("selectedPlot".equals(property))
	    s.selectedPlot = Integer.parseInt(value);
	else if ("acCoupled".equals(property)) {
	    if (plotIndex < 0 || plotIndex >= s.plots.size())
		throw new IllegalArgumentException("Scope plot index is out of range");
	    s.plots.get(plotIndex).acCoupled = Boolean.parseBoolean(value);
	    s.resetGraph();
	} else {
	    String known = "manualScale showvoltage showcurrent showscale showpeak shownegpeak " +
		    "showp2p showfreq showfft logspectrum showrms showaverage showduty " +
		    "showphaseangle showelminfo showpower showib showic showie showvbe " +
		    "showvbc showvce showvcevsic showvvsi plotxy showresistance showcharge maxscale";
	    if ((" " + known + " ").indexOf(" " + property + " ") < 0)
		handled = false;
	    else
		s.handleMenu(property, Boolean.parseBoolean(value));
	}
	if (!handled)
	    throw new IllegalArgumentException("Unknown scope property '" + property + "'");
	app.repaint();
	return getScopes().get(scopeIndex);
    }

    JavaScriptObject resetSimulation() {
	app.resetAction();
	app.repaint();
	return getEditorState();
    }

    native void install() /*-{
	var that = this;
	var stringify = function(value) {
	    return value == null ? "" : String(value);
	};
	var joinIndices = function(indices) {
	    if (indices == null)
		return "";
	    if (!Array.isArray(indices))
		throw new TypeError("indices must be an array");
	    return indices.join(",");
	};
	if (!$wnd.CircuitJS1)
	    throw new Error("CircuitJS1 base API must be installed before the editor bridge");
	$wnd.CircuitJS1.editor = {
	    getCapabilities: $entry(function() {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getCapabilities()();
	    }),
	    getState: $entry(function() {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getEditorState()();
	    }),
	    getElement: $entry(function(index) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getElementState(I)(index);
	    }),
	    getElementEditInfo: $entry(function(index) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getElementEditInfo(I)(index);
	    }),
	    getGlobalEditInfo: $entry(function() {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getGlobalEditInfo()();
	    }),
	    getOptions: $entry(function() {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getOptions()();
	    }),
	    getScopes: $entry(function() {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::getScopes()();
	    }),
	    addElement: $entry(function(type, x1, y1, x2, y2) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::addElement(Ljava/lang/String;IIII)(String(type), x1, y1, x2, y2);
	    }),
	    moveElement: $entry(function(index, x1, y1, x2, y2) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setElementPosition(IIIII)(index, x1, y1, x2, y2);
	    }),
	    splitWire: $entry(function(index, x, y) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::splitWire(III)(index, x, y);
	    }),
	    removeElements: $entry(function(indices) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::removeElements(Ljava/lang/String;)(joinIndices(indices));
	    }),
	    selectElements: $entry(function(indices, mode) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setSelection(Ljava/lang/String;Ljava/lang/String;)(joinIndices(indices), mode || "replace");
	    }),
	    setElementEditValue: $entry(function(index, fieldIndex, value) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setElementEditValue(IILjava/lang/String;)(index, fieldIndex, stringify(value));
	    }),
	    setGlobalEditValue: $entry(function(fieldIndex, value) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setGlobalEditValue(ILjava/lang/String;)(fieldIndex, stringify(value));
	    }),
	    setElementControl: $entry(function(index, controlId, value) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setElementControl(ILjava/lang/String;D)(index, String(controlId), value);
	    }),
	    createAdjustable: $entry(function(elementIndex, fieldIndex, label, min, max, step, logarithmic, sharedAdjustableIndex) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::createAdjustable(IILjava/lang/String;DDDZI)(elementIndex, fieldIndex, stringify(label), min, max, step, !!logarithmic, sharedAdjustableIndex == null ? -1 : sharedAdjustableIndex);
	    }),
	    updateAdjustable: $entry(function(adjustableIndex, label, min, max, step, logarithmic, sharedAdjustableIndex) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::updateAdjustable(ILjava/lang/String;DDDZI)(adjustableIndex, stringify(label), min, max, step, !!logarithmic, sharedAdjustableIndex == null ? -2 : sharedAdjustableIndex);
	    }),
	    removeAdjustable: $entry(function(adjustableIndex) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::removeAdjustable(I)(adjustableIndex);
	    }),
	    invokeCommand: $entry(function(menu, item, targetIndex, scopeIndex, plotIndex) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::invokeCommand(Ljava/lang/String;Ljava/lang/String;III)(String(menu), String(item), targetIndex == null ? -1 : targetIndex, scopeIndex == null ? -1 : scopeIndex, plotIndex == null ? -1 : plotIndex);
	    }),
	    setOption: $entry(function(name, value) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setOption(Ljava/lang/String;Z)(String(name), !!value);
	    }),
	    setControl: $entry(function(name, value) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setControl(Ljava/lang/String;I)(String(name), value);
	    }),
	    setView: $entry(function(scale, translateX, translateY) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setView(DDD)(scale, translateX, translateY);
	    }),
	    setScopeProperty: $entry(function(scopeIndex, property, value, plotIndex) {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::setScopeProperty(ILjava/lang/String;Ljava/lang/String;I)(scopeIndex, String(property), stringify(value), plotIndex == null ? -1 : plotIndex);
	    }),
	    resetSimulation: $entry(function() {
		return that.@com.lushprojects.circuitjs1.client.AgentBridge::resetSimulation()();
	    })
	};
    }-*/;

    JavaScriptObject getEditorState() {
	return makeEditorState(app.dumpCircuit(), app.simIsRunning(), app.sim.t,
		app.sim.maxTimeStep, app.ui.mouseModeStr,
		app.undoManager.undoStack.size() > 0, app.undoManager.redoStack.size() > 0,
		getOptions(), getElementStates(), getScopes());
    }

    private void markChanged() {
	app.unsavedChanges = true;
	app.undoManager.writeRecoveryToStorage();
	app.repaint();
    }
}
