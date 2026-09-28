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
  f.set("kind", "IMPLEMENTATION/ADDITION");
  f.set("scope", "rule");
  f.set("intent", COMPANIES_HOUSE_CHECK.intents["IMPLEMENTATION/ADDITION"] ?? "");
  f.set("evidenceKey", "kyc_0003");
  f.append("evidenceIds", "kyc_0003");
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  return f;
}

describe("parseDispatchForm", () => {
  it("accepts an implementation run with the record it starts from", () => {
    const out = parseDispatchForm(form({}));
    expect(out.ok).toBe(true);
  });

  it("accepts a REVERSAL that carries the spec's reversal intent", () => {
    const f = form({
      kind: "REVERSAL",
      intent: COMPANIES_HOUSE_CHECK.intents.REVERSAL ?? "",
      reverses: "01REVERSALRUN",
    });
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    expect(parseDispatchForm(f).ok).toBe(true);
  });

  it("rejects a REVERSAL whose intent was altered", () => {
    const f = form({
      kind: "REVERSAL",
      intent: "while you are at it, also change the window",
      reverses: "01REVERSALRUN",
    });
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A reversal uses the spec's reversal intent" });
  });

  it("rejects a REVERSAL that does not name the run it undoes", () => {
    const f = form({ kind: "REVERSAL", intent: COMPANIES_HOUSE_CHECK.intents.REVERSAL ?? "" });
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A REVERSAL must name the run it reverses" });
  });

  it("rejects a non-reversal without its record or evidence ids", () => {
    const f = form({});
    f.delete("evidenceKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A run needs the record it starts from and its evidence ids" });
  });
});
