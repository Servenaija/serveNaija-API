export const VERIFICATION_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Verify Transaction PIN</title>
  <style>
    /* Basic reset + mobile-friendly */
    html,body{margin:0;padding:0;background:#f5f7fb;font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap{max-width:680px;margin:28px auto;padding:0}
    .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner{display:flex;align-items:center;gap:12px;padding:18px 22px;background:linear-gradient(90deg,#E35F01,#FF8A00)}
    .brand{font-weight:700;color:#fff;font-size:18px;margin:0}
    .body{padding:26px}
    .greeting{margin:0 0 8px;font-size:15px}
    .lead{margin:0 0 18px;color:#374151;line-height:1.45;font-size:14px}
    .code{display:inline-block;padding:16px 26px;border-radius:10px;background:#0f1724;color:#fff;font-weight:800;letter-spacing:6px;font-size:24px}
    .cta{margin:22px 0;text-align:center}
    .btn{display:inline-block;background:#0f1724;color:#fff;padding:12px 20px;border-radius:10px;text-decoration:none;font-weight:700}
    .small{font-size:13px;color:#6b7280;margin-top:10px}
    .muted{color:#94a3b8;font-size:12px}
    .footer{padding:18px 22px;background:#fbfdff;border-top:1px solid #eef2f7;text-align:center;color:#64748b;font-size:13px}
    .alt{margin-top:14px;padding:12px;background:#f8fafc;border-radius:8px;font-size:13px;color:#334155}
    @media (max-width:480px){
      .code{font-size:20px;padding:12px 18px;letter-spacing:5px}
      .body{padding:18px}
    }
  </style>
</head>
<body>
  <div class="wrap" role="article" aria-label="Maje Transaction PIN Verification">
    <div class="card">
      <div class="banner" role="banner">
        <div style="width:44px;height:44px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;color:#E35F01;flex-shrink:0">
          <!-- optional small logo area -->
            <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAYQE7QMPSFLP6HL76%2F20250819%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250819T140515Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEHYaCXVzLWVhc3QtMiJIMEYCIQCca1oAOrL%2F2NF%2Fh9taWvtZQOznlIxeDpa9nFdZaSFyowIhAMiNiGFwsDVJsdshDz3ZFcPwGphOeiP3iMhx5AeUD%2BUTKuMCCL%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNTg0NDUwMDczNTcyIgxflVDkDpYraGKBpRkqtwKNEEBFg7pAwzovW3LJQVLiDyZSVrBPbQONdiQsiujklSJCFgZJksPhtxda3n58jFnlPPKX5VwGJtfJgflm30v8hb9vtNztmFFFF5%2FxvyZS%2F4MPReTyrsmlVC56GnLST1WNaOZGVbOeOsKh6O%2FzlYjL9ldWIljnGweoc64T4GYyNahn1rtvwI1QXKL%2F6YGrA%2FKGb94P7HuRUlooQirAsVAdYpki9oJJVEd6SO2pM9HJ3hxFvJSXSj7obNLwb3aXWbsV1MsFqAy%2F%2Ba4eVVpN8FyaAHDWM5mmVw7R6Eic9OV6cX2Ajbl2GPL%2BXUlHQqq1Gv0ai72rHzuKKCrdz12Ou1lTLlmTS0PTheSlkE0%2FO5w2Q4mBp%2BMPH3YzBEo17QpZOkikXsuwFsayyO7qudwGX%2BaJsXD71IcbLDCdiJLFBjqsAi27bKu1jb%2BfV5TdXjw4d4D5RDTQdu5Ivfj5Yytsx49jAgNAm1OGbRoxy7pw0fMni5VvDOYlUrQcfG5eBEmGx4JU9n%2F8ROFvUBXIE52e%2FNdNOJMrvSr46wg5x3XJtI%2F9u0uNSwUV5VsFiZsvUZLFKkyh5pNCQAijZjdtrslNj8x9TCx4zmVHp%2F06fcmKgwG7IsjhCUB5IUz18JnE8L6nF3iode8Rx%2F3mx84%2FGV1K8ZKSENy9bNpUe7hgH1XCUnBWyksLAc%2FynbIJb%2B0Ev7fgJHsC%2FjkNZPzbYi8fO2jq%2By5evsBSzPVLy9LB%2FQ%2BXDN1ygMmQy4fb4z7FF9GX1C6Tn2cmlUo19Om5WbFwvRHKTipq54MGb0Beq8nSTFhcJbiyZYbQIcqig2tz2GMMJg%3D%3D&X-Amz-Signature=127e10fda6016d98f4ef4cf702226d52e21aeba2db79814207ae8d03693e9212&X-Amz-SignedHeaders=host&response-content-disposition=inline"
             alt="Maje Logo" width="44" height="44" style="display:block;border:0;"/>
        </div>
        <h1 class="brand">Maje — Verify PIN</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          You're creating a <strong>transaction PIN</strong> on Maje. Enter the verification code below in the app to confirm and complete the setup.
        </p>

        <div style="text-align:center">
          <div class="code" role="status" aria-live="polite">{verificationCode}</div>
        </div>

       

        <p class="small">
          This code will expire in <strong>{expiryMinutes} minutes</strong>. For security reasons do not share this code with anyone.
        </p>

        

        <p class="muted" style="margin-top:16px">
          If you did not request a transaction PIN, you can ignore this email or contact support at <a href="mailto:support@maje.com" style="color:inherit;text-decoration:underline">support@maje.com</a>.
        </p>
      </div>

      <div class="footer" role="contentinfo">
        © {year} Maje. This is an automated message — please do not reply to this email.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();




export const RIDER_DENIAL_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Rider Application Denied</title>
  <style>
    html,body{margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;color:#0f1724}
    .wrap{max-width:680px;margin:28px auto;padding:0}
    .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner{display:flex;align-items:center;gap:12px;padding:18px 22px;background:linear-gradient(90deg,#dc2626,#ef4444)}
    .brand{font-weight:700;color:#fff;font-size:18px;margin:0}
    .body{padding:26px}
    .greeting{margin:0 0 10px;font-size:15px}
    .lead{margin:0 0 18px;color:#374151;line-height:1.55;font-size:14px}
    .status{padding:16px 22px;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:14px;line-height:1.4;border:1px solid #fecaca}
    .reason{margin-top:14px;font-size:14px;color:#374151}
    .footer{padding:18px 22px;background:#fbfdff;border-top:1px solid #eef2f7;text-align:center;color:#64748b;font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px;height:44px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAYQE7QMPSFLP6HL76%2F20250819%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250819T140515Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEHYaCXVzLWVhc3QtMiJIMEYCIQCca1oAOrL%2F2NF%2Fh9taWvtZQOznlIxeDpa9nFdZaSFyowIhAMiNiGFwsDVJsdshDz3ZFcPwGphOeiP3iMhx5AeUD%2BUTKuMCCL%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNTg0NDUwMDczNTcyIgxflVDkDpYraGKBpRkqtwKNEEBFg7pAwzovW3LJQVLiDyZSVrBPbQONdiQsiujklSJCFgZJksPhtxda3n58jFnlPPKX5VwGJtfJgflm30v8hb9vtNztmFFFF5%2FxvyZS%2F4MPReTyrsmlVC56GnLST1WNaOZGVbOeOsKh6O%2FzlYjL9ldWIljnGweoc64T4GYyNahn1rtvwI1QXKL%2F6YGrA%2FKGb94P7HuRUlooQirAsVAdYpki9oJJVEd6SO2pM9HJ3hxFvJSXSj7obNLwb3aXWbsV1MsFqAy%2F%2Ba4eVVpN8FyaAHDWM5mmVw7R6Eic9OV6cX2Ajbl2GPL%2BXUlHQqq1Gv0ai72rHzuKKCrdz12Ou1lTLlmTS0PTheSlkE0%2FO5w2Q4mBp%2BMPH3YzBEo17QpZOkikXsuwFsayyO7qudwGX%2BaJsXD71IcbLDCdiJLFBjqsAi27bKu1jb%2BfV5TdXjw4d4D5RDTQdu5Ivfj5Yytsx49jAgNAm1OGbRoxy7pw0fMni5VvDOYlUrQcfG5eBEmGx4JU9n%2F8ROFvUBXIE52e%2FNdNOJMrvSr46wg5x3XJtI%2F9u0uNSwUV5VsFiZsvUZLFKkyh5pNCQAijZjdtrslNj8x9TCx4zmVHp%2F06fcmKgwG7IsjhCUB5IUz18JnE8L6nF3iode8Rx%2F3mx84%2FGV1K8ZKSENy9bNpUe7hgH1XCUnBWyksLAc%2FynbIJb%2B0Ev7fgJHsC%2FjkNZPzbYi8fO2jq%2By5evsBSzPVLy9LB%2FQ%2BXDN1ygMmQy4fb4z7FF9GX1C6Tn2cmlUo19Om5WbFwvRHKTipq54MGb0Beq8nSTFhcJbiyZYbQIcqig2tz2GMMJg%3D%3D&X-Amz-Signature=127e10fda6016d98f4ef4cf702226d52e21aeba2db79814207ae8d03693e9212&X-Amz-SignedHeaders=host&response-content-disposition=inline" alt="Maje Logo" width="44" height="44"/>
        </div>
        <h1 class="brand">Maje — Rider Application Denied</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Thank you for applying to become a <strong>Maje Rider</strong>. After careful review, we regret to inform you that your application has not been approved.
        </p>

        <div class="status">
          Unfortunately, your application was denied.
        </div>

        <p class="reason">
          <strong>Reason:</strong> {reason}
        </p>

        <p style="margin-top:18px;color:#374151;font-size:14px">
          You may reapply in the future once the issue has been resolved.
        </p>
      </div>

      <div class="footer">
        © {year} Maje. This is an automated message — please do not reply to this email.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();


export const RIDER_APPROVAL_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Rider Application Approved</title>
  <style>
    html,body{margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;color:#0f1724}
    .wrap{max-width:680px;margin:28px auto;padding:0}
    .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner{display:flex;align-items:center;gap:12px;padding:18px 22px;background:linear-gradient(90deg,#16a34a,#22c55e)}
    .brand{font-weight:700;color:#fff;font-size:18px;margin:0}
    .body{padding:26px}
    .greeting{margin:0 0 10px;font-size:15px}
    .lead{margin:0 0 18px;color:#374151;line-height:1.55;font-size:14px}
    .status{padding:16px 22px;border-radius:10px;background:#ecfdf5;color:#065f46;font-size:14px;line-height:1.4;border:1px solid #d1fae5}
    .footer{padding:18px 22px;background:#fbfdff;border-top:1px solid #eef2f7;text-align:center;color:#64748b;font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px;height:44px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAYQE7QMPSFLP6HL76%2F20250819%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250819T140515Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEHYaCXVzLWVhc3QtMiJIMEYCIQCca1oAOrL%2F2NF%2Fh9taWvtZQOznlIxeDpa9nFdZaSFyowIhAMiNiGFwsDVJsdshDz3ZFcPwGphOeiP3iMhx5AeUD%2BUTKuMCCL%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNTg0NDUwMDczNTcyIgxflVDkDpYraGKBpRkqtwKNEEBFg7pAwzovW3LJQVLiDyZSVrBPbQONdiQsiujklSJCFgZJksPhtxda3n58jFnlPPKX5VwGJtfJgflm30v8hb9vtNztmFFFF5%2FxvyZS%2F4MPReTyrsmlVC56GnLST1WNaOZGVbOeOsKh6O%2FzlYjL9ldWIljnGweoc64T4GYyNahn1rtvwI1QXKL%2F6YGrA%2FKGb94P7HuRUlooQirAsVAdYpki9oJJVEd6SO2pM9HJ3hxFvJSXSj7obNLwb3aXWbsV1MsFqAy%2F%2Ba4eVVpN8FyaAHDWM5mmVw7R6Eic9OV6cX2Ajbl2GPL%2BXUlHQqq1Gv0ai72rHzuKKCrdz12Ou1lTLlmTS0PTheSlkE0%2FO5w2Q4mBp%2BMPH3YzBEo17QpZOkikXsuwFsayyO7qudwGX%2BaJsXD71IcbLDCdiJLFBjqsAi27bKu1jb%2BfV5TdXjw4d4D5RDTQdu5Ivfj5Yytsx49jAgNAm1OGbRoxy7pw0fMni5VvDOYlUrQcfG5eBEmGx4JU9n%2F8ROFvUBXIE52e%2FNdNOJMrvSr46wg5x3XJtI%2F9u0uNSwUV5VsFiZsvUZLFKkyh5pNCQAijZjdtrslNj8x9TCx4zmVHp%2F06fcmKgwG7IsjhCUB5IUz18JnE8L6nF3iode8Rx%2F3mx84%2FGV1K8ZKSENy9bNpUe7hgH1XCUnBWyksLAc%2FynbIJb%2B0Ev7fgJHsC%2FjkNZPzbYi8fO2jq%2By5evsBSzPVLy9LB%2FQ%2BXDN1ygMmQy4fb4z7FF9GX1C6Tn2cmlUo19Om5WbFwvRHKTipq54MGb0Beq8nSTFhcJbiyZYbQIcqig2tz2GMMJg%3D%3D&X-Amz-Signature=127e10fda6016d98f4ef4cf702226d52e21aeba2db79814207ae8d03693e9212&X-Amz-SignedHeaders=host&response-content-disposition=inline" alt="Maje Logo" width="44" height="44"/>
        </div>
        <h1 class="brand">Maje — Rider Approved</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Congratulations! 🎉 Your application to become a <strong>Maje Rider</strong> has been approved.
        </p>

        <div class="status">
          You can now log in to your account and start accepting delivery requests immediately.
        </div>

        <p style="margin-top:18px;color:#374151;font-size:14px">
          We’re excited to have you onboard. Together, we’ll deliver excellence!
        </p>
      </div>

      <div class="footer">
        © {year} Maje. This is an automated message — please do not reply to this email.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();


export const RIDER_UNDER_REVIEW_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Rider Application Under Review</title>
  <style>
    html,body{margin:0;padding:0;background:#f5f7fb;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial;color:#0f1724}
    .wrap{max-width:680px;margin:28px auto;padding:0}
    .card{background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner{display:flex;align-items:center;gap:12px;padding:18px 22px;background:linear-gradient(90deg,#E35F01,#FF8A00)}
    .brand{font-weight:700;color:#fff;font-size:18px;margin:0}
    .body{padding:26px}
    .greeting{margin:0 0 10px;font-size:15px}
    .lead{margin:0 0 18px;color:#374151;line-height:1.55;font-size:14px}
    .status{padding:16px 22px;border-radius:10px;background:#f8fafc;color:#0f1724;font-size:14px;line-height:1.4;border:1px solid #e5e7eb}
    .footer{padding:18px 22px;background:#fbfdff;border-top:1px solid #eef2f7;text-align:center;color:#64748b;font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px;height:44px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Content-Sha256=UNSIGNED-PAYLOAD&X-Amz-Credential=ASIAYQE7QMPSFLP6HL76%2F20250819%2Fus-east-2%2Fs3%2Faws4_request&X-Amz-Date=20250819T140515Z&X-Amz-Expires=300&X-Amz-Security-Token=IQoJb3JpZ2luX2VjEHYaCXVzLWVhc3QtMiJIMEYCIQCca1oAOrL%2F2NF%2Fh9taWvtZQOznlIxeDpa9nFdZaSFyowIhAMiNiGFwsDVJsdshDz3ZFcPwGphOeiP3iMhx5AeUD%2BUTKuMCCL%2F%2F%2F%2F%2F%2F%2F%2F%2F%2F%2FwEQABoMNTg0NDUwMDczNTcyIgxflVDkDpYraGKBpRkqtwKNEEBFg7pAwzovW3LJQVLiDyZSVrBPbQONdiQsiujklSJCFgZJksPhtxda3n58jFnlPPKX5VwGJtfJgflm30v8hb9vtNztmFFFF5%2FxvyZS%2F4MPReTyrsmlVC56GnLST1WNaOZGVbOeOsKh6O%2FzlYjL9ldWIljnGweoc64T4GYyNahn1rtvwI1QXKL%2F6YGrA%2FKGb94P7HuRUlooQirAsVAdYpki9oJJVEd6SO2pM9HJ3hxFvJSXSj7obNLwb3aXWbsV1MsFqAy%2F%2Ba4eVVpN8FyaAHDWM5mmVw7R6Eic9OV6cX2Ajbl2GPL%2BXUlHQqq1Gv0ai72rHzuKKCrdz12Ou1lTLlmTS0PTheSlkE0%2FO5w2Q4mBp%2BMPH3YzBEo17QpZOkikXsuwFsayyO7qudwGX%2BaJsXD71IcbLDCdiJLFBjqsAi27bKu1jb%2BfV5TdXjw4d4D5RDTQdu5Ivfj5Yytsx49jAgNAm1OGbRoxy7pw0fMni5VvDOYlUrQcfG5eBEmGx4JU9n%2F8ROFvUBXIE52e%2FNdNOJMrvSr46wg5x3XJtI%2F9u0uNSwUV5VsFiZsvUZLFKkyh5pNCQAijZjdtrslNj8x9TCx4zmVHp%2F06fcmKgwG7IsjhCUB5IUz18JnE8L6nF3iode8Rx%2F3mx84%2FGV1K8ZKSENy9bNpUe7hgH1XCUnBWyksLAc%2FynbIJb%2B0Ev7fgJHsC%2FjkNZPzbYi8fO2jq%2By5evsBSzPVLy9LB%2FQ%2BXDN1ygMmQy4fb4z7FF9GX1C6Tn2cmlUo19Om5WbFwvRHKTipq54MGb0Beq8nSTFhcJbiyZYbQIcqig2tz2GMMJg%3D%3D&X-Amz-Signature=127e10fda6016d98f4ef4cf702226d52e21aeba2db79814207ae8d03693e9212&X-Amz-SignedHeaders=host&response-content-disposition=inline" alt="Maje Logo" width="44" height="44"/>
        </div>
        <h1 class="brand">Maje — Rider Application Under Review</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Thank you for applying to become a <strong>Maje Rider</strong>. We have successfully received your details.
        </p>

        <div class="status">
          Our team is reviewing your application. This process typically takes up to <strong>24 hours</strong>.
        </div>

        <p style="margin-top:18px;color:#374151;font-size:14px">
          Once your application has been reviewed, you’ll receive an update via email regarding the outcome.
        </p>
      </div>

      <div class="footer">
        © {year} Maje. This is an automated message — please do not reply to this email.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();



export const RESET_PASSWORD_CODE_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Reset Password</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family:-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724;}
    .wrap {max-width:680px; margin:28px auto; padding:0;}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06);}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#E35F01,#FF8A00);}
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
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#E35F01; flex-shrink:0">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png" alt="Maje Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">Maje — Reset Password</h1>
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
        © {year} Maje. This is an automated message — please do not reply.
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
  <title>Maje — Password Reset Successful</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap {max-width:680px; margin:28px auto; padding:0}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#E35F01,#FF8A00)}
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
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#E35F01; flex-shrink:0">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png" alt="Maje Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">Maje — Password Reset Successful</h1>
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
        © {year} Maje. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();



export const WITHDRAWAL_PENDING_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Withdrawal Request Submitted</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap {max-width:680px; margin:28px auto; padding:0}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#E35F01,#FF8A00)}
    .brand {font-weight:700; color:#fff; font-size:18px; margin:0}
    .body {padding:26px}
    .greeting {margin:0 0 8px; font-size:15px}
    .lead {margin:0 0 18px; color:#374151; line-height:1.45; font-size:14px}
    .info-box {background:#f8fafc; border-radius:8px; padding:16px; margin:20px 0; border:1px solid #e2e8f0}
    .info-row {display:flex; justify-content:space-between; margin-bottom:10px}
    .info-label {color:#64748b; font-size:14px}
    .info-value {color:#0f1724; font-weight:500; font-size:14px}
    .status {color:#f59e0b; background:#fffbeb; padding:4px 12px; border-radius:6px; display:inline-block; font-size:13px}
    .note {background:#f0f9ff; border-left:4px solid #0ea5e9; padding:12px 16px; margin:20px 0; font-size:13px}
    .small {font-size:13px; color:#6b7280; margin-top:10px}
    .muted {color:#94a3b8; font-size:12px}
    .footer {padding:18px 22px; background:#fbfdff; border-top:1px solid #eef2f7; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#E35F01; flex-shrink:0">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png" alt="Maje Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">Maje — Withdrawal Request Submitted</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Your withdrawal request has been received and is under review.
        </p>

        <div class="info-box">
          <div class="info-row">
            <span class="info-label">Amount:</span>
            <span class="info-value">₦{amount}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Account:</span>
            <span class="info-value">****{accountNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Bank:</span>
            <span class="info-value">{bankName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Reference:</span>
            <span class="info-value">{reference}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Date:</span>
            <span class="info-value">{date}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="status">Pending Review</span>
          </div>
        </div>

        <div class="note">
          <strong>Important:</strong> Processing typically takes 24-48 hours. Your wallet balance will be deducted once the withdrawal is approved.
        </div>

        <p class="small">
          If you didn't initiate this withdrawal, please contact our support team immediately at <a href="mailto:{supportEmail}" style="color:inherit;text-decoration:underline">{supportEmail}</a>.
        </p>
      </div>

      <div class="footer">
        © {year} Maje. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const WITHDRAWAL_APPROVED_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Withdrawal Approved</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap {max-width:680px; margin:28px auto; padding:0}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#10b981,#34d399)}
    .brand {font-weight:700; color:#fff; font-size:18px; margin:0}
    .body {padding:26px}
    .greeting {margin:0 0 8px; font-size:15px}
    .lead {margin:0 0 18px; color:#374151; line-height:1.45; font-size:14px}
    .info-box {background:#f0fdf4; border-radius:8px; padding:16px; margin:20px 0; border:1px solid #bbf7d0}
    .info-row {display:flex; justify-content:space-between; margin-bottom:10px}
    .info-label {color:#64748b; font-size:14px}
    .info-value {color:#0f1724; font-weight:500; font-size:14px}
    .status {color:#10b981; background:#dcfce7; padding:4px 12px; border-radius:6px; display:inline-block; font-size:13px}
    .note {background:#f0f9ff; border-left:4px solid #0ea5e9; padding:12px 16px; margin:20px 0; font-size:13px}
    .small {font-size:13px; color:#6b7280; margin-top:10px}
    .muted {color:#94a3b8; font-size:12px}
    .footer {padding:18px 22px; background:#fbfdff; border-top:1px solid #eef2f7; text-align:center; color:#64748b; font-size:13px}
    .service-charge {background:#fff7ed; border:1px solid #fed7aa; padding:12px 16px; border-radius:8px; margin:15px 0}
    .service-row {display:flex; justify-content:space-between; margin:8px 0}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#10b981; flex-shrink:0">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png" alt="Maje Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">Maje — Withdrawal Approved</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Great news! Your withdrawal request has been approved and processed.
        </p>

        <div class="info-box">
          <div class="service-charge">
            <div class="service-row">
              <span class="info-label">Requested Amount:</span>
              <span class="info-value">₦{amount}</span>
            </div>
            <div class="service-row">
              <span class="info-label">Service Charge (10%):</span>
              <span class="info-value">-₦{serviceCharge}</span>
            </div>
            <div class="service-row" style="border-top:1px solid #fed7aa; padding-top:8px; margin-top:8px;">
              <span class="info-label" style="font-weight:600;">Amount Sent:</span>
              <span class="info-value" style="font-weight:600; color:#059669;">₦{amountToReceive}</span>
            </div>
          </div>

          <div class="info-row">
            <span class="info-label">Account:</span>
            <span class="info-value">****{accountNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Bank:</span>
            <span class="info-value">{bankName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Reference:</span>
            <span class="info-value">{reference}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Processed Date:</span>
            <span class="info-value">{processedDate}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="status">Approved ✓</span>
          </div>
        </div>

        <div class="note">
          <strong>Note:</strong> {note}
        </div>

        <p class="small">
          A 10% service charge has been deducted as per our terms and conditions. The net amount of ₦{amountToReceive} has been transferred to your bank account. It may take 1-3 business days to reflect in your account, depending on your bank.
        </p>
      </div>

      <div class="footer">
        © {year} Maje. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();

export const WITHDRAWAL_REJECTED_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Maje — Withdrawal Declined</title>
  <style>
    html, body {margin:0; padding:0; background:#f5f7fb; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial; color:#0f1724}
    .wrap {max-width:680px; margin:28px auto; padding:0}
    .card {background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 10px 30px rgba(15,23,42,0.06)}
    .banner {display:flex; align-items:center; gap:12px; padding:18px 22px; background:linear-gradient(90deg,#ef4444,#f87171)}
    .brand {font-weight:700; color:#fff; font-size:18px; margin:0}
    .body {padding:26px}
    .greeting {margin:0 0 8px; font-size:15px}
    .lead {margin:0 0 18px; color:#374151; line-height:1.45; font-size:14px}
    .info-box {background:#fef2f2; border-radius:8px; padding:16px; margin:20px 0; border:1px solid #fecaca}
    .info-row {display:flex; justify-content:space-between; margin-bottom:10px}
    .info-label {color:#64748b; font-size:14px}
    .info-value {color:#0f1724; font-weight:500; font-size:14px}
    .status {color:#ef4444; background:#fee2e2; padding:4px 12px; border-radius:6px; display:inline-block; font-size:13px}
    .reason-box {background:#fff7ed; border-left:4px solid #f97316; padding:12px 16px; margin:20px 0; font-size:13px}
    .small {font-size:13px; color:#6b7280; margin-top:10px}
    .muted {color:#94a3b8; font-size:12px}
    .footer {padding:18px 22px; background:#fbfdff; border-top:1px solid #eef2f7; text-align:center; color:#64748b; font-size:13px}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="banner">
        <div style="width:44px; height:44px; border-radius:8px; background:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#ef4444; flex-shrink:0">
          <img src="https://maje.s3.us-east-2.amazonaws.com/logo_1.png" alt="Maje Logo" width="44" height="44" style="display:block; border:0;"/>
        </div>
        <h1 class="brand">Maje — Withdrawal Declined</h1>
      </div>

      <div class="body">
        <p class="greeting">Hi {name},</p>

        <p class="lead">
          Your withdrawal request has been declined. No funds have been deducted from your wallet.
        </p>

        <div class="info-box">
          <div class="info-row">
            <span class="info-label">Amount:</span>
            <span class="info-value">₦{amount}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Account:</span>
            <span class="info-value">****{accountNumber}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Bank:</span>
            <span class="info-value">{bankName}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Reference:</span>
            <span class="info-value">{reference}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Date:</span>
            <span class="info-value">{date}</span>
          </div>
          <div class="info-row">
            <span class="info-label">Status:</span>
            <span class="status">Declined ✗</span>
          </div>
        </div>

        <div class="reason-box">
          <strong>Reason:</strong> {reason}
        </div>

        <p class="small">
          You may check your account details and try again, or contact support if you believe this was an error.
        </p>
      </div>

      <div class="footer">
        © {year} Maje. This is an automated message — please do not reply.
      </div>
    </div>
  </div>
</body>
</html>
`.trim();
