
import { describe, it, expect } from "vitest";
import { countWords } from "./WordCount";

describe("countWords", () => {
  it("returns 0 for empty string", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("   ")).toBe(0);
  });

  it("counts single and multiple words", () => {
    expect(countWords("hello")).toBe(1);
    expect(countWords("hello world")).toBe(2);
    expect(countWords("two   spaces")).toBe(2);
    expect(countWords(" punctuation, handled! ")).toBe(2);
  });
});
