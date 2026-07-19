import { housingProgram } from "./program.ts";
import type { RuleCitation } from "./types.ts";

export const mtsp2026EffectiveDate = "2026-05-01";

export const ruleCitations: RuleCitation[] = [
  {
    id: "HUD-MTSP-001",
    title: "FY 2026 MTSP effective date",
    sourceName: "HUD User MTSP dataset",
    sourceUrl: "https://www.huduser.gov/portal/datasets/mtsp.html",
    effectiveDate: mtsp2026EffectiveDate,
    ruleVersion: housingProgram.ruleVersion,
    authority: "official_hud",
    sourceLocator: "FY 2026 effective date notice",
    plainLanguageSummary:
      "HUD's FY 2026 Multifamily Tax Subsidy Project income limits are effective May 1, 2026.",
  },
  {
    id: "HUD-MTSP-002",
    title: "Boston-Cambridge-Quincy FY 2026 60% MTSP thresholds",
    sourceName: "HUD FY 2026 HERA Income Limits Report",
    sourceUrl: housingProgram.officialSourceUrl,
    effectiveDate: mtsp2026EffectiveDate,
    ruleVersion: housingProgram.ruleVersion,
    authority: "official_hud",
    sourceLocator: "PDF page 130",
    plainLanguageSummary:
      "For the Boston-Cambridge-Quincy, MA-NH HMFA, the official pack freezes the FY 2026 60% limits for household sizes 1 through 8.",
  },
  {
    id: "CH-INCOME-001",
    title: "Frozen RealDoor annualization convention",
    sourceName: "RealDoor challenge rules",
    sourceUrl: "data/realdoor/rule_corpus.jsonl",
    effectiveDate: "2026-07-18",
    ruleVersion: housingProgram.ruleVersion,
    authority: "hackathon_simulation",
    sourceLocator: "Frozen challenge convention",
    plainLanguageSummary:
      "For scoring only, annualize recurring gross income using the explicit pay frequency and sum independently documented recurring sources.",
  },
  {
    id: "CH-DECISION-001",
    title: "Human decision boundary",
    sourceName: "RealDoor data use and safety boundary",
    sourceUrl: "data/realdoor/rule_corpus.jsonl",
    effectiveDate: "2026-07-18",
    ruleVersion: housingProgram.ruleVersion,
    authority: "hackathon_simulation",
    sourceLocator: "Human-decision boundary",
    plainLanguageSummary:
      "Outputs may compare an annualized amount with a frozen threshold, but must not label a person eligible, ineligible, approved, denied, or prioritized.",
  },
];
