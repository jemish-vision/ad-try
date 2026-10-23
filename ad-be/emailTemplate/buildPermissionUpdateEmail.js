exports.buildPermissionUpdateEmail = ({ userName, dashboardUrl }) => {
  return `
  <div style="font-family: Arial, sans-serif; background:#f0f4f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(2,70,139,0.10);">

      <!-- Header -->
      <div style="background:#02468B; color:#ffffff; padding:24px 28px 20px;">
        <div style="font-size:13px; letter-spacing:1.5px; text-transform:uppercase; opacity:0.75; margin-bottom:6px;">AdvertiseIQ</div>
        <h2 style="margin:0; font-size:22px; font-weight:700;">🔔 Your Permissions Have Been Updated</h2>
      </div>

      <!-- Body -->
      <div style="padding:28px 28px 20px;">
        <p style="font-size:16px; color:#1a2940; margin:0 0 12px;">
          Hello <b style="color:#02468B;">${userName || "there"}</b>,
        </p>

        <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px;">
          Your account permissions on <strong>AdvertiseIQ</strong> have been updated by your <strong>Super Admin</strong>.
        </p>

        <!-- Info Box -->
        <div style="background:#f0f5ff; border-left:4px solid #02468B; border-radius:0 6px 6px 0; padding:16px 20px; margin:16px 0;">
          <p style="margin:0 0 6px; font-size:13px; color:#6b7280;">What this means for you</p>
          <p style="margin:0; font-size:15px; color:#1a2940; line-height:1.6;">
            ✅ Your updated permissions are now <strong>active</strong>.<br/>
            ✅ You can now <strong>log in</strong> and access your dashboard.<br/>
            ✅ Check your dashboard to see what's available to you.
          </p>
        </div>

        <p style="font-size:15px; color:#374151; font-weight:600; margin-top:14px;">
          Sign in to access your updated dashboard:
        </p>

        <!-- CTA Button -->
        <div style="text-align:center; margin:22px 0 16px;">
          <a
            href="${dashboardUrl}"
            style="
              display:inline-block;
              background:#02468B;
              color:#ffffff !important;
              text-decoration:none;
              padding:14px 36px;
              border-radius:7px;
              font-size:16px;
              font-weight:700;
              letter-spacing:0.3px;
            "
          >
            Sign In & View Dashboard
          </a>
        </div>

        <p style="font-size:14px; color:#6b7280; line-height:1.5; text-align:center;">
          After signing in, you will be automatically redirected to your dashboard.
        </p>

        <p style="font-size:14px; color:#6b7280; line-height:1.5; text-align:center;">
          If you have any questions about your permissions, please contact your administrator.
        </p>

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

        <p style="font-size:13px; color:#9ca3af; line-height:1.6; text-align:justify;">
          You are receiving this email because your role permissions were recently updated by a Super Admin.
          If you think this was a mistake, please reach out to your administrator.
        </p>

        <p style="font-size:13px; color:#9ca3af; margin-top:16px; text-align:center;">
          © ${new Date().getFullYear()} <strong style="color:#02468B;">AdvertiseIQ</strong>
        </p>
      </div>

    </div>
  </div>
  `;
};