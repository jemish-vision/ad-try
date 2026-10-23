const { google } = require("googleapis");
const moment = require("moment-timezone");
const googleSheetSchema = require("../models/googleSheet.model");
const { wait } = require("./common");

exports.updateBestPerformerGoogleSheet = async (config, yearFolder, profile, fileName, campaignDetails, orders) => {

    fileName = `${profile?.countryCode} | ${profile?.name} | Top Performer`;
    const auth = new google.auth.OAuth2(config?.clientId, config?.clientSecret);
    auth.setCredentials({ refresh_token: config?.googleRefreshToken });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const folderName = "AdvertiseIQ";

    const yearFolderCache = new Map();
    const workbookCache = new Map();

    let folderId = await createfolder(drive, folderName);
    for (const cp of campaignDetails) {

        yearFolder = moment(cp.reportDate).year();
        const order = orders.find(o => o._id === cp.reportDate)

        // ---------- YEAR FOLDER ----------
        let yearFolderId;
        if (yearFolderCache.has(yearFolder)) {
            yearFolderId = yearFolderCache.get(yearFolder);
        } else {
            yearFolderId = await createChildFolder(drive, yearFolder, folderId);
            yearFolderCache.set(yearFolder, yearFolderId);
        }

        // ---------- WORKBOOK ----------
        const workbookKey = `${yearFolder}-${fileName}`;
        let workbookId;

        if (workbookCache.has(workbookKey)) {
            workbookId = workbookCache.get(workbookKey);
        } else {
            workbookId = await createWorkbook(drive, sheets, fileName, yearFolderId);
            workbookCache.set(workbookKey, workbookId);
        }

        await googleSheetSchema.findOneAndUpdate(
            {
                userId: config.userId,
                profileId: profile.profileId,
                currentYear: yearFolder,
                fileName: fileName
            },
            {
                $set: {
                    googleSheetId: workbookId
                }
            },
            {
                new: true, upsert: true
            }
        ).lean()
        let sheetName = "";
        sheetName = getMonthSheetName(cp.reportDate);


        const { sheetId, isNew } = await createSheetInsideWorkbook(sheets, workbookId, sheetName);

        let existingRowIndex = 1;
        if (isNew) {

            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: workbookId,
                requestBody: {
                    requests: [
                        // 1. Title Row Bold
                        {
                            repeatCell: {
                                range: { sheetId, startRowIndex: 0, endRowIndex: 2 },
                                cell: {
                                    userEnteredFormat: {
                                        textFormat: { bold: true },
                                        backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } // light gray
                                    }
                                },
                                fields: "userEnteredFormat(textFormat,backgroundColor)"
                            }
                        },

                        // 2. Date Column Bold (Column A)
                        {
                            repeatCell: {
                                range: { sheetId, startColumnIndex: 0, endColumnIndex: 1 },
                                cell: { userEnteredFormat: { textFormat: { bold: true } } },
                                fields: "userEnteredFormat.textFormat.bold"
                            }
                        },

                        // 3. Center Align Everything
                        {
                            repeatCell: {
                                range: { sheetId },
                                cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
                                fields: "userEnteredFormat.horizontalAlignment"
                            }
                        },

                        // 4. Increase Name Column Width (Column J = index 9)
                        {
                            updateDimensionProperties: {
                                range: {
                                    sheetId,
                                    dimension: "COLUMNS",
                                    startIndex: 9,
                                    endIndex: 10
                                },
                                properties: { pixelSize: 350 },
                                fields: "pixelSize"
                            }
                        },

                        // --- 5. Wrap Text for Name Column ---
                        {
                            repeatCell: {
                                range: {
                                    sheetId,
                                    startColumnIndex: 9,
                                    endColumnIndex: 10
                                },
                                cell: {
                                    userEnteredFormat: {
                                        wrapStrategy: "WRAP"
                                    }
                                },
                                fields: "userEnteredFormat.wrapStrategy"
                            }
                        },

                        // --- 6. Freeze Title Row (Row 1) and Date Column (Column A) ---
                        {
                            updateSheetProperties: {
                                properties: {
                                    sheetId,
                                    gridProperties: {
                                        frozenRowCount: 2,
                                        frozenColumnCount: 1
                                    }
                                },
                                fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount"
                            }
                        },

                        // Merge Group Header Cells
                        {
                            mergeCells: {
                                range: {
                                    sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 1,
                                    endColumnIndex: 6, // Ads Campaign
                                },
                                mergeType: "MERGE_ALL"
                            }
                        },
                        {
                            mergeCells: {
                                range: {
                                    sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 6,
                                    endColumnIndex: 9, // Organic Details
                                },
                                mergeType: "MERGE_ALL"
                            }
                        },
                        {
                            mergeCells: {
                                range: {
                                    sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1,
                                    startColumnIndex: 9,
                                    endColumnIndex: 15, // Top Performers
                                },
                                mergeType: "MERGE_ALL"
                            }
                        },

                        // Center align group header
                        {
                            repeatCell: {
                                range: {
                                    sheetId,
                                    startRowIndex: 0,
                                    endRowIndex: 1
                                },
                                cell: {
                                    userEnteredFormat: {
                                        horizontalAlignment: "CENTER",
                                        textFormat: { bold: true }
                                    }
                                },
                                fields: "userEnteredFormat(horizontalAlignment,textFormat)"
                            }
                        },

                        // Editable columns (G,H,I)
                        {
                            repeatCell: {
                                range: {
                                    sheetId,
                                    startRowIndex: 2, // skip headers
                                    startColumnIndex: 6,
                                    endColumnIndex: 9
                                },
                                cell: {
                                    userEnteredFormat: {
                                        backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } // light gray
                                    }
                                },
                                fields: "userEnteredFormat.backgroundColor"
                            }
                        },
                    ]
                }
            });

            const headerRow = getHeader();
            await sheets.spreadsheets.values.update({
                spreadsheetId: workbookId,
                range: `${sheetName}!A1`,
                valueInputOption: "RAW",
                requestBody: { values: headerRow }
            });

            await updateDashboard(sheets, workbookId, sheetName);
            await addTotalRow(sheets, workbookId, sheetName);

        }

        existingRowIndex = await findExistingDateRow(sheets, workbookId, sheetName, cp.reportDate);
        if (!existingRowIndex) {
            const date = moment(cp.reportDate, "YYYY-MM-DD");
            existingRowIndex = Number(date.format("DD")) + 3;
        }

        const rows = convertForSheet(cp, order, existingRowIndex);
        await appendRow(sheets, workbookId, sheetName, rows[0], existingRowIndex);

    }

};

