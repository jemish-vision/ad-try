exports.specialDayReminderEmail = ({
  userName,
  specialDayName,
  startDate,
  daysLeft,
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
          Just a quick reminder that <strong>${specialDayName}</strong> is coming up
          ${
            startDate
              ? `on <strong>${startDate}</strong>`
              : ""
          } — only
          <strong>${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong> to go!
        </p>

        <p style="font-size:15px; color:#333;">
          We wanted to make sure you have enough time to review your plans and
          prepare your campaigns ahead of the day.
        </p>

        <p style="font-size:15px; color:#333;">
          If you’d like to make any updates or adjustments, please log in to your
          dashboard before the special day begins.
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
            Review Special Day
          </a>
        </div>

        <p style="font-size:14px; color:#666;">
          Our team is always here to help you get the most out of important dates
          — simply reply to this email if you need assistance.
        </p>

        <p style="font-size:14px; color:#999; margin-top:20px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};
