import { DemoTicket } from '../core/demo-data.service';
import { createTicketCsv, createTicketPdf } from './ticket-report';

describe('ticket report exports', () => {
  const ticket: DemoTicket = {
    id: 1, code: 'INC-1', title: 'Revisión de red', client: 'Empresa; "Norte"',
    category: 'Equipos', priority: 'Alta', status: 'Abierto', risk: 'Crítico',
    assignee: 'Soporte', dueIn: '2 h',
  };

  it('creates an Excel-compatible UTF-8 CSV with escaped values and safe formulas', () => {
    const csv = createTicketCsv([ticket, { ...ticket, title: ' =1+1', code: 'INC-2' }]);
    expect(csv.startsWith('\uFEFF"Código";"Título";"Cliente"')).toBe(true);
    expect(csv).toContain('"Empresa; ""Norte"""');
    expect(csv).toContain('"Revisión de red"');
    expect(csv).toContain("\"' =1+1\"");
    expect(csv.split('\r\n')).toHaveLength(3);
    expect(createTicketCsv([]).split('\r\n')).toHaveLength(1);
  });

  it('generates a real multi-page PDF with summary and every ticket', async () => {
    const tickets = Array.from({ length: 100 }, (_, index) => ({
      ...ticket, id: index, code: `INC-${index}`, title: `Ticket ${index}`,
    }));
    const pdf = await createTicketPdf(tickets, { total: 100, open: 100, critical: 100, closed: 0 });
    const output = pdf.output();
    expect(output.startsWith('%PDF-')).toBe(true);
    expect(output).toContain('Resumen de tickets');
    expect(output).toContain('Total: 100');
    expect(output).toContain('Ticket 0');
    expect(output).toContain('Ticket 99');
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(output).toContain('%%EOF');
  });

  it('creates a PDF when no tickets match', async () => {
    const pdf = await createTicketPdf([], { total: 0, open: 0, critical: 0, closed: 0 });
    expect(pdf.output()).toContain('Total: 0');
    expect(pdf.output()).toContain('%PDF-');
  });

  it('omits demonstration risk from real ticket exports', async () => {
    const csv = createTicketCsv([ticket], false);
    expect(csv).not.toContain('Riesgo');
    expect(csv).not.toContain('Crítico');
    const pdf = await createTicketPdf([ticket], { total: 1, open: 1, critical: 0, closed: 0 }, false);
    expect(pdf.output()).toContain('Tickets registrados');
    expect(pdf.output()).not.toContain('Críticos');
    expect(pdf.output()).not.toContain('Datos de demostración');
  });

  it('exports real risk without labeling it as demonstration', async () => {
    const real = { ...ticket, risk: 'Alto' };
    expect(createTicketCsv([real])).toContain('"Alto"');
    const pdf = await createTicketPdf([real], { total: 1, open: 1, critical: 1, closed: 0 }, true, false);
    expect(pdf.output()).toContain('Tickets registrados');
    expect(pdf.output()).toContain('Riesgo alto: 1');
    expect(pdf.output()).toContain('Alto');
    expect(pdf.output()).not.toContain('Datos de demostración');
  });
});
