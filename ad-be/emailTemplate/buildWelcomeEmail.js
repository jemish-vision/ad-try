exports.buildWelcomeEmail = ({ userName, userId, password }) => {
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
          Welcome to <strong>Advertise IQ</strong>!  
          Your account has been created successfully.
        </p>

        <p style="font-size:15px; color:#333;">
          Below are your login credentials:
        </p>

        <!-- Credentials -->
        <div style="
          background:#f5f7fa;
          border:1px solid #e5e7eb;
          border-radius:6px;
          padding:16px;
          margin:20px 0;
          font-size:14px;
          color:#333;
        ">
          <p style="margin:6px 0;">
            <strong>User ID:</strong> ${userId}
          </p>
          <p style="margin:6px 0;">
            <strong>Temporary Password:</strong> ${password}
          </p>
        </div>

        <p style="font-size:14px; color:#555;">
          ⚠️ For security reasons, please log in and change your password immediately.
        </p>

        <p style="font-size:14px; color:#666;">
          If you have any questions, feel free to contact our support team.
        </p>

        <p style="font-size:14px; color:#999; margin-top:20px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};
