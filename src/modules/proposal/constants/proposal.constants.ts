import { ProposalCardData } from "../components/types/proposal.types";

export const INSTALLATION_SEARCH_RADIUS_METERS = Number(
  import.meta.env.VITE_INSTALLATION_SEARCH_RADIUS_METERS || 5000,
);

export const INVESTMENT_MAINTENANCE_EUR_PER_KWP_YEAR = 0;

/** Precio de compensación de excedentes vertidos a red (€/kWh).
 *  Valor regulado PVPC España 2024. Se usa como fallback si la instalación
 *  no tiene precio_excedentes_eur_kwh configurado en BD. */
export const DEFAULT_SURPLUS_COMPENSATION_EUR_KWH = 0.05;


export const chartPalette = {
  navy: "#07005f",
  mint: "#57d9d3",
  text: "#7c83a3",
  grid: "rgba(7, 0, 95, 0.08)",
  hover: "rgba(7, 0, 95, 0.04)",
};

export const BILL_TYPES = ["2TD", "3TD"] as const;


export const getMonthlySavings = (proposal: ProposalCardData) => {
  return proposal.annualSavings > 0 ? proposal.annualSavings / 12 : 0;
};