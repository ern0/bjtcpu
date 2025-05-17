self.addEventListener("message", function(event) {

    result = compile(event.data);

    setTimeout(function() {
        postMessage(result);
    }, 500);

}, false);

function compile(packet) {

    app = {}
    app.prg_lines = {}

    text = packet["source"].split("\n");
    for (lineno in text) {

        let line = new Line(lineno, text[lineno])
        if (line.error != null) break;
    }

    result = {};
    result.status = "okay";
    return result;
}

function split(str) {

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

class Line {

    constructor(lineno, text) {

        this.error = null;
        this.lineno = lineno;

        this.text_split = split(text);
        if (this.text_split.length == 0) return;

        this.parse_label();
        this.parse_instr();
    }

    parse_label() {

        if (this.text_split[0][0] == ":") {
            this.label = this.text_split[0].split("^")[1];
        } else {
            this.label = null;
        }
    }

    parse_instr() {

        let instr_index = 0;
        if (this.label) instr_index = 1;

        this.instr_orig = this.text_split[instr_index];
        this.instr_eff = this.instr_orig
            .toLowerCase()
            .split("^")[1];

        this.args = this.text_split
            .slice(instr_index + 1)
            .map(item => {
                return item.split("^")[1]
            })

        if (this.instr_eff[0] == ".") {
            this.parse_pseudo_instr();
        } else {
            this.parse_real_instr();
        }

        console.warn(this.label)
        console.warn(this.instr_eff);
        console.warn(this.args);
    }

    parse_pseudo_instr() {
        console.log("pseudo:", this.instr_eff);
    }

    parse_real_instr() {
        console.log("real:", this.instr_eff);
    }

} // class Line
