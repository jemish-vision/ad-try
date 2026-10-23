exports.trialEndReminderEmail = ({
  userName,
  daysLeft,
  endDate,
  billingUrl,
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
          Just a friendly reminder that your free trial with
          <strong>Advertise IQ</strong> will end in
          <strong>${daysLeft} day${daysLeft > 1 ? "s" : ""}</strong>
          ${endDate ? `on <strong>${endDate}</strong>` : ""}.
        </p>

        <p style="font-size:15px; color:#333;">
          To avoid any interruption in service, please make sure your billing
          details are up to date before the trial expires.
        </p>

        <!-- CTA Button -->
        <div style="text-align:center; margin:26px 0;">
          <a
            href="${billingUrl}"
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
            Manage Subscription
          </a>
        </div>

        <p style="font-size:14px; color:#555;">
          If you already updated your billing information, you’re all set —
          thanks for being with us!
        </p>

        <p style="font-size:14px; color:#666;">
          Need help? Just reply to this email and our support team will be happy
          to assist you.
        </p>

        <p style="font-size:14px; color:#999; margin-top:20px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};
