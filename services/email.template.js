// templates/emailTemplates.js

export const RESET_PASSWORD_CODE_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ServeNaija — Reset Password</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724;}
    .wrap {max-width:680px; margin:28px auto; padding:0;}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06);}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#165B43,#1a7a5a);}
    .brand {font-weight:700; color:#fff; font-size:18px; margin:0;}
    .body {padding:26px;}
    .greeting {margin:0 0 8px; font-size:15px;}
    .lead {margin:0 0 18px; color:#374151; line-height:1.45; font-size:14px;}
    .code {display:inline-block; padding:16px 26px; border-radius:10px; background:#0f1724; color:#fff; font-weight:800; letter-spacing:6px; font-size:24px;}
    .small {font-size:13px; color:#6b7280; margin-top:10px;}
    .muted {color:#94a3b8; font-size:12px;}
    .footer {padding:18px 22px; background:#fbfdff; border-top:1px solid #eef2f7; text-align:center; color:#64748b; font-size:13px;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#165B43; flex-shrink:0">
          <img src="https://servenaija.s3.amazonaws.com/logo.png" alt="ServeNaija Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">ServeNaija — Reset Password</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          You requested to reset your password. Enter the verification code below to proceed.
        </p>

        <div style="text-align:center; margin:24px 0">
          <div class="code" role="status" aria-live="polite">{verificationCode}</div>
        </div>

        <p class="small">
          This code will expire in <strong>{expiryMinutes} minutes</strong>. Do not share this code with anyone.
        </p>

        <p class="muted" style="margin-top:16px">
          If you did not request this, ignore this email or contact support at 
          <a href="mailto:{supportEmail}" style="color:inherit;text-decoration:underline">{supportEmail}</a>.
        </p>
      </div>

      <div class="footer">
        © {year} ServeNaija. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const RESET_PASSWORD_SUCCESS_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ServeNaija — Password Reset Successful</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap {max-width:680px; margin:28px auto; padding:0}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#165B43,#1a7a5a)}
    .brand {font-weight:700; color:#fff; font-size:18px; margin:0}
    .body {padding:26px}
    .greeting {margin:0 0 8px; font-size:15px}
    .lead {margin:0 0 18px; color:#374151; line-height:1.45; font-size:14px}
    .small {font-size:13px; color:#6b7280; margin-top:10px}
    .muted {color:#94a3b8; font-size:12px}
    .footer {padding:18px 22px; background:#fbfdff; border-top:1px solid #eef2f7; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#165B43; flex-shrink:0">
          <img src="https://servenaija.s3.amazonaws.com/logo.png" alt="ServeNaija Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">ServeNaija — Password Reset Successful</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Your password has been changed successfully. You can now log in with your new password.
        </p>

        <p class="small">
          If you did not perform this change, immediately contact support at <a href="mailto:{supportEmail}" style="color:inherit;text-decoration:underline">{supportEmail}</a>.
        </p>
      </div>

      <div class="footer">
        © {year} ServeNaija. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const MAGIC_LINK_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>ServeNaija — Magic Link Login</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap {max-width:680px; margin:28px auto; padding:0}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#165B43,#1a7a5a)}
    .brand {font-weight:700; color:#fff; font-size:18px; margin:0}
    .body {padding:26px}
    .greeting {margin:0 0 8px; font-size:15px}
    .lead {margin:0 0 18px; color:#374151; line-height:1.45; font-size:14px}
    .button {display:inline-block; background-color:#165B43; color:#fff; padding:12px 24px; text-decoration:none; border-radius:5px; margin:20px 0;}
    .small {font-size:13px; color:#6b7280; margin-top:10px}
    .muted {color:#94a3b8; font-size:12px}
    .footer {padding:18px 22px; background:#fbfdff; border-top:1px solid #eef2f7; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#165B43; flex-shrink:0">
          <img src="https://servenaija.s3.amazonaws.com/logo.png" alt="ServeNaija Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">ServeNaija — Magic Link Login</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          You requested a magic link to log in to your {userType} account.
        </p>

        <div style="text-align:center; margin:24px 0">
          <a href="{magicLink}" class="button">Log In to ServeNaija</a>
        </div>

        <p class="small">
          This link will expire in <strong>{expiryMinutes} minutes</strong>. Do not share this link with anyone.
        </p>

        <p style="word-break: break-all; background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 12px; color: #666;">
          Or copy and paste this URL: {magicLink}
        </p>

        <p class="muted" style="margin-top:16px">
          If you did not request this, ignore this email or contact support at 
          <a href="mailto:{supportEmail}" style="color:inherit;text-decoration:underline">{supportEmail}</a>.
        </p>
      </div>

      <div class="footer">
        © {year} ServeNaija. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();