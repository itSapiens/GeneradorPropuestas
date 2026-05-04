export const ENERGY_CONSTANTS = {
  "2TD": {
    P1: 0.385,
    P2: 0.342,
    P3: 0.273,
  },
  "3TD": {
    P1: 0.124,
    P2: 0.181,
    P3: 0.156,
    P4: 0.148,
    P5: 0.109,
    P6: 0.282,
  },
};

export const STUDY_STATUS = {
  NEW: "nuevo",
  REVIEW: "en revisión",
  CALCULATED: "calculado",
  SENT: "enviado",
  ACCEPTED: "aceptado",
  REJECTED: "descartado",
} as const;

export const INSTALLATION_MODALITIES = {
  INVESTMENT: "inversión",
  SERVICE: "servicio",
  BOTH: "ambas",
} as const;
