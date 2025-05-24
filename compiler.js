self.addEventListener("message", function(event) {

    let compiler = new Compiler(event.data)
    compiler.compile();

    setTimeout(function() {
        postMessage(compiler);
    }, 500);

}, false);

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

class Compiler {

    constructor(data) {
        this.packet = data;
        this.lines = {};
        this.symbols = {};
        this.error = null;
        this.address = 0;
    }

    compile() {

        this.compile_round_1();
        if (this.error == null) {
            this.compile_round_2();
        }

        console.group("==== lines ====");
        console.log(this.lines);
        console.groupEnd();
    }

    compile_round_1() {

        let text = this.packet["source"].split("\n");
        for (let index in text) {
            let lineno = 1 * index + 1;
            let line = new Line(this)

            line.round1(lineno, text[index]);

            if (line.error != null) {
                this.error = line;
                break;
            }
            this.lines[lineno] = line;
        }

    }

    compile_round_2() {

        for (let lineno in this.lines) {
            let line = this.lines[lineno];
            line.round2();
        }
    }

} // class Compiler

class Line {

    constructor(compiler) {

        this.compiler = compiler;
        this.error = null;
    }

    round1(lineno, text) {
        this.round = 1;

        this.lineno = lineno;
        this.text_split = split(text);

        this.parse_label();
        this.parse_instr();
    }

    parse_label() {

        this.label = null;

        if (this.text_split.length == 0) return;
        if (this.text_split[0][0] != ":") return;

        this.label = this.text_split[0].split("^")[1];
    }

    parse_instr() {

        let instr_index = (this.label ? 1 : 0);

        if (this.text_split.length <= instr_index) {
            this.instr_orig = null;
            this.instr_eff = ".nop";
        } else {
            this.instr_orig = this.text_split[instr_index];
            this.instr_eff = this.instr_orig
                .toLowerCase()
                .split("^")[1];
        }

        this.args = this.text_split
            .slice(instr_index + 1)
            .map(item => {
                return item.split("^")[1]
            });

        if (this.instr_eff == null) {
            this.instr_eff = ".nop";
        } else  if (this.instr_eff[0] == ".") {
            this.parse_pseudo_instr();
        } else {
            this.parse_real_instr();
        }
    }

    parse_pseudo_instr() {
        this.size = 2;
    }

    parse_real_instr() {
        this.data = [1, 2];
    }

    round2() {
        this.round = 2;

        console.group("---- line", this.lineno, "----");
        console.log("label:", this.label)
        console.log("instr", this.instr_eff);
        console.log("args", this.args);
        console.groupEnd()
    }

} // class Line
