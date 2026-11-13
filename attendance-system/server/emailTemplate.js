// Email-safe HTML (tables + inline styles) so it renders well in Gmail / Outlook / mobile.
const BRAND = '#2563eb';

export function otpEmail({ code, minutes = 5, name = 'Horizon Attendance' }) {
  const digits = String(code)
    .split('')
    .map(
      (d) =>
        `<td style="width:46px;height:58px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;text-align:center;font-size:28px;font-weight:700;color:#1e3a8a;font-family:'Segoe UI',Arial,sans-serif">${d}</td><td style="width:8px"></td>`
    )
    .join('');

  const subject = `${code} is your verification code | رمز التحقق`;

  const text = [
    `${name}`,
    '',
    `Your verification code: ${code}`,
    `It expires in ${minutes} minutes. Do not share it with anyone.`,
    '',
    `رمز التحقق الخاص بك: ${code}`,
    `ينتهي خلال ${minutes} دقائق. لا تشاركه مع أي شخص.`,
    '',
    `If you did not request this, you can ignore this email.`,
  ].join('\n');

  const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:'Segoe UI',Tahoma,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">Your verification code is ${code}. It expires in ${minutes} minutes.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 18px rgba(15,23,42,.08);">
        <tr>
          <td style="background:${BRAND};padding:26px 28px;text-align:center;">
            <div style="width:48px;height:48px;line-height:48px;margin:0 auto 10px;background:rgba(255,255,255,.18);border-radius:50%;font-size:24px;color:#fff;">&#10003;</div>
            <div style="color:#ffffff;font-size:20px;font-weight:700;">${name}</div>
            <div style="color:#dbeafe;font-size:13px;margin-top:4px;">نظام تسجيل الحضور</div>
          </td>
        </tr>
        <tr>
          <td style="padding:30px 28px 8px;text-align:center;">
            <div style="font-size:18px;font-weight:700;color:#0f172a;">Verify your email</div>
            <div style="font-size:14px;color:#64748b;margin-top:8px;line-height:1.6;">
              Enter the code below to sign in and record your attendance.
            </div>
            <div dir="rtl" style="font-size:14px;color:#64748b;margin-top:6px;line-height:1.7;">
              أدخل الرمز التالي لتسجيل الدخول وتسجيل حضورك.
            </div>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding:20px 28px 8px;">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr>${digits}</tr></table>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 28px 6px;text-align:center;">
            <span style="display:inline-block;background:#fef3c7;color:#92400e;font-size:13px;padding:7px 14px;border-radius:999px;">
              &#9201; Expires in ${minutes} minutes &nbsp;|&nbsp; <span dir="rtl">ينتهي خلال ${minutes} دقائق</span>
            </span>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 28px 28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:10px;">
              <tr><td style="padding:14px 16px;font-size:12.5px;color:#475569;line-height:1.7;">
                &#128274; Never share this code with anyone. Our team will never ask for it.<br>
                <span dir="rtl" style="display:block;margin-top:4px;">لا تشارك هذا الرمز مع أي شخص، ولن يطلبه منك أحد.</span>
              </td></tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid #e2e8f0;padding:16px 28px;text-align:center;font-size:12px;color:#94a3b8;line-height:1.6;">
            If you didn't request this code, you can safely ignore this email.<br>
            <span dir="rtl">إذا لم تطلب هذا الرمز فتجاهل هذه الرسالة.</span>
          </td>
        </tr>
      </table>
      <div style="font-size:11px;color:#94a3b8;margin-top:14px;">&copy; ${new Date().getFullYear()} ${name}</div>
    </td></tr>
  </table>
</body>
</html>`;

  return { subject, text, html };
}
