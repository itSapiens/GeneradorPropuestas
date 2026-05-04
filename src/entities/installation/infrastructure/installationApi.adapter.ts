import apiClient from "@/src/shared/lib/http/apiClient";

import type { ApiInstallation } from "../domain/installation.types";

export async function findNearbyInstallations(params: {
  lat: number;
  lng: number;
  radius: number;
}) {
  const response = await apiClient.get<ApiInstallation[] | { data: ApiInstallation[] }>(
    "/api/installations",
    { params },
  );

  const responseData = response.data;
  return Array.isArray(responseData)
    ? responseData
    : Array.isArray(responseData?.data)
      ? responseData.data
      : [];
}
