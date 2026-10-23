exports.forgotPasswordTemplate = ({ fullName, resetLink }) => {
    return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
      <div style="background:#2563eb; color:#ffffff; padding:20px; text-align:center;">
        <h2 style="margin:0;">Advertise IQ</h2>
      </div>

      <div style="padding:30px;">
        <p style="font-size:16px;">Hello <b>${fullName}</b>,</p>

        <p style="font-size:15px; color:#333;">
          We received a request to reset your password.  
          Click the button below to proceed.
        </p>

        <div style="text-align:center; margin:30px 0;">
          <a href="${resetLink}" 
             style="background:#2563eb; color:#ffffff; padding:12px 24px;
                    text-decoration:none; border-radius:6px; font-weight:600;">
            Reset Password
          </a>
        </div>

        <p style="font-size:14px; color:#666;">
          If you did not request this, you can safely ignore this email.
        </p>

        <p style="font-size:14px; color:#999;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};
