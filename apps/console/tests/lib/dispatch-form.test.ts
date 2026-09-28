import { beforeAll, describe, expect, it } from "vitest";
import { COMPANIES_HOUSE_CHECK } from "@console/tool-automation";
import { parseDispatchForm } from "@/lib/dispatch-form";
import { setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
});

function form(over: Record<string, string>): FormData {
  const f = new FormData();
  f.set("spec", COMPANIES_HOUSE_CHECK.file);
  f.set("operation", "change");
  f.set("intent", COMPANIES_HOUSE_CHECK.intents.change);
  f.set("evidenceKey", "kyc_0003");
  f.append("evidenceIds", "kyc_0003");
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  return f;
}

describe("parseDispatchForm", () => {
  it("accepts a change with the record it starts from", () => {
    const out = parseDispatchForm(form({}));
    expect(out.ok).toBe(true);
  });

  it("accepts an undo that carries the spec's undo intent", () => {
    const f = form({
      operation: "undo",
      intent: COMPANIES_HOUSE_CHECK.intents.undo,
      reverses: "01UNDORUN",
    });
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    expect(parseDispatchForm(f).ok).toBe(true);
  });

  it("rejects an undo whose intent was altered", () => {
    const f = form({
      operation: "undo",
      intent: "while you are at it, also change the window",
      reverses: "01UNDORUN",
    });
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "An undo uses the spec's undo intent" });
  });

  it("rejects an undo that does not name the run it undoes", () => {
    const f = form({ operation: "undo", intent: COMPANIES_HOUSE_CHECK.intents.undo });
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "An undo must name the run it undoes" });
  });

  it("rejects a change without its record or evidence ids", () => {
    const f = form({});
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A run needs the record it starts from and its evidence ids" });
  });
});
