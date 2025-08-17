self.addEventListener("message", function(event) {

    let compiler = new Compiler(event.data)
    compiler.compile();

    setTimeout(function() {
        postMessage(compiler);
    }, 500);

}, false);

function low_nibble(value) {
    return value & 0x0f;
}

function mid_nibble(value) {
    return (value >> 4) & 0x0f;
}

function high_nibble(value) {
    return (value >> 8) & 0x0f;
}

function super_nibble(value) {
    return (value >> 12) & 0x0f;
}

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

        return; /////////////////////////////////////////////////////

        if (this.error != null) {
            console.log("dump:", this.error)
            return;
        }

        console.group("==== lines ====");
        console.log(this.lines);
        console.groupEnd();

        console.group("==== symbols ====");
        console.log(this.symbols);
        console.groupEnd();

        console.group("==== memory ====");
        console.log(this.memory);
        console.groupEnd();

        // for (let ptr = 0; ptr < this.pc; ptr++) {
        //     console.log(ptr + ":", "$" + this.memory[ptr].value.toString(16));
        // }
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
            ".display": [null, 0,  2],
            ".address": [null, 0,  3],
            ".word":    [null, 0,  4],
        };
    }

    compile() {

        this.compile_round_1();
        if (this.error != null) return;

        this.compile_round_2();
        if (this.error != null) return;

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

    calculate_expression(expr, size) {

        console.log(expr)
        let result = [];
        result.push(0);

        return result;
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

        this.round1_parse_label();
        if (this.compiler.error != null) return;

        this.round1_parse_instr();
        if (this.compiler.error != null) return;

        this.size = this.round1_get_instr_size();
        if (this.compiler.error != null) return;
    }

    round1_get_instr_size() {

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

    round1_parse_label() {

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

    round1_parse_instr() {

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
        if (typeof(instr_info) == "undefined") return;
        const opcode = instr_info[0];
        const arg_size = instr_info[2];

        if (opcode == null) {

            if (this.instr_eff[0] == ".") {
                if (arg_size > 0) {
                    this.round2_proc_instr_pseudo_data(arg_size);
                } else {
                    // not such pseudo instructions yet
                }
            } else {
                this.round2_proc_instr_macro();
            }

        } else {
            this.round2_proc_instr_real(opcode, arg_size);
        }

    }

    round2_proc_instr_real(opcode, arg_size) {

        this.check_arg_count();
        if (this.compiler.error != null) return;

        this.add_instruction(opcode);
        if (this.compiler.error != null) return;

        if (this.instr_eff == "mvi") {
            const value = this.compiler.calculate_expression(this.args[1], 1)[0];
        if (this.compiler.error != null) return;
            this.add_immediate(value);
        } else {
            const address = this.compiler.calculate_expression(this.args[0], 1)[0];
            if (this.compiler.error != null) return;
            this.add_address(address);
        }
    }

    round2_proc_instr_macro() {

        if (this.instr_eff == "call") this.round2_proc_instr_macro_call();
        if (this.instr_eff == "ret") this.round2_proc_instr_macro_ret();
        if (this.compiler.error != null) return;
    }

    get_opcode_by_name(name) {

        return this.compiler.machine_instr_list[name][0];
    }

    round2_proc_instr_macro_call() {

        const PLACEHOLDER = 0;
        const target_address = 0;
        const return_address = this.pc + (1+1+1+3 + 1+1+1+3 + 1+1+1+3 + 1+3);

        this.add_instruction(this.get_opcode_by_name("mvi"));  // 1
        this.add_immediate(low_nibble(return_address));        // 1
        this.add_instruction(this.get_opcode_by_name("sta"));  // 1
        this.add_address(PLACEHOLDER);                         // 3

        this.add_instruction(this.get_opcode_by_name("mvi"));  // 1
        this.add_immediate(mid_nibble(return_address));        // 1
        this.add_instruction(this.get_opcode_by_name("sta"));  // 1
        this.add_address(PLACEHOLDER);                         // 3

        this.add_instruction(this.get_opcode_by_name("mvi"));  // 1
        this.add_immediate(high_nibble(return_address));       // 1
        this.add_instruction(this.get_opcode_by_name("sta"));  // 1
        this.add_address(PLACEHOLDER);                         // 3

        this.add_instruction(this.get_opcode_by_name("jmp"));  // 1
        this.add_address(target_address);                      // 3
    }

    round2_proc_instr_macro_ret() {

        const PLACEHOLDER = 0;

        this.add_instruction(this.get_opcode_by_name("jmp"));
        this.add_address(PLACEHOLDER);
    }

    round2_proc_instr_pseudo_data(arg_size) {

        let offset = 0;
        for (const arg_index in this.args) {
            const arg_value = this.args[arg_index];

            const value_list = this.compiler.calculate_expression(arg_value, arg_size);
            if (value_list == null) {
                this.report_error("invalid expression: " + arg_value);
                return;
            }

            for (const value in value_list) {

                let shift = 0;
                for (let digit_pos = 0; digit_pos < arg_size; digit_pos++) {

                    const digit_value = (value >> shift) & 0x0f;
                    shift += 4;
                    const nibble = new Nibble(this.compiler, digit_value, this);
                    this.compiler.set_mem_relative(offset + digit_pos, nibble);

                } // for digit

                offset += arg_size;
            } // for value
        } // for arg

    }

    check_arg_count() {

        let req_arg_count = 1;
        if (this.instr_eff == "mvi") req_arg_count = 2;

        if (this.args.length < req_arg_count) {
            this.report_error("missing argument");
            return;
        }
        if (this.args.length > req_arg_count) {
            this.report_error("too many arguments");
            return;
        }

        if (this.instr_eff == "mvi") {
            if (lowercase_unquoted(this.args[0]) != 'a') {
                this.report_error("first argument must be \"A\" for MVI");
                return;
            }
        }
    }

    add_instruction(opcode) {

        let nibble = new Nibble(this.compiler, opcode, this);
        this.compiler.set_mem_relative(0, nibble);
    }

    add_immediate(value) {

        const nibble = new Nibble(this.compiler, value, this);
        this.compiler.set_mem_relative(1, nibble);
    }

    add_address(address) {

        const low = new Nibble(this.compiler, low_nibble(address), this);
        this.compiler.set_mem_relative(1, low);

        const mid = new Nibble(this.compiler, mid_nibble(address), this);
        this.compiler.set_mem_relative(2, mid);

        const high = new Nibble(this.compiler, high_nibble(address), this);
        this.compiler.set_mem_relative(3, high);
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
