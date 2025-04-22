document.addEventListener('DOMContentLoaded', function() { startup() });


function startup() {

    app = {};
    setup_editor();
    setup_keys();
}


function setup_editor() {

    app.editor = CodeMirror.fromTextArea(document.getElementById("editor"), {
        lineNumbers: true,
        theme: "dracula",
        lineWrapping: false,
        extraKeys: {
            "Ctrl-A": function(cm) { key_ctrl_r(cm); },
            "Cmd-A": function(cm) { key_ctrl_r(cm); }
        }
    });
}

function setup_keys() {

    document.addEventListener("keydown", function(event) {
        var is_ctrl = event.metaKey || event.ctrlKey;

        if (is_ctrl && event.key == 'a') {
            key_ctrl_r();
            event.preventDefault();
        }
    })
}

function key_ctrl_r(cm) {

    app.editor.addLineClass(2, "background", "highlight");

}
