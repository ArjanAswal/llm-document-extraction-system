/** Sample invoice text snippets for unit tests */
export const ENGLISH_ELECTRICITY_SNIPPET = `
PACIFIC GRID ENERGY ELECTRICITY BILL
Invoice Date: March 15, 2024
Billing Period: Feb 12, 2024 – Mar 13, 2024
TOTAL ELECTRICITY USAGE 663 kWh
AMOUNT DUE $181.73
`.trim();

export const SPANISH_WATER_SNIPPET = `
Compania Municipal de Agua
Factura de agua potable
Fecha de factura: 15 de marzo de 2024
Consumo total: 12 m3
`.trim();

export const FRENCH_ELECTRICITY_SNIPPET = `
EDF Electricite de France
Facture d'electricite
Date de facture: 15/03/2024
Consommation: 450 kWh
`.trim();

export const MOCK_LLM_EXTRACTION = {
  vendor_name: "Pacific Grid Energy",
  invoice_date: "2024-03-15",
  service_address: "742 Evergreen Terrace",
  utility_type: "electricity" as const,
  usage_amount: 663,
  usage_unit: "kWh",
  billing_period_start: "2024-02-12",
  billing_period_end: "2024-03-13",
  extraction_confidence: 0.92,
  field_confidence: {
    vendor_name: 0.95,
    invoice_date: 0.9,
    service_address: 0.85,
    utility_type: 0.98,
    usage_amount: 0.88,
    usage_unit: 0.9,
    billing_period_start: 0.87,
    billing_period_end: 0.87,
  },
};

export const MOCK_LLM_MISSING_FIELDS = {
  vendor_name: "British Gas",
  invoice_date: "2024-03-01",
  service_address: null,
  utility_type: "gas" as const,
  usage_amount: null,
  usage_unit: null,
  billing_period_start: null,
  billing_period_end: null,
  extraction_confidence: 0.45,
  field_confidence: {
    vendor_name: 0.9,
    invoice_date: 0.8,
    service_address: 0.1,
    utility_type: 0.85,
    usage_amount: 0.2,
    usage_unit: 0.1,
    billing_period_start: 0.1,
    billing_period_end: 0.1,
  },
};

export const MOCK_LLM_AMBIGUOUS = {
  vendor_name: "City Water Co",
  invoice_date: "2024-03-10",
  service_address: "100 Oak Ave",
  utility_type: "water" as const,
  usage_amount: null,
  usage_unit: "gallons",
  billing_period_start: "2024-02-01",
  billing_period_end: "2024-03-01",
  extraction_confidence: 0.55,
  field_confidence: {
    vendor_name: 0.9,
    invoice_date: 0.85,
    service_address: 0.8,
    utility_type: 0.7,
    usage_amount: 0.3,
    usage_unit: 0.5,
    billing_period_start: 0.8,
    billing_period_end: 0.8,
  },
};
