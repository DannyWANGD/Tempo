/// <reference types="vite/client" />

import type { TempoApi } from "../shared/types.js";

declare global {
  interface Window {
    tempo: TempoApi;
  }
}
