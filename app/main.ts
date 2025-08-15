import { type Token, Tokenizer } from "./tokenizer";

function printTokens(tokens: Token[]): (string | Token)[] {
  let result: (string | Token)[] = [];
  for (const token of tokens) {
    switch (token.type) {
      case "literal":
        result.push(token.value);
        break;

      case "quantifier":
        const innerSimplified = printTokens([token.token]);
        result.push({ ...token, token: innerSimplified[0] } as Token);
        break;

      case "alternation":
        const simplifiedBranches = token.branches.map((branch) =>
          printTokens(branch),
        );
        result.push({ ...token, branches: simplifiedBranches } as Token);
        break;

      case "backreference":
        result.push(token);
        break;

      default:
        result.push(token);
    }
  }
  return result;
}

class GrepMatcher {
  private pattern;
  private tokens: Token[];
  constructor(pattern: string) {
    this.pattern = pattern;
    this.tokens = Tokenizer.tokenize(pattern);
    console.log(`original pattern: ${pattern}`);
    console.log(`Tokens: ${JSON.stringify(printTokens(this.tokens))}`);
  }

  private matchToken(
    token: Token,
    input: string[],
    pos: number,
    capturedGroups: string[] = [],
  ): number[] {
    if (pos > input.length) return [];

    switch (token.type) {
      case "literal":
        // if 'a' matches at position 3, next position is [4]
        // if it doesn't match, no valid positions: []
        return input[pos] === token.value ? [pos + 1] : [];
      case "dot":
        return [pos + 1];
      case "digit":
        return /[0-9]/.test(input[pos]) ? [pos + 1] : [];
      case "word":
        return /[a-zA-Z0-9_]/.test(input[pos]) ? [pos + 1] : [];
      case "group":
        const charMatches = token.chars.includes(input[pos]);
        // should match means wether the grep should find it.
        const shouldMatch = token.negated ? !charMatches : charMatches;
        return shouldMatch ? [pos + 1] : [];
      case "anchor":
        if (token.value === "^") return pos === 0 ? [pos] : [];
        if (token.value === "$") return pos === input.length ? [pos] : [];
        return [];
      case "quantifier":
        return this.matchQuantifier(token, input, pos, capturedGroups);
      case "alternation":
        return this.matchAlternation(token, input, pos, capturedGroups);
      case "backreference":
        if (token.group <= capturedGroups.length) {
          const capturedText = capturedGroups[token.group - 1];

          if (capturedText && pos + capturedText.length <= input.length) {
            const inputSlice = input
              .slice(pos, pos + capturedText.length)
              .join("");

            return inputSlice === capturedText
              ? [pos + capturedText.length]
              : [];
          }
        } else {
        }
        return [];
      default:
        return [];
    }
  }

  private matchAlternation(
    token: Token & { type: "alternation" },
    input: string[],
    pos: number,
    capturedGroups: string[] = [],
  ): number[] {
    const positions = [];
    console.log(
      `Attention: matching alternation for token ${JSON.stringify(printTokens([token]))}`,
    );
    for (const branch of token.branches) {
      let currentPos = pos;
      let success = true;
      for (const tokenBranch of branch) {
        const nextPositions = this.matchToken(
          tokenBranch,
          input,
          currentPos,
          capturedGroups,
        );
        // if lenght is 0 then it didn't match
        if (nextPositions.length === 0) {
          success = false;
          break;
        }
        currentPos = nextPositions[0];
      }
      if (success) {
        positions.push(currentPos);
      }
    }
    console.log("After matching alternation", positions);
    return positions;
  }

