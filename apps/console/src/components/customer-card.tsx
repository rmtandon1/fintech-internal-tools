import { Icon } from "@console/ui/icon";
import { TONE_INK, type GaugeTone } from "@console/ui/gauge";
import { ScoreGauge } from "@console/ui/score-gauge";
import { cn } from "@console/ui/utils";
import {
  approvalNeed,
  countryName,
  dueLabel,
  flagEmoji,
  initials,
  riskBands,
  type CustomerFacts,
  type RiskThresholds,
} from "@/lib/customer-profile";

/**
 * The top of a KYC case: who the customer is, the four things that decide
 * whether they can be approved, and the risk score on a gauge whose colour
 * bands are the live approval thresholds.
 */
export function CustomerCard({
  facts,
  thresholds,
  countryAllowed,
  open,
  now,
}: {
  facts: CustomerFacts;
  thresholds: RiskThresholds;
  countryAllowed: boolean;
  /** False once the case is decided: the deadline no longer applies. */
  open: boolean;
  now: number;
}) {
  const need = approvalNeed(facts.riskScore, thresholds);
  const due = dueLabel(facts.dueAt, now);
  const flag = flagEmoji(facts.country);

  return (
    <section
      className="relative m-3 mb-1 overflow-hidden rounded-xl border border-border bg-gradient-to-br from-muted/60 via-card to-card motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-3 motion-safe:duration-500"
      data-testid="customer-card"
    >
      <div className="flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <div className="min-w-[280px] flex-1 space-y-5">
          <div className="flex items-center gap-3.5">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background text-base font-semibold text-foreground">
              {initials(facts.name)}
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-xl font-semibold tracking-tight text-foreground">
                {facts.name}
              </h2>
              <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
                <span>
                  {flag ? <span className="mr-1.5" aria-hidden>{flag}</span> : null}
                  {countryName(facts.country)}
                </span>
                <span aria-hidden>·</span>
                <span>{facts.segment === "business" ? "Business" : "Personal"} customer</span>
                <span aria-hidden>·</span>
                <span>{sentence(facts.documentType)}</span>
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
            <Signal
              label="Sanctions screening"
              value={facts.sanctionsHit ? "Possible match" : "Clear"}
              tone={facts.sanctionsHit ? "negative" : "positive"}
            />
            <Signal
              label="Documents"
              value={facts.documentsComplete ? "Complete" : "Outstanding"}
              tone={facts.documentsComplete ? "positive" : "warning"}
            />
            <Signal
              label="Country"
              value={countryAllowed ? "Permitted" : "Prohibited"}
              tone={countryAllowed ? "positive" : "negative"}
            />
            <Signal
              label="Review deadline"
              value={open ? due.text : "Decided"}
              tone={open ? due.tone : "neutral"}
            />
          </div>

          <p className="flex items-center gap-2 text-sm text-foreground">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: TONE_INK[need.tone] }}
              aria-hidden
            />
            {need.text}
          </p>
        </div>

        <div className="mx-auto flex w-[220px] shrink-0 flex-col items-center">
          <ScoreGauge
            key={facts.riskScore}
            value={facts.riskScore}
            bands={riskBands(thresholds)}
            label="Risk score"
          />
          <p className="-mt-1 text-[11px] font-medium text-muted-foreground">Risk score</p>
        </div>
      </div>
    </section>
  );
}

const SIGNAL_ICON: Record<GaugeTone | "neutral", string> = {
  positive: "CircleCheck",
  caution: "CircleAlert",
  warning: "CircleAlert",
  negative: "CircleX",
  neutral: "Clock",
};

function Signal({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: GaugeTone | "neutral";
}) {
  return (
    <div className="rounded-lg border border-border bg-background/60 px-3 py-2.5">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Icon
          name={SIGNAL_ICON[tone]}
          className={cn("size-4 shrink-0", tone === "neutral" && "text-muted-foreground")}
          style={tone === "neutral" ? undefined : { color: TONE_INK[tone] }}
        />
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

/** `company_registry` → `Company registry`. */
function sentence(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
