const PRECISION = 15;
const BINARY_OPS = {
    "+": (lhs: number, rhs: number) => Number((lhs + rhs).toPrecision(PRECISION)),
    "-": (lhs: number, rhs: number) => Number((lhs - rhs).toPrecision(PRECISION)),
    "*": (lhs: number, rhs: number) => Number((lhs * rhs).toPrecision(PRECISION)),
    "/": (lhs: number, rhs: number) => Number((lhs / rhs).toPrecision(PRECISION)),
    "^": (lhs: number, rhs: number) => Number((lhs ** rhs).toPrecision(PRECISION)),
} as const;

const UNARY_OPS = {
    "+": (operand: number) => operand,
    "-": (operand: number) => -operand,
    "%": (operand: number) => Number((operand / 100).toPrecision(PRECISION)),
} as const;

interface Token {
    kind: string;
    type: string;
    value: string | number | null;
}

function checkParanKind(token: Token, counter: { count: number }) {
    if (token.kind === "bracket" && token.type === "open") counter.count++;
    if (token.kind === "bracket" && token.type === "close") counter.count--;
}

class Lexer {
    private stream: string = "";
    private cursor: number = 0;

    private isNumber(str: string): boolean {
        const charCode = str.charCodeAt(0);
        return (charCode >= "0".charCodeAt(0) && charCode <= "9".charCodeAt(0)) || charCode === ".".charCodeAt(0);
    }

    private peek(offset: number) {
        return this.stream[this.cursor + offset];
    }

    private get current(): string {
        return this.peek(0);
    }

    tokenize(stream: string, nullTerm: boolean = true) {
        this.cursor = 0;
        this.stream = stream;

        let tokens: Array<Token> = [];

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
                    // we convert percentage to prefix unary, expr% to %expr
                    const prev = tokens[tokens.length - 1];
                    const token = {
                        kind: "operator",
                        type: "percentage",
                        value: this.current,
                    };

                    if (prev === undefined) {
                        tokens.push({ kind: "invalid", type: "unknown", value: this.current });
                    } else if (prev.kind === "operand" || prev.type === "percentage") {
                        tokens.splice(tokens.length - 1, 0, token);
                    } else if (prev.type === "close") {
                        let counter = { count: -1 }; // we already checked closing above
                        for (let off = 2; off <= tokens.length; ++off) {
                            const bound = tokens[tokens.length - off];
                            checkParanKind(bound, counter);
                            if (counter.count === 0) {
                                tokens.splice(tokens.length - off, 0, token);
                                break;
                            }
                        }
                    } else {
                        tokens.push({ kind: "invalid", type: "unknown", value: this.current });
                    }
                    this.cursor++;
                    break;
                }

                case "^": {
                    tokens.push({ kind: "operator", type: "exponential", value: this.current });
                    this.cursor++;
                    break;
                }

