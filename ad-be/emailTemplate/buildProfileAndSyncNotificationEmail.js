function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatIstDate(dateValue = new Date()) {
  return (
    new Date(dateValue).toLocaleString("en-US", {
      timeZone: "Asia/Kolkata",
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    }) + " (IST)"
  );
}

function renderKeyValueRows(rows) {
  return rows
    .filter((row) => row && row.value !== undefined && row.value !== null && row.value !== "")
    .map(
      (row, idx) => `
        <tr style="border-bottom:1px solid #e5e7eb; background:${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:10px 12px; color:#6b7280; font-weight:600; width:40%; background:#f9fafb;">${escapeHtml(row.label)}</td>
          <td style="padding:10px 12px; color:${row.color || "#111827"}; ${row.mono ? "font-family:monospace;" : ""} ${row.bold ? "font-weight:700;" : ""}">${row.rawHtml ? row.value : escapeHtml(row.value)}</td>
        </tr>
      `
    )
    .join("");
}

function renderEmailShell({ badge, title, intro, sectionsHtml }) {
  return `
  <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background:#f0f4f8; padding:30px 15px;">
    <div style="max-width:640px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 4px 16px rgba(2,70,139,0.10);">
      <div style="background:#02468B; color:#ffffff; padding:24px 28px 20px;">
        <div style="font-size:12px; letter-spacing:1.5px; text-transform:uppercase; opacity:0.8; margin-bottom:6px;">AdvertiseIQ Notification</div>
        <h2 style="margin:0; font-size:22px; font-weight:700;">${escapeHtml(title)}</h2>
        <div style="display:inline-block; background:rgba(255,255,255,0.18); border-radius:4px; padding:3px 10px; font-size:12px; font-weight:600; letter-spacing:0.5px; margin-top:8px;">
          ${escapeHtml(badge)}
        </div>
      </div>

      <div style="padding:28px;">
        <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 20px;">
          ${intro}
        </p>

        ${sectionsHtml}

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:24px 0 16px;" />

        <p style="font-size:12px; color:#9ca3af; margin:0; line-height:1.5;">
          This is an automated notification from AdvertiseIQ for the development and admin operations team.
        </p>
        <p style="font-size:12px; color:#9ca3af; margin:6px 0 0;">
          © ${new Date().getFullYear()} <strong style="color:#02468B;">AdvertiseIQ</strong>. All rights reserved.
        </p>
      </div>
    </div>
  </div>
  `;
}

function renderUserOrgSection(user, organization) {
  const userEmail = user?.email || "";
  const emailCell = userEmail
    ? `<a href="mailto:${escapeHtml(userEmail)}" style="color:#02468B; text-decoration:none; font-weight:600;">${escapeHtml(userEmail)}</a>`
    : "N/A";

  return `
    <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
      User &amp; Organization Info
    </h3>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
      <tbody>
        ${renderKeyValueRows([
          { label: "User Full Name", value: user?.fullName || "N/A", bold: true },
          { label: "User Email", value: emailCell, rawHtml: Boolean(userEmail) },
          { label: "Company Name", value: user?.companyName || organization?.organizationName || "N/A" },
          { label: "Organization", value: organization?.organizationName || "Default Organization" },
          { label: "Subscription Plan", value: organization?.planId?.planName || organization?.planId?.name || "Trial / Standard" },
        ])}
      </tbody>
    </table>
  `;
}

exports.buildNewProfileConnectionEmail = ({
  user,
  organization,
  config,
  profiles = [],
  connectedAt = new Date(),
  ipAddress,
}) => {
  const formattedDate = formatIstDate(connectedAt);
  const profileRows = (profiles || [])
    .map(
      (p, idx) => `
        <tr style="border-bottom:1px solid #e5e7eb; background:${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:10px 12px; font-weight:600; color:#111827;">${escapeHtml(p.name || "N/A")}</td>
          <td style="padding:10px 12px; font-family:monospace; color:#374151;">${escapeHtml(p.profileId || "N/A")}</td>
          <td style="padding:10px 12px; color:#374151;">${escapeHtml(p.countryCode || "N/A")}</td>
          <td style="padding:10px 12px; color:#374151;">${escapeHtml(p.currencyCode || "N/A")}</td>
          <td style="padding:10px 12px; color:#374151; text-transform:capitalize;">${escapeHtml(p.type || "seller")}</td>
        </tr>
      `
    )
    .join("");

  const sectionsHtml = `
    <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:16px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
      Connection Summary
    </h3>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
      <tbody>
        ${renderKeyValueRows([
          { label: "Account / Config Name", value: config?.companyName || "N/A", bold: true },
          { label: "New Profiles Connected", value: String(profiles.length), bold: true, color: "#059669" },
          { label: "Connection Time", value: formattedDate },
          { label: "IP Address", value: ipAddress || "", mono: true },
        ])}
      </tbody>
    </table>

    ${renderUserOrgSection(user, organization)}

    <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
      Connected Advertising Profile(s)
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
  `;

  return renderEmailShell({
    badge: "Amazon Advertising Profile Connected",
    title: "New Advertising Profile Connected",
    intro: "A user has connected <strong>" + escapeHtml(String(profiles.length)) + "</strong> new advertising profile(s) on <strong>AdvertiseIQ</strong>.",
    sectionsHtml,
  });
};

