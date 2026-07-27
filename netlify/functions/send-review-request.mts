import { getStore } from '@netlify/blobs';
import nodemailer from 'nodemailer';

const TZ = 'America/Toronto';

// Retourne l'offset UTC→Toronto en minutes (ex: -240 pour EDT)
function getTorontoOffsetMinutes(utcDate: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcDate);

  const utcH = utcDate.getUTCHours();
  const utcM = utcDate.getUTCMinutes();
  let torH = parseInt(parts.find((p) => p.type === 'hour')!.value);
  const torM = parseInt(parts.find((p) => p.type === 'minute')!.value);
  if (torH === 24) torH = 0;

  let offset = (torH * 60 + torM) - (utcH * 60 + utcM);
  if (offset > 12 * 60) offset -= 24 * 60;
  if (offset < -12 * 60) offset += 24 * 60;
  return offset;
}

// Convertit une heure locale Toronto (YYYY-MM-DD + HH:MM) en Date UTC
function torontoToUTC(dateStr: string, hhmm: string): Date {
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const offsetMin = getTorontoOffsetMinutes(noonUTC);
  const [h, m] = hhmm.split(':').map(Number);
  const [y, mo, d] = dateStr.split('-').map(Number);
  const utcTotalMin = h * 60 + m - offsetMin;
  return new Date(Date.UTC(y, mo - 1, d, Math.floor(utcTotalMin / 60), utcTotalMin % 60, 0));
}

interface Appointment {
  prenom: string;
  nom: string;
  courriel: string;
  date: string;
  heure: string;
  duree: number;
  reviewSent: boolean;
}

export default async () => {
  const store = getStore('kinesia');
  const appointments: Appointment[] = (await store.get('appointments', { type: 'json' })) || [];

  const now = new Date();
  const sevenDaysAgoMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  let updated = false;

  for (const appt of appointments) {
    if (appt.reviewSent) continue;

    const startUTC = torontoToUTC(appt.date, appt.heure);
    if (startUTC.getTime() < sevenDaysAgoMs) continue; // ignorer les rendez-vous trop vieux

    const endUTC = new Date(startUTC.getTime() + Number(appt.duree) * 60 * 1000);
    const reviewTimeUTC = new Date(endUTC.getTime() + 4 * 60 * 60 * 1000);

    if (now.getTime() < reviewTimeUTC.getTime()) continue; // pas encore l'heure

    try {
      await transporter.sendMail({
        from: `"Kinésia Relief — Isabelle Bureau" <${process.env.GMAIL_USER}>`,
        to: appt.courriel,
        bcc: 'isabelle_bureau04@hotmail.com',
        subject: 'Merci pour votre visite — Kinésia Relief 💚',
        html: `
          <!DOCTYPE html>
          <html lang="fr">
          <head><meta charset="UTF-8" /></head>
          <body style="font-family: 'Inter', Arial, sans-serif; background: #f5f5f0; margin: 0; padding: 32px;">
            <div style="max-width: 560px; margin: 0 auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
              <div style="background: linear-gradient(135deg, #1A1A18, #2A5446); padding: 36px 40px; text-align: center;">
                <h1 style="font-family: Georgia, serif; color: #D4AF5A; font-size: 1.6rem; margin: 0 0 6px;">Kinésia Relief</h1>
                <p style="color: rgba(255,255,255,0.65); font-size: 0.85rem; margin: 0;">Isabelle Bureau Mistral · Massothérapeute</p>
              </div>
              <div style="padding: 36px 40px;">
                <h2 style="color: #1A2E25; font-size: 1.2rem; margin: 0 0 20px;">Bonjour ${appt.prenom},</h2>
                <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 24px;">
                  Merci d'avoir choisi Kinésia Relief pour votre séance de ${appt.duree} minutes aujourd'hui.
                  J'espère que vous vous sentez déjà mieux !
                </p>
                <p style="color: #3A5E50; line-height: 1.65; margin: 0 0 24px;">
                  Si vous avez apprécié votre expérience, j'aimerais beaucoup que vous partagiez votre avis sur Google — cela m'aide énormément à faire connaître ma pratique.
                </p>
                <div style="background: #f9f6ee; border: 1px solid #e8d9a0; border-radius: 10px; padding: 20px 24px; margin-bottom: 28px; text-align: center;">
                  <a href="https://share.google/JAIxut0FPTkd6aZoL" style="display: inline-block; background: #D4AF5A; color: #1A1A18; font-weight: 700; font-size: 0.9rem; text-decoration: none; padding: 12px 28px; border-radius: 100px;">👉 Laisser un avis Google</a>
                </div>
                <p style="color: #3A5E50; line-height: 1.65; margin: 0;">
                  Merci du fond du cœur,<br />
                  <strong style="color: #1A2E25;">Isabelle Bureau</strong><br />
                  <span style="color: #7AAF98; font-size: 0.875rem;">Massothérapeute &amp; Kinésithérapeute · Kinésia Relief — Saint-Rémi, Québec</span><br />
                  <span style="color: #7AAF98; font-size: 0.875rem;">438-939-8359</span>
                </p>
              </div>
              <div style="background: #1A1A18; padding: 16px 40px; text-align: center;">
                <p style="color: rgba(255,255,255,0.35); font-size: 0.75rem; margin: 0;">© 2025 Kinésia Relief · Saint-Rémi, Québec</p>
              </div>
            </div>
          </body>
          </html>
        `,
      });

      appt.reviewSent = true;
      updated = true;
      console.log(`Avis Google envoyé à ${appt.courriel} (RDV ${appt.date} ${appt.heure})`);
    } catch (err) {
      console.error(`Erreur envoi avis pour ${appt.courriel}:`, err);
    }
  }

  if (updated) {
    await store.setJSON('appointments', appointments);
  }

  return new Response('OK');
};
