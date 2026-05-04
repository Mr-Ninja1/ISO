# Supabase Email Branding Checklist

Use this when you want signup verification and password reset emails to look like they come from ISO Pro instead of Supabase.

## What the app can do

- Send users to the right pages after verification or password reset.
- Provide the redirect URLs that Supabase should use.
- Show user-facing signup, verification, and reset-password screens.

## What Supabase must do

- Configure custom SMTP in the Supabase dashboard for production.
- Set the sender name and from address in SMTP settings.
- Customize the Auth email templates in Supabase.
- Configure the allowed redirect URLs in Supabase Auth settings.

## Recommended SMTP setup

If you want the fastest path, use a transactional email provider like Resend, SendGrid, Postmark, or Amazon SES.

For a clean starting point, Resend is usually the simplest option:

- Sender email address: `noreply@yourdomain.com`
- Sender name: `ISO Pro`
- Host: use the SMTP host shown by Resend
- Port: `587`
- SMTP user: use the username from Resend's SMTP credentials
- SMTP password: use the SMTP password or API key from Resend

For local testing, you can still keep the Supabase auth pages pointed at `http://localhost:3000` while using the provider's SMTP credentials.

If you want to use Google instead, Gmail or Google Workspace can also work with an app password:

- Sender email address: your Gmail or Google Workspace address
- Sender name: `ISO Pro`
- Host: `smtp.gmail.com`
- Port: `587` for TLS, or `465` for SSL
- SMTP user: your full Gmail address
- SMTP password: the Google app password you create after enabling 2-step verification

Use this only if your Google account has 2-step verification turned on, because app passwords are required for SMTP.

Google setup steps:

1. Turn on 2-step verification for your Google account.
2. Open Google Account security settings and create an app password.
3. Choose Mail as the app and Other as the device name if Google asks.
4. Copy the generated 16-character app password.
5. Paste that password into Supabase SMTP password.
6. Use your full Gmail address as the SMTP user.
7. Set the sender email address to the same Gmail or Workspace address.
8. Save the Supabase SMTP settings and send a test verification email.

## Dashboard checklist

1. Open Supabase Dashboard and go to Auth settings.
2. For local testing, set or temporarily use your localhost app URL, then switch to the real production URL when you go live.
3. Add redirect URLs for the app pages used by auth:
  - `http://localhost:3000/login?verified=1`
  - `http://localhost:3000/reset-password`
  - `http://localhost:3000/verify-email`
  - `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/login?verified=1`
  - `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/reset-password`
  - `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/verify-email`
  - `/login?verified=1`
  - `/reset-password`
  - any other auth callback path you use later
4. Open Auth email templates and customize:
   - Confirm signup
   - Reset password
   - Invite user, if you use invitations later
5. Replace the default subject lines and HTML content with your brand copy.
6. Use `{{ .ConfirmationURL }}` or a custom link built from `{{ .SiteURL }}` and `{{ .RedirectTo }}`.
7. If you use an external email service, set up custom SMTP and a branded sender name.
8. Disable email tracking if the provider rewrites links.
9. Test verification and reset emails with a real inbox before shipping.

## Recommended branding copy

- Sender name: `ISO Pro`
- From address: `no-reply@your-domain.com`
- Subject example: `Confirm your ISO Pro account`
- Password reset subject example: `Reset your ISO Pro password`

## Fill These Dashboard Fields

### Sender details

- Sender email address: `noreply@iso-pro.yourdomain.com` or `no-reply@yourdomain.com`
- Sender name: `ISO Pro`

### SMTP provider settings

- Host: use the SMTP host from your email provider
- Port number: usually `587` for TLS or `465` for SSL
- SMTP user: the username or API user from your provider
- SMTP password: the SMTP password or API secret from your provider

### Gmail / Google Workspace settings

- Host: `smtp.gmail.com`
- Port number: `587` is the usual starting point
- SMTP user: your full Google email address
- SMTP password: the Google app password, not your normal Google account password

