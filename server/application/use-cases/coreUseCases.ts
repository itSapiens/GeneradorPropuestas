import type { ServerDependencies } from "../ports/serverDependencies";

export function getConfigUseCase() {
  return {
    googleMapsApiKey: process.env.VITE_GOOGLE_MAPS_API_KEY || "",
  };
}

export function getHealthUseCase() {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
  };
}

export function getServerPortUseCase(deps: ServerDependencies) {
  return deps.env.port;
}
