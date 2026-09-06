(function () {
    function escapePdfText(value) {
        return String(value).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
    }

    function createPdf(lines) {
        const content = ['BT', '/F1 12 Tf', '50 790 Td'];
        lines.forEach((line, index) => {
            if (index > 0) content.push('0 -18 Td');
            content.push(`(${escapePdfText(line)}) Tj`);
        });
        content.push('ET');
        const objects = [
            '<< /Type /Catalog /Pages 2 0 R >>',
            '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
            '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
            `<< /Length ${content.join('\n').length} >>\nstream\n${content.join('\n')}\nendstream`
        ];
        let pdf = '%PDF-1.4\n';
        const offsets = [0];
        objects.forEach((object, index) => {
            offsets[index + 1] = pdf.length;
            pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
        });
        const xref = pdf.length;
        pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
        offsets.slice(1).forEach(offset => {
            pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
        });
        pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
        return new Blob([pdf], { type: 'application/pdf' });
    }

    function createXls(rows) {
        const table = rows.map(row => `<tr>${row.map(cell => `<td>${String(cell).replace(/&/g, '&amp;').replace(/</g, '&lt;')}</td>`).join('')}</tr>`).join('');
        return new Blob([`<html><head><meta charset="UTF-8"></head><body><table>${table}</table></body></html>`], {
            type: 'application/vnd.ms-excel'
        });
    }

    function download(blob, filename) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    document.querySelectorAll('[data-report-download]').forEach(button => {
        button.addEventListener('click', () => {
            const report = typeof window.getSlaReportData === 'function'
                ? window.getSlaReportData()
                : { title: 'reporte-sla', rows: [['Reporte SLA'], ['Sin datos disponibles']] };
            const extension = button.dataset.reportDownload;
            const filename = `${report.title}.${extension}`;
            const blob = extension === 'pdf'
                ? createPdf(report.rows.map(row => row.join(' | ')))
                : createXls(report.rows);
            download(blob, filename);
        });
    });
})();
