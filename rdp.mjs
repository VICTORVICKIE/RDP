const PRECISION = 15;
const BINARY_OPS = {
    "+": (lhs, rhs) => Number((lhs + rhs).toPrecision(PRECISION)),
    "-": (lhs, rhs) => Number((lhs - rhs).toPrecision(PRECISION)),
    "*": (lhs, rhs) => Number((lhs * rhs).toPrecision(PRECISION)),
    "/": (lhs, rhs) => Number((lhs / rhs).toPrecision(PRECISION)),
    "^": (lhs, rhs) => Number((lhs ** rhs).toPrecision(PRECISION)),
};

const UNARY_OPS = {
    "+": (operand) => operand,
    "-": (operand) => -operand,
    "%": (operand) => Number((operand / 100).toPrecision(PRECISION)),
};

class Lexer {
    stream = "";
    cursor = 0;

    isNumber(str) {
        const charCode = str.charCodeAt(0);
        return (charCode >= "0".charCodeAt(0) && charCode <= "9".charCodeAt(0)) || charCode === ".".charCodeAt(0);
    }

    peek(offset) {
        return this.stream[this.cursor + offset];
    }

    get current() {
        return this.peek(0);
    }

    tokenize(stream, nullTerm = true) {
        this.cursor = 0;
        this.stream = stream;

        let tokens = [];

        while (this.cursor < this.stream.length) {
            switch (this.current) {
                case " ": {
                    this.cursor++;
                    break;
                }

                case "+":
                case "-": {
                    tokens.push({ kind: "operator", type: "additive", value: this.current });
                    this.cursor++;
                    break;
                }

                case "/":
                case "*": {
                    tokens.push({ kind: "operator", type: "multiplicative", value: this.current });
                    this.cursor++;
                    break;
                }

                case "%": {
                    // we convert percentage to prefix unary, A% to %A
                    tokens.splice(tokens.length - 1, 0, { kind: "operator", type: "percentage", value: this.current });
                    this.cursor++;
                    break;
                }

                case "^": {
                    tokens.push({ kind: "operator", type: "exponential", value: this.current });
                    this.cursor++;
                    break;
                }

                case "(":
                case ")": {
                    tokens.push({ kind: "separator", type: "bracket", value: this.current });
                    this.cursor++;
                    break;
                }

                default: {
                    if (this.isNumber(this.current)) {
                        let strNumber = "";

                        while (this.cursor < this.stream.length && this.isNumber(this.current)) {
                            strNumber += this.current;
                            this.cursor++;
                        }

                        tokens.push({ kind: "operand", type: "number", value: Number(strNumber) });
                    } else {
                        tokens.push({ kind: "invalid", type: "unknown", value: this.current });
                        this.cursor++;
                    }
                }
            }
        }

        if (nullTerm) tokens.push({ kind: "eof", type: "eof", value: null });
        return tokens;
    }
}

class Parser {
    tokens = [];
    cursor = 0;

    peek(offset) {
        let idx = this.cursor + offset;
        if (idx < 0 || idx > this.tokens.length) {
            idx = this.tokens.length - 1;
        }
        return this.tokens[idx];
    }

    get current() {
        return this.peek(0);
    }

    countParanthesis(tokens) {
        let count = 0;
        for (const token of tokens) {
            if (token.type === "bracket" && token.value === "(") count++;
            if (token.type === "bracket" && token.value === ")") count--;
        }
        return count;
    }

    isValidParanthesis() {
        return this.countParanthesis(this.tokens) === 0;
    }

    isConsecutiveNumbers() {
        for (let idx = 0; idx < this.tokens.length - 1; ++idx) {
            if (this.tokens[idx].type === "number" && this.tokens[idx + 1].type === "number") return true;
        }
        return false;
    }

