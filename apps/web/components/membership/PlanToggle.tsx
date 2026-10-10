"use client";

import type { OfferPlan } from "@/lib/membership-offer";

/**
 * The plan toggle (14.21). Two plain choices side by side, monthly and
 * annual, one of them always selected. Each shows its price the same way:
 * the annual plan as a monthly equivalent with the yearly total beside it,
 * both figures at the same size (the plan-price-figure class has one size,
 * set once in globals.css). The trial label sits under the price. There is
 * no struck-through price, no saving claim and nothing counts down.
 */
export function PlanToggle({ plans, value, onChange, name = "plan" }: { plans: OfferPlan[]; value: OfferPlan["plan"]; onChange: (plan: OfferPlan["plan"]) => void; name?: string }) {
  if (plans.length < 2) return null;
  return (
    <fieldset className="plan-toggle">
      <legend>Choose a plan</legend>
      <div className="plan-toggle-options">
        {plans.map((p) => (
          <label key={p.plan} className="plan-option" data-selected={value === p.plan ? "true" : "false"}>
            <input type="radio" name={name} value={p.plan} checked={value === p.plan} onChange={() => onChange(p.plan)} />
            <span className="plan-option-name">{p.heading}</span>
            <span className="plan-price">
              <span className="plan-price-figure">{p.line.primary}</span>
              {p.line.secondary ? <span className="plan-price-figure">{p.line.secondary}</span> : null}
            </span>
            <span className="plan-option-trial muted small">{p.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
