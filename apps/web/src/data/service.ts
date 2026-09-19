import { createMockService } from "./mockService";
import type { SituationService } from "./types";
// Composition root: replace this adapter with an HTTP/wallet implementation later.
// Components consume only SituationService, never fixtures or storage.
let storage: Storage | undefined;
try {
  storage = window.localStorage;
} catch {
  /* Session-only when storage is restricted. */
}
export const situationService: SituationService = createMockService(storage);
