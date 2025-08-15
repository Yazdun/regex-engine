import { type Token, Tokenizer } from "./tokenizer";
import { readdirSync, statSync } from "fs";
import { join } from "path";

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
        result.push({
          ...token,
          branches: simplifiedBranches,
          groupNumber: token.groupNumber,
        } as Token);
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
  }

  private matchToken(
    token: Token,
    input: string[],
    pos: number,
    capturedGroups: Map<number, string> = new Map(),
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
        if (capturedGroups.has(token.group)) {
          const capturedText = capturedGroups.get(token.group)!;

          if (capturedText && pos + capturedText.length <= input.length) {
            const inputSlice = input
              .slice(pos, pos + capturedText.length)
              .join("");

            return inputSlice === capturedText
              ? [pos + capturedText.length]
              : [];
          }
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
    capturedGroups: Map<number, string> = new Map(),
  ): number[] {
    const positions = [];
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
    return positions;
  }

  // quantifier allows matching of 0 or None (?) 1+(+) 0+(*)
  // on our implementation, quantifiers create multiple possible paths.
  private matchQuantifier(
    token: Token & { type: "quantifier" },
    input: string[],
    pos: number,
    capturedGroups: Map<number, string> = new Map(),
  ): number[] {
    const results: number[] = [];
    if (token.value === "?") {
      // match 0 or 1 time
      const oneMatch = this.matchToken(token.token, input, pos, capturedGroups);
      // Try 1 match first (greedy), then 0 matches
      results.push(...oneMatch);
      results.push(pos);
    } else if (token.value === "*") {
      // match 0+ times (greedy - longest first)
      let currPos = pos;
      const allMatches = [pos]; // 0 matches

      while (true) {
        const nextPos = this.matchToken(
          token.token,
          input,
          currPos,
          capturedGroups,
        );
        if (nextPos.length === 0) break;
        currPos = nextPos[0];
        allMatches.push(currPos);
      }

      // Return in reverse order for greedy matching with backtracking
      for (let i = allMatches.length - 1; i >= 0; i--) {
        results.push(allMatches[i]);
      }
    } else if (token.value === "+") {
      // match 1+ times (greedy - longest first)
      let currPos = pos;
      const firstMatch = this.matchToken(
        token.token,
        input,
        currPos,
        capturedGroups,
      );
      if (firstMatch.length === 0) return [];

      currPos = firstMatch[0];
      const allMatches = [currPos]; // 1 match minimum

      while (true) {
        const nextPos = this.matchToken(
          token.token,
          input,
          currPos,
          capturedGroups,
        );
        if (nextPos.length == 0) break;
        currPos = nextPos[0];
        allMatches.push(currPos);
      }

      // Return in reverse order for greedy matching with backtracking
      for (let i = allMatches.length - 1; i >= 0; i--) {
        results.push(allMatches[i]);
      }
    }

    return results;
  }

  private matchFromPosition(
    tokens: Token[],
    input: string[],
    tokenIdx: number,
    inputPos: number,
    capturedGroups: Map<number, string> = new Map(),
  ): boolean {
    // base case: matched all tokens
    if (tokenIdx >= tokens.length) {
      return true;
    }

    const token = tokens[tokenIdx];

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
        // Special handling for single-quantifier branches to enable proper backtracking
        if (branch.length === 1 && branch[0].type === "quantifier") {
          const quantifierToken = branch[0];
          const possiblePositions = this.matchToken(
            quantifierToken,
            input,
            inputPos,
            capturedGroups,
          );

          // Try each possible position (longest first for greedy matching)
          for (const endPos of possiblePositions.sort((a, b) => b - a)) {
            const capturedText = input.slice(inputPos, endPos).join("");
            const newCapturedGroups = new Map(capturedGroups);
            newCapturedGroups.set(token.groupNumber, capturedText);

            if (
              this.matchFromPosition(
                tokens,
                input,
                tokenIdx + 1,
                endPos,
                newCapturedGroups,
              )
            ) {
              return true;
            }
          }
        } else {
          // Regular branch handling
          const result = this.matchBranch(
            branch,
            input,
            inputPos,
            capturedGroups,
          );
          if (result) {
            // Merge existing captured groups with new ones from the branch
            const newCapturedGroups = new Map(capturedGroups);
            // Add all groups from the branch result
            for (const [key, value] of result.updatedGroups) {
              newCapturedGroups.set(key, value);
            }
            // Add the captured text for this alternation group
            newCapturedGroups.set(token.groupNumber, result.capturedText);

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
    capturedGroups: Map<number, string>,
  ): {
    endPos: number;
    capturedText: string;
    updatedGroups: Map<number, string>;
  } | null {
    let currentPos = startPos;
    let capturedText = "";
    let workingGroups = new Map(capturedGroups);

    for (const branchToken of branch) {
      // Handle alternation (nested capturing groups) specially
      if (branchToken.type === "alternation") {
        for (const nestedBranch of branchToken.branches) {
          const nestedResult = this.matchBranch(
            nestedBranch,
            input,
            currentPos,
            workingGroups,
          );

          if (nestedResult) {
            // Store the captured text for this group
            workingGroups.set(
              branchToken.groupNumber,
              nestedResult.capturedText,
            );
            // Merge nested groups with current working groups
            for (const [key, value] of nestedResult.updatedGroups) {
              workingGroups.set(key, value);
            }

            const matchedText = nestedResult.capturedText;
            capturedText += matchedText;
            currentPos = nestedResult.endPos;

            // If this is the last token in the branch, we're done
            if (branch.indexOf(branchToken) === branch.length - 1) {
              return {
                endPos: currentPos,
                capturedText: capturedText,
                updatedGroups: workingGroups,
              };
            }

            // Try to match the rest of the branch
            const remainingBranch = branch.slice(
              branch.indexOf(branchToken) + 1,
            );

            const result = this.matchBranch(
              remainingBranch,
              input,
              currentPos,
              workingGroups,
            );

            if (result) {
              return {
                endPos: result.endPos,
                capturedText: capturedText + result.capturedText,
                updatedGroups: result.updatedGroups,
              };
            }

            // Continue to try other nested branches if this one didn't work
          }
        }

        // If no nested branch matched, this branch fails
        return null;
      } else {
        // Handle regular tokens
        const nextPositions = this.matchToken(
          branchToken,
          input,
          currentPos,
          workingGroups,
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

            return {
              endPos: nextPos,
              capturedText: finalCapturedText,
              updatedGroups: workingGroups,
            };
          }

          // Try to match the rest of the branch from this position
          const remainingBranch = branch.slice(branch.indexOf(branchToken) + 1);
          const result = this.matchBranch(
            remainingBranch,
            input,
            nextPos,
            workingGroups,
          );

          if (result) {
            return {
              endPos: result.endPos,
              capturedText: capturedText + matchedText + result.capturedText,
              updatedGroups: result.updatedGroups,
            };
          }
        }

        // If no position worked, this branch fails
        return null;
      }
    }

    return { endPos: currentPos, capturedText, updatedGroups: workingGroups };
  }

  private matchQuantifiedAlternation(
    token: Token & { type: "quantifier" },
    tokens: Token[], // the full token array
    input: string[],
    tokenIdx: number,
    inputPos: number,
    capturedGroups: Map<number, string> = new Map(),
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
    capturedGroups: Map<number, string> = new Map(),
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
      return this.matchFromPosition(
        this.tokens.slice(1),
        inputChars,
        0,
        0,
        new Map(),
      );
    }

    // otherwise, try matching from each position
    // Always try at least position 0, even for empty strings
    const maxPos = Math.max(1, inputChars.length);
    for (let i = 0; i < maxPos; i++) {
      if (this.matchFromPosition(this.tokens, inputChars, 0, i, new Map())) {
        return true;
      }
    }

    // if it hasn't matched on any of the possible paths
    return false;
  }
}