exports.buildDataSyncRequestEmail = ({
  user,
  organization,
  config,
  profile,
  profileId,
  type = "ads",
  requestedRecords = [],
  groups = [],
  requestedAt = new Date(),
  ipAddress,
}) => {
  const formattedDate = formatIstDate(requestedAt);
  const groupTitleById = new Map((groups || []).map((g) => [g.id, g.title || g.id]));
  const syncLabel = type === "seller" ? "Seller Central (SP-API)" : "Amazon Ads";

  const requestRows = (requestedRecords || [])
    .map((record, idx) => {
      const groupTitle = groupTitleById.get(record.groupId) || record.groupId;
      return `
        <tr style="border-bottom:1px solid #e5e7eb; background:${idx % 2 === 0 ? "#ffffff" : "#f9fafb"};">
          <td style="padding:10px 12px; font-weight:600; color:#111827;">${escapeHtml(groupTitle)}</td>
          <td style="padding:10px 12px; font-family:monospace; color:#374151;">${escapeHtml(record.groupId)}</td>
          <td style="padding:10px 12px; font-weight:600; color:#111827;">${escapeHtml(String(record.selectedSyncDays))} days</td>
          <td style="padding:10px 12px; color:#d97706; font-weight:700;">${escapeHtml(record.requestStatus || "PENDING")}</td>
        </tr>
      `;
    })
    .join("");

  const sectionsHtml = `
    <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:16px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
      Data Request Details
    </h3>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:14px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
      <tbody>
        ${renderKeyValueRows([
          { label: "Sync Source", value: syncLabel, bold: true },
          { label: "Profile Name", value: profile?.name || "N/A", bold: true },
          { label: "Profile ID", value: String(profile?.profileId || profileId || "N/A"), mono: true },
          { label: "Country / Currency", value: [profile?.countryCode, profile?.currencyCode].filter(Boolean).join(" / ") || "N/A" },
          { label: "Account / Config Name", value: config?.companyName || "N/A" },
          { label: "Status", value: "Pending Super Admin Approval", bold: true, color: "#d97706" },
          { label: "Requested At", value: formattedDate },
          { label: "IP Address", value: ipAddress || "", mono: true },
        ])}
      </tbody>
    </table>

    ${renderUserOrgSection(user, organization)}

    <h3 style="font-size:14px; font-weight:700; color:#02468B; margin:20px 0 8px; text-transform:uppercase; letter-spacing:0.5px;">
      Requested Data Groups (${escapeHtml(String(requestedRecords.length))})
    </h3>
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; font-size:13px; border:1px solid #e5e7eb; border-radius:6px; overflow:hidden;">
      <thead>
        <tr style="background:#02468B; color:#ffffff;">
          <th style="padding:9px 12px; text-align:left;">Data Group</th>
          <th style="padding:9px 12px; text-align:left;">Group ID</th>
          <th style="padding:9px 12px; text-align:left;">Retention / Days</th>
          <th style="padding:9px 12px; text-align:left;">Status</th>
        </tr>
      </thead>
      <tbody>
        ${requestRows}
      </tbody>
    </table>
  `;

  return renderEmailShell({
    badge: `${syncLabel} Data Sync Request`,
    title: "New Profile Data Sync Requested",
    intro: `A user has requested historical data synchronization for <strong>${escapeHtml(profile?.name || `Profile ${profileId}`)}</strong>. Please review and approve it in Super Admin.`,
    sectionsHtml,
  });
};
