exports.holidayReminderEmail = ({
  userName,
  holidayName,
  startDate,
  daysLeft,
  protectionAction,
  reduceBidPercent,
  dashboardUrl,
}) => {
  return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
      <!-- Header -->
      <div style="background:#2563eb; color:#ffffff; padding:20px; text-align:center;">
        <h2 style="margin:0;">Advertise IQ</h2>
      </div>

      <!-- Body -->
      <div style="padding:30px;">
        <p style="font-size:16px;">
          Hello <b>${userName || "there"}</b>,
        </p>

        <p style="font-size:15px; color:#333;">
          Just a quick reminder that <strong>${holidayName}</strong> is coming up
          ${
            startDate
              ? `on <strong>${startDate}</strong>`
              : ""
          } — only
          <strong>${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong> to go!
        </p>

        ${
          protectionAction
            ? `
        <p style="font-size:15px; color:#333;">
          If you’ve enabled holiday protection for this date, here’s what will happen automatically:
        </p>

        <ul style="font-size:14px; color:#444; padding-left:18px;">
          <li><strong>Action:</strong> ${protectionAction}</li>
          ${
            reduceBidPercent !== null
              ? `<li><strong>Bid Reduction:</strong> ${reduceBidPercent}%</li>`
              : ""
          }
        </ul>
        `
            : ""
        }

        <p style="font-size:15px; color:#333;">
          If you’d like to review or make any changes, please log in to your
          dashboard before the holiday begins.
        </p>

        <!-- CTA Button -->
        <div style="text-align:center; margin:26px 0;">
          <a
            href="${dashboardUrl}"
            style="
              display:inline-block;
              background:#2563eb;
              color:#ffffff !important;
              text-decoration:none;
              padding:12px 22px;
              border-radius:6px;
              font-size:14px;
              font-weight:bold;
            "
          >
            Review Holiday Settings
          </a>
        </div>

        <p style="font-size:14px; color:#666;">
          Let us know if you need help planning your campaigns around this period
          — we’re always happy to help.
        </p>

        <p style="font-size:14px; color:#999; margin-top:20px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};
