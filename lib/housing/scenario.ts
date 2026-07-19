import mtspData from "../../data/realdoor/mtsp_2026_boston_cambridge_quincy.json" with { type: "json" };

import type { ScenarioConfig, ScenarioThreshold } from "./types.ts";

type MtspData = {
  sourceFile: string;
  rows: ScenarioThreshold[];
};

const data = mtspData as MtspData;

export const canonicalScenario: ScenarioConfig = {
  id: "realdoor-boston-2026-hh-003",
  label: "Official RealDoor Boston-Cambridge-Quincy 2026 challenge simulation",
  selectedHouseholdId: "HH-003",
  selectedDocumentTypes: ["pay_stub", "benefit_letter"],
  thresholdSourceFile: data.sourceFile,
  thresholds: data.rows,
};

export function getScenarioThreshold(householdSize: number) {
  return canonicalScenario.thresholds.find((row) => row.householdSize === householdSize);
}
