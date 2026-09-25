import { describe, expect, it } from "vitest";
import { pageNumber } from "@/lib/page-number";

describe("pageNumber", () => {
  it("returns the integer when the value is a positive integer", () => {
    expect(pageNumber("1")).toBe(1);
    expect(pageNumber("12")).toBe(12);
    expect(pageNumber("007")).toBe(7);
  });

  it("falls back to 1 for missing, non-numeric, fractional or non-positive values", () => {
    expect(pageNumber(undefined)).toBe(1);
    expect(pageNumber("")).toBe(1);
    expect(pageNumber("abc")).toBe(1);
    expect(pageNumber("1.5")).toBe(1);
    expect(pageNumber("0")).toBe(1);
    expect(pageNumber("-3")).toBe(1);
    expect(pageNumber("Infinity")).toBe(1);
  });

  it("uses the first value of a repeated parameter", () => {
    expect(pageNumber(["3", "9"])).toBe(3);
    expect(pageNumber([])).toBe(1);
  });
});
