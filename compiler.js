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

function split_by(line, by) {

    const result = [];
    let current = '';
    let inside_single = false;
    let inside_double = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char == "'" && !inside_double) {
            if (inside_single) {
                current += char;
                result.push(current.trim());
                current = "";
                inside_single = false;
            } else {
                if (current.trim().length > 0) {
                    result.push(current.trim());
                    current = "";
                }
                current += char;
                inside_single = true;
            }
            continue;
        }

        if (char == '"' && !inside_single) {
            if (inside_double) {
                current += char;
                result.push(current.trim());
                current = "";
                inside_double = false;
            } else {
                if (current.trim().length > 0) {
                    result.push(current.trim());
                    current = "";
                }
                current += char;
                inside_double = true;
            }
            continue;
        }

        if (char == by && !inside_single && !inside_double) {
            if (current.trim().length > 0) {
                result.push(current.trim());
                current = "";
            }
            continue;
        }

        current += char;
    }

    if (current.trim().length > 0) {
        result.push(current.trim());
    }

    return result;
}

class Compiler {

    constructor(data) {

        this.packet = data;
        this.lines = {};
        this.memory = [];
        this.symbols = {};
        this.error = null;
        this.address = 0;

        this.machine_instr_list = {
            "mvi":  [0x0, 2],
            "sta":  [0x1, 4],
            "lda":  [0x2, 4],
            "ad0":  [0x3, 4],
            "ad1":  [0x4, 4],
            "adc":  [0x5, 4],
            "nand": [0x6, 4],
            "nor":  [0x7, 4],
            "rrm":  [0x8, 4],
            "jmp":  [0x9, 4],
            "jc":   [0xA, 4],
            "jnc":  [0xB, 4],
            "jz":   [0xC, 4],
            "jnz":  [0xD, 4],
            "jn":   [0xE, 4],
            "jp":   [0xF, 4]
        };
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

    add_symbol(type, orig_name, size, value, line) {

        const eff_name = orig_name.toLowerCase();

        if (eff_name in this.symbols) {
            const dupe_type = this.symbols[eff_name]["type"];
            this.report_error(
                type
                +' "' + orig_name + '"'
                + " is already defined as "
                + dupe_type
                ,line
            );
        }

        this.symbols[eff_name] = new Symbol(type, orig_name, size, value);
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
        this.size = 0;
    }

    report_error(message) {
        this.compiler.report_error(message, this);
    }

    round1(lineno, text) {

        this.round = 1;
        this.lineno = lineno;
        this.original = text;
        this.size = 0;

        this.parts = split_by(this.original, " ");
        if (this.parts.length == 0) return;
        if (this.parts[0].substring(0, 1) == ";") return;

        this.parse_label();
        if (this.error != null) return;

        this.parse_instr();
        if (this.error != null) return;

        this.size = this.get_instr_size();
        if (this.error != null) return;
    }

    get_instr_size() {
        if (this.instr_eff[0] == ".") return this.get_pseudo_instr_size();
        return this.get_machine_instr_size();
    }

    get_pseudo_instr_size() {

        if (!is_valid_symbol(this.instr_eff.substring(1,99))) {
            this.report_error("malformed pseudo instruction");
            return -1;
        }

        if (this.instr_eff == ".nop") return 0;
        if (this.instr_eff == ".nibble") return 1 * this.args.length;
        if (this.instr_eff == ".byte") return 2 * this.args.length;
        if (this.instr_eff == ".address") return 3 * this.args.length;

        this.report_error("invalid pseudo instruction");
        return -1;
    }

    get_machine_instr_size() {

        if (!is_valid_symbol(this.instr_eff)) {
            this.report_error("malformed instruction");
            return -1;
        }

        if (!this.instr_eff in this.compiler.machine_instr_list) {
            this.report_error("invalid instruction");
            return -1;
        }

        let size = this.compiler.machine_instr_list[this.instr_eff][1];
        return size;
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

        const instr_index = ( this.label == null ? 0 : 1 );
        if (this.parts.length <= instr_index) {
            this.instr_orig = null;
            this.instr_eff = ".nop";
            this.args = [];
            return;
        }

        this.instr_orig = this.parts[instr_index];
        this.instr_eff = this.instr_orig.toLowerCase();

        if (this.label != null) this.parts.shift();
        this.parts.shift();

        const str = this.parts.join(" ");
        this.args = split_by(str, ",");
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
