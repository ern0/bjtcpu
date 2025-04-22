document.addEventListener('DOMContentLoaded', function() { startup() });


function startup() {

    init_vars();
    setup_editor();
    setup_keys();

    hilite(3);
}


function setup_editor() {

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
}

function hilite(lineno) {

    if (app.hilite > 0) {
        app.editor.removeLineClass(app.hilite, "background", "highlight");
    }

    if (hilite > 0) {
        app.editor.addLineClass(lineno, "background", "highlight");
    }
    app.hilite = lineno;
}


function execute(mode) {

    hilite(0);
    compile();
    app.exec_mode = mode;

    execute_step(1)
}

function execute_step(lineno) {

    var instr = app.code[lineno];
    instr["fn"](instr);
}

function compile() {

    app.code = [];
    app.line = 1;

    compile_append({"fn": debug_log, "log": "hello"});

    console.group("code");
    console.log(app.browser_code);
    console.groupEnd();
}

function compile_append(instr) {

    app.code[app.line] = instr;
    app.line += 1;
}

function debug_log(args) {
    console.log(args["log"]);
}
