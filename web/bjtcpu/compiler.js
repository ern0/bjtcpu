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
    if (symbol[0] == "@") symbol = symbol.substring(1);
    if (/^\d/.test(symbol)) return false;
    return /^[a-zA-Z0-9_]+$/.test(symbol);
}

function split_by(line, split) {

    const result = [];
    let current = "";
    let in_quote = null;
    let i = 0;

    while (i < line.length) {
        const char = line[i];

        if ((char == '"') || (char == "'")) {
            if (in_quote == null) {
                in_quote = char;
                current += char;
            } else if (in_quote == char) {
                in_quote = null;
                current += char;
            } else {
                current += char;
            }
            i++;
            continue;
        }

        if ((char == split) && (in_quote == null)) {
            result.push(current);
            current = "";
            i++;
            continue;
        }

        current += char;
        i++;
    }

    result.push(current);

    return result;
}

function lowercase_unquoted(str) {

  let in_single_quote = false;
  let in_double_quote = false;
  let result = '';

  for (const char of str) {

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

function is_string_expr(expr) {

    if (expr[0] == '"') return true;
    if (expr[0] == "'") return true;

    return false;
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

        let ptr = 0;
        while (true) {

            const instr = this.memory[ptr].value;
            let line = ptr.toString(16).padStart(3, "0").toUpperCase();
            line += ":  " + instr.toString(16) + " ";
            ptr++;

            let width = 3;
            if (instr == 0) width = 1;

            for (let i = 0; i < width; i++) {
                const value = this.memory[ptr].value;
                ptr++;
                line += " " + value.toString(16);
            }

            console.log(line);

            if (ptr >= this.line_ptr) break;
        }

        let line = ptr.toString(16).padStart(3, "0").toUpperCase();
        console.log(line + ":  <EOF>");

    }

    add_label(line) {
        this.add_symbol("label", line.label, 3, this.line_ptr, line);
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

        this.symbols[eff_name] = new Symbol(type, orig_name, value);
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
            "nop":      [null, 4,  0],
            "hlt":      [null, 4,  0],
            "call":     [null, ((3 * 2) + (3 * 4) + (1 * 4)),  0],  // 3x mvi, 3x sta, 1x jmp => 22
            "ret":      [null, 4, 0],
            //
            ".nibble":  [null, 0,  1],
            ".byte":    [null, 0,  2],
            ".display": [null, 0,  2],
            ".address": [null, 0,  3],
            ".word":    [null, 0,  4],
            ".log":     [null, 0,  0],
        };
    }

    compile() {

        this.compile_round_1();
        if (this.error != null) return;

        this.compile_round_2();
        if (this.error != null) return;

        this.compile_round_3_resolve_calls();
        if (this.error != null) return;

        this.dump();
    }

    compile_round_1() {

        this.line_ptr = 0;

        let text = this.packet["source"].split("\n");
        for (let index in text) {

            let lineno = 1 * index + 1;
            let line = new Line(this)
            line.round1(lineno, text[index]);
            if (line.error != null) return;

            this.lines[lineno] = line;
            this.line_ptr += line.size;
        }
    }

    compile_round_2() {

        this.line_ptr = 0;
        this.last_ptr = 0;
        this.sub_call_list = [];
        this.sub_ret_list = {};
        this.last_sub = null;

        for (let lineno in this.lines) {

            let line = this.lines[lineno];
            line.round2();
            if (line.error != null) break;

            this.line_ptr += line.size;
        }
    }

    compile_round_3_resolve_calls() {

        for (const ref of this.sub_call_list) {

            const sub_name = ref[0];
            const call_address = ref[1];
            const line = ref[2];
            const ret_address = this.sub_ret_list[sub_name];
            const cont_address = call_address + (3*2) + (3*4) + 4;

            let mvi_address = call_address;
            this.memory[mvi_address + 1] = new Nibble(this, low_nibble(cont_address), line);
            let sta_address = mvi_address + 2;
            this.memory[sta_address + 1] = new Nibble(this, low_nibble(ret_address + 1), line);
            this.memory[sta_address + 2] = new Nibble(this, mid_nibble(ret_address + 1), line);
            this.memory[sta_address + 3] = new Nibble(this, high_nibble(ret_address + 1), line);

            mvi_address = sta_address + 4;
            this.memory[mvi_address + 1] = new Nibble(this, mid_nibble(cont_address), line);
            sta_address = mvi_address + 2;
            this.memory[sta_address + 1] = new Nibble(this, low_nibble(ret_address + 2), line);
            this.memory[sta_address + 2] = new Nibble(this, mid_nibble(ret_address + 2), line);
            this.memory[sta_address + 3] = new Nibble(this, high_nibble(ret_address + 2), line);

            mvi_address = sta_address + 4;
            this.memory[mvi_address + 1] = new Nibble(this, high_nibble(cont_address), line);
            sta_address = mvi_address + 2;
            this.memory[sta_address + 1] = new Nibble(this, low_nibble(ret_address + 3), line);
            this.memory[sta_address + 2] = new Nibble(this, mid_nibble(ret_address + 3), line);
            this.memory[sta_address + 3] = new Nibble(this, high_nibble(ret_address + 3), line);

            console.log("SUB:", sub_name, "call:", call_address.toString(16), "ret:", ret_address.toString(16))
        }

    }

    set_mem_relative(ptr, nibble) {

        const address = this.line_ptr + ptr;
        this.memory[address] = nibble;
        this.last_ptr = ptr;
    }

    calculate_expression(line, expr, size, negative_allowed) {

        expr = expr.trim();

        if (expr == "") {
            this.report_error("invalid expression", line);
            return;
        }

        if (is_string_expr(expr)) {
            return this.calculate_expression_string(line, expr, size);
        } else {
            return this.calculate_expression_numeric(line, expr, size, negative_allowed);
        }
    }

    calculate_expression_string(line, string_literal, size) {

        if ((size != 2) && (size != 0)) {
            this.report_error("string must be 8-bit", line);
            return;
        }

        if (string_literal[0] != string_literal[string_literal.length - 1]) {
            this.report_error("invalid string", line);
            return;
        }

        string_literal = string_literal.slice(1, -1);
        let result = [];

        for (const char of string_literal) {
            const ascii = char.charCodeAt(0);
            result.push(ascii);
        }

        if (line.instr_eff == ".display") {
            result = this.ascii_to_display(result);
        }

        return result;
    }

    ascii_to_display(result) {

        // TODO

        return result;
    }


    calculate_expression_numeric(line, expr, size, negative_allowed) {

        const error_message = "invalid expression";
        expr = expr.replace(/\s+/g, "");
        const tokens = expr.split(/([+-])/).filter(token => token != "");

        if (tokens[0] == "+" || tokens[0] == "-") {
            tokens.unshift("0");
        }
        let result = this.parse_value(line, tokens[0]);
        if (this.error != null) return;
        if (isNaN(result)) {
            this.report_error(error_message, line);
            return;
        }
        for (let i = 1; i < tokens.length; i += 2) {

            if (tokens.length <= (i + 1)) {
                this.report_error(error_message, line);
                return;
            }
            const operator = tokens[i];
            const next_value = this.parse_value(line, tokens[i + 1])
            if (this.error != null) return;

            if (isNaN(next_value)) {
                this.report_error(error_message, line);
                return;
            }

            if (operator == "+") {
                result += next_value;
            } else if (operator == "-") {
                result -= next_value;
            } else {
                this.report_error(error_message, line);
                return;
            }

        }

        this.check_limit(line, result, size, negative_allowed);
        return [result];
    }

    check_limit(line, value, size, negative_allowed) {

        if (size == 0) return;

        const bit_count = size * 4;
        const upper_limit_excl = 2 ** bit_count;
        let lower_limit_incl = 0;
        if (negative_allowed) {
            lower_limit_incl = -(2 ** (bit_count - 1));
        }

        if ((value < lower_limit_incl) || (value >= upper_limit_excl)) {
            this.report_error("value out of range", line);
        }
    }

    parse_value(line, token) {

        let value;

        if (is_valid_symbol(token)) {
            value = this.parse_symbol(line, token);
        } else {
            value = this.parse_number(token);
        }

        return value;
    }

    parse_symbol(line, token) {

        if (token[0] == "@") {
            return this.get_sysvar_value(line, token);
        } else {
            return this.get_symbol_value(line, token);
        }

    }

    get_sysvar_value(line, token) {

        const token_lc = token.toLowerCase();

        if (token_lc == "@line") return this.line_ptr;
        if (token_lc == "@pc") return this.line_ptr + this.last_set_ptr + 1;
        if (token_lc == "@end") return this.memory.length;

        this.report_error("undefined system variable: " + token, line);
    }

    get_symbol_value(line, token) {

        const token_lc = token.toLowerCase();

        const symbol = this.symbols[token_lc];
        if (typeof(symbol) == "undefined") {
            this.report_error("undefined symbol: " + token, line);
            return;
        }

        return symbol.value;
    }

    parse_number(token) {

        if (token == "0") return 0;

        let radix = 10;
        if (token.startsWith("$")) {
            token = token.substring(1);
            radix = 16;
        }
        if (token.startsWith("0")) {
            if (token.toLowerCase().startsWith("0x")) {
                token = token.substring(2);
                radix = 16;
            } else {
                token = token.substring(1);
                radix = 8;
            }
        }
        if (token.startsWith("%")) {
            token = token.substring(1);
            radix = 2;
        }

        let value = parseInt(token, radix);

        if (isNaN(value)) return NaN;
        if ((radix == 10) && (token != value)) return NaN;

        return value;
    }

    get_valid_target_address(line, instr_type) {

        const target_expr = line.args[0];
        if (typeof(target_expr) == "undefined") {
            this.report_error("missing " + instr_type + " target", line);
            return;
        }

        const target_lc = target_expr.toLowerCase();
        const symbol = this.symbols[target_lc];
        if (typeof(symbol) == "undefined") {
            if (is_valid_symbol(target_lc)) {
                this.report_error("undefined " + instr_type + " target label: " + target_expr, line);
            } else {
                this.report_error("invalid " + instr_type + " target expression: " + target_expr, line);
            }
            return;
        }

        return symbol.value;
    }

} // class Compiler

