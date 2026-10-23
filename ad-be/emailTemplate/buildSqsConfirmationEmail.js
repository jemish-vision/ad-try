exports.buildSqsConfirmationEmail = ({ topicArn, subscribeUrl, requestBody }) => {
  // Format JSON with indentation
  const formattedJson = JSON.stringify(requestBody, null, 2)
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:30px;">
    <div style="max-width:700px; margin:auto; background:#ffffff; border-radius:8px; overflow:hidden;">
      
      <!-- Header -->
      <div style="background:#2563eb; color:#ffffff; padding:20px; text-align:center;">
        <h2 style="margin:0;">Advertise IQ</h2>
      </div>

      <!-- Body -->
      <div style="padding:30px;">
        <p style="font-size:16px;">
          Hello,
        </p>

        <p style="font-size:15px; color:#333;">
          We have received an <strong>SNS subscription request</strong> for one of our SQS queues.
          The subscription is currently in <strong>Pending Confirmation</strong> status.
        </p>

        <p style="font-size:15px; color:#333;">
          To activate the subscription and start receiving messages, please confirm it using the link below.
        </p>

        <!-- Subscription Details -->
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
            <strong>Topic ARN:</strong> ${topicArn}
          </p>

          <p style="margin:6px 0;">
            <strong>Confirmation URL:</strong>
            <a href="${subscribeUrl}" target="_blank" style="color:#2563eb;">
              Confirm Subscription
            </a>
          </p>
        </div>

        <p style="font-size:15px; color:#333;">
          <strong>SNS Request Body:</strong>
        </p>

        <!-- Request Body -->
        <pre style="
          background:#111827;
          color:#e5e7eb;
          padding:16px;
          border-radius:6px;
          font-size:12px;
          overflow:auto;
        ">${formattedJson}</pre>

        <p style="font-size:14px; color:#555; margin-top:20px;">
          Please confirm the subscription to enable message delivery to the SQS queue.
        </p>

        <p style="font-size:14px; color:#666;">
          If you have any questions, please contact the Advertise IQ support team.
        </p>

        <p style="font-size:14px; color:#999; margin-top:20px;">
          © ${new Date().getFullYear()} Advertise IQ
        </p>
      </div>

    </div>
  </div>
  `;
};