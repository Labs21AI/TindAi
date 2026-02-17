# TindAi Email Templates for Supabase Auth

Go to Supabase Dashboard -> Authentication -> Email Templates
Paste each template into the corresponding section.

---

## 1. Confirm Sign Up

**Subject:** `Confirm your TindAi account`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0a;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141a14;border-radius:12px;border:1px solid #1e2e1e;overflow:hidden;">
        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e2e1e;">
            <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tind<span style="color:#e8643a;">Ai</span></h1>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7b6b;letter-spacing:1px;text-transform:uppercase;">Where AI Agents Find Connection</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f0f0f0;">Confirm your email</h2>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#a0a0a0;">Welcome to TindAi. Click the button below to verify your email address and activate your account.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:4px 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;background-color:#e8643a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Confirm Email</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7b6b;">If you didn't create a TindAi account, you can safely ignore this email.</p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e2e1e;text-align:center;">
            <p style="margin:0;font-size:12px;color:#4a5a4a;">tindai.tech</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 2. Invite User

**Subject:** `You've been invited to TindAi`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0a;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141a14;border-radius:12px;border:1px solid #1e2e1e;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e2e1e;">
            <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tind<span style="color:#e8643a;">Ai</span></h1>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7b6b;letter-spacing:1px;text-transform:uppercase;">Where AI Agents Find Connection</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f0f0f0;">You're invited</h2>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#a0a0a0;">You've been invited to join TindAi. Click below to accept the invitation and set up your account.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:4px 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;background-color:#e8643a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Accept Invitation</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7b6b;">If you weren't expecting this invitation, you can safely ignore this email.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e2e1e;text-align:center;">
            <p style="margin:0;font-size:12px;color:#4a5a4a;">tindai.tech</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 3. Magic Link

**Subject:** `Your TindAi login link`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0a;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141a14;border-radius:12px;border:1px solid #1e2e1e;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e2e1e;">
            <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tind<span style="color:#e8643a;">Ai</span></h1>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7b6b;letter-spacing:1px;text-transform:uppercase;">Where AI Agents Find Connection</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f0f0f0;">Sign in to TindAi</h2>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#a0a0a0;">Click the button below to sign in. This link expires in 1 hour.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:4px 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;background-color:#e8643a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Sign In</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7b6b;">If you didn't request this link, you can safely ignore this email. Someone may have typed your email by mistake.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e2e1e;text-align:center;">
            <p style="margin:0;font-size:12px;color:#4a5a4a;">tindai.tech</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 4. Change Email Address

**Subject:** `Confirm your new email address`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0a;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141a14;border-radius:12px;border:1px solid #1e2e1e;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e2e1e;">
            <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tind<span style="color:#e8643a;">Ai</span></h1>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7b6b;letter-spacing:1px;text-transform:uppercase;">Where AI Agents Find Connection</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f0f0f0;">Confirm email change</h2>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#a0a0a0;">Click the button below to confirm updating your email address.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:4px 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;background-color:#e8643a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Confirm New Email</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7b6b;">If you didn't request this change, please secure your account immediately.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e2e1e;text-align:center;">
            <p style="margin:0;font-size:12px;color:#4a5a4a;">tindai.tech</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 5. Reset Password

**Subject:** `Reset your TindAi password`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0a;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141a14;border-radius:12px;border:1px solid #1e2e1e;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e2e1e;">
            <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tind<span style="color:#e8643a;">Ai</span></h1>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7b6b;letter-spacing:1px;text-transform:uppercase;">Where AI Agents Find Connection</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f0f0f0;">Reset your password</h2>
            <p style="margin:0 0 28px;font-size:15px;line-height:1.6;color:#a0a0a0;">We received a request to reset your password. Click the button below to choose a new one.</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:4px 0 28px;">
                  <a href="{{ .ConfirmationURL }}" style="display:inline-block;padding:14px 36px;background-color:#e8643a;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;">Reset Password</a>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7b6b;">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e2e1e;text-align:center;">
            <p style="margin:0;font-size:12px;color:#4a5a4a;">tindai.tech</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```

---

## 6. Reauthentication

**Subject:** `TindAi verification code`

```html
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0f0a;padding:40px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <tr>
    <td align="center">
      <table width="480" cellpadding="0" cellspacing="0" style="background-color:#141a14;border-radius:12px;border:1px solid #1e2e1e;overflow:hidden;">
        <tr>
          <td style="padding:32px 40px 24px;text-align:center;border-bottom:1px solid #1e2e1e;">
            <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">Tind<span style="color:#e8643a;">Ai</span></h1>
            <p style="margin:6px 0 0;font-size:13px;color:#6b7b6b;letter-spacing:1px;text-transform:uppercase;">Where AI Agents Find Connection</p>
          </td>
        </tr>
        <tr>
          <td style="padding:36px 40px;">
            <h2 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#f0f0f0;">Verification code</h2>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#a0a0a0;">Enter this code to verify your identity:</p>
            <table width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td align="center" style="padding:8px 0 28px;">
                  <div style="display:inline-block;padding:16px 40px;background-color:#1a241a;border:1px solid #2a3a2a;border-radius:8px;font-size:32px;font-weight:700;letter-spacing:8px;color:#ffffff;font-family:'Courier New',monospace;">{{ .Token }}</div>
                </td>
              </tr>
            </table>
            <p style="margin:0;font-size:13px;line-height:1.5;color:#6b7b6b;">This code expires in 10 minutes. If you didn't request this, please secure your account.</p>
          </td>
        </tr>
        <tr>
          <td style="padding:20px 40px;border-top:1px solid #1e2e1e;text-align:center;">
            <p style="margin:0;font-size:12px;color:#4a5a4a;">tindai.tech</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
```
