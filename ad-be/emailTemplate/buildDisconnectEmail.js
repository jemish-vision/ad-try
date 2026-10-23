exports.buildDisconnectEmail = ({
  userName,
  profileNames,
  purgeDate,
  signInUrl,
  type = "all", // "ads" | "sp" | "all"
}) => {
  let connectionName = "Amazon account";
  let dataList =
    "campaigns, keywords, orders, placements, search terms, and reports";

  if (type === "ads") {
    connectionName = "Amazon Advertising Connection";
    dataList =
      "ads campaigns, keywords, placements, search terms, targeting rules, and campaign performance settings";
  } else if (type === "sp") {
    connectionName = "Amazon Seller Partner (SP-API) Connection";
    dataList =
      "orders, order details, inventory logs, transaction logs, returns, and sales analytics reports";
  }

  return `
  <div style="font-family: Arial, sans-serif; background:#f0f4f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(2,70,139,0.10);">

      <!-- Header -->
      <div style="background:#02468B; color:#ffffff; padding:24px 28px 20px;">
        <div style="font-size:13px; letter-spacing:1.5px; text-transform:uppercase; opacity:0.75; margin-bottom:6px;">AdvertiseIQ</div>
        <h2 style="margin:0; font-size:22px; font-weight:700;">&#9888; Connection disconnected</h2>
        <div style="display:inline-block; background:rgba(255,255,255,0.18); border-radius:4px; padding:2px 10px; font-size:12px; font-weight:600; letter-spacing:0.5px; margin-top:8px;">
          ${connectionName}
        </div>
      </div>

      <!-- Body -->
      <div style="padding:28px 28px 20px;">
        <p style="font-size:16px; color:#1a2940; margin:0 0 12px;">
          Hello <b style="color:#02468B;">${userName || "there"}</b>,
        </p>

        <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px;">
          Your <strong>${connectionName}</strong> has been <strong>disconnected</strong> from
          <strong>AdvertiseIQ</strong>.
        </p>

        <!-- Profile Info Box -->
        <div style="background:#f0f5ff; border-left:4px solid #02468B; border-radius:0 6px 6px 0; padding:12px 16px; margin:14px 0;">
          <p style="margin:0 0 2px; font-size:12px; color:#6b7280;">Affected profiles / accounts</p>
          <p style="margin:0; font-size:15px; font-weight:600; color:#02468B;">${profileNames || "All linked profiles"}</p>
        </div>

        <p style="font-size:15px; color:#374151; line-height:1.6; margin:12px 0;">
          All related data — including
          <strong style="color:#dc2626;">${dataList}</strong> — will be
          <strong style="color:#dc2626;">permanently deleted on ${purgeDate}</strong>
          (30 days from now) under our Data Protection Policy.
        </p>

        <p style="font-size:15px; color:#374151; line-height:1.6; margin-top:14px;">
          To keep your data, sign in again to reactivate your connection:
        </p>

        <!-- CTA Button -->
        <div style="text-align:center; margin:22px 0 16px;">
          <a
            href="${signInUrl}"
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
            Sign In & Connect
          </a>
        </div>

        <p style="font-size:14px; color:#6b7280; line-height:1.5;">
          By signing in before <strong>${purgeDate}</strong>, your connection
          will be reactivated and all your data will remain safe.
        </p>

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

        <p style="font-size:13px; color:#9ca3af; line-height:1.6;">
          If you intended to disconnect and want your data removed, no action
          is needed. Your data will be automatically cleaned up after 30 days
          as per our Data Protection Policy.
        </p>

        <p style="font-size:13px; color:#9ca3af; margin-top:16px;">
          © ${new Date().getFullYear()} <strong style="color:#02468B;">AdvertiseIQ</strong>
        </p>
      </div>

    </div>
  </div>
  `;
};