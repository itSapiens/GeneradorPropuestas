import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { type CalculationResult } from "../calculation/energyService";
import { type BillData } from "../../lib/validators";

export const generateStudyPDF = (data: BillData, result: CalculationResult) => {
  const doc = new jsPDF();
  const primaryColor = [16, 185, 129]; // Emerald 600

  // Header
  doc.setFillColor(primaryColor[0], primaryColor[1], primaryColor[2]);
  doc.rect(0, 0, 210, 40, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.text("SolarStudy Pro", 20, 25);
  doc.setFontSize(12);
  doc.text("Estudio Energético Personalizado", 20, 32);

  // Client Info
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.text("Resumen del Cliente", 20, 55);
  
  autoTable(doc, {
    startY: 60,
    head: [["Campo", "Información"]],
    body: [
      ["Nombre", `${data.name} ${data.lastName}`],
      ["DNI", data.dni],
      ["Dirección", data.address],
      ["CUPS", data.cups],
      ["Email", data.email],
    ],
    theme: "striped",
    headStyles: { fillColor: primaryColor as [number, number, number] },
  });

  // Results
  doc.setFontSize(16);
  doc.text("Resultados del Estudio", 20, (doc as any).lastAutoTable.finalY + 15);

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 20,
    head: [["Concepto", "Valor"]],
    body: [
      ["Consumo Anual Estimado", `${data.monthlyConsumption * 12} kWh`],
      ["Potencia Recomendada", `${result.recommendedPowerKwp} kWp`],
      ["Inversión Estimada", `${result.investmentCost.toFixed(2)} €`],
      ["Ahorro Anual Estimado", `${result.annualSavingsInvestment.toFixed(2)} €`],
      ["Ahorro a 25 años", `${(result.annualSavingsInvestment * 25).toFixed(2)} €`],
    ],
    theme: "grid",
    headStyles: { fillColor: primaryColor as [number, number, number] },
  });

  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(10);
    doc.setTextColor(150);
    doc.text(
      "Este estudio es una estimación basada en los datos proporcionados. SolarStudy Pro 2026.",
      105,
      285,
      { align: "center" }
    );
  }

  return doc;
};
