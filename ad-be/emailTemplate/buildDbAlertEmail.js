export const buildDbAlertEmail = ({ status, dbName, timestamp, reconnectAttempt = null }) => {
    const isDown = status === "DISCONNECTED";
    const headerColor = isDown ? "#d32f2f" : "#2e7d32";
    const icon = isDown ? "🔴" : "🟢";
    const title = isDown ? "Alert: MongoDB Connection Lost" : "Resolved: MongoDB Reconnected";

    return `
  <div style="font-family: Arial, sans-serif; background:#f4f6f8; padding:20px;">
    <div style="max-width:650px; margin:auto; background:#ffffff; border-radius:8px;
      box-shadow:0 2px 8px rgba(0,0,0,0.08); overflow:hidden;">

      <!-- HEADER -->
      <div style="background:${headerColor}; padding:16px 20px; color:#ffffff;">
        <h2 style="margin:0; font-size:20px;">${icon} ${title}</h2>
        <p style="margin:4px 0 0; font-size:14px; opacity:0.9;">
          AdvertiseIQ Database Monitoring
        </p>
      </div>

      <!-- BODY -->
      <div style="padding:20px;">
        <div style="background:#f5f5f5; padding:12px; border-radius:6px; font-size:13px; color:#333;">
          <p style="margin:6px 0;"><strong>Status:</strong> ${status}</p>
          <p style="margin:6px 0;"><strong>Database:</strong> ${dbName || "N/A"}</p>
          <p style="margin:6px 0;"><strong>Time:</strong> ${timestamp}</p>
          ${reconnectAttempt ? `<p style="margin:6px 0;"><strong>Reconnect Attempt:</strong> #${reconnectAttempt}</p>` : ""}
        </div>

        ${isDown ? `
        <div style="margin-top:18px;">
          <h3 style="margin-bottom:8px; color:#d32f2f; font-size:16px;">🛠 Recommended Action</h3>
          <ul style="margin:8px 0 0 18px; font-size:14px; color:#444;">
            <li>Check MongoDB server status</li>
            <li>Verify network connectivity</li>
            <li>Check RAM / Disk usage on DB server</li>
            <li>Review MongoDB logs for crash reason</li>
          </ul>
        </div>` : `
        <div style="margin-top:18px;">
          <p style="font-size:14px; color:#2e7d32;">
            ✅ Database connection has been restored. All services should resume normally.
          </p>
        </div>`}
      </div>

      <!-- FOOTER -->
      <div style="background:#fafafa; padding:12px 20px; font-size:12px; color:#777; text-align:center;">
        AdvertiseIQ · Database Monitoring System
      </div>
    </div>
  </div>
  `;
};