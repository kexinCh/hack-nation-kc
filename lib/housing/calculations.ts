import type {
  CalculationInput,
  CalculationResult,
  ExtractedFieldKey,
  Frequency,
  IncomeSourceGroupOverride,
  RenterConfirmation,
  ScenarioThreshold,
} from "./types.ts";

import { getScenarioThreshold } from "./scenario.ts";
import { buildIncomeSourceGroups } from "./income-sources.ts";

export const frequencyMultipliers: Record<Frequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  annual: 1,
};

const amountKeys: ExtractedFieldKey[] = ["gross_pay", "benefit_amount", "monthly_benefit", "annual_income"];
const frequencyKeys: ExtractedFieldKey[] = ["pay_frequency", "benefit_frequency"];

function isConfirmedValue(field: RenterConfirmation) {
  return (field.status === "confirmed" || field.status === "corrected") && field.value !== undefined;
}

function normalizeFrequency(value: unknown): Frequency | undefined {
  if (
    value === "weekly" ||
    value === "biweekly" ||
    value === "semimonthly" ||
    value === "monthly" ||
    value === "annual"
  ) {
    return value;
  }

  return undefined;
}

function numericValue(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }

  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

export function calculateAnnualizedIncomeFromConfirmedFields(
  sessionId: string,
  householdSize: number,
  confirmations: RenterConfirmation[],
  threshold: ScenarioThreshold | undefined = getScenarioThreshold(householdSize),
  overrides: IncomeSourceGroupOverride[] = [],
): CalculationResult {
  const confirmed = confirmations.filter(isConfirmedValue);
  const inputs: CalculationInput[] = [];
  const annualizedLines: CalculationResult["annualizedLines"] = [];
  const warnings: string[] = [];
  let annualizedIncome = 0;
  const groups = buildIncomeSourceGroups(confirmations, overrides);

  if (groups.length > 0) {
    for (const group of groups) {
      for (const document of group.documents) {
        for (const field of document.fields.values()) {
          inputs.push({
            documentId: document.documentId,
            fieldKey: field.fieldKey,
            label: field.label,
            value: field.value ?? field.originalValue,
          });
        }
      }
      annualizedLines.push({
        documentId: group.documents[0]?.documentId ?? group.id,
        sourceDocumentId: group.documents.map((document) => document.sourceDocumentId).join(", "),
        incomeSourceId: group.id,
        incomeSourceName: group.name,
        supportingDocumentIds: group.documents.map((document) => document.documentId),
        amountLabel: group.explanation ?? group.name,
        amount: group.annualizedAmount ?? 0,
        frequencyLabel: "Income source calculation",
        frequency: "annual",
        multiplier: 1,
        annualizedAmount: group.annualizedAmount ?? 0,
      });
      annualizedIncome += group.annualizedAmount ?? 0;
      warnings.push(...group.warnings);
    }
  } else {

  const documentIds = Array.from(new Set(confirmed.map((field) => field.documentId)));

  for (const documentId of documentIds) {
    const documentFields = confirmed.filter((field) => field.documentId === documentId);
    const amountField = documentFields.find((field) => amountKeys.includes(field.fieldKey));
    const frequencyField = documentFields.find((field) => frequencyKeys.includes(field.fieldKey));
    const amount = numericValue(amountField?.value);
    const frequency = amountField?.fieldKey === "annual_income" ? "annual" : normalizeFrequency(frequencyField?.value);

    if (!amountField || (!frequencyField && amountField.fieldKey !== "annual_income")) {
      warnings.push("A reviewed document is missing a confirmed amount or frequency.");
      continue;
    }

    if (amount === undefined || !frequency) {
      warnings.push("A confirmed amount or frequency could not be used in the calculation.");
      continue;
    }

    inputs.push({
      documentId,
      fieldKey: amountField.fieldKey,
      label: amountField.label,
      value: amount,
    });
    inputs.push({
      documentId,
      fieldKey: frequencyField?.fieldKey ?? "annual_income",
      label: frequencyField?.label ?? "Annual frequency",
      value: frequency,
    });

    const annualizedAmount = annualize(amount, frequency);
    annualizedLines.push({
      documentId,
      sourceDocumentId: amountField.sourceDocumentId,
      amountLabel: amountField.label,
      amount,
      frequencyLabel: frequencyField?.label ?? "Annual frequency",
      frequency,
      multiplier: frequencyMultipliers[frequency],
      annualizedAmount,
    });

    annualizedIncome += annualizedAmount;
  }
  }

  const thresholdAmount = threshold?.thresholdAmount;
  const thresholdComparison =
    thresholdAmount === undefined
      ? "no_frozen_threshold"
      : annualizedIncome <= thresholdAmount
        ? "below_or_equal"
        : "above";
  const readinessStatus =
    inputs.length > 0 && thresholdComparison !== "no_frozen_threshold" && warnings.length === 0
      ? "READY_TO_REVIEW"
      : "NEEDS_REVIEW";

  return {
    id: `calc-${Date.now()}`,
    sessionId,
    type: "annualized_income",
    inputs,
    annualizedLines,
    formula: groups.length > 0
      ? "Group documents into distinct income sources; average distinct pay periods per job; annualize each source once."
      : "weekly x 52, biweekly x 26, semimonthly x 24, monthly x 12, annual x 1",
    annualizedIncome,
    householdSize,
    amiPercent: threshold?.amiPercent,
    thresholdAmount,
    thresholdEffectiveDate: threshold?.effectiveDate,
    thresholdHudArea: threshold?.hudArea,
    thresholdSourceUrl: threshold?.sourceUrl,
    thresholdSourcePdfPage: threshold?.sourcePdfPage,
    thresholdComparison,
    readinessStatus,
    calculatedAt: new Date().toISOString(),
    citationIds: ["CH-INCOME-001", "HUD-MTSP-002", "CH-DECISION-001"],
    warnings,
  };
}

export function annualize(amount: number, frequency: Frequency) {
  if (amount < 0) {
    throw new Error("Amount must be non-negative");
  }

  return Math.round(amount * frequencyMultipliers[frequency] * 100) / 100;
}

export function compareToFrozenThreshold(annualIncome: number, householdSize: number) {
  const threshold = getScenarioThreshold(householdSize)?.thresholdAmount;
  if (threshold === undefined) {
    return "no_frozen_threshold" as const;
  }

  return annualIncome <= threshold ? "below_or_equal" : "above";
}
