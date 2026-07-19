import type { ChecklistTask } from "./types.ts";

export const frozenChecklist: ChecklistTask[] = [
  {
    id: "pay-stub-task",
    documentType: "pay_stub",
    title: "Pay stub",
    description:
      "Recent wage record used to review gross pay, pay frequency, and source-page evidence.",
    incomeSources: ["employment"],
    supportedExtraction: true,
    allowsMultiple: true,
    ruleCitationIds: ["CH-INCOME-001"],
  },
  {
    id: "employment-letter-task",
    documentType: "employment_letter",
    title: "Employment letter",
    description:
      "Employer letter used to review hourly rate, expected weekly hours, and document date when available.",
    incomeSources: ["employment"],
    supportedExtraction: true,
    allowsMultiple: true,
    ruleCitationIds: ["CH-INCOME-001"],
  },
  {
    id: "benefit-letter-task",
    documentType: "benefit_letter",
    title: "Benefit letter",
    description:
      "Benefits or government assistance letter used to review amount, frequency, and source-page evidence.",
    incomeSources: ["benefits"],
    supportedExtraction: true,
    allowsMultiple: true,
    ruleCitationIds: ["CH-INCOME-001"],
  },
  {
    id: "gig-statement-task",
    documentType: "gig_statement",
    title: "Gig statement",
    description:
      "Gig work or self-employment earnings record used to review gross receipts, platform fees, and statement month.",
    incomeSources: ["gig_self_employment"],
    supportedExtraction: true,
    allowsMultiple: true,
    ruleCitationIds: ["CH-INCOME-001"],
  },
  {
    id: "support-letter-task",
    documentType: "support_letter",
    title: "Support letter",
    description:
      "Letter or proof for gifts or financial support. This milestone stores the PDF for review without validated extraction.",
    incomeSources: ["gifts_support"],
    supportedExtraction: false,
    allowsMultiple: true,
    ruleCitationIds: ["CH-INCOME-001"],
  },
  {
    id: "other-income-proof-task",
    documentType: "other_income_proof",
    title: "Other income proof",
    description:
      "Other renter-described income document. This milestone stores the PDF for review without validated extraction.",
    incomeSources: ["other"],
    supportedExtraction: false,
    allowsMultiple: true,
    ruleCitationIds: ["CH-INCOME-001"],
  },
];

export function checklistForIncomeSources(incomeSources: readonly string[]) {
  if (incomeSources.includes("no_current_income") && incomeSources.length === 1) {
    return [];
  }

  return frozenChecklist.filter((task) =>
    task.incomeSources.some((source) => incomeSources.includes(source)),
  );
}