  // quantifier allows matching of 0 or None (?) 1+(+) 0+(*)
  // on our implementation, quantifiers create multiple possible paths.
  private matchQuantifier(
    token: Token & { type: "quantifier" },
    input: string[],
    pos: number,
    capturedGroups: string[] = [],
  ): number[] {
    console.log(
      `Attention: matching quantifier for token: ${JSON.stringify(printTokens([token]))}`,
    );
    const results: number[] = [];
    if (token.value === "?") {
      // match 0 or 1 time
      results.push(pos);
      const oneMatch = this.matchToken(token.token, input, pos, capturedGroups);
      // if token is literal, this will do a literal match, and advance to pos+1
      results.push(...oneMatch);
    } else if (token.value === "*") {
      // match 0+ times
      results.push(pos);
      let currPos = pos;
      while (true) {
        const nextPos = this.matchToken(
          token.token,
          input,
          currPos,
          capturedGroups,
        );
        if (nextPos.length === 0) break;
        currPos = nextPos[0];
        results.push(currPos);
      }
    } else if (token.value === "+") {
      // match 1+ times
      let currPos = pos;
      const firstMatch = this.matchToken(
        token.token,
        input,
        currPos,
        capturedGroups,
      );
      if (firstMatch.length === 0) return [];

      currPos = firstMatch[0];
      results.push(currPos);

      while (true) {
        const nextPos = this.matchToken(
          token.token,
          input,
          currPos,
          capturedGroups,
        );
        if (nextPos.length == 0) break;
        currPos = nextPos[0];
        results.push(currPos);
      }
    }

    return results;
  }

  private matchFromPosition(
    tokens: Token[],
    input: string[],
    tokenIdx: number,
    inputPos: number,
    capturedGroups: string[] = [],
  ): boolean {
    // base case: matched all tokens
    if (tokenIdx >= tokens.length) {
      return true;
    }

    const token = tokens[tokenIdx];
    console.log(
      `Matching: \n\t token: ${JSON.stringify(token)} \n\t ${input.slice(inputPos)} \n\t ${tokenIdx} \n\t ${inputPos}`,
    );

    if (token.type === "quantifier" && token.token.type === "alternation") {
      return this.matchQuantifiedAlternation(
        token as Token & { type: "quantifier" },
        tokens,
        input,
        tokenIdx,
        inputPos,
        capturedGroups,
      );
    }

    // Handle alternation (capturing groups)
    if (token.type === "alternation") {
      for (const branch of token.branches) {
        const result = this.matchBranch(
          branch,
          input,
          inputPos,
          capturedGroups,
        );
        if (result) {
          // Add the captured text to the captured groups
          const newCapturedGroups = [...capturedGroups, result.capturedText];

          if (
            this.matchFromPosition(
              tokens,
              input,
              tokenIdx + 1,
              result.endPos,
              newCapturedGroups,
            )
          ) {
            return true;
          }
        }
      }
      return false;
    }

    const nextPositions = this.matchToken(
      token,
      input,
      inputPos,
      capturedGroups,
    );
    // try each possible next option
    for (const pos of nextPositions) {
      if (
        this.matchFromPosition(tokens, input, tokenIdx + 1, pos, capturedGroups)
      ) {
        return true;
      }
    }

    return false;
  }

  private matchBranch(
    branch: Token[],
    input: string[],
    startPos: number,
    capturedGroups: string[],
  ): { endPos: number; capturedText: string } | null {
    let currentPos = startPos;
    let capturedText = "";

    for (const branchToken of branch) {
      const nextPositions = this.matchToken(
        branchToken,
        input,
        currentPos,
        capturedGroups,
      );

      if (nextPositions.length === 0) {
        return null;
      }

      // Try each possible next position (greedy - longest match first)
      const sortedPositions = [...nextPositions].sort((a, b) => b - a);
      for (const nextPos of sortedPositions) {
        const matchedText = input.slice(currentPos, nextPos).join("");

        // If this is the last token in the branch, we're done
        if (branch.indexOf(branchToken) === branch.length - 1) {
          const finalCapturedText = capturedText + matchedText;

          return { endPos: nextPos, capturedText: finalCapturedText };
        }

        // Try to match the rest of the branch from this position
        const remainingBranch = branch.slice(branch.indexOf(branchToken) + 1);
        const result = this.matchBranch(
          remainingBranch,
          input,
          nextPos,
          capturedGroups,
        );

        if (result) {
          return {
            endPos: result.endPos,
            capturedText: capturedText + matchedText + result.capturedText,
          };
        }
      }

      // If no position worked, this branch fails
      return null;
    }

    return { endPos: currentPos, capturedText };
  }

