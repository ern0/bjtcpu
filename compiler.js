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

    result.push(current.trim());

    return result;
}

function lowercase_unquoted(str) {

  let in_single_quote = false;
  let in_double_quote = false;
  let result = '';

  for (let i = 0; i < str.length; i++) {
    const char = str[i];

    if (char == "'" && !in_double_quote) {
      in_single_quote = !in_single_quote;
    } else if (char == '"' && !in_single_quote) {
      in_double_quote = !in_double_quote;
    }

    if (in_single_quote || in_double_quote) {
      result += char;
    } else {
      result += char.toLowerCase();
    }
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

        this.create_instr_list();
    }

    dump() {

        if (this.error != null) {
            console.log("dump:", this.error)
            return;
        }

        // console.group("==== lines ====");
        // console.log(this.lines);
        // console.groupEnd();

        // console.group("==== symbols ====");
        // console.log(this.symbols);
        // console.groupEnd();

        // console.group("==== memory ====");
        // console.log(this.memory);
        // console.groupEnd();

        for (let ptr = 0; ptr < this.pc; ptr++) {
            console.log(ptr + ":", "$" + this.memory[ptr].value.toString(16));
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

    create_instr_list() {

        // "instr": [opcode, size_fix, size_opcount_multiplier]
        this.machine_instr_list = {
            "mvi":      [0x0,  2,  0],
            "sta":      [0x1,  4,  0],
            "lda":      [0x2,  4,  0],
            "ad0":      [0x3,  4,  0],
            "ad1":      [0x4,  4,  0],
            "adc":      [0x5,  4,  0],
            "nand":     [0x6,  4,  0],
            "nor":      [0x7,  4,  0],
            "rrm":      [0x8,  4,  0],
            "jmp":      [0x9,  4,  0],
            "jc":       [0xA,  4,  0],
            "jnc":      [0xB,  4,  0],
            "jz":       [0xC,  4,  0],
            "jnz":      [0xD,  4,  0],
            "jn":       [0xE,  4,  0],
            "jp":       [0xF,  4,  0],
            //
            "nop":      [null, 0,  0],
            "call":     [null, ((2 * 3) + (4 * 3)),  0],
            "ret":      [null, 4, 0],
            //
            ".nibble":  [null, 0,  1],
            ".byte":    [null, 0,  2],
            ".address": [null, 0,  3],
            ".word":    [null, 0,  4],
        };
    }

    compile() {

        this.compile_round_1();
        if (this.error != null) return;

        this.compile_round_2();
        if (this.error != null) return;

        console.log(this.lines);
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

    compile_round_2() {

        this.pc = 0;

        for (let lineno in this.lines) {

            let line = this.lines[lineno];
            line.round2();
            if (line.error != null) break;

            this.pc += line.size;
        }
    }

    set_mem_relative(offset, nibble) {
        this.memory[this.pc + offset] = nibble;
    }

} // class Compiler

class Line {

    constructor(compiler) {

        this.compiler = compiler;
        this.size = 0;
    }

    report_error(message) {
        this.error = message;
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
        if (this.parts[0] == "") return;

        this.parse_label();
        if (this.compiler.error != null) return;

        this.parse_instr();
        if (this.compiler.error != null) return;

        this.size = this.get_instr_size();
        if (this.compiler.error != null) return;
    }

    get_instr_size() {

        let symbol_to_validate = this.instr_eff;
        if (this.instr_eff[0] == ".") symbol_to_validate = this.instr_eff.substring(1,99);
        if (!is_valid_symbol(symbol_to_validate)) {
            this.report_error("malformed instruction");
            return -1;
         }

        if (!(this.instr_eff in this.compiler.machine_instr_list)) {
            this.report_error("invalid instruction");
            return -1;
        }

        const instr_info = this.compiler.machine_instr_list[this.instr_eff];
        const size = instr_info[1] + (instr_info[2] * this.args.length);
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
            this.label = candidate.toLowerCase();
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

        const instr_info = this.compiler.machine_instr_list[this.instr_eff];
        const opcode = instr_info[0];
        const arg_size = instr_info[1];

        if (opcode != null) {
            this.round2_proc_instr(opcode, arg_size);
            if (this.compiler.error != null) return;
        } else {
            // pass
        }

    }

    round2_proc_instr(opcode, arg_size) {

        this.check_arg_count();
        if (this.compiler.error != null) return;


        this.report_error("break");

    }

    check_arg_count() {

        let req_arg_count = 1;
        if (this.instr_eff == "mvi") req_arg_count = 2;

        if (this.args.length < 2) {
            this.report_error("missing argument");
            return;
        }
        if (this.args.length > 2) {
            this.report_error("too many arguments");
            return;
        }

        if (this.instr_eff == "mvi") {
            if (lowercase_unquoted(this.args[0]) != 'a') {
                this.report_error("first argument must be \"a\" for mvi");
                return;
            }
        }
    }

    add_instruction(code) {
        let nibble = new Nibble(this.compiler, code, this);
        this.compiler.set_mem_relative(0, nibble);
    }

    add_address(address) {

        const value1 = (address >> 0) & 0x0f;
        const nibble1 = new Nibble(this.compiler, value1, this);
        this.compiler.set_mem_relative(1, nibble1);

        const value2 = (address >> 4) & 0x0f;
        const nibble2 = new Nibble(this.compiler, value2, this);
        this.compiler.set_mem_relative(2, nibble2);

        const value3 = (address >> 8) & 0x0f;
        const nibble3 = new Nibble(this.compiler, value3, this);
        this.compiler.set_mem_relative(3, nibble3);
    }

    add_operand(op) {

        const nibble = new Nibble(this.compiler, op, this);
        this.compiler.set_mem_relative(1, nibble);
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
