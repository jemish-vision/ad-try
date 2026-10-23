exports.buildInventoryForecastAlertEmail = ({ urgentItems = [], planShipmentItems = [], overstockItems = [], warehouseItems = [], currency = "USD" }) => {

    const formatCurrency = (amount, currencyCode) => {
        try {
            return new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: currencyCode || "USD",
            }).format(amount);
        } catch (e) {
            return `${currencyCode || "$"} ${Number(amount).toFixed(2)}`;
        }
    };

    const buildWarehouseSection = ({ accentColor, title, items }) => {
        if (!items || !items.length) return "";

        const rows = items.map((item) => {
            return `
            <tr style="border-bottom: 1px solid #EDF2F7;">
                <!-- Product Column -->
                <td style="padding: 12px 10px; min-width: 200px; border-right: 1px solid #EDF2F7;">
                    <div style="font-size: 12px; font-weight: 700; color: #1A202C;">${item.sku || item.productName || 'N/A'}</div>
                    <div style="font-size: 10px; color: #718096; margin-top: 2px;">
                        ASIN: <span style="color: #4A5568; font-weight:600;">${item.asin || '—'}</span>
                    </div>
                </td>

                <!-- Warehouse / FC -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; font-weight: 700; color: #2B6CB0; border-right: 1px solid #EDF2F7;">
                    <span style="display: inline-block; padding: 2px 8px; border-radius: 4px; background: #EBF8FF; border: 1px solid #BEE3F8; font-family: monospace;">
                        ${item.warehouseId}
                    </span>
                    ${item.warehouseName && item.warehouseName !== item.warehouseId ? `<div style="font-size: 10px; color: #718096; margin-top: 2px; font-weight: normal;">${item.warehouseName}</div>` : ''}
                </td>

                <!-- Current Qty in FC -->
                <td style="padding: 12px 10px; text-align: center; font-size: 13px; font-weight: 800; color: #DC2626; border-right: 1px solid #EDF2F7;">
                    ${item.currentQty ?? 0}
                </td>

                <!-- Configured Alert Threshold -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; font-weight: 600; color: #4A5568; border-right: 1px solid #EDF2F7;">
                    ${item.alertThreshold !== null && item.alertThreshold !== undefined ? item.alertThreshold : '—'}
                </td>

                <!-- Transit Days -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #718096; border-right: 1px solid #EDF2F7;">
                    ${item.transitDays !== null && item.transitDays !== undefined ? `${item.transitDays}d` : '—'}
                </td>

                <!-- Buffer Days -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #718096; border-right: 1px solid #EDF2F7;">
                    ${item.bufferDays !== null && item.bufferDays !== undefined ? `${item.bufferDays}d` : '—'}
                </td>

                <!-- Coverage Days -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #718096;">
                    ${item.coverageDays !== null && item.coverageDays !== undefined ? `${item.coverageDays}d` : '—'}
                </td>
            </tr>`;
        }).join("");

        return `
        <div style="margin-bottom: 30px; background: #ffffff; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="background: ${accentColor}; padding: 12px 20px; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 0.5px;">
                ${title.toUpperCase()} (${items.length} FULFILLMENT CENTERS)
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; min-width: 800px;">
                    <thead>
                        <tr style="background: #F7FAFC; border-bottom: 2px solid #CBD5E1;">
                            <th style="padding: 12px 10px; text-align: left; font-size: 10px; color: #718096; text-transform: uppercase;">Product (SKU / ASIN)</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #02468B; text-transform: uppercase; text-align: center;">Fulfillment Center</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #C53030; text-transform: uppercase; text-align: center;">Current Qty</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #2D3748; text-transform: uppercase; text-align: center;">Alert Threshold</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #718096; text-transform: uppercase; text-align: center;">Transit Days</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #718096; text-transform: uppercase; text-align: center;">Buffer Days</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #718096; text-transform: uppercase; text-align: center;">Coverage Days</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    };

    const buildSection = ({ accentColor, title, items }) => {
        if (!items.length) return "";

        const rows = items.map((item) => {
            return `
            <tr style="border-bottom: 1px solid #EDF2F7;">
                <!-- Product Column -->
                <td style="padding: 12px 10px; min-width: 280px; border-right: 1px solid #EDF2F7;">
                    <table style="width:100%; border-collapse: collapse;">
                        <tr>
                            <td style="width: 40px; padding: 0;">
                                ${item.imageURL
                    ? `<img src="${item.imageURL}" style="width:38px; height:38px; border-radius:4px; border:1px solid #E2E8F0; object-fit:cover;">`
                    : `<div style="width:38px; height:38px; background:#F7FAFC; border-radius:4px; border:1px solid #E2E8F0; text-align:center; line-height:38px;">📦</div>`
                }
                            </td>
                            <td style="padding-left: 10px;">
                                <div style="font-size: 12px; font-weight: 700; color: #1A202C;">${item.productName || 'N/A'}</div>
                                <div style="font-size: 10px; color: #718096; margin-top: 2px;">
                                    ASIN: <span style="color: #4A5568; font-weight:600;">${item.asin || '—'}</span> | 
                                    SKU: <span style="color: #4A5568; font-weight:600;">${item.sku || '—'}</span>
                                </div>
                                <div style="font-size: 11px; color: #02468B; font-weight: 700; margin-top: 2px;">
                                    ${item.sellingPrice ? formatCurrency(item.sellingPrice, currency) : ''}
                                </div>
                            </td>
                        </tr>
                    </table>
                </td>

                <!-- Inventory Fields -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #2D3748;">${item.currentStock ?? 0}</td>
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #2D3748; font-weight: 700;">${item.availableInventory ?? 0}</td>
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #2D3748;">${item.inboundStock ?? 0}</td>
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #A0AEC0; border-right: 1px solid #EDF2F7;">${item.reservedStock ?? 0}</td>

                <!-- Velocity Fields -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #1A202C; font-weight: 800; background: #EDF2F7; border-right: 1px solid #CBD5E1;">${item.salesPerDay ?? 0}</td>

                <!-- Forecast & Config Fields -->
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: ${item.inventoryForecastStatus === 'URGENT' ? '#E53E3E' : '#2D3748'}; font-weight: 700;">${item.doi ?? 0}</td>
                <td style="padding: 12px 10px; text-align: center; font-size: 12px; color: #4A5568;">${item.reorderPoint ?? 0}</td>
                <td style="padding: 12px 10px; text-align: center; font-size: 13px; color: #02468B; font-weight: 800; background: #F0F7FF;">${item.recommendedShipmentQty ?? 0}</td>
            </tr>`;
        }).join("");

        return `
        <div style="margin-bottom: 30px; background: #ffffff; border: 1px solid #E2E8F0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
            <div style="background: ${accentColor}; padding: 12px 20px; color: #ffffff; font-weight: 800; font-size: 14px; letter-spacing: 0.5px;">
                ${title.toUpperCase()} (${items.length} SKUS)
            </div>
            <div style="overflow-x: auto;">
                <table style="width: 100%; border-collapse: collapse; min-width: 1200px;">
                    <thead>
                        <tr style="background: #F7FAFC; border-bottom: 2px solid #CBD5E1;">
                            <th style="padding: 12px 10px; text-align: left; font-size: 10px; color: #718096; text-transform: uppercase; white-space: nowrap;">Product Detail</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #02468B; text-transform: uppercase; white-space: nowrap;">Stock</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #02468B; text-transform: uppercase; white-space: nowrap;">Available</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #02468B; text-transform: uppercase; white-space: nowrap;">Inbound</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #02468B; text-transform: uppercase; white-space: nowrap; border-right: 1px solid #EDF2F7;">Reserved</th>
                            
                            <th style="padding: 12px 10px; font-size: 10px; color: #1A202C; text-transform: uppercase; white-space: nowrap; background: #EDF2F7; border-right: 1px solid #CBD5E1;">ADS</th>

                            <th style="padding: 12px 10px; font-size: 10px; color: #C53030; text-transform: uppercase; white-space: nowrap;">DOI</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #2D3748; text-transform: uppercase; white-space: nowrap;">Reorder Point</th>
                            <th style="padding: 12px 10px; font-size: 10px; color: #02468B; text-transform: uppercase; white-space: nowrap; background: #F0F7FF;">Ship Quantity</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </div>`;
    };

    return `
    <!DOCTYPE html>
    <html>
    <body style="margin:0; padding:20px; background-color: #F4F7F9; font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <div style="max-width: 1000px; margin: 0 auto;">
            
            <table style="width: 100%; margin-bottom: 25px;">
                <tr>
                    <td>
                        <h1 style="font-size: 24px; color: #1A202C; margin: 0; letter-spacing: -0.5px;">Inventory Forecast & Fulfillment Report</h1>
                        <p style="font-size: 14px; color: #718096; margin: 5px 0 0;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                    </td>
                    <td style="text-align: right;">
                        <div style="background: #02468B; color: #fff; padding: 8px 16px; border-radius: 6px; font-size: 13px; font-weight: bold; display: inline-block;">
                            ADVERTISE IQ
                        </div>
                    </td>
                </tr>
            </table>

            ${buildWarehouseSection({ accentColor: "#9333EA", title: "Fulfillment Center Stock Alerts", items: warehouseItems })}
            ${buildSection({ accentColor: "#DC2626", title: "Critical Stock Alerts", items: urgentItems })}
            ${buildSection({ accentColor: "#D97706", title: "Restock Planning", items: planShipmentItems })}
            ${buildSection({ accentColor: "#2563EB", title: "Overstock Management", items: overstockItems })}

            <div style="text-align: center; padding: 30px 0;">
                <a href="${process.env.FRONTEND_REDIRECT_URL}/fba-planning" 
                   style="background: linear-gradient(180deg, #02468B 0%, #013570 100%); color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; display: inline-block; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    Open Full Inventory Dashboard
                </a>
            </div>

            <div style="text-align: center; border-top: 1px solid #E2E8F0; margin-top: 20px; padding-top: 20px;">
                <p style="font-size: 12px; color: #A0AEC0;">
                    This is an automated report generated by Advertise IQ Inventory Systems.<br>
                    © ${new Date().getFullYear()} Advertise IQ.
                </p>
            </div>
        </div>
    </body>
    </html>`;
};