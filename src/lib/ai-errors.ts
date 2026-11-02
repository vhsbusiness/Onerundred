import OpenAI from "openai";
import { ApiError } from "./errors";

/** Traduz falhas do provedor sem expor chaves, headers ou detalhes da requisição. */
export function aiProviderError(error: unknown): ApiError | null {
  if (!(error instanceof OpenAI.APIError)) return null;
  if (error.status === 429) {
    const quota = error.code === "insufficient_quota" || /no credits remaining|insufficient.quota|exceeded your current quota/i.test(error.message);
    return quota
      ? new ApiError(503, "A IA está temporariamente indisponível: os créditos da API acabaram. O administrador precisa repor o saldo para gerar novas análises. Sua última análise foi mantida.")
      : new ApiError(429, "A IA recebeu muitas solicitações. Aguarde um momento e tente novamente.");
  }
  if (error.status === 401 || error.status === 403) return new ApiError(503, "A conexão com a IA precisa ser revisada pelo administrador. Tente novamente mais tarde.");
  if (!error.status || error.status >= 500 || error.status === 408) return new ApiError(503, "Não foi possível conectar à IA agora. Aguarde um momento e tente novamente.");
  return new ApiError(502, "Não foi possível concluir a solicitação à IA. Tente novamente; se persistir, avise o administrador.");
}
