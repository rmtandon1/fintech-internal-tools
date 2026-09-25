import { beforeAll, describe, expect, it } from "vitest";
import { REFUND_CLUSTERING_HOLD } from "@console/tool-automation";
import { parseDispatchForm } from "@/lib/dispatch-form";
import { setupHarness } from "../helpers/harness";

beforeAll(() => {
  setupHarness();
});

function form(over: Record<string, string>): FormData {
  const f = new FormData();
  f.set("spec", REFUND_CLUSTERING_HOLD.file);
  f.set("kind", "IMPLEMENTATION/ADDITION");
  f.set("scope", "rule");
  f.set("intent", REFUND_CLUSTERING_HOLD.intents["IMPLEMENTATION/ADDITION"] ?? "");
  f.set("clusterKey", "Kestrel Outdoors");
  f.append("evidenceIds", "rfnd_0011");
  for (const [k, v] of Object.entries(over)) f.set(k, v);
  return f;
}

describe("parseDispatchForm", () => {
  it("accepts an implementation run with cluster evidence", () => {
    const out = parseDispatchForm(form({}));
    expect(out.ok).toBe(true);
  });

  it("accepts a REVERSAL that carries the spec's reversal intent", () => {
    const f = form({
      kind: "REVERSAL",
      intent: REFUND_CLUSTERING_HOLD.intents.REVERSAL ?? "",
      reverses: "01REVERSALRUN",
    });
    f.delete("clusterKey");
    f.delete("evidenceIds");
    expect(parseDispatchForm(f).ok).toBe(true);
  });

  it("rejects a REVERSAL whose intent was altered", () => {
    const f = form({
      kind: "REVERSAL",
      intent: "while you are at it, also change the window",
      reverses: "01REVERSALRUN",
    });
    f.delete("clusterKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A reversal uses the spec's reversal intent" });
  });

  it("rejects a REVERSAL that does not name the run it undoes", () => {
    const f = form({ kind: "REVERSAL", intent: REFUND_CLUSTERING_HOLD.intents.REVERSAL ?? "" });
    f.delete("clusterKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A REVERSAL must name the run it reverses" });
  });

  it("rejects a non-reversal without cluster key or evidence ids", () => {
    const f = form({});
    f.delete("clusterKey");
    f.delete("evidenceIds");
    const out = parseDispatchForm(f);
    expect(out).toEqual({ ok: false, detail: "A run needs a cluster key and evidence ids" });
  });
});
