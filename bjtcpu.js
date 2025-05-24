document.addEventListener('DOMContentLoaded', function() { startup() });


function startup() {

    init_vars();
    setup_editor();
    setup_keys();

    compile_background_launch();
    //hilite(2);
}


function setup_editor() {

    app.editor_change_timeout = null;

    app.editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        lineNumbers: true,
        theme: "dracula",
        lineWrapping: false,
        extraKeys: {
            "Ctrl-E": function(_cm) { execute("full"); },
            "Cmd-E": function(_cm) { execute("full"); },
            "Ctrl-A": function(_cm) { execute("anim"); },
            "Cmd-A": function(_cm) { execute("anim"); },
            "Ctrl-T": function(_cm) { execute("debug"); },
            "Cmd-T": function(_cm) { execute("debug"); },
        }
    });

    app.editor.on("change", function(cm, change) {
        editor_changed();
    });
}

function editor_changed() {

    if (app.editor_change_timeout != null) {
        clearTimeout(app.editor_change_timeout);
        app.editor_change_timeout = null;
    }

    if (app.compile_indicator_timeout != null) {
        clearTimeout(app.compile_indicator_timeout);
        app.compile_indicator_timeout = null;
    }

    if (app.state == "compiling") {
        app.worker.terminate();
    }

    if (app.state != "edit") {
        set_state("edit");
    }

    indicator("edit");

    app.editor_change_timeout = setTimeout(function() {
        compile_background_launch();
    },1200);
}

function setup_keys() {

    document.addEventListener("keydown", function(event) {
        var is_ctrl = event.metaKey || event.ctrlKey;

        if (is_ctrl && event.key == 'e') {
            execute("full");
            event.preventDefault();
        }
        if (is_ctrl && event.key == 'a') {
            execute("anim");
            event.preventDefault();
        }
        if (is_ctrl && event.key == 't') {
            execute("debug");
            event.preventDefault();
        }
    })
}

function init_vars() {

    app = {};
    app.hilite = 0;
    app.state = "(none)";
    set_state("edit");
    indicator("edit");
    app.compile_indicator_timeout = null;
}

function set_state(st) {

    //console.log("status: " + app.state + " => " + st);
    app.state = st;
}

function hilite(lineno) {

    if (app.hilite > 0) {
        app.editor.removeLineClass(app.hilite, "background", "highlight");
    }

    if (lineno > 0) {
        app.editor.addLineClass(lineno, "background", "highlight");
        app.hilite = lineno;
    }
}

function indicator(status) {

    var indicator = document.getElementById("indicator");

    indicator.className = indicator.className
        .split(' ')
        .filter(className => !className.startsWith('indicator-'))
        .join(' ');

    indicator.classList.add("indicator-" + status);
}

function compile_background_launch() {

    if (app.state == "compiling") {
        app.worker.terminate();
    } else {
        app.compile_saved_state = app.state;
        set_state("compiling");
        indicator("compiling");
        if (app.compile_indicator_timeout != null) {
            clearTimeout(app.compile_indicator_timeout);
            app.compile_indicator_timeout = null;
        }
    }

    app.worker = new Worker("compiler.js?" + (new Date()).getTime());
    app.worker.onmessage = function(event) {
        compile_background_finished(event.data);
    }

    packet = {};
    packet["source"] = app.editor.getValue();
    app.worker.postMessage(packet);
}

function compile_background_finished(compiler) {
    app.compiler = compiler;

    app.state = app.compile_saved_state;

    if (compiler.error == null) {

        indicator("okay");

        if (app.compile_indicator_timeout != null) {
            clearTimeout(app.compile_indicator_timeout);
            app.compile_indicator_timeout = null;
        }
        app.compile_indicator_timeout = setTimeout(function() {
            if (app.state == "edit") {
                indicator("edit");
            }
        }, 5000);

    } else {

        indicator("error");

    }

}

function execute(mode) {

    hilite(0);
    app.exec_mode = mode;

    execute_step(1)
}

function execute_step(lineno) {

    var instr = app.code[lineno];
    instr["fn"](instr);
}
