export const apiAreas = {
  dashboard: { label: "Dashboard e desempenho (resumo de atividades)", path: "dashboard", readOnly: true },
  boards: { label: "Quadros, tarefas, arquivos e mapas", path: "boards" },
  work: { label: "Sessões de trabalho", path: "work" },
  goals: { label: "Metas", path: "projetos" },
  training: { label: "Projetos de treino", path: "treinos" },
  diet: { label: "Projetos de dieta", path: "dietas" },
  personal: { label: "Financeiro pessoal", path: "financeiro/personal" },
  business: { label: "Financeiro da empresa", path: "financeiro/business" },
  sleep: { label: "Sono", path: "sono" },
  leisure: { label: "Lazer", path: "lazer" },
  reminders: { label: "Lembretes", path: "lembretes" },
  ai: { label: "Análises e memória de IA", path: "ai/insight" },
  collaboration: { label: "Colaborações e convites", path: "colaboradores" },
  settings: { label: "Preferências e notificações", path: "settings" },
  profile: { label: "Perfil (editar nome e foto)", path: "perfil" },
} as const;
export type Area = keyof typeof apiAreas;
export type Grants = Partial<Record<Area, "read" | "write">>;
export const areaKeys = Object.keys(apiAreas) as Area[];
export const readOnlyArea = (area: Area) => "readOnly" in apiAreas[area];
