self.addEventListener("message", function(event) {

    let compiler = new Compiler(event.data)
    compiler.compile();

    setTimeout(function() {
        postMessage(compiler);
    }, 500);

}, false);

function is_valid_symbol(symbol) {

    if (symbol.length == 0) return false;
    if (/^\d/.test(symbol)) return false;
    return /^[a-zA-Z0-9_]+$/.test(symbol);
}

function split(line) {

    const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
    const matches = [];
    let match;

    while ((match = regex.exec(line)) !== null) {
        matches.push(match[1] || match[2] || match[0]);
    }

    return matches;
}

class Compiler {

    constructor(data) {

        this.packet = data;
        this.lines = {};
        this.memory = [];
        this.symbols = {};
        this.error = null;
        this.address = 0;
    }

    dump() {

        console.group("==== lines ====");
        console.log(this.lines);
        console.groupEnd();

        console.group("==== symbols ====");
        console.log(this.symbols);
        console.groupEnd();

        console.group("==== memory ====");
        console.log(this.memory);
        console.groupEnd();
    }

    compile() {

        this.compile_round_1();
        if (this.error == null) {
            this.compile_round_2();
        }

        this.dump();
    }

    compile_round_1() {

        this.pc = 0;

        let text = this.packet["source"].split("\n");
        for (let index in text) {
            let lineno = 1 * index + 1;
            let line = new Line(this)

            line.round1(lineno, text[index]);
            if (line.error != null) return;

            this.lines[lineno] = line;
            this.pc += line.size;
        }

    }

    add_label(line) {
        this.add_symbol("label", line.label, 3, this.pc, line);
    }

    add_symbol(type, name, size, value, line) {

        if (name in this.symbols) {
            const dupe_type = this.symbols[name]["type"];
            this.report_error(
                type
                +' "' + name + '"'
                + " is already defined as "
                + dupe_type
                ,line
            );
        }

        this.symbols[name] = new Symbol(type, name, size, value);
    }

    report_error(message, line) {

        if (this.error == null) {
            this.error = {};
            this.error.message = message + " &ndash; line " + line.lineno;
            this.error.line = line;
        }
    }

    compile_round_2() {

        this.pc = 0;

        for (let lineno in this.lines) {

            let line = this.lines[lineno];
            line.round2();

            if (line.size == 0) continue;

            for (let index = 0; index < line.size; index++) {
                let value = line.data[index];
                this.memory[this.pc] = new Nibble(this, value, line);
                this.pc += line.size;
            }
        }
    }

} // class Compiler

class Line {

    constructor(compiler) {

        this.compiler = compiler;
        this.error = null;
    }

    report_error(message) {
        this.compiler.report_error(message, this);
    }

    round1(lineno, text) {

        this.round = 1;
        this.lineno = lineno;
        this.original = text;

        this.parts = split(this.original);

        if (this.parts.length == 0) return;
        if (this.parts[0].substring(0, 1) == ";") return;
        this.parse_label();

        this.size = 2; ////

    }

    parse_label() {

        this.label = null;
        const len = this.parts[0].length;
        let last_char = this.parts[0].substring(len - 1, len);

        this.check_multipart_label();
        if (this.compiler.error != null) return;
        if (last_char != ":") return;

        const candidate = this.parts[0].substring(0, len - 1);
        if (is_valid_symbol(candidate)) {
            this.label = candidate;
            this.compiler.add_label(this);
        } else {
            this.report_error("invalid label value");
        }
    }

    check_multipart_label() {

        if (this.parts.length < 2) return;

        for (let i = 1; i < this.parts.length; i++) {

            const len = this.parts[i].length;
            let last_char = this.parts[i].substring(len - 1, len);
            if (last_char == ":") {
                this.report_error("invalid label format");
                return;
            }
        }
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
    }

    parse_real_instr() {
    }

    round2() {

        this.round = 2;

        this.data = [1, 2]; ////

    }

} // class Line

class Symbol {

    constructor(type, name, size, value) {
        this.type = type;
        this.name = name;
        this.size = size;
        this.value = value;
    }
}

class Nibble {

    constructor(compiler, value, line) {
        this.compiler = compiler;
        this.value = value;
        this.line = line;
    }
}
