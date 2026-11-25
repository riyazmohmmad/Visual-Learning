import nodemailer from 'nodemailer';

interface SendVerificationResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string | false;
  error?: string;
}

let cachedTransporter: any = null;

async function getTransporter(): Promise<any> {
  if (cachedTransporter) {
    return cachedTransporter;
  }

  // 1. Check if production/custom SMTP credentials are provided in environment
  const smtpHost = process.env.SMTP_HOST;
  const smtpPort = process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : 587;
  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;

  if (smtpHost && smtpUser && smtpPass) {
    cachedTransporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
    console.log(`[EMAIL SERVICE] Configured custom SMTP transport via ${smtpHost}:${smtpPort}`);
    return cachedTransporter;
  }

  // 2. Default to real Ethereal SMTP test account for development/testing
  try {
    const testAccount = await nodemailer.createTestAccount();
    cachedTransporter = nodemailer.createTransport({
      host: testAccount.smtp.host,
      port: testAccount.smtp.port,
      secure: testAccount.smtp.secure,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    console.log(`[EMAIL SERVICE] Generated real Ethereal SMTP transport account: ${testAccount.user}`);
    return cachedTransporter;
  } catch (err: any) {
    console.warn('[EMAIL SERVICE] Could not initialize Ethereal test account, creating fallback transporter:', err?.message);
    // Fallback transporter in case outbound internet access is restricted
    cachedTransporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    return cachedTransporter;
  }
}

export async function sendAdminVerificationEmail(
  toEmail: string,
  verificationCode: string,
  adminName: string = 'Super Administrator'
): Promise<SendVerificationResult> {
  try {
    const transporter = await getTransporter();

    const fromAddress = process.env.SMTP_FROM || '"VisuaLearn Security Gateway" <security@visualearn.edu>';

    const subject = `[VisuaLearn IAM] Security Verification Code: ${verificationCode}`;

    const textContent = `
Hello ${adminName},

You have initiated the First-Time Security Setup to protect your VisuaLearn Administrative Account.

Your one-time email verification code is: ${verificationCode}

This code will expire in 15 minutes. For maximum protection, do not share this code with anyone.

If you did not initiate this credential change, lock your server immediately and review system audit logs.

— VisuaLearn Security Team
`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 800; color: #38bdf8; }
    .badge { display: inline-block; background-color: #312e81; color: #a5b4fc; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #4338ca; }
    .title { font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 16px; }
    .desc { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 16px 0; }
    .code-box { background-color: #020617; border: 1px solid #6366f1; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; color: #a5b4fc; letter-spacing: 0.25em; }
    .footer { font-size: 12px; color: #64748b; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">VisuaLearn</div>
      <div class="badge">Institutional IAM Security</div>
      <div class="title">Admin Email Verification</div>
    </div>
    <p class="desc">Hello <strong>${adminName}</strong>,</p>
    <p class="desc">A request was made to link this email address to the <strong>Super Administrator</strong> account for your VisuaLearn platform instance. To finalize your First-Time Security Setup, enter the verification code below:</p>
    
    <div class="code-box">
      <div class="code">${verificationCode}</div>
    </div>

    <p class="desc" style="font-size: 13px; color: #cbd5e1;">⏱️ This verification code is valid for <strong>15 minutes</strong>. Both email verification and password update are required to unlock the Admin Portal.</p>
    
    <div class="footer">
      This is an automated security transmission. If you did not initiate this request, verify your server configuration immediately.
    </div>
  </div>
</body>
</html>
`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[EMAIL SERVICE] Verification email successfully sent to ${toEmail}. Message ID: ${info.messageId}`);
    if (previewUrl) {
      console.log(`[EMAIL SERVICE] Real Ethereal Message Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
    };
  } catch (err: any) {
    console.error(`[EMAIL SERVICE] Error delivering verification email to ${toEmail}:`, err);
    return {
      success: false,
      error: err?.message || 'Failed to send verification email.',
    };
  }
}

export async function sendProfileEmailVerification(
  toEmail: string,
  verificationCode: string,
  userName: string = 'User'
): Promise<SendVerificationResult> {
  try {
    const transporter = await getTransporter();

    const fromAddress = process.env.SMTP_FROM || '"VisuaLearn Account Center" <noreply@visualearn.edu>';

    const subject = `[VisuaLearn] Email Verification Code: ${verificationCode}`;

    const textContent = `
Hello ${userName},

A request was made to update the email address associated with your VisuaLearn account to: ${toEmail}

Your one-time verification code is: ${verificationCode}

This code will expire in 15 minutes. If you did not make this change, please ignore this email or review your account security immediately.

— The VisuaLearn Team
`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #020617; color: #f8fafc; margin: 0; padding: 24px; }
    .card { max-width: 520px; margin: 0 auto; background-color: #0f172a; border: 1px solid #334155; border-radius: 16px; padding: 32px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    .header { text-align: center; margin-bottom: 24px; }
    .brand { font-size: 24px; font-weight: 800; color: #38bdf8; }
    .badge { display: inline-block; background-color: #0c4a6e; color: #7dd3fc; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 6px; margin-top: 8px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid #0284c7; }
    .title { font-size: 18px; font-weight: 700; color: #ffffff; margin-top: 16px; }
    .desc { font-size: 14px; line-height: 1.6; color: #94a3b8; margin: 16px 0; }
    .code-box { background-color: #020617; border: 1px solid #0284c7; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 32px; font-weight: 800; color: #38bdf8; letter-spacing: 0.25em; }
    .footer { font-size: 12px; color: #64748b; text-align: center; margin-top: 24px; border-top: 1px solid #1e293b; padding-top: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <div class="brand">VisuaLearn</div>
      <div class="badge">Account Verification</div>
      <div class="title">Verify Your New Email Address</div>
    </div>
    <p class="desc">Hello <strong>${userName}</strong>,</p>
    <p class="desc">You have requested to change your email address on VisuaLearn to <strong>${toEmail}</strong>. To complete this change, enter the verification code below:</p>
    
    <div class="code-box">
      <div class="code">${verificationCode}</div>
    </div>

    <p class="desc" style="font-size: 13px; color: #cbd5e1;">⏱️ This verification code is valid for <strong>15 minutes</strong>. Do not share this code with anyone.</p>
    
    <div class="footer">
      If you did not initiate this request, you can safely ignore this email. Your current account email remains unchanged.
    </div>
  </div>
</body>
</html>
`;

    const info = await transporter.sendMail({
      from: fromAddress,
      to: toEmail,
      subject,
      text: textContent,
      html: htmlContent,
    });

    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log(`[EMAIL SERVICE] Profile email verification sent to ${toEmail}. Message ID: ${info.messageId}`);
    if (previewUrl) {
      console.log(`[EMAIL SERVICE] Ethereal Preview URL: ${previewUrl}`);
    }

    return {
      success: true,
      messageId: info.messageId,
      previewUrl,
    };
  } catch (err: any) {
    console.error(`[EMAIL SERVICE] Error delivering profile verification email to ${toEmail}:`, err);
    return {
      success: false,
      error: err?.message || 'Failed to send verification email.',
    };
  }
}

