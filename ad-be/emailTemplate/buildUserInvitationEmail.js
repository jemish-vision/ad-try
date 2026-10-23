exports.buildUserInvitationEmail = ({ organizationName, roleName, inviteUrl, rejectUrl }) => {
  const finalRejectUrl = rejectUrl || `${inviteUrl}&action=reject`;
  return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden; border:1px solid #e2e8f0;">
      
      <!-- Header -->
      <div style="background:linear-gradient(135deg, #2374F2, #1A9FD4); color:#ffffff; padding:24px; text-align:center;">
        <h2 style="margin:0; font-size:22px; font-weight:700;">Advertise IQ</h2>
      </div>

      <!-- Body -->
      <div style="padding:32px;">
        <p style="font-size:16px; color:#1e293b; margin-top:0;">
          Hello,
        </p>

        <p style="font-size:16px; color:#334155; line-height:1.6;">
          <b>${organizationName || "An organization"}</b> invites you to join our organization as <b>${roleName || "Member"}</b>.
        </p>

        <p style="font-size:15px; color:#475569; line-height:1.6;">
          Please select an option below to respond to this invitation:
        </p>

        <!-- Buttons -->
        <div style="text-align:center; margin:30px 0;">
          <a href="${inviteUrl}" target="_blank" rel="noopener noreferrer" style="
            background: linear-gradient(135deg, #2374F2, #1A9FD4);
            color: #ffffff;
            text-decoration: none;
            font-weight: 600;
            font-size: 15px;
            padding: 12px 28px;
            border-radius: 6px;
            display: inline-block;
            margin-right: 12px;
            margin-bottom: 10px;
            box-shadow: 0 4px 12px rgba(35, 116, 242, 0.25);
          ">
            Accept Invitation
          </a>
          <a href="${finalRejectUrl}" target="_blank" rel="noopener noreferrer" style="
            background: #ffffff;
            color: #64748b;
            text-decoration: none;
            font-weight: 600;
            font-size: 15px;
            padding: 11px 24px;
            border-radius: 6px;
            display: inline-block;
            margin-bottom: 10px;
            border: 1px solid #cbd5e1;
          ">
            Reject Invitation
          </a>
        </div>

        <p style="font-size:13px; color:#94a3b8; margin-top:28px; border-top:1px solid #e2e8f0; padding-top:16px;">
          This invitation will expire in 3 days. If you reject or ignore this invitation, it will become inactive.
        </p>

        <p style="font-size:13px; color:#94a3b8; margin-top:12px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};