### Auth settings

- Site URL: your localhost app URL for testing, then your main app URL in production, for example `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net`
- Redirect URLs:
   - `http://localhost:3000/login?verified=1`
   - `http://localhost:3000/reset-password`
   - `http://localhost:3000/verify-email`
  - `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/login?verified=1`
  - `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/reset-password`
  - `https://iso-pro-b0grfvh9hcc5chgf.southafricanorth-01.azurewebsites.net/verify-email`

### Auth templates

- Confirm signup: use the branded HTML below
- Reset password: use the branded HTML below

## Suggested email templates

### Confirm signup

Subject:

`Confirm your ISO Pro account`

HTML body:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your ISO Pro account</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px;">
        <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Confirm your ISO Pro account</h1>
        <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">Thanks for signing up. Confirm your email address to finish creating your account.</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-radius: 50px; background-color: #1a1a1a;">
              <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 500; color: #ffffff; text-decoration: none;">Confirm your email</a>
            </td>
          </tr>
        </table>
        <p style="margin: 30px 0 10px 0; font-size: 14px; color: #6a6a6a;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="margin: 0; font-size: 13px; color: #6a6a6a; word-break: break-all;">{{ .ConfirmationURL }}</p>
      </td>
    </tr>
  </table>
</body>
</html>
```

If your dashboard currently shows the default text, it may look like this:

```html
<h2>Confirm your signup</h2>

<p>Follow this link to confirm your user:</p>
<p><a href="{{ .ConfirmationURL }}">Confirm your mail</a></p>
```

### Reset password

Subject:

`Reset your ISO Pro password`

HTML body:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your ISO Pro password</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #ffffff;">
    <tr>
      <td style="padding: 40px 30px;">
        <h1 style="margin: 0 0 20px 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">Reset your ISO Pro password</h1>
        <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.6; color: #4a4a4a;">We received a request to reset your password. Use the link below to choose a new one.</p>
        <table role="presentation" cellpadding="0" cellspacing="0">
          <tr>
            <td style="border-radius: 50px; background-color: #1a1a1a;">
              <a href="{{ .ConfirmationURL }}" style="display: inline-block; padding: 14px 32px; font-size: 15px; font-weight: 500; color: #ffffff; text-decoration: none;">Reset your password</a>
            </td>
          </tr>
        </table>
        <p style="margin: 30px 0 10px 0; font-size: 14px; color: #6a6a6a;">If the button does not work, copy and paste this link into your browser:</p>
        <p style="margin: 0 0 20px 0; font-size: 13px; color: #6a6a6a; word-break: break-all;">{{ .ConfirmationURL }}</p>
        <p style="margin: 0; font-size: 14px; color: #6a6a6a;">If you did not request this, you can ignore this message.</p>
      </td>
    </tr>
  </table>
</body>
</html>
```

### Optional brand note

If you want the emails to feel more branded, keep the copy short and use the same product name in the subject, heading, and sender name.

## Example provider settings

If you need a starting point, common SMTP providers use these patterns:

- Resend: use the SMTP credentials from your Resend dashboard
- SendGrid: use the API user and SMTP password from SendGrid
- Postmark: use the server token as the SMTP password and the Postmark SMTP host
- Amazon SES: use the SES SMTP endpoint for your region and the generated SMTP credentials

## Notes

- The default Supabase SMTP service is only for team/testing use and can be rate limited.
- If you want the sender name to stop saying Supabase, the fix is in SMTP/provider settings, not in the frontend code.
- The sender details section in SMTP settings is where you set the sender email address and the sender name that appears in the inbox.
- It is normal to test the auth flow on localhost first and only switch to the real domain when you are ready to launch.
- If you do not yet have a provider, create the email account and SMTP credentials first, then paste those values into Supabase.
- Keep the auth email body short and focused on the action the user must take.