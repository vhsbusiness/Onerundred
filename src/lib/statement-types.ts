export const STATEMENT_LIMIT = 1000;
export type StatementRow = {
  source: string;
  dayKey: string;
  title: string;
  kind: "income" | "expense" | "";
  amount: string;
  category: string;
  settled: boolean;
};
export type ReviewedRow = StatementRow & { peerId: string; includeMatch: boolean };
export type StatementPreview = {
  rows: (StatementRow & { match: "imported" | "possible" | null })[];
  warning: string;
};
