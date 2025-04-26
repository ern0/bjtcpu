self.addEventListener("message", function(e) {

    console.log("COMPILING" + e.data);

    setTimeout(function() {
        postMessage("COMPILER DONE");
    }, 2500);

}, false);


function compile() {

    app.prog = [];
    app.line = 1;
    app.mem = [];
    app.ptr = 0;

    compile_append({"fn": debug_log, "log": "hello"});

    console.group("code");
    console.log(app.prog);
    console.groupEnd();
}

function compile_append(instr) {

    app.prog[app.line] = instr;
    app.line += 1;
}
