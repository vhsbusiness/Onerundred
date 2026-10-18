import { askConfirm } from "@/components/ui/ConfirmProvider";

/**
 * Aviso ao mudar um dia marcado como "não feito" para "feito".
 * O usuário pode alterar, mas é lembrado de que só deve marcar se cumpriu de verdade.
 */
export function confirmMarkDone(): Promise<boolean> {
  return askConfirm({
    title: "Marcar como feito?",
    message:
      "Esse dia está marcado como NÃO FEITO.\n\n" +
      "Se a obrigação não foi cumprida nesse dia, não marque como feito: a meta só vale se for honesta com você mesmo.\n\n" +
      "Você realmente cumpriu as obrigações nesse dia?",
    confirmLabel: "Sim, cumpri",
    cancelLabel: "Não marcar",
  });
}