                case "(":
                    tokens.push({ kind: "bracket", type: "open", value: this.current });
                    this.cursor++;
                    break;
                case ")": {
                    tokens.push({ kind: "bracket", type: "close", value: this.current });
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

type Expr = UnaryExpr | BinaryExpr;

interface UnaryExpr {
    kind: "unary";
    op: keyof typeof UNARY_OPS;
    operand: Expr | Token | undefined;
}

interface BinaryExpr {
    kind: "binary";
    op: keyof typeof BINARY_OPS;
    lhs: Expr | Token | undefined;
    rhs: Expr | Token | undefined;
}

class Parser {
    private tokens: Array<Token> = [];
    private cursor: number = 0;

    private peek(offset: number): Token {
        let idx = this.cursor + offset;
        if (idx < 0 || idx > this.tokens.length) {
            idx = this.tokens.length - 1;
        }
        return this.tokens[idx];
    }

    private get current(): Token {
        return this.peek(0);
    }

    private countParanthesis(tokens: Token[]) {
        const counter = { count: 0 };
        for (const token of tokens) {
            checkParanKind(token, counter);
        }
        return counter.count;
    }

    private isValidParanthesis(): boolean {
        return this.countParanthesis(this.tokens) === 0;
    }

    private isConsecutiveNumbers(): boolean {
        for (let idx = 0; idx < this.tokens.length - 1; ++idx) {
            if (this.tokens[idx].type === "number" && this.tokens[idx + 1].type === "number") return true;
        }
        return false;
    }

    // A + B % =, the result should be A * (1 + B%)
    private replaceLaymanPercentage(): void {
        const lexer = new Lexer();
        // console.log("before:", this.tokens);
        while (this.current && this.current.value !== null) {
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

            const rightTokens = this.tokens.slice(this.cursor + 1);
            const leftTokens = this.tokens.slice(0, this.cursor);

            let substitute = "";
            let count = 0;
            if (next.type === "number") {
                count = 3; // + % num
                substitute = `) * (1 ${prev.value} ${next.value}%)`;
            } else if (next.type == "open") {
                let counter = { count: 1 };
                let operand_idx = 1;
                count = 4; // + % ( )
                substitute = `) ${prev.value} (`;
                while (operand_idx < rightTokens.length && counter.count !== 0) {
                    checkParanKind(rightTokens[operand_idx], counter);
                    substitute += `${rightTokens[operand_idx].value}`;
                    operand_idx += 1;
                    count += 1; // token
                }
                substitute += `%))`;
            }

            const replacement = lexer.tokenize(substitute, false);
            this.tokens.splice(this.cursor - 1, count, ...replacement);

            const right = this.countParanthesis(rightTokens);
            const left = this.countParanthesis(leftTokens);

            if (left !== 0 && right !== 0) {
                let counter = { count: 0 };
                for (let i = leftTokens.length - 1; i > 0; --i) {
                    const token = leftTokens[i];
                    checkParanKind(token, counter);

                    if (counter.count > 0) {
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
    parse(tokens: Array<Token>): Token | Expr | undefined {
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

    private parseExpr(): Token | Expr | undefined {
        let lhs = this.parseTerm();
        // console.log("parseExpr", this.current);
        if (this.current === undefined) return;
        while (this.current.type === "additive") {
            const op = this.current.value as keyof typeof BINARY_OPS;
            this.cursor++;
            let rhs = this.parseTerm();
            lhs = { kind: "binary", op, lhs, rhs };
        }

        return lhs;
    }

    private parseTerm(): Token | Expr | undefined {
        let lhs = this.parsePower();
        // console.log("parseTerm", this.current);
        if (this.current === undefined) return;
        while (this.current.type === "multiplicative") {
            const op = this.current.value as keyof typeof BINARY_OPS;
            this.cursor++;
            let rhs = this.parsePower();
            lhs = { kind: "binary", op, lhs, rhs };
        }
        return lhs;
    }

    private parsePower(): Token | Expr | undefined {
        let lhs = this.parseFactor();
        // console.log("parsePower", this.current);
        if (this.current === undefined) return;
        if (this.current.type === "exponential") {
            const op = this.current.value as keyof typeof BINARY_OPS;
            this.cursor++;
            let rhs = this.parsePower(); // Right-associative
            lhs = { kind: "binary", op, lhs, rhs };
        }
        return lhs;
    }

    private parseFactor(): Token | Expr | undefined {
        // console.log("parseFactor", this.current);
        if (this.current === undefined) return;
        if (this.current.type === "number") {
            const token = this.current;
            this.cursor++;
            return token;
        }

        if (this.current.kind === "bracket" && this.current.type === "open") {
            this.cursor++; // (
            let expr = this.parseExpr();
            this.cursor++; // )

            return expr;
        }

        if (this.current.type === "additive") {
            let op = this.current.value as keyof typeof UNARY_OPS;
            this.cursor++;
            let factor = this.parseFactor();
            return { kind: "unary", operand: factor, op };
        }

        if (this.current.type === "percentage") {
            let op = this.current.value as keyof typeof UNARY_OPS;
            this.cursor++;
            let factor = this.parseFactor();
            return { kind: "unary", operand: factor, op };
        }
    }
}

export class Evaluator {
    private ast: Expr | Token | undefined = undefined;
    private parser: Parser = new Parser();
    private lexer: Lexer = new Lexer();

    evaluate(input: string): number {
        const tokens = this.lexer.tokenize(input);
        // console.log(tokens);
        this.ast = this.parser.parse(tokens);
        // console.dir(this.ast, { depth: null });
        return this.evaluateExpr(this.ast);
    }

    private evaluateExpr(expr: Expr | Token | undefined): number {
        if (expr === undefined) {
            // console.log("syntax error:", this.ast);
            return NaN;
        }

        switch (expr.kind) {
            case "operand": {
                return expr.value as number;
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
