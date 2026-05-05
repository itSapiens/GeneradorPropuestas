export interface ClientAddress {
  street?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  country?: string;
}

export interface ClientLocation {
  lat?: number;
  lng?: number;
}

export interface ClientData {
  name: string;
  lastname1?: string;
  lastname2?: string;
  dni: string;
  email: string;
  phone?: string;
  iban?: string;
  address?: ClientAddress;
  location?: ClientLocation;
  status?: string;
}