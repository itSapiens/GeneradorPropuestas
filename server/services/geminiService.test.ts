import { describe, expect, it } from "vitest";

import { __test__ } from "./geminiService";

describe("geminiService address helpers", () => {
  it("extracts the supply address from Iberdrola blocks", () => {
    const text = `
CONTRATO
Titular Potencia:
BLANCA ALABADI PARDIÑES Potencia punta: 2,3 kW
Potencia valle: 2,3 kW
Dirección de suministro:
C/ SAGUNTO, 7, BAJO 46510
QUARTELL (VALENCIA)
Nº DE CONTRATO: 952646882
RESUMEN DE FACTURA
`;

    expect(__test__.extractSupplyAddress(text)).toBe(
      "C/ SAGUNTO, 7, BAJO 46510 QUARTELL (VALENCIA)",
    );
  });

  it("removes commercial plan noise from the extracted address", () => {
    const text = `
Dirección de suministro: Plan A Tu Medida Contratado:
POLIGONO VEINTE, PARCELA
217-E SAGUNT/SAGUNTO 46500
SAGUNTO (VALENCIA)
PLAN ESTABLE
Nº DE CONTRATO: 808025168
`;

    expect(__test__.extractSupplyAddress(text)).toBe(
      "POLIGONO VEINTE, PARCELA 217-E SAGUNT/SAGUNTO 46500 SAGUNTO (VALENCIA)",
    );
  });

  it("parses Quartell and Valencia correctly when the province is in parentheses", () => {
    expect(
      __test__.parseAddressParts("C/ SAGUNTO, 7, BAJO 46510 QUARTELL (VALENCIA)"),
    ).toMatchObject({
      street: "C/ SAGUNTO, 7, BAJO",
      postalCode: "46510",
      city: "QUARTELL",
      province: "VALENCIA",
    });
  });

  it("parses Spanish addresses even when the province is not wrapped in parentheses", () => {
    expect(
      __test__.parseAddressParts("C/ SAGUNTO, 7, BAJO 46510 QUARTELL VALENCIA"),
    ).toMatchObject({
      street: "C/ SAGUNTO, 7, BAJO",
      postalCode: "46510",
      city: "QUARTELL",
      province: "Valencia",
    });
  });

  it("builds local extraction data with the correct Quartell location", () => {
    const text = `
Titular Potencia:
BLANCA ALABADI PARDIÑES Potencia punta: 2,3 kW
Potencia valle: 2,3 kW
Dirección de suministro:
C/ SAGUNTO, 7, BAJO 46510
QUARTELL (VALENCIA)
Nº DE CONTRATO: 952646882
DIAS FACTURADOS:
33
Consumo total de esta factura. 78 kWh
NIF titular del contrato: 45911043F
Identificación punto de suministro (CUPS): ES 0021 0000 1118 3470 LQ
IBAN: ES58 2100 7322 3121 0015 ****
`;

    expect(__test__.extractLocalDataFromText(text)).toMatchObject({
      location: {
        address: "C/ SAGUNTO, 7, BAJO 46510 QUARTELL (VALENCIA)",
        street: "C/ SAGUNTO, 7, BAJO",
        postalCode: "46510",
        city: "QUARTELL",
        province: "VALENCIA",
      },
    });
  });

  it("extracts key data from Switch invoice OCR text", () => {
    const text = `
Factura electricidad
DATOS DEL CLIENTE
Titular: AUTO BERTRAN, S.L.
DNI/CIF: B58595174
Dirección suministro: Avda. Onze Setembre 243 Pta Loc
CUPS: ES0031406276833001ZT0F
Potencia contratada: P1 37.00 P2 37.00 P3 37.00
P4 37.00 P5 37.00 P6 43.65
Tarifa de acceso: 3.0TD
IMPORTE FACTURA: 1.454,48 €
Periodo de Facturación: De 01/02/2026 al 28/02/2026
Nº de Cuenta: ES63 0075 0338 2606 0014 ****
AUTO BERTRAN, S.L.
Onze Setembre 243 Pta Loc
08820 Prat de Llobregat
Energía: 851.59 €
Su consumo medio diario en esta factura ha sido de 144.86 kWh
Su consumo acumulado del último año ha sido de 37,900.03 kWh
`;

    expect(__test__.extractLocalDataFromText(text)).toMatchObject({
      customer: {
        fullName: "AUTO BERTRAN, S.L.",
        dni: "B58595174",
        cups: "ES0031406276833001ZT0F",
        iban: "ES63 0075 0338 2606 0014 ****",
        ibanNeedsCompletion: true,
      },
      location: {
        address:
          "Avda. Onze Setembre 243 Pta Loc, 08820 Prat de Llobregat",
      },
      invoice_data: {
        type: "3TD",
        billedDays: 28,
        currentInvoiceConsumptionKwh: 4056.08,
        averageMonthlyConsumptionKwh: 3158.34,
        invoiceVariableEnergyAmountEur: 851.59,
        invoiceTotalAmountEur: 1454.48,
        contractedPowerP1: 37,
        contractedPowerP2: 37,
      },
    });
  });
});