const createfolder = async (drive, folderName) => {
    const folderSearch = await drive.files.list({
        q: `mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
        fields: "files(id,name)",
        spaces: "drive",
    });

    let folderId = "";
    if (folderSearch.data.files.length > 0) {
        folderId = folderSearch.data.files[0].id;
    } else {
        const folderCreate = await drive.files.create({
            resource: {
                name: folderName,
                mimeType: "application/vnd.google-apps.folder"
            },
            fields: "id",
        });
        folderId = folderCreate.data.id;
    }
    return folderId;
}

const createChildFolder = async (drive, folderName, parentFolderId) => {
    const folderSearch = await drive.files.list({
        q: `'${parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and name='${folderName}'`,
        fields: "files(id,name)",
        spaces: "drive",
    });

    let folderId = "";
    if (folderSearch.data.files.length > 0) {
        folderId = folderSearch.data.files[0].id;
    } else {
        const folderCreate = await drive.files.create({
            resource: {
                name: folderName,
                parents: [parentFolderId],
                mimeType: "application/vnd.google-apps.folder"
            },
            fields: "id",
        });
        folderId = folderCreate.data.id;
    }
    return folderId;
}

const createWorkbook = async (drive, sheets, fileName, parentFolderId) => {
    const sheetSearch = await drive.files.list({
        q: `'${parentFolderId}' in parents and name='${fileName}' and mimeType='application/vnd.google-apps.spreadsheet'`,
        fields: "files(id, name)",
    });

    let workbookId = "";
    if (sheetSearch.data.files.length > 0) {
        workbookId = sheetSearch.data.files[0].id;
    } else {
        const createRes = await drive.files.create({
            resource: {
                name: fileName,
                mimeType: "application/vnd.google-apps.spreadsheet",
                parents: [parentFolderId]
            },
            fields: "id",
        });
        workbookId = createRes.data.id;
    }

    await drive.permissions.create({
        fileId: workbookId,
        requestBody: {
            // role: "reader",
            role: "writer",
            type: "anyone"
        }
    });

    const sheetInfo = await sheets.spreadsheets.get({
        spreadsheetId: workbookId,
        fields: "sheets.properties"
    });

    const sheet1 = sheetInfo.data.sheets.find(
        (s) => s.properties.title === "Sheet1"
    );

    if (!sheet1) {
        return workbookId;
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: workbookId,
        requestBody: {
            requests: [
                {
                    updateSheetProperties: {
                        properties: {
                            sheetId: sheet1.properties.sheetId,
                            title: "Dashboard"
                        },
                        fields: "title"
                    }
                }
            ]
        }
    });


    return workbookId;
}

