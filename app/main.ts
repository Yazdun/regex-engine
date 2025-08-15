const args = process.argv;
const pattern = args[3];

const inputLine: string = await Bun.stdin.text();

function matchToken(input: string, token: string): boolean {
  if (!input[0]) return false;
  switch (true) {
    case token === "\\d":
      return /\d/.test(input[0]);
    case token === "\\w":
      return /\w/.test(input[0]);
    case token.startsWith("[") && token.endsWith("]"):
      const chars = token.slice(1, -1);
      if (chars.startsWith("^")) {
        return !chars.slice(1).includes(input[0]);
      } else {
        return chars.includes(input[0]);
      }
    default:
      return input[0] === token;
  }
}

function matchPattern(input: string, pattern: string): boolean {
  if (pattern === "") return true;
  if (input === "") return false;

  let token: string;
  let restPattern: string;

  switch (true) {
    case pattern.startsWith("\\d") || pattern.startsWith("\\w"):
      token = pattern.slice(0, 2);
      restPattern = pattern.slice(2);
      break;

    case pattern.startsWith("[") && pattern.includes("]"):
      const end = pattern.indexOf("]") + 1;
      token = pattern.slice(0, end);
      restPattern = pattern.slice(end);
      break;

    default:
      token = pattern[0];
      restPattern = pattern.slice(1);
      break;
  }

  if (restPattern.startsWith("+")) {
    restPattern = restPattern.slice(1);
    let i = 0;
    while (i < input.length && matchToken(input.slice(i), token)) i++;
    if (i === 0) return false;
    for (let j = i; j >= 1; j--) {
      if (matchPattern(input.slice(j), restPattern)) return true;
    }
    return false;
  }

  if (!matchToken(input, token)) return false;
  return matchPattern(input.slice(1), restPattern);
}

function matchPatternAnywhere(input: string, pattern: string): boolean {
  if (pattern.startsWith("^")) {
    const subPattern = pattern.slice(1);
    if (subPattern.endsWith("$")) {
      return input === subPattern.slice(0, -1);
    }
    return matchPattern(input, subPattern);
  }

  if (pattern.endsWith("$")) {
    const subPattern = pattern.slice(0, -1);
    for (let i = 0; i <= input.length; i++) {
      if (
        matchPattern(input.slice(i), subPattern) &&
        i + subPattern.length === input.length
      ) {
        return true;
      }
    }
    return false;
  }

  for (let i = 0; i <= input.length; i++) {
    if (matchPattern(input.slice(i), pattern)) return true;
  }
  return false;
}

if (args[2] !== "-E") {
  console.log("Expected first argument to be '-E'");
  process.exit(1);
}

if (matchPatternAnywhere(inputLine, pattern)) {
  process.exit(0);
} else {
  process.exit(1);
}
