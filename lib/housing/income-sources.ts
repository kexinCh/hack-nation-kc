import type {
  ExtractedFieldKey,
  Frequency,
  IncomeSourceGroupOverride,
  RenterConfirmation,
} from "./types.ts";

export const incomeSourceFrequencyMultipliers: Record<Frequency, number> = {
  weekly: 52,
  biweekly: 26,
  semimonthly: 24,
  monthly: 12,
  annual: 1,
};

function annualizeLocal(amount: number, frequency: Frequency) {
  return Math.round(amount * incomeSourceFrequencyMultipliers[frequency] * 100) / 100;
}

type FieldMap = Map<ExtractedFieldKey, RenterConfirmation>;

export type IncomeSourceDocument = {
  documentId: string;
  sourceDocumentId: string;
  fileName: string;
  kind: "job_document" | "benefit" | "gig" | "support" | "other";
  fields: FieldMap;
  employerKey?: string;
  workerKey?: string;
  periodKey?: string;
  amount?: number;
  frequency?: Frequency;
  hourlyRate?: number;
  weeklyHours?: number;
  annualIncome?: number;
  ytdGrossIncome?: number;
};

export type IncomeSourceGroup = {
  id: string;
  type: "job" | "benefit" | "gig" | "support" | "other";
  name: string;
  documents: IncomeSourceDocument[];
  inactive?: boolean;
  uncertain?: boolean;
  annualizedAmount?: number;
  explanation?: string;
  warnings: string[];
};

function isConfirmedValue(field: RenterConfirmation) {
  return (field.status === "confirmed" || field.status === "corrected") && field.value !== undefined;
}