const createSheetInsideWorkbook = async (sheets, workbookId, sheetName) => {

    const spreadsheetInfo = await sheets.spreadsheets.get({ spreadsheetId: workbookId, fields: "sheets.properties" });
    const existingSheet = spreadsheetInfo.data.sheets.find((s) => s?.properties?.title === sheetName);

    let isNew = true;
    let sheetId = "";
    if (existingSheet) {
        sheetId = existingSheet.properties.sheetId;
        isNew = false;
    } else {
        const addSheetRes = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: workbookId,
            requestBody: {
                requests: [
                    {
                        addSheet: {
                            properties: {
                                title: sheetName
                            }
                        }
                    }
                ]
            },
        });
        sheetId = addSheetRes.data.replies[0].addSheet.properties.sheetId;
    }
    return { sheetId, isNew };
}

const getHeader = () => {
    const groupHeader = [
        "",
        "Ads Campaign", "", "", "", "", // 5 columns
        "Organic Details", "", "",          // 3 columns
        "Top Performers", "", "", "", "", "" // 6 columns
    ];

    const rows = [
        groupHeader,
        [
            "Date",
            "Ad Spend (₹)",
            "Ad Sales (₹)",
            "Ad Order",
            "ACOS (%)",
            "ROAS",
            "Total Sales (₹)",
            "Total Order",
            "TCOS (%)",
            "Name",
            "Click",
            "Ph",
            "Ex",
            "Order",
            "Placements"
        ]
    ];

    rows.push([]);

    return rows;
}

const convertForSheet = (item, order, rowIndex) => {

    let rows = [];
    const bp = item.bestCampaign || {};

    let placements = bp.placement || [];
    placements = placements.map(p => p.placementModifier).join("/");

    // ---- Extract PH & EX keywords ----
    let phBid = "-";
    let exBid = "-";

    (bp.targeting || []).forEach(t => {
        if (t.keywordType.toLowerCase() == "phrase") phBid = t.keywordBid;
        if (t.keywordType.toLowerCase() == "exact") exBid = t.keywordBid;
    });

    const tcos = Number((((item?.totalSpend || 0) / (order?.totalSales || 0)) * 100).toFixed(2));

    // ---- Push row ----
    rows.push([
        item?.reportDate,
        item?.totalSpend,
        item?.totalSales,
        item.totalOrders,
        `=IFERROR(ROUND((B${rowIndex}/C${rowIndex} * 100), 2), 0)`, // E - ACOS (%) → SAFE
        `=IFERROR(ROUND(C${rowIndex}/B${rowIndex}, 2), 0)`, // F - ROAS → SAFE
        order?.totalSales,
        order?.orderCount,
        tcos,
        bp.name,
        bp.clicks,
        phBid,
        exBid,
        bp.orders,
        `'${placements}`
    ]);

    return rows;
}

