import { createMockService } from "./mockService";
import { createHttpSituationService } from "./httpService";
import type { SituationService } from "./types";
// Composition root: UI code stays independent from fixtures, HTTP and wallet APIs.
let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  /* Session-only when storage is restricted. */
}
const mode = import.meta.env.VITE_DATA_MODE === "api" ? "api" : "mock";
export const situationService: SituationService =
  mode === "api"
    ? createHttpSituationService({
        baseUrl: import.meta.env.VITE_API_BASE_URL || "/api/v1",
        situationAddress: import.meta.env.VITE_SITUATION_ADDRESS,
      })
    : createMockService(storage);
