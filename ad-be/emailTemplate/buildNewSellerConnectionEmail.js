exports.buildNewSellerConnectionEmail = ({
  sellerId,
  user,
  organization,
  source = "Amazon Selling Partner Appstore",
  profiles = [],
  connectedAt = new Date(),
  ipAddress,
  userAgent,
}) => {
  const formattedDate = new Date(connectedAt).toLocaleString("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  }) + " (IST)";

  const profileRows = (profiles && profiles.length > 0)
    ? profiles.map((p, idx) => `
        <tr style="border-bottom:1px solid #e5e7eb; background:${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:10px 12px; font-weight:600; color:#111827;">${p.name || "N/A"}</td>
          <td style="padding:10px 12px; font-family:monospace; color:#374151;">${p.profileId || "N/A"}</td>
          <td style="padding:10px 12px; color:#374151;">${p.countryCode || "N/A"}</td>
          <td style="padding:10px 12px; color:#374151;">${p.currencyCode || "N/A"}</td>
          <td style="padding:10px 12px; color:#374151; text-transform:capitalize;">${p.type || "seller"}</td>
        </tr>
      `).join("")
    : `
        <tr>
          <td colspan="5" style="padding:12px; text-align:center; color:#6b7280; font-style:italic;">
            No advertising profiles linked yet. Profiles will be synced upon user selection in Settings.
          </td>
        </tr>
      `;

  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f0f4f8; padding:30px 15px;">
    <div style="max-width:640px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 16px rgba(2,70,139,0.10);">
      
      <!-- Header -->
      <div style="background:#02468B; color:#ffffff; padding:24px 28px 20px;">
        <div style="font-size:12px; letter-spacing:1.5px; text-transform:uppercase; opacity:0.8; margin-bottom:6px;">AdvertiseIQ Notification</div>
        <h2 style="margin:0; font-size:22px; font-weight:700;">&#128279; New Seller Account Connected</h2>
        <div style="display:inline-block; background:rgba(255,255,255,0.18); border-radius:4px; padding:3px 10px; font-size:12px; font-weight:600; letter-spacing:0.5px; margin-top:8px;">
          Amazon Selling Partner (SP-API)
        </div>
      </div>

      <!-- Content -->
      <div style="padding:28px;">
        <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 20px;">
          A new Amazon Seller account has been authorized and connected to <strong>AdvertiseIQ</strong>. The connection details are summarized below:
        </p>

        <!-- Section 1: Amazon Seller Account Details -->
        <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:16px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
          Amazon Seller Account Details
        </h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
          <tbody>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; width:40%; background:#f9fafb;">Amazon Seller ID (Merchant ID)</td>
              <td style="padding:10px 12px; color:#111827; font-weight:700; font-family:monospace;">${sellerId || "N/A"}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">Connection Status</td>
              <td style="padding:10px 12px; color:#059669; font-weight:700;">&#10004; Active / Authorized</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">Authorization Source</td>
              <td style="padding:10px 12px; color:#111827;">${source}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">Connection Time</td>
              <td style="padding:10px 12px; color:#111827;">${formattedDate}</td>
            </tr>
            ${ipAddress ? `
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">IP Address</td>
              <td style="padding:10px 12px; color:#374151; font-family:monospace;">${ipAddress}</td>
            </tr>
            ` : ''}
          </tbody>
        </table>

        <!-- Section 2: User & Organization Details -->
        <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
          User & Organization Info
        </h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
          <tbody>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; width:40%; background:#f9fafb;">User Full Name</td>
              <td style="padding:10px 12px; color:#111827; font-weight:600;">${user?.fullName || "N/A"}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">User Email</td>
              <td style="padding:10px 12px; color:#111827;"><a href="mailto:${user?.email || ""}" style="color:#02468B; text-decoration:none; font-weight:600;">${user?.email || "N/A"}</a></td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">Company Name</td>
              <td style="padding:10px 12px; color:#111827;">${user?.companyName || organization?.organizationName || "N/A"}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">Organization</td>
              <td style="padding:10px 12px; color:#111827;">${organization?.organizationName || "Default Organization"}</td>
            </tr>
            <tr style="border-bottom:1px solid #e5e7eb;">
              <td style="padding:10px 12px; color:#6b7280; font-weight:600; background:#f9fafb;">Subscription Plan</td>
              <td style="padding:10px 12px; color:#111827;">${organization?.planId?.planName || "Trial / Standard"}</td>
            </tr>
          </tbody>
        </table>

        <!-- Section 3: Linked Profiles -->
        <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
          Linked Advertising Profile(s)
        </h3>
        <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:13px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
          <thead>
            <tr style="background:#02468B; color:#ffffff;">
              <th style="padding:9px 12px; text-align:left;">Profile Name</th>
              <th style="padding:9px 12px; text-align:left;">Profile ID</th>
              <th style="padding:9px 12px; text-align:left;">Country</th>
              <th style="padding:9px 12px; text-align:left;">Currency</th>
              <th style="padding:9px 12px; text-align:left;">Type</th>
            </tr>
          </thead>
          <tbody>
            ${profileRows}
          </tbody>
        </table>

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0 16px;" />

        <p style="font-size:12px; color:#9ca3af; margin:0; line-height:1.5;">
          This is an automated notification from AdvertiseIQ. You received this email because you are registered as a system administrator.
        </p>
        <p style="font-size:12px; color:#9ca3af; margin:6px 0 0;">
          © ${new Date().getFullYear()} <strong style="color:#02468B;">AdvertiseIQ</strong>. All rights reserved.
        </p>
      </div>

    </div>
  </div>
  `;
};