const getMonthSheetName = (dateString) => {
    const date = new Date(dateString);
    const month = date.toLocaleString("en-US", { month: "long" });
    return month;
}

const findExistingDateRow = async (sheets, workbookId, sheetName, targetDate) => {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: workbookId,
        range: `${sheetName}!A:A`  // Date is in column A
    });

    const rows = res.data.values || [];

    for (let i = 0; i < rows.length; i++) {
        if (rows[i][0] === targetDate) {
            return i + 1; // Google Sheets rows are 1-indexed
        }
    }

    return null;
}

const deleteRow = async (sheets, workbookId, sheetId, rowIndex) => {
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: workbookId,
        requestBody: {
            requests: [
                {
                    deleteDimension: {
                        range: {
                            sheetId,
                            dimension: "ROWS",
                            startIndex: rowIndex - 1, // 0-indexed
                            endIndex: rowIndex
                        }
                    }
                }
            ]
        }
    });
}

const appendRow = async (sheets, workbookId, sheetName, row, rowIndex) => {
    await sheets.spreadsheets.values.update({
        spreadsheetId: workbookId,
        range: `${sheetName}!A${rowIndex}`,
        valueInputOption: "USER_ENTERED",
        requestBody: {
            values: [row]
        }
    });
}

const getLastRow = async (sheets, workbookId, sheetName) => {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: workbookId,
        range: `${sheetName}!A:A`
    });

    const rows = res.data.values || [];

    return rows.length;
};

const addDashboardHeader = async (sheets, workbookId, sheetName) => {
    const groupHeader = [
        "",
        "Ads Campaign", "", "", "", "", // 5 columns
        "Organic Details", "", "",          // 3 columns
    ];

    const headerRow = [
        groupHeader,
        [
            "Month",
            "Ad Spend (₹)",
            "Ad Sales (₹)",
            "Ad Order",
            "ACOS (%)",
            "ROAS",
            "Total Sales (₹)",
            "Total Order",
            "TCOS (%)"
        ]
    ];

    headerRow.push([]);

    // Add Header Row
    await sheets.spreadsheets.values.update({
        spreadsheetId: workbookId,
        range: `${sheetName}!A1`,
        valueInputOption: "RAW",
        requestBody: { values: headerRow }
    });

    const { sheetId, isNew } = await createSheetInsideWorkbook(sheets, workbookId, sheetName);

    // Apply Bold + Gray Background
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: workbookId,
        requestBody: {
            requests: [
                {
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: 0,   // Header Row 1
                            endRowIndex: 2,
                            startColumnIndex: 0, // Column A
                            endColumnIndex: 9    // Up to column I
                        },
                        cell: {
                            userEnteredFormat: {
                                textFormat: { bold: true },
                                backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } // light gray
                            }
                        },
                        fields: "userEnteredFormat(textFormat,backgroundColor)"
                    }
                },
                //center align
                {
                    repeatCell: {
                        range: { sheetId },
                        cell: { userEnteredFormat: { horizontalAlignment: "CENTER" } },
                        fields: "userEnteredFormat.horizontalAlignment"
                    }
                },
                // Freeze Title Row (Row 1) and Date Column (Column A) ---
                {
                    updateSheetProperties: {
                        properties: {
                            sheetId,
                            gridProperties: {
                                frozenRowCount: 2,
                                frozenColumnCount: 1
                            }
                        },
                        fields: "gridProperties.frozenRowCount,gridProperties.frozenColumnCount"
                    }
                },
                // Merge Group Header Cells
                {
                    mergeCells: {
                        range: {
                            sheetId,
                            startRowIndex: 0,
                            endRowIndex: 1,
                            startColumnIndex: 1,
                            endColumnIndex: 6, // Ads Campaign
                        },
                        mergeType: "MERGE_ALL"
                    }
                },
                {
                    mergeCells: {
                        range: {
                            sheetId,
                            startRowIndex: 0,
                            endRowIndex: 1,
                            startColumnIndex: 6,
                            endColumnIndex: 9, // Organic Details
                        },
                        mergeType: "MERGE_ALL"
                    }
                },
                // Center align group header
                {
                    repeatCell: {
                        range: {
                            sheetId,
                            startRowIndex: 0,
                            endRowIndex: 1
                        },
                        cell: {
                            userEnteredFormat: {
                                horizontalAlignment: "CENTER",
                                textFormat: { bold: true }
                            }
                        },
                        fields: "userEnteredFormat(horizontalAlignment,textFormat)"
                    }
                }
            ]
        }
    });
}

