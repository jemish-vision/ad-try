exports.buildDisconnectReminderEmail = ({
  userName,
  profileNames,
  daysLeft,
  purgeDate,
  signInUrl,
  type = "all", // "ads" | "sp" | "all"
}) => {

  // Dynamic urgency styling based on days remaining
  let headerBg, urgencyIcon, urgencyText, stripBg, stripColor, stripIcon;
  let countdownBorder, countdownBg, countdownColor;

  if (daysLeft > 20) {
    headerBg = "#02468B";
    urgencyIcon = "&#128226;";
    urgencyText = "Reminder";
    stripBg = "#dbeafe";
    stripColor = "#1e40af";
    stripIcon = "&#128226;";
    countdownBorder = "#02468B";
    countdownBg = "#f0f5ff";
    countdownColor = "#02468B";
  } else if (daysLeft > 10) {
    headerBg = "linear-gradient(135deg,#02468B 0%,#c2410c 100%)";
    urgencyIcon = "&#9888;&#65039;";
    urgencyText = "Important reminder";
    stripBg = "#ffedd5";
    stripColor = "#c2410c";
    stripIcon = "&#9888;&#65039;";
    countdownBorder = "#ea580c";
    countdownBg = "#fff7f0";
    countdownColor = "#ea580c";
  } else if (daysLeft > 3) {
    headerBg = "linear-gradient(135deg,#991b1b 0%,#c2410c 100%)";
    urgencyIcon = "&#128308;";
    urgencyText = "Urgent: action required";
    stripBg = "#fee2e2";
    stripColor = "#b91c1c";
    stripIcon = "&#128308;";
    countdownBorder = "#dc2626";
    countdownBg = "#fff5f5";
    countdownColor = "#dc2626";
  } else {
    headerBg = "#5c0a0a";
    urgencyIcon = "&#128680;";
    urgencyText = "Final warning";
    stripBg = "#7f1d1d";
    stripColor = "#fee2e2";
    stripIcon = "&#128680;";
    countdownBorder = "#7f1d1d";
    countdownBg = "#fef2f2";
    countdownColor = "#7f1d1d";
  }

  let connectionName = "Amazon account connection";
  let dataList =
    "campaigns, keywords, orders, placements, search terms, and reports";

  if (type === "ads") {
    connectionName = "Amazon Advertising Connection";
    dataList =
      "ads campaigns, keywords, placements, search terms, targeting rules, and bidding settings";
  } else if (type === "sp") {
    connectionName = "Amazon Seller Partner (SP-API) Connection";
    dataList =
      "orders, order details, inventory logs, transaction logs, returns, and sales analytics reports";
  }

  return `
  <div style="font-family: Arial, sans-serif; background:#f0f4f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:10px; overflow:hidden; box-shadow:0 2px 12px rgba(2,70,139,0.10);">

      <!-- Urgency Strip -->
      <div style="background:${stripBg}; color:${stripColor}; padding:9px 16px; text-align:center; font-size:13px; font-weight:700; letter-spacing:0.5px;">
        ${stripIcon} ${urgencyText} — ${daysLeft} day${daysLeft !== 1 ? "s" : ""} left
      </div>

      <!-- Header -->
      <div style="background:${headerBg}; color:#ffffff; padding:24px 28px 20px;">
        <div style="font-size:13px; letter-spacing:1.5px; text-transform:uppercase; opacity:0.75; margin-bottom:6px;">AdvertiseIQ</div>
        <h2 style="margin:0; font-size:22px; font-weight:700;">${urgencyIcon} ${urgencyText}</h2>
      </div>

      <!-- Body -->
      <div style="padding:28px 28px 20px;">
        <p style="font-size:16px; color:#1a2940; margin:0 0 12px;">
          Hello <b style="color:#02468B;">${userName || "there"}</b>,
        </p>

        <p style="font-size:15px; color:#374151; line-height:1.6; margin:0 0 16px;">
          This is a reminder that your <strong>${connectionName}</strong> on
          <strong>AdvertiseIQ</strong> is currently disconnected.
        </p>

        <!-- Countdown Box -->
        <div style="border:2px solid ${countdownBorder}; border-radius:8px; padding:18px 20px; text-align:center; margin:16px 0; background:${countdownBg};">
          <p style="margin:0 0 4px; font-size:13px; color:#6b7280;">Your data will be permanently deleted in</p>
          <p style="margin:0; font-size:40px; font-weight:800; color:${countdownColor}; line-height:1;">${daysLeft}</p>
          <p style="margin:4px 0 0; font-size:12px; color:#9ca3af;">day${daysLeft !== 1 ? "s" : ""} &nbsp;·&nbsp; on ${purgeDate}</p>
        </div>

        <!-- Profile Info -->
        <div style="background:#f0f5ff; border-left:4px solid #02468B; border-radius:0 6px 6px 0; padding:12px 16px; margin:14px 0;">
          <p style="margin:0 0 2px; font-size:12px; color:#6b7280;">Affected profile / account</p>
          <p style="margin:0; font-size:15px; font-weight:600; color:#02468B;">${profileNames || "All linked profiles"}</p>
        </div>

        <p style="font-size:15px; color:#374151; line-height:1.6; margin:12px 0;">
          Once deleted, your <strong>${dataList}</strong> cannot be recovered.
        </p>

        <p style="font-size:15px; color:#374151; font-weight:600; margin-top:14px;">
          To keep your data, sign in again now:
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
          Signing in will immediately reactivate your connection and your data
          will remain safe.
        </p>

        <hr style="border:none; border-top:1px solid #e5e7eb; margin:20px 0;" />

        <p style="font-size:13px; color:#9ca3af; line-height:1.6;">
          You are receiving this email because your connection was disconnected.
          If you no longer wish to use our service, no action is needed — your
          data will be automatically removed on ${purgeDate}.
        </p>

        <p style="font-size:13px; color:#9ca3af; margin-top:16px;">
          © ${new Date().getFullYear()} <strong style="color:#02468B;">AdvertiseIQ</strong>
        </p>
      </div>

    </div>
  </div>
  `;
};