class Line {

    constructor(compiler) {

        this.compiler = compiler;
        this.size = 0;
        this.label = null;
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
        this.offset = 0;

        this.parts = split_by(this.original.trim(), " ");
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
        if (this.instr_eff[0] == ".") symbol_to_validate = this.instr_eff.substring(1);
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
            this.instr_eff = "nop";
            this.args = [];
            return;
        }

        this.instr_orig = this.parts[instr_index];
        this.instr_eff = this.instr_orig.toLowerCase();

        if (this.label != null) this.parts.shift();
        this.parts.shift();

        const str = this.parts.join(" ");
        this.args = split_by(str, ",");
        if (this.args[0] == "") {
            this.args = [];
        }
    }

    round2() {

        const instr_info = this.compiler.machine_instr_list[this.instr_eff];
        if (typeof(instr_info) == "undefined") return;
        this.offset = 0;
        const opcode = instr_info[0];
        const arg_size = instr_info[2];

        if (opcode == null) {
            if (this.instr_eff[0] == ".") {
                if (arg_size > 0) {
                    this.round2_proc_instr_pseudo_data(arg_size);
                } else {
                    this.round2_proc_instr_pseudo_log();
                }
            } else {
                this.round2_proc_instr_macro();
            }

        } else {
            this.round2_proc_instr_real(opcode, arg_size);
        }

    }

    round2_proc_instr_real(opcode, arg_size) {

        if (this.instr_eff != "jmp") {
            this.check_arg_count();
            if (this.compiler.error != null) return;
        }

        this.add_instruction(opcode);
        if (this.compiler.error != null) return;

        if (this.instr_eff == "mvi") {
            const result = this.compiler.calculate_expression(this, this.args[1], arg_size, true);
            if (this.compiler.error != null) return;
            const value = result[0];
            this.add_immediate(value);
        } else if (this.instr_eff == "jmp") {
            const address = this.compiler.get_valid_target_address(this, "jmp");
            if (this.compiler.error != null) return;
            this.add_address(address);
        } else {
            const result = this.compiler.calculate_expression(this, this.args[0], arg_size, false);
            if (this.compiler.error != null) return;
            const address = result[0];
            this.add_address(address);
        }
    }

    round2_proc_instr_macro() {

        if (this.instr_eff == "nop") this.round2_proc_isntr_macro_nop();
        if (this.instr_eff == "hlt") this.round2_proc_isntr_macro_hlt();
        if (this.instr_eff == "call") this.round2_proc_instr_macro_call();
        if (this.instr_eff == "ret") this.round2_proc_instr_macro_ret();
        if (this.compiler.error != null) return;
    }

    get_opcode_by_name(name) {
        return this.compiler.machine_instr_list[name][0];
    }

    round2_proc_isntr_macro_nop() {

        this.add_instruction(this.get_opcode_by_name("jmp"));
        this.add_address(this.compiler.line_ptr + 4);
    }

    round2_proc_isntr_macro_hlt() {

        this.add_instruction(this.get_opcode_by_name("jmp"));
        this.add_address(this.compiler.line_ptr);
    }

    round2_proc_instr_macro_call() {

        const target_address = this.compiler.get_valid_target_address(this, "call");
        if (this.compiler.error != null) return;

        const target_lc = this.args[0].toLowerCase();
        this.compiler.sub_ret_list[target_lc] = null;
        this.compiler.sub_call_list.push([target_lc, this.compiler.line_ptr, this]);
        this.compiler.last_sub = target_lc;
        const PLACEHOLDER = 0;

        const return_address = this.compiler.line_ptr + (
            1+1+1+3 +
            1+1+1+3 +
            1+1+1+3 +
            1+3
        );

        this.add_instruction(this.get_opcode_by_name("mvi"));  // 1
        this.add_immediate(low_nibble(return_address));        // 1
        this.offset += 2;
        this.add_instruction(this.get_opcode_by_name("sta"));  // 1
        this.add_address(PLACEHOLDER);                         // 3
        this.offset += 4;

        this.add_instruction(this.get_opcode_by_name("mvi"));  // 1
        this.add_immediate(mid_nibble(return_address));        // 1
        this.offset += 2;
        this.add_instruction(this.get_opcode_by_name("sta"));  // 1
        this.add_address(PLACEHOLDER);                         // 3
        this.offset += 4;

        this.add_instruction(this.get_opcode_by_name("mvi"));  // 1
        this.add_immediate(high_nibble(return_address));       // 1
        this.offset += 2;
        this.add_instruction(this.get_opcode_by_name("sta"));  // 1
        this.add_address(PLACEHOLDER);                         // 3
        this.offset += 4;

        this.add_instruction(this.get_opcode_by_name("jmp"));  // 1
        this.add_address(target_address);                      // 3
    }

    round2_proc_instr_macro_ret() {

        const PLACEHOLDER = 0;

        this.add_instruction(this.get_opcode_by_name("jmp"));
        this.add_address(PLACEHOLDER);

        if (this.compiler.last_sub != null) {
            this.compiler.sub_ret_list[this.compiler.last_sub] = this.compiler.line_ptr;
            this.compiler.last_sub = null;
        }
    }

    round2_proc_instr_pseudo_data(arg_size) {

        for (const arg_value of this.args) {

            const value_list = this.compiler.calculate_expression(this, arg_value, arg_size, true);
            if (this.compiler.error != null) return;

            for (const value_index in value_list) {
                const value = value_list[value_index];

                let shift = 0;
                for (let digit_pos = 0; digit_pos < arg_size; digit_pos++) {

                    const digit_value = (value >> shift) & 0x0f;
                    shift += 4;
                    const nibble = new Nibble(this.compiler, digit_value, this);
                    this.compiler.set_mem_relative(this.offset + digit_pos, nibble);

                } // for digit

                this.offset += arg_size;
            } // for value
        } // for arg

    }

    round2_proc_instr_pseudo_log() {

        let result = "";
        let separator = ",";

        for (let arg_value of this.args) {
            arg_value = arg_value.trim();

            if (is_string_expr(arg_value)) {
                result += arg_value.slice(1, -1);
                separator = ": ";
                continue;
            }

            const value_list = this.compiler.calculate_expression(this, arg_value, 0, true);
            if (this.compiler.error != null) return;

            if (result != "") result += separator;
            separator = ", ";

            let vals = "";
            for (let value of value_list) {
                vals += ("" + value).trim();
            }
            if (vals != arg_value) {
                result += arg_value + " = ";
            }
            result += vals;
        }

        console.warn("LOG[" + this.lineno + "]:", result);
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
        this.compiler.set_mem_relative(0 + this.offset, nibble);
    }

    add_immediate(value, offset) {

        const nibble = new Nibble(this.compiler, value, this);
        this.compiler.set_mem_relative(1 + this.offset, nibble);
    }

    add_address(address, offset) {

        const low = new Nibble(this.compiler, low_nibble(address), this);
        this.compiler.set_mem_relative(1 + this.offset, low);

        const mid = new Nibble(this.compiler, mid_nibble(address), this);
        this.compiler.set_mem_relative(2 + this.offset, mid);

        const high = new Nibble(this.compiler, high_nibble(address), this);
        this.compiler.set_mem_relative(3 + this.offset, high);
    }

} // class Line

class Symbol {

    constructor(type, name, value) {
        this.type = type;
        this.name = name;
        this.value = value;
    }
}

class Nibble {

    constructor(compiler, value, line) {
        this.compiler = compiler;
        this.value = value;
        this.line = line;
        this.label_first_ret = null;
    }
}
