const args = process.argv;
const pattern = args[3];

const inputLine: string = await Bun.stdin.text();

function matchPattern(inputLine: string, pattern: string): boolean {
  if (pattern.length >= 1) {
    switch (pattern) {
      case "\\d":
        return /\d/.test(inputLine);
      case "\\w":
        return /\w/.test(inputLine);
      default:
        if (pattern.startsWith("[") && pattern.endsWith("]")) {
          const regex = new RegExp(pattern);
          return regex.test(inputLine);
        }

        return inputLine.includes(pattern);
    }
  } else {
    throw new Error(`Unhandled pattern: ${pattern}`);
  }
}

if (args[2] !== "-E") {
  console.log("Expected first argument to be '-E'");
  process.exit(1);
}

if (matchPattern(inputLine, pattern)) {
  process.exit(0);
} else {
  process.exit(1);
}
