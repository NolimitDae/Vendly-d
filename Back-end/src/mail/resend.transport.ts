// Nodemailer transport that sends through Resend's HTTPS API: Railway blocks outbound SMTP below the Pro plan.
// The mailer has already rendered the template into `html` by the time send() runs.
export function resendTransport(apiKey: string) {
  return {
    name: 'resend',
    version: '1.0.0',
    send(mail: any, callback: (err: Error | null, info?: any) => void) {
      const { from, to, subject, html, text, replyTo } = mail.data;
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        // replyTo: pressing Reply answers this person (a Contact us message), not Vendly's no-reply address
        body: JSON.stringify({ from, to: Array.isArray(to) ? to : [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
        // a stuck request fails the mail job, which the queue retries
        signal: AbortSignal.timeout(20_000),
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
