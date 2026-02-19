import PDFDocument from "pdfkit";
import { Readable } from "stream";

export interface SalesOrderPayload {
  orderId: string;
  orderDate: Date;
  projectName: string;
  clientName?: string;
  clientCompany?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientAddress?: string;
  budget: number;
  costProducts: number;
  costViaticos: number;
  costOperativo: number;
  margin: number;
  deliveryDate?: Date;
  paymentTerms?: string;
  preparedBy?: string;
  preparedRole?: string;
  quoteNumber?: string;
  quoteSummary?: string;
}

export const generateSalesOrderPdf = (payload: SalesOrderPayload): Buffer => {
  const doc = new PDFDocument({ size: "letter", margin: 40 });
  const buffers: Buffer[] = [];

  doc.on("data", (data) => buffers.push(data));

  // Header with branding
  doc.fontSize(24).font("Helvetica-Bold").text("ORDEN DE COMPRA", { align: "center" });
  doc.fontSize(10).font("Helvetica").text("Nexara Software", { align: "center" });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(1);

  // Order details section
  doc.fontSize(11).font("Helvetica-Bold").text("DETALLES DE LA ORDEN", { underline: true });
  doc.fontSize(10).font("Helvetica");
  doc.moveDown(0.3);

  const detailsData = [
    ["No. de Orden", payload.orderId, "Fecha", payload.orderDate.toLocaleDateString("es-MX")],
    ["Proyecto", payload.projectName, "Fecha Entrega", payload.deliveryDate?.toLocaleDateString("es-MX") || "Por confirmar"],
  ];

  let startY = doc.y;
  detailsData.forEach((row) => {
    doc.text(row[0], 60, startY, { width: 80 });
    doc.font("Helvetica-Bold").text(row[1], 140, startY, { width: 100 });
    doc.font("Helvetica").text(row[2], 260, startY, { width: 80 });
    doc.font("Helvetica-Bold").text(row[3], 340, startY, { width: 150 });
    startY = doc.y + 5;
  });
  doc.moveDown(1.5);

  // Client information
  doc.fontSize(11).font("Helvetica-Bold").text("INFORMACIÓN DEL CLIENTE", { underline: true });
  doc.fontSize(9).font("Helvetica");
  doc.moveDown(0.2);

  const clientInfo = [
    `Empresa: ${payload.clientCompany || "N/A"}`,
    `Contacto: ${payload.clientName || "N/A"}`,
    `Email: ${payload.clientEmail || "N/A"}`,
    `Teléfono: ${payload.clientPhone || "N/A"}`,
    `Dirección: ${payload.clientAddress || "N/A"}`,
  ];

  clientInfo.forEach((line) => {
    doc.text(`• ${line}`, { lineGap: 2 });
  });
  doc.moveDown(1);

  // Financial summary - in a nice card layout
  doc.fontSize(11).font("Helvetica-Bold").text("RESUMEN FINANCIERO", { underline: true });
  doc.moveDown(0.3);

  const lineArr = [
    {
      label: "Presupuesto Total",
      value: formatCurrency(Number(payload.budget)),
    },
    {
      label: "Costo Productos",
      value: formatCurrency(Number(payload.costProducts)),
    },
    {
      label: "Costo Viáticos",
      value: formatCurrency(Number(payload.costViaticos)),
    },
    {
      label: "Costo Operativo",
      value: formatCurrency(Number(payload.costOperativo)),
    },
  ];

  const cardX = 60;
  const cardY = doc.y;
  const cardHeight = 25 + lineArr.length * 15;

  doc.rect(cardX, cardY, 500, cardHeight).stroke();

  let lineY = cardY + 10;
  lineArr.forEach((item) => {
    doc.font("Helvetica").fontSize(9).text(item.label, cardX + 10, lineY, { width: 200 });
    doc.font("Helvetica-Bold").fontSize(9).text(item.value, cardX + 300, lineY, { width: 190, align: "right" });
    lineY += 15;
  });

  // Total margin - highlighted
  const totalY = lineY + 5;
  doc.font("Helvetica-Bold").fontSize(11).text("MARGEN LIBRE", cardX + 10, totalY);
  doc.font("Helvetica-Bold").fontSize(12).fillColor("#16a96e").text(formatCurrency(Number(payload.margin)), cardX + 300, totalY, { width: 190, align: "right" }).fillColor("#000");

  doc.moveDown(4);

  // Terms & conditions
  if (payload.paymentTerms) {
    doc.fontSize(10).font("Helvetica-Bold").text("CONDICIONES DE PAGO", { underline: true });
    doc.fontSize(9).font("Helvetica").text(payload.paymentTerms, { align: "left" });
    doc.moveDown(0.5);
  }

  // Quote reference
  if (payload.quoteNumber) {
    doc.fontSize(9).font("Helvetica").text(`Cotización Base: ${payload.quoteNumber}`);
    doc.moveDown(0.5);
  }

  // Footer
  doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);
  doc.fontSize(8).font("Helvetica").text("Documento generado automáticamente por Nexara Software. ", { align: "center" });
  doc.text(`Fecha: ${new Date().toLocaleString("es-MX")}`, { align: "center" });

  if (payload.preparedBy) {
    doc.moveDown(1);
    doc.fontSize(9).font("Helvetica").text(`Preparado por: ${payload.preparedBy}`);
    if (payload.preparedRole) {
      doc.fontSize(8).font("Helvetica").text(payload.preparedRole);
    }
  }

  doc.end();

  return Buffer.concat(buffers);
};

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