export function normalizeIdentity(value: unknown) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeEmployerName(value: unknown) {
  return normalizeIdentity(value)
    .replace(/\b(inc|incorporated|llc|l l c|corp|corporation|co|company|ltd|limited|pllc|lp|llp)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function valueOf(fields: FieldMap, keys: ExtractedFieldKey[]) {
  for (const key of keys) {
    const field = fields.get(key);
    if (field?.value !== undefined) return field.value;
  }
  return undefined;
}

function numericValue(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string") {
    const parsed = Number(value.replace(/[$,\s]/g, ""));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function normalizeFrequency(value: unknown): Frequency | undefined {
  const text = normalizeIdentity(value);
  if (text === "weekly") return "weekly";
  if (text === "biweekly" || text === "bi weekly" || text === "every two weeks") return "biweekly";
  if (text === "semimonthly" || text === "semi monthly" || text === "twice monthly") return "semimonthly";
  if (text === "monthly") return "monthly";
  if (text === "annual" || text === "annually" || text === "yearly") return "annual";
  return undefined;
}

function documentKind(fields: FieldMap): IncomeSourceDocument["kind"] {
  if (fields.has("gross_pay") || fields.has("pay_period_end_date") || fields.has("employer_name") || fields.has("employer")) {
    return "job_document";
  }
  if (fields.has("monthly_benefit") || fields.has("benefit_amount") || fields.has("benefit_frequency")) {
    return "benefit";
  }
  if (fields.has("gross_receipts") || fields.has("platform_fees") || fields.has("statement_month")) {
    return "gig";
  }
  return "other";
}

export function documentsFromConfirmations(confirmations: RenterConfirmation[]) {
  const confirmed = confirmations.filter(isConfirmedValue);
  const documentIds = Array.from(new Set(confirmed.map((field) => field.documentId)));
  return documentIds.map((documentId): IncomeSourceDocument => {
    const fields = new Map(
      confirmed.filter((field) => field.documentId === documentId).map((field) => [field.fieldKey, field]),
    );
    const first = confirmed.find((field) => field.documentId === documentId);
    const employer = valueOf(fields, ["employer_name", "employer"]);
    const worker = valueOf(fields, ["employee_name", "person_name"]);
    const start = valueOf(fields, ["pay_period_start"]);
    const end = valueOf(fields, ["pay_period_end_date"]);
    const kind = documentKind(fields);

    return {
      documentId,
      sourceDocumentId: first?.sourceDocumentId ?? documentId,
      fileName: first?.fileName ?? documentId,
      kind,
      fields,
      employerKey: normalizeEmployerName(employer),
      workerKey: normalizeIdentity(worker),
      periodKey: start || end ? `${String(start ?? "")}:${String(end ?? "")}` : undefined,
      amount: numericValue(valueOf(fields, ["gross_pay", "monthly_benefit", "benefit_amount", "gross_receipts"])),
      frequency: normalizeFrequency(valueOf(fields, ["pay_frequency", "benefit_frequency"])),
      hourlyRate: numericValue(valueOf(fields, ["hourly_rate"])),
      weeklyHours: numericValue(valueOf(fields, ["weekly_hours"])),
      annualIncome: numericValue(valueOf(fields, ["annual_income", "salary"])),
      ytdGrossIncome: numericValue(valueOf(fields, ["ytd_gross_income"])),
    };
  });
}

function baseGroupId(document: IncomeSourceDocument) {
  if (document.kind === "job_document") {
    return `job:${document.workerKey || "unknown-worker"}:${document.employerKey || document.documentId}`;
  }
  if (document.kind === "benefit") {
    const program = normalizeIdentity(valueOf(document.fields, ["benefit_type"]) ?? "benefit");
    const worker = document.workerKey || normalizeIdentity(valueOf(document.fields, ["person_name"]));
    return `benefit:${worker}:${program}`;
  }
  if (document.kind === "gig") {
    const platform = normalizeIdentity(valueOf(document.fields, ["employer_name", "employer"]) ?? valueOf(document.fields, ["job_title"]) ?? "gig");
    return `gig:${document.workerKey}:${platform}`;
  }
  return `other:${document.documentId}`;
}

function displayName(group: IncomeSourceGroup) {
  const first = group.documents[0];
  if (!first) return group.name;
  const employer = valueOf(first.fields, ["employer_name", "employer"]);
  const benefit = valueOf(first.fields, ["benefit_type"]);
  if (group.type === "job") return employer ? `Job - ${String(employer)}` : "Job";
  if (group.type === "benefit") return benefit ? `Benefits - ${String(benefit)}` : "Benefits";
  if (group.type === "gig") return employer ? `Gig income - ${String(employer)}` : "Gig income";
  return group.name;
}

function applyOverrides(groups: IncomeSourceGroup[], overrides: IncomeSourceGroupOverride[] = []) {
  if (overrides.length === 0) return groups;
  const byDocument = new Map<string, IncomeSourceGroup>();
  for (const group of groups) for (const doc of group.documents) byDocument.set(doc.documentId, group);
  const overriddenIds = new Set(overrides.flatMap((override) => override.documentIds));
  const remaining = groups
    .map((group) => ({ ...group, documents: group.documents.filter((doc) => !overriddenIds.has(doc.documentId)) }))
    .filter((group) => group.documents.length > 0);
  const overrideGroups = overrides.map((override): IncomeSourceGroup => {
    const docs = override.documentIds.flatMap((documentId) => byDocument.get(documentId)?.documents.filter((doc) => doc.documentId === documentId) ?? []);
    const type = byDocument.get(override.documentIds[0])?.type ?? "other";
    const group = {
      id: override.id,
      type,
      name: override.name ?? "Income source",
      documents: docs,
      inactive: override.inactive,
      warnings: [],
    } satisfies IncomeSourceGroup;
    return { ...group, name: override.name ?? displayName(group) };
  }).filter((group) => group.documents.length > 0);
  return [...remaining, ...overrideGroups];
}

function calculateJob(group: IncomeSourceGroup) {
  const warnings: string[] = [];
  const payStubs = group.documents.filter((doc) => doc.fields.has("gross_pay"));
  const distinct = new Map<string, IncomeSourceDocument>();
  for (const stub of payStubs) {
    const key = stub.periodKey ?? `no-period:${stub.documentId}`;
    if (distinct.has(key)) {
      warnings.push(`Duplicate or overlapping pay period excluded for ${stub.fileName}.`);
      continue;
    }
    distinct.set(key, stub);
  }
  const stubs = Array.from(distinct.values()).filter((stub) => stub.amount !== undefined);
  const frequency = stubs.find((stub) => stub.frequency)?.frequency ?? group.documents.find((doc) => doc.frequency)?.frequency;
  if (stubs.length > 0 && frequency) {
    const average = stubs.reduce((sum, stub) => sum + (stub.amount ?? 0), 0) / stubs.length;
    const annualizedAmount = annualizeLocal(average, frequency);
    const ytd = stubs.find((stub) => stub.ytdGrossIncome !== undefined)?.ytdGrossIncome;
    if (ytd !== undefined) warnings.push(`YTD gross income cross-check available: ${ytd}.`);
    return {
      amount: annualizedAmount,
      explanation: `${group.name}: average gross per ${frequency} pay period x ${incomeSourceFrequencyMultipliers[frequency]}`,
      warnings,
    };
  }
  const letter = group.documents.find((doc) => doc.annualIncome !== undefined || (doc.hourlyRate !== undefined && doc.weeklyHours !== undefined));
  if (letter?.annualIncome !== undefined) {
    return { amount: letter.annualIncome, explanation: `${group.name}: employment letter annual income`, warnings };
  }
  if (letter?.hourlyRate !== undefined && letter.weeklyHours !== undefined) {
    return {
      amount: annualizeLocal(letter.hourlyRate * letter.weeklyHours, "weekly"),
      explanation: `${group.name}: hourly rate x weekly hours x 52`,
      warnings,
    };
  }
  return { amount: 0, explanation: `${group.name}: missing confirmed amount and frequency`, warnings: [...warnings, "A job source is missing usable confirmed pay evidence."] };
}

function calculateSimple(group: IncomeSourceGroup) {
  const doc = group.documents[0];
  const amount = doc?.amount;
  const frequency = doc?.frequency ?? (group.type === "gig" ? "monthly" : undefined);
  if (amount !== undefined && frequency) {
    const net = group.type === "gig"
      ? Math.max(0, amount - (numericValue(valueOf(doc.fields, ["platform_fees"])) ?? 0))
      : amount;
    return {
      amount: annualizeLocal(net, frequency),
      explanation: `${group.name}: ${group.type === "gig" ? "net receipts" : "amount"} x ${incomeSourceFrequencyMultipliers[frequency]}`,
      warnings: [],
    };
  }
  return { amount: 0, explanation: `${group.name}: missing confirmed amount and frequency`, warnings: ["An income source is missing usable confirmed amount or frequency."] };
}

export function buildIncomeSourceGroups(
  confirmations: RenterConfirmation[],
  overrides: IncomeSourceGroupOverride[] = [],
) {
  const docs = documentsFromConfirmations(confirmations);
  const map = new Map<string, IncomeSourceGroup>();
  for (const doc of docs) {
    const id = baseGroupId(doc);
    const type = doc.kind === "job_document" ? "job" : doc.kind === "benefit" ? "benefit" : doc.kind === "gig" ? "gig" : "other";
    const group = map.get(id) ?? { id, type, name: type, documents: [], warnings: [] };
    group.documents.push(doc);
    map.set(id, group);
  }
  let groups = Array.from(map.values()).map((group) => ({ ...group, name: displayName(group) }));
  groups = applyOverrides(groups, overrides);
  return groups.map((group) => {
    if (group.inactive) return { ...group, annualizedAmount: 0, explanation: `${group.name}: inactive or ended`, warnings: group.warnings };
    const calculation = group.type === "job" ? calculateJob(group) : calculateSimple(group);
    return {
      ...group,
      annualizedAmount: calculation.amount,
      explanation: calculation.explanation,
      warnings: [...group.warnings, ...calculation.warnings],
    };
  });
}
