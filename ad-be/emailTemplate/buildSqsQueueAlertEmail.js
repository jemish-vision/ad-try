export const buildSqsQueueAlertEmail = ({
  queueName,
  visibleCount,
  inFlightCount,
  delayedCount,
  totalCount
}) => {

  const headerColor = "#f57c00";

  return `
  <div style="
    font-family: Arial, sans-serif;
    background:#f4f6f8;
    padding:20px;
  ">

    <div style="
      max-width:650px;
      margin:auto;
      background:#ffffff;
      border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.08);
      overflow:hidden;
    ">

      <!-- HEADER -->
      <div style="
        background:${headerColor};
        padding:16px 20px;
        color:#ffffff;
      ">
        <h2 style="margin:0;font-size:20px;">
          📩 SQS Queue Alert
        </h2>
        <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">
          Pending Message Threshold Exceeded
        </p>
      </div>

      <!-- BODY -->
      <div style="padding:20px;">

        <!-- META INFO -->
        <div style="margin-bottom:16px;">
          <p style="margin:4px 0;">
            <strong>📦 Queue Name:</strong> ${queueName || "N/A"}
          </p>
        </div>

        <!-- QUEUE METRICS -->
        <div>
          <h3 style="
            margin-bottom:8px;
            color:#d32f2f;
            font-size:16px;
          ">
            📊 Queue Metrics
          </h3>

          <div style="
            background:#f5f5f5;
            padding:12px;
            border-radius:6px;
            font-size:13px;
            color:#333;
          ">
            <p style="margin:6px 0;">
              <strong>Visible (Pending):</strong> ${visibleCount || 0}
            </p>
            <p style="margin:6px 0;">
              <strong>In-Flight (Processing):</strong> ${inFlightCount || 0}
            </p>
            <p style="margin:6px 0;">
              <strong>Delayed:</strong> ${delayedCount || 0}
            </p>
            <p style="margin:6px 0;">
              <strong>Total Approximate:</strong> ${totalCount || 0}
            </p>
          </div>
        </div>

        <!-- RECOMMENDATION -->
        <div style="margin-top:18px;">
          <h3 style="
            margin-bottom:8px;
            color:#f57c00;
            font-size:16px;
          ">
            🛠 Recommended Action
          </h3>

          <p style="margin:6px 0;font-size:14px;color:#444;">
            The queue backlog has exceeded the configured threshold.
            Please verify:
          </p>

          <ul style="margin:8px 0 0 18px;font-size:14px;color:#444;">
            <li>Worker service status</li>
            <li>MongoDB connectivity and performance</li>
            <li>Processing latency or failures</li>
            <li>Infrastructure resource usage (CPU / Memory)</li>
          </ul>
        </div>

      </div>

      <!-- FOOTER -->
      <div style="
        background:#fafafa;
        padding:12px 20px;
        font-size:12px;
        color:#777;
        text-align:center;
      ">
        AdvertiseIQ · SQS Monitoring System
      </div>

    </div>
  </div>
  `;
};