const updateDashboard = async (sheets, workbookId, month) => {

    const sheetName = "Dashboard";
    let lastIndex = await getLastRow(sheets, workbookId, sheetName);
    if (lastIndex == 0) {
        await addDashboardHeader(sheets, workbookId, sheetName);
        lastIndex = await getLastRow(sheets, workbookId, sheetName);
        lastIndex++;
    }

    const dashboardValues = [
        month,
        `='${month}'!B35`,     // Ad Spend (₹)
        `='${month}'!C35`,     // Ad Sales (₹)
        `='${month}'!D35`,     // Ad Order
        `='${month}'!E35`,     // ACOS (%)
        `='${month}'!F35`,     // ROAS
        `='${month}'!G35`,     // Total Sales (₹)
        `='${month}'!H35`,     // Total Order
        `='${month}'!I35`      // TCOS (%)
    ];

    // Write dashboard values
    await sheets.spreadsheets.values.update({
        spreadsheetId: workbookId,
        range: `${sheetName}!A${lastIndex + 1}`,
        valueInputOption: "USER_ENTERED",
        requestBody: { values: [dashboardValues] }
    });
}

const hasTotalRow = async (sheets, workbookId, sheetName) => {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: workbookId,
        range: `${sheetName}!A35`
    });

    const value = res.data.values?.[0]?.[0] || "";
    return value.toString().trim().toUpperCase() === "TOTAL";
};

const addTotalRow = async (sheets, workbookId, sheetName) => {
    const exists = await hasTotalRow(sheets, workbookId, sheetName);
    if (!exists) {
        const totalValues = [
            "TOTAL",                 // A
            `=SUM(B4:B34)`,          // B - Spend
            `=SUM(C4:C34)`,          // C - Sales
            `=SUM(D4:D34)`,          // D - Orders            
            `=IFERROR(ROUND((SUM(B4:B34)/SUM(C4:C34) * 100), 2), 0)`, // E - ACOS (%) → SAFE
            `=IFERROR(ROUND(SUM(C4:C34)/SUM(B4:B34), 2), 0)`, // F - ROAS → SAFE
            `=SUM(G4:G34)`,          // G - Total Sales
            `=SUM(H4:H34)`,          // H - Total Orders
            `=IFERROR(ROUND((SUM(B4:B34)/SUM(G4:G34) * 100), 2), 0)`       // I - TCOS (%)
        ];

        // Write dashboard values
        await sheets.spreadsheets.values.update({
            spreadsheetId: workbookId,
            range: `${sheetName}!A35`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [totalValues] }
        });

        const { sheetId, isNew } = await createSheetInsideWorkbook(sheets, workbookId, sheetName);

        // Bold total rows 
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: workbookId,
            requestBody: {
                requests: [
                    {
                        repeatCell: {
                            range: {
                                sheetId,     // ← ID of the month sheet
                                startRowIndex: 34,    // Row 35 (0-based index)
                                endRowIndex: 35,
                                startColumnIndex: 0,  // Column A
                                endColumnIndex: 9     // Column I (exclusive)
                            },
                            cell: {
                                userEnteredFormat: {
                                    textFormat: { bold: true },
                                    backgroundColor: { red: 0.9, green: 0.9, blue: 0.9 } // light gray
                                }
                            },
                            fields: "userEnteredFormat.textFormat.bold"
                        }
                    }
                ]
            }
        });
    }

}


