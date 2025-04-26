self.addEventListener("message", function(event) {

    result = compile(event.data);

    setTimeout(function() {
        postMessage(result);
    }, 500);

}, false);


function compile(packet) {

    app = {};
    app.prog = [];
    app.line = 1;
    app.mem = [];
    app.ptr = 0;

    result = {};
    result.status = "okay";

    return result;
}

function compile_append(instr) {

    app.prog[app.line] = instr;
    app.line += 1;
}
