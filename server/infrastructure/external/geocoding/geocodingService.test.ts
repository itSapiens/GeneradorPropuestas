import { afterEach, describe, expect, it, vi } from "vitest";

import { __test__, geocodeAddressWithGoogle } from "./geocodingService";

function createGoogleResponse(results: any[], status = "OK") {
  return {
    ok: true,
    json: async () => ({
      results,
      status,
    }),
  } as Response;
}

describe("geocodingService", () => {
  afterEach(() => {
    __test__.clearGeocodeCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds Quartell fallback candidates for invoice addresses", () => {
    expect(
      __test__.buildAddressCandidates(
        "C/ SAGUNTO, 7, BAJO 46510 QUARTELL (VALENCIA)",
      ),
    ).toEqual(
      expect.arrayContaining([
        "C/ SAGUNTO, 7, BAJO 46510 QUARTELL, VALENCIA",
        "Carrer SAGUNTO, 7, BAJO, 46510 QUARTELL, Valencia, España",
        "46510 QUARTELL, Valencia, España",
      ]),
    );
  });

  it("rejects generic route matches and falls back to a precise Quartell result", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const address = url.searchParams.get("address");

        if (address === "C/ SAGUNTO, 7, BAJO 46510 QUARTELL, VALENCIA") {
          return createGoogleResponse([
            {
              address_components: [
                { long_name: "A-7", short_name: "A-7", types: ["route"] },
                {
                  long_name: "España",
                  short_name: "ES",
                  types: ["country", "political"],
                },
              ],
              formatted_address: "A-7, España",
              geometry: { location: { lat: 37.9969334, lng: -1.2351335 } },
              partial_match: true,
              place_id: "bad-route",
              types: ["route"],
            },
          ]);
        }

        if (
          address ===
          "Carrer SAGUNTO, 7, BAJO, 46510 QUARTELL, Valencia, España"
        ) {
          return createGoogleResponse([
            {
              address_components: [
                { long_name: "7", short_name: "7", types: ["street_number"] },
                {
                  long_name: "Carrer Sagunt",
                  short_name: "Carrer Sagunt",
                  types: ["route"],
                },
                {
                  long_name: "Quartell",
                  short_name: "Quartell",
                  types: ["locality", "political"],
                },
                {
                  long_name: "Valencia",
                  short_name: "V",
                  types: ["administrative_area_level_2", "political"],
                },
                {
                  long_name: "España",
                  short_name: "ES",
                  types: ["country", "political"],
                },
                { long_name: "46510", short_name: "46510", types: ["postal_code"] },
              ],
              formatted_address:
                "Carrer Sagunt, 7, 46510 Quartell, Valencia, España",
              geometry: { location: { lat: 39.7382918, lng: -0.2612579 } },
              partial_match: true,
              place_id: "quartell-good",
              types: ["premise", "street_address"],
            },
          ]);
        }

        return createGoogleResponse([], "ZERO_RESULTS");
      });

    const result = await geocodeAddressWithGoogle(
      "C/ SAGUNTO, 7, BAJO 46510 QUARTELL (VALENCIA)",
    );

    expect(result).toMatchObject({
      formattedAddress: "Carrer Sagunt, 7, 46510 Quartell, Valencia, España",
      lat: 39.7382918,
      lng: -0.2612579,
      placeId: "quartell-good",
    });
    expect(fetchMock).toHaveBeenCalled();
    const queriedAddresses = fetchMock.mock.calls.map(([input]) =>
      new URL(String(input)).searchParams.get("address"),
    );
    expect(queriedAddresses).toEqual(
      expect.arrayContaining([
        "C/ SAGUNTO, 7, BAJO 46510 QUARTELL, VALENCIA",
        "Carrer SAGUNTO, 7, BAJO, 46510 QUARTELL, Valencia, España",
      ]),
    );
  });

  it("falls back to postal-code geocoding when the street-level candidates do not resolve", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const address = url.searchParams.get("address");

        if (address === "46510 QUARTELL, Valencia, España") {
          return createGoogleResponse([
            {
              address_components: [
                { long_name: "46510", short_name: "46510", types: ["postal_code"] },
                {
                  long_name: "Cuartell",
                  short_name: "Cuartell",
                  types: ["locality", "political"],
                },
                {
                  long_name: "Valencia",
                  short_name: "V",
                  types: ["administrative_area_level_2", "political"],
                },
                {
                  long_name: "España",
                  short_name: "ES",
                  types: ["country", "political"],
                },
              ],
              formatted_address: "46510 Cuartell, Valencia, España",
              geometry: { location: { lat: 39.725076, lng: -0.2373658 } },
              place_id: "quartell-postal",
              types: ["postal_code"],
            },
          ]);
        }

        return createGoogleResponse([], "ZERO_RESULTS");
      },
    );

    const result = await geocodeAddressWithGoogle(
      "C/ SAGUNTO, 7, BAJO 46510 QUARTELL (VALENCIA)",
    );

    expect(result).toMatchObject({
      formattedAddress: "46510 Cuartell, Valencia, España",
      lat: 39.725076,
      lng: -0.2373658,
      placeId: "quartell-postal",
    });
  });
});