exports.updateTargetingAnalysisSheet = async (config, yearFolder, profile, fileName, targetingData) => {

    fileName = `${profile?.countryCode} | ${profile?.name} | Keyword Analysis`;
    const auth = new google.auth.OAuth2(config?.clientId, config?.clientSecret);
    auth.setCredentials({ refresh_token: config?.googleRefreshToken });

    const drive = google.drive({ version: "v3", auth });
    const sheets = google.sheets({ version: "v4", auth });

    const folderName = "AdvertiseIQ";
    const sheetName = "Targeting";

    let folderId = await createfolder(drive, folderName);
    let yearFolderId = await createChildFolder(drive, yearFolder, folderId);

    let workbookId = await createWorkbook(drive, sheets, fileName, yearFolderId);

    await googleSheetSchema.findOneAndUpdate(
        {
            userId: config.userId,
            profileId: profile.profileId,
            currentYear: yearFolder,
            fileName: fileName
        },
        {
            $set: {
                googleSheetId: workbookId
            }
        },
        {
            new: true, upsert: true
        }
    ).lean()

    const { sheetId, isNew } = await createSheetInsideWorkbook(sheets, workbookId, sheetName);

    if (isNew) {
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId: workbookId,
            requestBody: {
                requests: [
                    {
                        repeatCell: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 2   // First 2 rows
                            },
                            cell: {
                                userEnteredFormat: {
                                    backgroundColor: {
                                        red: 0.80,
                                        green: 0.93,
                                        blue: 0.88
                                    },
                                    textFormat: {
                                        bold: true,
                                        fontSize: 11
                                    },
                                    horizontalAlignment: "CENTER",
                                    verticalAlignment: "MIDDLE",
                                    wrapStrategy: "WRAP"
                                }
                            },
                            fields:
                                "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,wrapStrategy)"
                        }
                    },
                    {
                        updateSheetProperties: {
                            properties: {
                                sheetId: sheetId,
                                gridProperties: {
                                    frozenRowCount: 2
                                }
                            },
                            fields: "gridProperties.frozenRowCount"
                        }
                    },
                    {
                        updateDimensionProperties: {
                            range: {
                                sheetId: sheetId,
                                dimension: "ROWS",
                                startIndex: 0,
                                endIndex: 2
                            },
                            properties: {
                                pixelSize: 45
                            },
                            fields: "pixelSize"
                        }
                    },
                    {
                        updateBorders: {
                            range: {
                                sheetId: sheetId,
                                startRowIndex: 0,
                                endRowIndex: 2
                            },
                            top: { style: "SOLID" },
                            bottom: { style: "SOLID" },
                            left: { style: "SOLID" },
                            right: { style: "SOLID" },
                            innerHorizontal: { style: "SOLID" },
                            innerVertical: { style: "SOLID" }
                        }
                    },
                    {
                        updateDimensionProperties: {
                            range: {
                                sheetId: sheetId,
                                dimension: "COLUMNS",
                                startIndex: 0, // Column A
                                endIndex: 4    // Up to column D (exclusive)
                            },
                            properties: {
                                pixelSize: 40
                            },
                            fields: "pixelSize"
                        }
                    },
                    {
                        updateDimensionProperties: {
                            range: {
                                sheetId: sheetId,
                                dimension: "COLUMNS",
                                startIndex: 4,
                                endIndex: 5
                            },
                            properties: {
                                pixelSize: 250
                            },
                            fields: "pixelSize"
                        }
                    },
                    {
                        mergeCells: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 0,
                                endColumnIndex: 3,
                            },
                            mergeType: "MERGE_ALL"
                        }
                    },
                    {
                        mergeCells: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 3,
                                endColumnIndex: 4,
                            },
                            mergeType: "MERGE_ALL"
                        }
                    },
                    {
                        mergeCells: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 5,
                                endColumnIndex: 15,
                            },
                            mergeType: "MERGE_ALL"
                        }
                    },
                    {
                        mergeCells: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 15,
                                endColumnIndex: 17,
                            },
                            mergeType: "MERGE_ALL"
                        }
                    },
                    {
                        mergeCells: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 17,
                                endColumnIndex: 19,
                            },
                            mergeType: "MERGE_ALL"
                        }
                    },
                    {
                        mergeCells: {
                            range: {
                                sheetId,
                                startRowIndex: 0,
                                endRowIndex: 1,
                                startColumnIndex: 19,
                                endColumnIndex: 21,
                            },
                            mergeType: "MERGE_ALL"
                        }
                    },
                ]
            }
        });

        const headerRow = await getSearchTermHeader();
        await sheets.spreadsheets.values.update({
            spreadsheetId: workbookId,
            range: `${sheetName}!A1`,
            valueInputOption: "RAW",
            requestBody: { values: headerRow }
        });

    }

    //Clear Whole sheet
    await sheets.spreadsheets.values.clear({
        spreadsheetId: workbookId,
        range: `${sheetName}!A3:ZZ`
    });

    if (targetingData.length > 0) {
        const rows = convertTargetingDataForSheet(targetingData);

        await sheets.spreadsheets.values.append({
            spreadsheetId: workbookId,
            range: `${sheetName}!A3`,
            valueInputOption: "USER_ENTERED",
            insertDataOption: "INSERT_ROWS",
            requestBody: {
                values: rows
            }
        });
    }

    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: workbookId,
        requestBody: {
            requests: [
                {
                    repeatCell: {
                        range: {
                            sheetId: sheetId,
                            startRowIndex: 2,
                        },
                        cell: {
                            userEnteredFormat: {
                                backgroundColor: { red: 1, green: 1, blue: 1 },
                                textFormat: {
                                    bold: false,
                                    fontSize: 10
                                }
                            }
                        },
                        fields: "userEnteredFormat(backgroundColor,textFormat)"
                    }
                }
            ]
        }
    });


};

