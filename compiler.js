self.addEventListener("message", function(event) {

    result = compile(event.data);

    setTimeout(function() {
        postMessage(result);
    }, 500);

}, false);


function split_line(str) {

    const result = [];
    var current = "";
    var inside_quote = null;
    var skip_rest = false;
    var last_delim = ""

    for (var i = 0; i < str.length; i++) {
        var char = str[i];

        if (skip_rest) continue;

        if (char == '"' || char == "'") {
            if (inside_quote == char) {
                inside_quote = null;
            } else if (inside_quote == null) {
                inside_quote = char;
            }
            continue;
        }

        if (inside_quote) {
            if (char != inside_quote) current += char;
            continue;
        }

        if (char === ';') {
            skip_rest = true;
            continue;
        }

        if (char == ':' || char == ',' || char == ' ') {
            if (current.trim()) {
                if (char == ":") {
                    result.push(":^" + current.trim());
                    last_delim = "";
                } else {
                    result.push(last_delim + "^" + current.trim());
                    last_delim = char;
                }
            }
            current = '';
            continue;
        }

        current += char;
    }

    if (current.trim()) {
        result.push(last_delim + "^" + current.trim());
    }

    return result;
}

function compile(packet) {

    app = {}
    app.ptr = 0;
    app.mem = {}

    text = packet["source"].split("\n");
    for (lineno in text) {
        var line = text[lineno];
        line = line.replace("\t", " ");
        line = line.trim();
        line = split_line(line);

        console.log(line);
    }

    result = {};
    result.status = "okay";
    return result;
}



function compile_append(instr) {

    app.prog[app.line] = instr;
    app.line += 1;
}

function test() {

    a = "label: db 1,2,4,'a,b,c',99 ; okay"
    a = split_line(a)
    console.log(a)
}
