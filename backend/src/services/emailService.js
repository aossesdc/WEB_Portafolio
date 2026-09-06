const nodemailer = require('nodemailer');

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    return null;
  }

  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

async function sendCriticalRiskAlert(ticket, recipient) {
  const transporter = createTransport();

  if (!transporter) {
    console.log('[EMAIL MOCK] Correo crítico simulado para:', ticket.id, recipient);
    return {
      ok: true,
      mocked: true,
      message: 'Correo simulado: el servidor SMTP no está configurado.'
    };
  }

  const mail = {
    from: process.env.SMTP_FROM || 'sla-control@empresa.cl',
    to: recipient,
    subject: `Ticket ${ticket.id} en riesgo crítico`,
    text: `El ticket ${ticket.id} del cliente ${ticket.client} ha alcanzado un riesgo crítico. Requiere atención inmediata.`
  };

  const info = await transporter.sendMail(mail);

  return {
    ok: true,
    mocked: false,
    messageId: info.messageId
  };
}

module.exports = {
  sendCriticalRiskAlert
};
