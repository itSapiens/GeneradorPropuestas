import { describe, it, expect } from "vitest";
import {
  resolveReservationAmountForInstallation,
  DEFAULT_RESERVATION_AMOUNT_EUR,
} from "./installationAssignmentService";

describe("resolveReservationAmountForInstallation", () => {
  it("uses reserva_fija_eur when set", () => {
    const result = resolveReservationAmountForInstallation({
      installation: { reserva_fija_eur: 100 },
      assignedKwp: 3,
    });
    expect(result.signalAmount).toBe(100);
    expect(result.reservationMode).toBe("fija");
    expect(result.source).toBe("fixed");
  });

  it("uses 500 when reserva_fija_eur is null", () => {
    const result = resolveReservationAmountForInstallation({
      installation: { reserva_fija_eur: null },
      assignedKwp: 3,
    });
    expect(result.signalAmount).toBe(DEFAULT_RESERVATION_AMOUNT_EUR);
    expect(result.signalAmount).toBe(500);
    expect(result.reservationMode).toBe("segun_potencia");
    expect(result.source).toBe("default");
  });

  it("uses 500 when reserva_fija_eur is undefined", () => {
    const result = resolveReservationAmountForInstallation({
      installation: {},
      assignedKwp: 3,
    });
    expect(result.signalAmount).toBe(500);
    expect(result.reservationMode).toBe("segun_potencia");
  });

  it("uses reserva_fija_eur regardless of calculo_estudios mode", () => {
    const result = resolveReservationAmountForInstallation({
      installation: { calculo_estudios: "segun_factura", reserva_fija_eur: 250 },
      assignedKwp: 5,
    });
    expect(result.signalAmount).toBe(250);
    expect(result.reservationMode).toBe("fija");
  });

  it("uses 500 for segun_factura installations without reserva_fija_eur", () => {
    const result = resolveReservationAmountForInstallation({
      installation: { calculo_estudios: "segun_factura", reserva_fija_eur: null },
      assignedKwp: 5,
    });
    expect(result.signalAmount).toBe(500);
    expect(result.reservationMode).toBe("segun_potencia");
  });
});
