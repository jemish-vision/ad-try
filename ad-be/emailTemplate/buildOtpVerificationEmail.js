exports.buildOtpVerificationEmail = ({
    userName,
    otp,
    expiresIn = "5 minutes"
}) => {
    return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
      <!-- Header -->
      <div style="background:#2563eb; color:#ffffff; padding:20px; text-align:center;">
        <h2 style="margin:0;">
          Advertise IQ – OTP Verification
        </h2>
      </div>

      <!-- Body -->
      <div style="padding:30px;">
        <p style="font-size:16px;">
          Hello <b>${userName || "there"}</b>,
        </p>

        <p style="font-size:15px; color:#333;">
          To complete your signup, please verify your email address using the OTP below.
        </p>

        <!-- OTP Box -->
        <div style="
          background:#f5f7fa;
          border:1px solid #e5e7eb;
          border-radius:6px;
          padding:20px;
          margin:25px 0;
          text-align:center;
        ">
          <p style="margin:0; font-size:14px; color:#666;">Your One-Time Password (OTP)</p>
          <p style="
            font-size:28px;
            font-weight:bold;
            letter-spacing:4px;
            color:#2563eb;
            margin:10px 0 0;
          ">
            ${otp}
          </p>
        </div>

        <p style="font-size:14px; color:#333;">
          This OTP is valid for <b>${expiresIn}</b>. Please do not share it with anyone.
        </p>

        <p style="font-size:13px; color:#666; margin-top:20px;">
          If you did not request this verification, you can safely ignore this email.
        </p>

        <p style="font-size:12px; color:#999; margin-top:25px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>
    </div>
  </div>
  `;
};
