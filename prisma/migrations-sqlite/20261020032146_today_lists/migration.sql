-- Listas chamadas "Hoje" (tipo normal) passam para o novo tipo "today": só elas contam
-- como tarefas abertas na nota do dashboard.
UPDATE "List" SET "kind" = 'today' WHERE "kind" = 'normal' AND lower(trim("name")) = 'hoje';
