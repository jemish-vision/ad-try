export const buildServiceAlertEmail = ({ serviceName, status, lastPing, environment }) => {
  const headerColor = "#d32f2f";
  
  return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
    <div style="max-width:650px; margin:auto; background:#ffffff; border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">

      <!-- HEADER -->
      <div style="background:${headerColor}; padding:16px 20px; color:#ffffff;">
        <h2 style="margin:0; font-size:20px;">🚨 Alert: Service Stoppage Detected</h2>
        <p style="margin:4px 0 0; font-size:14px; opacity:0.9;">
          AdvertiseIQ Infrastructure Monitoring
        </p>
      </div>

      <!-- BODY -->
      <div style="padding:20px;">
        <div style="background:#f5f5f5; padding:12px; border-radius:6px; font-size:13px; color:#333;">
          <p style="margin:6px 0;"><strong>Service Name:</strong> ${serviceName}</p>
          <p style="margin:6px 0;"><strong>Status:</strong> <span style="color:#d32f2f; font-weight:bold;">${status}</span></p>
          <p style="margin:6px 0;"><strong>Last Heartbeat Ping:</strong> ${lastPing ? new Date(lastPing).toLocaleString() : "Never"}</p>
          <p style="margin:6px 0;"><strong>Environment:</strong> ${environment || "production"}</p>
        </div>

        <div style="margin-top:18px;">
          <h3 style="margin-bottom:8px; color:#d32f2f; font-size:16px;">🛠 Recommended Action</h3>
          <ul style="margin:8px 0 0 18px; font-size:14px; color:#444; line-height: 1.5;">
            <li>Verify if the process is active on the server (e.g. check PM2 status: <code>pm2 status</code>)</li>
            <li>Inspect the server log file (e.g. <code>logs/cron-error.log</code>) for crash traces</li>
            <li>Ensure the MongoDB database connection is active and stable</li>
            <li>Manually restart the worker service to restore scheduling operations</li>
          </ul>
        </div>
      </div>

      <!-- FOOTER -->
      <div style="background:#fafafa; padding:12px 20px; font-size:12px; color:#777; text-align:center;">
        AdvertiseIQ · Service Monitoring System
      </div>
    </div>
  </div>
  `;
};