    // A + B % =, the result should be A * (1 + B%)
    replaceLaymanPercentage() {
        const lexer = new Lexer();
        // console.log("before:", this.tokens);
        while (this.current.value !== null) {
            if (this.current.type !== "percentage") {
                this.cursor++;
                continue;
            }
            // console.log(this.cursor, this.current);
            const bound = this.peek(-2); // boundary to determine unary or not
            const prev = this.peek(-1); // additive
            const next = this.peek(1); // operand

            if (prev.type !== "additive" || bound.value === null || bound.value === "(") {
                this.cursor++;
                continue;
            }

            const substitute = `) * (1 ${prev.value} ${next.value}%)`;
            const replacement = lexer.tokenize(substitute, false);

            const rightTokens = this.tokens.slice(this.cursor + 1);
            const leftTokens = this.tokens.slice(0, this.cursor);
            const right = this.countParanthesis(rightTokens);
            const left = this.countParanthesis(leftTokens);

            this.tokens.splice(this.cursor - 1, 3, ...replacement);
            if (left !== 0 && right !== 0) {
                let count = 0;
                for (let i = leftTokens.length - 1; i > 0; --i) {
                    const token = leftTokens[i];
                    if (token.type === "bracket" && token.value === "(") count++;
                    if (token.type === "bracket" && token.value === ")") count--;

                    if (count > 0) {
                        this.tokens.splice(i, 0, lexer.tokenize("(", false)[0]);
                        break;
                    }
                }
            } else {
                this.tokens.splice(0, 0, lexer.tokenize("(", false)[0]);
            }
            this.cursor += replacement.length;

            // console.log(this.cursor, this.current);
            // console.log("after:", this.tokens);
        }
        // console.log("after:", this.tokens);
        this.cursor = 0;
    }

    /** Grammar   :
     * expression : term | term + term | term − term
     * term       : factor | factor * factor | factor / factor
     * power      : factor | factor ^ power
     * factor     : number | ( expression ) | + factor | − factor | % factor
     */
    parse(tokens) {
        this.cursor = 0;
        this.tokens = tokens;

        if (!this.isValidParanthesis()) return;
        if (this.isConsecutiveNumbers()) return;
        const invalidExist = this.tokens.find((t) => t.kind === "invalid");
        if (invalidExist !== undefined) return;

        this.replaceLaymanPercentage();
        // console.log("parse", this.tokens);
        return this.parseExpr();
    }

    parseExpr() {
        let lhs = this.parseTerm();
        // console.log("parseExpr", this.current);
        if (this.current === undefined) return;
        while (this.current.type === "additive") {
            const op = this.current.value;
            this.cursor++;
            let rhs = this.parseTerm();
            lhs = { kind: "binary", op, lhs, rhs };
        }

        return lhs;
    }

    parseTerm() {
        let lhs = this.parsePower();
        // console.log("parseTerm", this.current);
        if (this.current === undefined) return;
        while (this.current.type === "multiplicative") {
            const op = this.current.value;
            this.cursor++;
            let rhs = this.parsePower();
            lhs = { kind: "binary", op, lhs, rhs };
        }
        return lhs;
    }

    parsePower() {
        let lhs = this.parseFactor();
        // console.log("parsePower", this.current);
        if (this.current === undefined) return;
        if (this.current.type === "exponential") {
            const op = this.current.value;
            this.cursor++;
            let rhs = this.parsePower(); // Right-associative
            lhs = { kind: "binary", op, lhs, rhs };
        }
        return lhs;
    }

    parseFactor() {
        // console.log("parseFactor", this.current);
        if (this.current === undefined) return;
        if (this.current.type === "number") {
            const token = this.current;
            this.cursor++;
            return token;
        }

        if (this.current.type === "bracket") {
            this.cursor++; // (
            let expr = this.parseExpr();
            this.cursor++; // )

            return expr;
        }

        if (this.current.type === "additive") {
            let op = this.current.value;
            this.cursor++;
            let factor = this.parseFactor();
            return { kind: "unary", operand: factor, op };
        }

        if (this.current.type === "percentage") {
            let op = this.current.value;
            this.cursor++;
            let factor = this.parseFactor();
            return { kind: "unary", operand: factor, op };
        }
    }
}

export class Evaluator {
    ast = undefined;
    parser = new Parser();
    lexer = new Lexer();

    evaluate(input) {
        const tokens = this.lexer.tokenize(input);
        // console.log(tokens);
        this.ast = this.parser.parse(tokens);
        // console.dir(this.ast, { depth: null });
        return this.evaluateExpr(this.ast);
    }

    evaluateExpr(expr) {
        if (expr === undefined) {
            // console.log("syntax error:", this.ast);
            return NaN;
        }

        switch (expr.kind) {
            case "operand": {
                return expr.value;
            }
            case "binary": {
                if ("op" in expr && expr.op in BINARY_OPS) {
                    return BINARY_OPS[expr.op](this.evaluateExpr(expr.lhs), this.evaluateExpr(expr.rhs));
                }
            }
            case "unary": {
                if ("op" in expr && "operand" in expr && expr.op in UNARY_OPS) {
                    return UNARY_OPS[expr.op](this.evaluateExpr(expr.operand));
                }
            }
        }
        return NaN;
    }
}
