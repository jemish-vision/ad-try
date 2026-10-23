exports.buildDataDeletedEmail = ({
  userName,
  type = "all", // "ads" | "sp" | "all"
}) => {
  let title, connectionName, dataList;

  if (type === "ads") {
    title = "Advertising Data Deleted";
    connectionName = "Amazon Advertising integration";
    dataList = "campaigns, keywords, placements, rules, and history";
  } else if (type === "sp") {
    title = "Seller Data Deleted";
    connectionName = "Amazon Seller Partner (SP-API) integration";
    dataList = "orders, inventory, return logs, transactions, and sales metrics";
  } else {
    title = "Account Data Deleted";
    connectionName = "Amazon account integration";
    dataList = "campaigns, keywords, orders, placements, search terms, and reports";
  }

  return `
  <div style="font-family:Arial,sans-serif;background:#f0f4f8;padding:30px;">
    <div style="max-width:520px;margin:auto;background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(2,70,139,0.10);">

      <!-- Completion Strip -->
      <div style="background:#dbeafe;color:#1e40af;padding:9px 16px;text-align:center;font-size:13px;font-weight:700;letter-spacing:0.5px;">
        &#10003; Data deletion complete
      </div>

      <!-- Header -->
      <div style="background:#02468B;color:#ffffff;padding:24px 28px 20px;">
        <div style="font-size:13px;letter-spacing:1.5px;text-transform:uppercase;opacity:0.75;margin-bottom:6px;">AdvertiseIQ</div>
        <h2 style="margin:0;font-size:22px;font-weight:700;">&#128465; ${title}</h2>
      </div>

      <!-- Body -->
      <div style="padding:28px 28px 20px;">
        <p style="font-size:16px;color:#1a2940;margin:0 0 12px;">
          Hello <b style="color:#02468B;">${userName || "there"}</b>,
        </p>

        <p style="font-size:15px;color:#374151;line-height:1.6;margin:0 0 16px;">
          Your AdvertiseIQ <strong>${connectionName}</strong> and all related data —
          <strong style="color:#02468B;">${dataList}</strong> — have been
          <strong>permanently deleted</strong> as per our 30-day Data Protection Policy.
        </p>

        <!-- Info Box -->
        <div style="background:#f0f5ff;border-left:4px solid #02468B;border-radius:0 6px 6px 0;padding:12px 16px;margin:14px 0;">
          <p style="margin:0;font-size:14px;color:#374151;line-height:1.6;">
            You can always reconnect your ${connectionName} in the future if you choose to return.
          </p>
        </div>

        <hr style="border:none;border-top:1px solid #e5e7eb;margin:20px 0;" />

        <p style="font-size:13px;color:#9ca3af;line-height:1.6;">
          This action was performed automatically under our Data Protection Policy.
          If you believe this was a mistake, please contact our support team.
        </p>

        <p style="font-size:13px;color:#9ca3af;margin-top:16px;">
          © ${new Date().getFullYear()} <strong style="color:#02468B;">AdvertiseIQ</strong>
        </p>
      </div>

    </div>
  </div>
  `;
};