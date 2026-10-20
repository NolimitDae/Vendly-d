// Nodemailer transport that sends through Resend's HTTPS API: Railway blocks outbound SMTP below the Pro plan.
// The mailer has already rendered the template into `html` by the time send() runs.
export function resendTransport(apiKey: string) {
  return {
    name: 'resend',
    version: '1.0.0',
    send(mail: any, callback: (err: Error | null, info?: any) => void) {
      const { from, to, subject, html, text } = mail.data;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text }),
      })
        .then(async (res) => {
          const body = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(`Resend ${res.status}: ${body.message ?? res.statusText}`);
          callback(null, { messageId: body.id, envelope: mail.message.getEnvelope() });
        })
        .catch((err) => callback(err));
    },
  };
}
