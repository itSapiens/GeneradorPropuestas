import { describe, expect, it } from "vitest";

import { listInstallationsUseCase } from "./installationUseCases";

describe("listInstallationsUseCase", () => {
  it("calculates availability fields and preserves ordering without coords", async () => {
    const result = await listInstallationsUseCase(
      {
        env: {
          contractResumeJwtSecret: "",
          defaultSignalAmountEur: 500,
          frontendUrl: "http://localhost:3000",
          installationSearchRadiusMeters: 5000,
          port: 3000,
          sapiensBankAccountIban: "ES00",
          sapiensContactEmail: "info@example.com",
          sapiensContactPhone: "900000000",
          stripeWebhookSecret: "whsec_test",
        },
        repositories: {
          accessTokens: {} as any,
          clients: {} as any,
          contracts: {} as any,
          installations: {
            async findActive() {
              return [
                {
                  active: true,
                  contractable_kwp_confirmed: 15,
                  contractable_kwp_reserved: 10,
                  contractable_kwp_total: 100,
                  id: "i1",
                  lat: 39.46,
                  lng: -0.37,
                  nombre_instalacion: "Instalacion 1",
                },
              ];
            },
          },
          reservations: {} as any,
          studies: {} as any,
        },
        services: {} as any,
      } as any,
      {},
    );

    expect(result).toHaveLength(1);
    expect(result[0].available_kwp).toBe(75);
    expect(result[0].reserved_kwp).toBe(10);
    expect(result[0].confirmed_kwp).toBe(15);
  });

  it("filters by distance when coordinates are provided", async () => {
    const result = await listInstallationsUseCase(
      {
        env: {
          contractResumeJwtSecret: "",
          defaultSignalAmountEur: 500,
          frontendUrl: "http://localhost:3000",
          installationSearchRadiusMeters: 5000,
          port: 3000,
          sapiensBankAccountIban: "ES00",
          sapiensContactEmail: "info@example.com",
          sapiensContactPhone: "900000000",
          stripeWebhookSecret: "whsec_test",
        },
        repositories: {
          accessTokens: {} as any,
          clients: {} as any,
          contracts: {} as any,
          installations: {
            async findActive() {
              return [
                {
                  active: true,
                  contractable_kwp_confirmed: 0,
                  contractable_kwp_reserved: 0,
                  contractable_kwp_total: 100,
                  id: "near",
                  lat: 39.4699,
                  lng: -0.3763,
                  nombre_instalacion: "Cerca",
                },
                {
                  active: true,
                  contractable_kwp_confirmed: 0,
                  contractable_kwp_reserved: 0,
                  contractable_kwp_total: 100,
                  id: "far",
                  lat: 40.4168,
                  lng: -3.7038,
                  nombre_instalacion: "Lejos",
                },
              ];
            },
          },
          reservations: {} as any,
          studies: {} as any,
        },
        services: {} as any,
      } as any,
      {
        lat: 39.4699,
        lng: -0.3763,
        radius: 1000,
      },
    );

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("near");
  });
});
