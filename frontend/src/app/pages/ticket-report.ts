export interface ReportTicket {
  code: string;
  title: string;
  client: string;
  category: string;
  priority: string;
  status: string;
  risk: string;
}

const HEADERS = ['Código', 'Título', 'Cliente', 'Categoría', 'Prioridad', 'Estado', 'Riesgo'];

export interface TicketReportStats {
  total: number;
  open: number;
  critical: number;
  closed: number;
}

function ticketRows(tickets: readonly ReportTicket[], includeRisk: boolean): string[][] {
  return tickets.map((ticket) => {
    const row = [ticket.code, ticket.title, ticket.client, ticket.category, ticket.priority, ticket.status];
    return includeRisk ? [...row, ticket.risk] : row;
  });
}

export function createTicketCsv(tickets: readonly ReportTicket[], includeRisk = true): string {
  const escapeCell = (value: string) => {
    const safe = /^[\s]*[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [includeRisk ? HEADERS : HEADERS.slice(0, -1), ...ticketRows(tickets, includeRisk)]
    .map((row) => row.map(escapeCell).join(';'))
    .join('\r\n');
}

export async function createTicketPdf(tickets: readonly ReportTicket[], stats: TicketReportStats, includeRisk = true, demonstration = true) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const pdf = new jsPDF({ orientation: 'landscape' });
  pdf.setFontSize(18);
  pdf.text('Resumen de tickets', 14, 18);
  pdf.setFontSize(10);
  pdf.text(demonstration && includeRisk ? 'Datos de demostración' : 'Tickets registrados', 14, 25);
  pdf.text(`Total: ${stats.total}    Abiertos: ${stats.open}    ${includeRisk ? `${demonstration ? 'Críticos' : 'Riesgo alto'}: ${stats.critical}    ` : ''}Cerrados: ${stats.closed}`, 14, 32);
  autoTable(pdf, {
    startY: 38,
    head: [includeRisk ? HEADERS : HEADERS.slice(0, -1)],
    body: ticketRows(tickets, includeRisk),
    styles: { fontSize: 9, overflow: 'linebreak' },
    headStyles: { fillColor: [39, 67, 106] },
    margin: { left: 14, right: 14 },
  });
  return pdf;
}
