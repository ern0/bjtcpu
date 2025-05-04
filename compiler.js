self.addEventListener("message", function(event) {

    result = compile(event.data);

    setTimeout(function() {
        postMessage(result);
    }, 500);

}, false);


function split_line(str) {

    const result = [];
    let current = "";
    let inside_quote = null;
    let skip_rest = false;
    let last_delim = ""

    for (let i = 0; i < str.length; i++) {
        let char = str[i];

        if (skip_rest) continue;

        if ((char == '"') || (char == "'")) {
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

        if (char == ';') {
            skip_rest = true;
            continue;
        }

        char = char.replace("\t", " ");

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
    app.prg_lines = {}

    text = packet["source"].split("\n");
    for (lineno in text) {
        const line_text = text[lineno];
        const line_split = split_line(line_text);
        if (line_split.length == 0) continue;
        let line_obj = parse_line(lineno, line_split);

        console.log(line_obj);
        if (line_obj["error"] != null) break;
    }

    result = {};
    result.status = "okay";
    return result;
}

function parse_line(lineno, line_split) {

    let line_obj = {};
    line_obj["error"] = null;
    line_obj["lineno"] = lineno;

    parse_line_label(line_obj, line_split);
    parse_line_instr(line_obj, line_split);

    return line_obj;
}

function parse_line_label(line_obj, line_split) {

    if (line_split[0][0] == ":") {
        line_obj["label"] = line_split[0].split("^")[1];
    } else {
        line_obj["label"] = null;
    }
}

function parse_line_instr(line_obj, line_split) {

    let isntr_index = 0;
    if (line_obj["lineno"]) instr_index = 1;

    const instr_orig = line_split[instr_index];
    const instr_eff = instr_orig.toLowerCase();
    line_obj["instr"] = instr_eff;
    line_obj["args"] = line_split.slice(instr_index + 1);

    parse_check_instr_nof_args(line_obj);
}

function parse_check_instr_nof_args(line_obj) {

    if (line_obj["instr"][0] == ".") {
        parse_check_pseudo_instr_nof_args(line_obj);
    } else {
        parse_check_real_instr_nof_args(line_obj);
    }
}

function parse_check_pseudo_instr_nof_args(line_obj) {
    // TODO
}

function parse_check_real_instr_nof_args(line_obj) {
    // TODO
}