const getSearchTermHeader = () => {
    const groupHeader = [
        "SP", "", "", // 3 columns
        "SB", // 1 columns
        "", // 1 columns
        "Sponsored Product", "", "", "", "", "", "", "", "", "", // 10 columns
        "SP % of", "",          // 2 columns
        "SP", "", // 2 columns
        "SB", "" // 2 columns
    ];

    const rows = [
        groupHeader,
        [
            "EX",
            "PH",
            "BR",
            "",
            "Targeting",
            "Impressions",
            "Clicks",
            "Orders",
            "Spend",
            "Sales",
            "CTR",
            "CVR",
            "CPC",
            "ROAS",
            "ACOS",
            "Spend",
            "Sales",
            "Impression Rank",
            "Impression Share",
            "Impression Rank",
            "Impression Share"
        ]
    ];

    rows.push([]);

    return rows;
}

const convertTargetingDataForSheet = (targetingData) => {
    const cross = "❌";
    return targetingData.map((st) => ([
        st.EXACT ?? cross,
        st.PHRASE ?? cross,
        st.BROAD ?? cross,
        "",
        st.targeting,
        st.impressions,
        st.clicks,
        st.orders,
        st.spend,
        st.sales,
        st.ctr,
        st.cvr,
        st.cpc,
        st.roas,
        st.acos,
    ]));
};