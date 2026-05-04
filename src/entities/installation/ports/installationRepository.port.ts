import type { ApiInstallation } from "../domain/installation.types";

export interface InstallationRepositoryPort {
  findNearby(params: {
    lat: number;
    lng: number;
    radius: number;
  }): Promise<ApiInstallation[]>;
}