  private matchQuantifiedAlternation(
    token: Token & { type: "quantifier" },
    tokens: Token[], // the full token array
    input: string[],
    tokenIdx: number,
    inputPos: number,
    capturedGroups: string[] = [],
  ): boolean {
    const alternation = token.token as Token & { type: "alternation" };
    const quantifier = token.value;
    if (quantifier === "?") {
      // try 0 matches -> skipping the quantified alternation
      if (
        this.matchFromPosition(
          tokens,
          input,
          tokenIdx + 1,
          inputPos,
          capturedGroups,
        )
      ) {
        return true;
      }
      // try 1 match with the alternation
      for (const branch of alternation.branches) {
        // create a new token sequence [branch + rest of tokens]
        const newTokens = [...branch, ...tokens.slice(tokenIdx + 1)];
        if (
          this.matchFromPosition(newTokens, input, 0, inputPos, capturedGroups)
        ) {
          return true;
        }
      }
    } else if (quantifier === "*") {
      // try 0 matches -> skipping the quantified alternation
      if (
        this.matchFromPosition(
          tokens,
          input,
          tokenIdx + 1,
          inputPos,
          capturedGroups,
        )
      ) {
        return true;
      }
      // try 1+ matches (any combination of branches)
      return this.tryMultipleAlternationMatches(
        alternation,
        tokens,
        input,
        tokenIdx,
        inputPos,
        0, // min matches
        capturedGroups,
      );
    } else if (quantifier === "+") {
      // try 1+ matches (any combination of branches)
      return this.tryMultipleAlternationMatches(
        alternation,
        tokens,
        input,
        tokenIdx,
        inputPos,
        1, // min matches
        capturedGroups,
      );
    }
    return false;
  }

  private tryMultipleAlternationMatches(
    alternation: Token & { type: "alternation" },
    tokens: Token[],
    input: string[],
    tokenIdx: number,
    inputPos: number,
    minMatches: number,
    capturedGroups: string[] = [],
    matchCount: number = 0,
  ) {
    // if we have met the minimum, continue with the rest of the pattern
    if (matchCount >= minMatches) {
      if (
        this.matchFromPosition(
          tokens,
          input,
          tokenIdx + 1,
          inputPos,
          capturedGroups,
        )
      ) {
        return true;
      }
    }

    // try matching another instance of the alternation
    for (const branch of alternation.branches) {
      let possiblePositions = [inputPos];
      let success = true;

      // try to match every token for this branch
      for (const branchToken of branch) {
        let nextPositions = [];

        // for each poisition we could be at:
        for (const position of possiblePositions) {
          const matches = this.matchToken(
            branchToken,
            input,
            position,
            capturedGroups,
          );
          nextPositions.push(...matches);
        }

        if (nextPositions.length === 0) {
          success = false;
          break;
        }
        possiblePositions = nextPositions;
      }
      console.log(`success: ${success}`);

      if (success) {
        for (const endPos of possiblePositions) {
          if (endPos > inputPos) {
            // made progress
            // recursively try to match more instances
            if (
              this.tryMultipleAlternationMatches(
                alternation,
                tokens,
                input,
                tokenIdx,
                endPos, // continue from where the branch ended
                minMatches,
                capturedGroups,
                matchCount + 1,
              )
            ) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }

  match(inputLine: string): boolean {
    const inputChars = Array.from(inputLine);
    // check for start anchor
    if (this.tokens[0]?.type === "anchor" && this.tokens[0]?.value === "^") {
      // now it must match from the beginning
      return this.matchFromPosition(this.tokens.slice(1), inputChars, 0, 0, []);
    }

    console.log(`input: ${JSON.stringify(inputChars)}`);
    // otherwise, try matching from each position
    for (let i = 0; i < inputChars.length; i++) {
      if (this.matchFromPosition(this.tokens, inputChars, 0, i, [])) {
        return true;
      }
    }

    // if it hasn't matched on any of the possible paths
    return false;
  }
}

async function main() {
  const args = process.argv;

  if (args[2] !== "-E") {
    console.log("Expected first argument to be '-E'");
    process.exit(1);
  }
  const pattern = args[3];
  const inputLine: string = await Bun.stdin.text();

  try {
    const matcher = new GrepMatcher(pattern);
    if (matcher.match(inputLine.trim())) {
      process.exit(0);
    } else {
      process.exit(1);
    }
  } catch (error: any) {
    console.error(`Pattern error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
