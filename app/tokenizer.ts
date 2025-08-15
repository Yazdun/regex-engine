export type Token =
  | { type: "literal"; value: string }
  | { type: "dot" }
  | { type: "word" }
  | { type: "digit" }
  | { type: "group"; chars: string[]; negated: boolean }
  | { type: "anchor"; value: "$" | "^" }
  | { type: "alternation"; branches: Token[][] }
  | { type: "quantifier"; value: "?" | "+" | "*"; token: Token }
  | { type: "backreference"; group: number };

function splitByPipe(pattern: string[]): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current: string = "";
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] === "\\" && pattern[i + 1] === "|") {
      current += "|";
      i++;
    } else if (pattern[i] === "|" && depth === 0) {
      parts.push(current);
      current = "";
    } else if (pattern[i] === "(") {
      current += pattern[i];
      depth += 1;
    } else if (pattern[i] === ")") {
      current += pattern[i];
      depth -= 1;
    } else {
      current += pattern[i];
    }
  }
  parts.push(current);
  return parts;
}

export class Tokenizer {
  static tokenize(pattern: string): Token[] {
    const chars = Array.from(pattern);
    const result: Token[] = [];
    let i = 0;

    while (i < chars.length) {
      const char = chars[i];
      switch (char) {
        case "\\":
          result.push(Tokenizer.handleSpecialChar(chars[i + 1]));
          i += 2;
          break;

        case "(":
          const [parenToken, parenIdx] = Tokenizer.handleParen(chars, i);
          result.push(parenToken);
          i = parenIdx;
          break;

        case "[":
          const [bracketToken, bracketIdx] = Tokenizer.handleBracket(chars, i);
          result.push(bracketToken);
          i = bracketIdx;
          break;

        case "^":
          if (i === 0) {
            result.push({ type: "anchor", value: "^" });
            i++;
          } else {
            result.push({ type: "literal", value: char });
            i++;
          }
          break;

        case "$":
          if (i === pattern.length - 1) {
            result.push({ type: "anchor", value: "$" });
            i++;
          } else {
            result.push({ type: "literal", value: char });
            i++;
          }
          break;

        case ".":
          result.push({ type: "dot" });
          i++;
          break;

        case "?":
        case "+":
        case "*":
          if (result.length === 0) {
            throw new Error("Quantifier at the start is not allowed");
          }
          const prevToken = result.pop()!!;
          result.push({ type: "quantifier", value: char, token: prevToken });
          i++;
          break;

        default:
          result.push({ type: "literal", value: char });
          i++;
          break;
      }
    }

    return result;
  }

  static handleSpecialChar(char: string): Token {
    if (char === "d") return { type: "digit" };
    else if (char === "w") return { type: "word" };
    else if (/[0-9]/.test(char))
      return { type: "backreference", group: parseInt(char) };
    else return { type: "literal", value: char };
  }

  static handleParen(chars: string[], i: number): [Token, number] {
    const closingParenIdx = Tokenizer.findClosingParen(chars, i);
    if (closingParenIdx === -1) {
      throw new Error("Unclosed Parentheses");
    }
    const groupContent = chars.slice(i + 1, closingParenIdx);
    const tokenBranches = splitByPipe(groupContent).map((part) =>
      Tokenizer.tokenize(part),
    );
    return [
      { type: "alternation", branches: tokenBranches },
      closingParenIdx + 1,
    ];
  }

  static handleBracket(chars: string[], i: number): [Token, number] {
    const closingBracketIdx = chars.indexOf(`]`, i);
    if (closingBracketIdx === -1) {
      throw new Error("Unclosed Brackets");
    }
    const negated = chars[i + 1] === `^`;
    const groupChars = negated
      ? chars.slice(i + 2, closingBracketIdx)
      : chars.slice(i + 1, closingBracketIdx);
    return [
      {
        type: "group",
        chars: groupChars,
        negated: negated,
      },
      closingBracketIdx + 1,
    ];
  }

  // takes something like word)
  static findClosingParen(chars: string[], start: number): number {
    let depth = 1;
    // +1 to account for the current opening paren
    let i = start + 1;
    while (i < chars.length && depth > 0) {
      const currChar = chars[i];
      if (currChar === "\\" && i + 1 < currChar.length) {
        i += 2;
        continue;
      }
      if (currChar === "(") depth += 1;
      if (currChar === ")") depth -= 1;
      i++;
    }

    return depth === 0 ? i - 1 : -1;
  }
}
