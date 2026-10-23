exports.buildSupportTicketEmail = ({
  userName,
  ticketId,
  message,
  chatLink,
  fileUrl,
  type = "reply", // "created" | "reply"
}) => {
  const isCreated = type === "created";

  return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
      <!-- Header -->
      <div style="background:#2563eb; color:#ffffff; padding:20px; text-align:center;">
        <h2 style="margin:0;">
          Advertise IQ – ${isCreated ? "Ticket Created" : "New Support Reply"}
        </h2>
      </div>

      <!-- Body -->
      <div style="padding:30px;">
        <p style="font-size:16px;">
          Hello <b>${userName || "there"}</b>,
        </p>

        <p style="font-size:15px; color:#333;">
          ${isCreated
      ? "Your support ticket has been created successfully."
      : "You have received a new reply from our support team."
    }
        </p>

        <p style="font-size:14px; color:#333;">
          <strong>Ticket ID:</strong> ${ticketId}
        </p>

        <!-- Message -->
        <div style="
          background:#f5f7fa;
          border:1px solid #e5e7eb;
          border-radius:6px;
          padding:16px;
          padding-top:0px;
          margin:20px 0;
          font-size:14px;
          color:#333;
          white-space:pre-wrap;
        ">
          <br>${(message || "No message content.").trim()}
        </div>

        ${fileUrl ? `
          <div style="margin:20px 0;">
            <p style="font-size:14px; font-weight:600; margin-bottom:8px;">
              Attached Screenshot:
            </p>
            <a href="${fileUrl}" target="_blank">
              <img
                src="${fileUrl}"
                alt="Screenshot"
                style="
                  max-width:100%;
                  border-radius:6px;
                  border:1px solid #e5e7eb;
                "
              />
            </a>
          </div>
        ` : ""}

        <!-- CTA -->
        <div style="text-align:center; margin:30px 0;">
          <a href="${chatLink}"
            style="
              background:#2563eb;
              color:#ffffff;
              padding:12px 22px;
              border-radius:6px;
              text-decoration:none;
              font-size:14px;
              display:inline-block;
            ">
            View & Reply to Ticket
          </a>
        </div>

        <p style="font-size:13px; color:#666;">
          You can continue this conversation anytime using the link above.
        </p>

        <p style="font-size:12px; color:#999; margin-top:20px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>
    </div>
  </div>
  `;
};