function collectFilesRecursively(dirPath: string): string[] {
  const files: string[] = [];

  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        // Recursively collect files from subdirectory
        files.push(...collectFilesRecursively(fullPath));
      } else if (stat.isFile()) {
        // Add file to collection
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Skip directories/files that can't be read
  }

  return files;
}

async function main() {
  const args = process.argv;

  // Parse flags and arguments
  let isRecursive = false;
  let patternIndex = 3;
  let pathsIndex = 4;

  if (args[2] === "-r") {
    isRecursive = true;
    if (args[3] !== "-E") {
      console.log("Expected '-E' after '-r'");
      process.exit(1);
    }
    patternIndex = 4;
    pathsIndex = 5;
  } else if (args[2] !== "-E") {
    console.log("Expected first argument to be '-E' or '-r'");
    process.exit(1);
  }

  const pattern = args[patternIndex];
  const paths = args.slice(pathsIndex);

  // Collect files to search
  let filenames: string[] = [];
  if (isRecursive) {
    // Recursively collect files from directories
    for (const path of paths) {
      filenames.push(...collectFilesRecursively(path));
    }
  } else {
    filenames = paths;
  }

  try {
    const matcher = new GrepMatcher(pattern);
    let hasMatches = false;

    if (filenames.length === 0) {
      // Read from stdin
      const inputText = await Bun.stdin.text();
      const lines = inputText.split("\n");

      for (const line of lines) {
        if (matcher.match(line)) {
          console.log(line);
          hasMatches = true;
        }
      }
    } else {
      // Read from file(s)
      const shouldPrintFilename = filenames.length > 1 || isRecursive;

      for (const filename of filenames) {
        const inputText = await Bun.file(filename).text();
        const lines = inputText.split("\n");

        for (const line of lines) {
          if (matcher.match(line)) {
            if (shouldPrintFilename) {
              console.log(`${filename}:${line}`);
            } else {
              console.log(line);
            }
            hasMatches = true;
          }
        }
      }
    }

    if (hasMatches) {
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
