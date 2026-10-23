export const buildCronErrorEmail = ({ type, jobName, error }) => {
  const typeColorMap = {
    JOB_FAILED: "#d32f2f",
    CHANGE_STREAM_ERROR: "#f57c00",
    UNHANDLED_REJECTION: "#7b1fa2",
    UNCAUGHT_EXCEPTION: "#c62828",
    PROCESS_EXIT: "#455a64",
  };

  const headerColor = typeColorMap[type] || "#d32f2f";

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
          🚨 Cron Alert
        </h2>
        <p style="margin:4px 0 0;font-size:14px;opacity:0.9;">
          ${type}
        </p>
      </div>

      <!-- BODY -->
      <div style="padding:20px;">

        <!-- META INFO -->
        <div style="margin-bottom:16px;">
          <p style="margin:4px 0;">
            <strong>🧩 Job:</strong> ${jobName || "N/A"}
          </p>
          <p style="margin:4px 0;">
            <strong>🌍 Environment:</strong> ${process.env.NODE_ENV || "N/A"}
          </p>
          <p style="margin:4px 0;">
            <strong>⏰ Server Time:</strong> ${new Date().toLocaleString()}
          </p>
        </div>

        <!-- ERROR -->
        <div>
          <h3 style="
            margin-bottom:8px;
            color:#d32f2f;
            font-size:16px;
          ">
            ❌ Error Details
          </h3>

          <pre style="
            background:#f5f5f5;
            padding:12px;
            border-radius:6px;
            font-size:13px;
            overflow:auto;
            white-space:pre-wrap;
            word-break:break-word;
            color:#333;
          ">
${error || "No error details available"}
          </pre>
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
        AdvertiseIQ · Cron Monitoring System
      </div>

    </div>
  </div>
  `;
};
