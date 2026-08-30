/**
 * A tiny expression evaluator for the function strings in a plot scene.
 *
 * These strings come from the model, so `eval` and `new Function` are out —
 * this parses a fixed grammar and evaluates it, returning null on anything it
 * does not recognise so a bad expression degrades to "no curve" rather than
 * running arbitrary code.
 *
 * Supports: numbers, one free variable, + - * / ^, unary minus, parentheses,
 * the constants pi and e, and the functions below.
 */

const FUNCTIONS: Record<string, (value: number) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  sqrt: Math.sqrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log10,
  floor: Math.floor,
  ceil: Math.ceil,
};

const CONSTANTS: Record<string, number> = { pi: Math.PI, e: Math.E };

type Token =
  | { type: "number"; value: number }
  | { type: "variable" }
  | { type: "function"; name: string }
  | { type: "operator"; value: string }
  | { type: "paren"; value: "(" | ")" };

const PRECEDENCE: Record<string, number> = {
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  // Looser than "^" so that -x^2 is -(x^2), as in ordinary maths notation.
  u: 3,
  "^": 4,
};

const tokenize = (input: string, variable: string): Token[] | null => {
  const tokens: Token[] = [];
  const text = input.replace(/\s+/g, "").toLowerCase();
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (/[0-9.]/.test(char)) {
      const match = /^[0-9]*\.?[0-9]+/.exec(text.slice(i));
      if (!match) {
        return null;
      }
      tokens.push({ type: "number", value: Number(match[0]) });
      i += match[0].length;
      continue;
    }

    if (/[a-z]/.test(char)) {
      const match = /^[a-z]+/.exec(text.slice(i))!;
      const word = match[0];
      if (word === variable) {
        tokens.push({ type: "variable" });
      } else if (word in CONSTANTS) {
        tokens.push({ type: "number", value: CONSTANTS[word] });
      } else if (word in FUNCTIONS) {
        tokens.push({ type: "function", name: word });
      } else {
        return null;
      }
      i += word.length;
      continue;
    }

    if ("+-*/^".includes(char)) {
      tokens.push({ type: "operator", value: char });
      i++;
      continue;
    }

    if (char === "(" || char === ")") {
      tokens.push({ type: "paren", value: char });
      i++;
      continue;
    }

    return null;
  }

  return tokens;
};

/** Shunting-yard: infix tokens to reverse Polish notation. */
const toRpn = (tokens: Token[]): Token[] | null => {
  const output: Token[] = [];
  const stack: Token[] = [];

  let previous: Token | null = null;
  for (const token of tokens) {
    if (token.type === "number" || token.type === "variable") {
      output.push(token);
    } else if (token.type === "function") {
      stack.push(token);
    } else if (token.type === "operator") {
      // A minus is unary when nothing value-like precedes it.
      const isUnary =
        token.value === "-" &&
        (previous === null ||
          (previous.type === "operator") ||
          (previous.type === "paren" && previous.value === "("));
      const key = isUnary ? "u" : token.value;
      const op: Token = { type: "operator", value: key };

      // A prefix operator never pops: nothing to its left is its operand.
      if (isUnary) {
        stack.push(op);
        previous = token;
        continue;
      }

      while (stack.length > 0) {
        const top = stack[stack.length - 1];
        if (top.type === "function") {
          output.push(stack.pop()!);
          continue;
        }
        if (top.type !== "operator") {
          break;
        }
        const topPrecedence = PRECEDENCE[top.value];
        const rightAssociative = key === "^" || key === "u";
        if (
          topPrecedence > PRECEDENCE[key] ||
          (topPrecedence === PRECEDENCE[key] && !rightAssociative)
        ) {
          output.push(stack.pop()!);
        } else {
          break;
        }
      }
      stack.push(op);
    } else if (token.value === "(") {
      stack.push(token);
    } else {
      let matched = false;
      while (stack.length > 0) {
        const top = stack.pop()!;
        if (top.type === "paren" && top.value === "(") {
          matched = true;
          break;
        }
        output.push(top);
      }
      if (!matched) {
        return null;
      }
    }
    previous = token;
  }

  while (stack.length > 0) {
    const top = stack.pop()!;
    if (top.type === "paren") {
      return null;
    }
    output.push(top);
  }

  return output;
};

/**
 * Compiles `expression` into `f(x)`, or returns null if it cannot be parsed.
 * The returned function yields NaN outside the function's domain (e.g.
 * `sqrt(x)` for negative x), which the plot treats as a break in the curve.
 */
export const compileExpression = (
  expression: string,
  /** The free variable. Parametric curves are written in `t`. */
  variable = "x",
): ((x: number) => number) | null => {
  const tokens = tokenize(expression, variable);
  if (!tokens || tokens.length === 0) {
    return null;
  }
  const rpn = toRpn(tokens);
  if (!rpn) {
    return null;
  }

  // Evaluate once to reject malformed input (wrong arity, empty stack).
  const evaluate = (x: number): number => {
    const stack: number[] = [];
    for (const token of rpn) {
      if (token.type === "number") {
        stack.push(token.value);
      } else if (token.type === "variable") {
        stack.push(x);
      } else if (token.type === "function") {
        const value = stack.pop();
        if (value === undefined) {
          return NaN;
        }
        stack.push(FUNCTIONS[token.name](value));
      } else if (token.type === "operator") {
        if (token.value === "u") {
          const value = stack.pop();
          if (value === undefined) {
            return NaN;
          }
          stack.push(-value);
          continue;
        }
        const right = stack.pop();
        const left = stack.pop();
        if (right === undefined || left === undefined) {
          return NaN;
        }
        switch (token.value) {
          case "+":
            stack.push(left + right);
            break;
          case "-":
            stack.push(left - right);
            break;
          case "*":
            stack.push(left * right);
            break;
          case "/":
            stack.push(left / right);
            break;
          default:
            stack.push(Math.pow(left, right));
        }
      }
    }
    return stack.length === 1 ? stack[0] : NaN;
  };

  return Number.isNaN(evaluate(1)) && Number.isNaN(evaluate(0.5))
    ? null
    : evaluate;
};
