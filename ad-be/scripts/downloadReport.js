const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const axios = require("axios");

// ==========================================
// CONFIGURATION: Paste your manual values here
// ==========================================
const config = {
    reportDocumentId: "amzn1.spdoc.1.4.eu.c9891614-9b39-445c-a832-1e478a5d5b2d.TNVQCKUWJ37E7.23000",
    accessToken: "Atza|IwEBILYa199XacCv82cHCUABKI-cNIsjkHvP1LpHNFVT0k-uOr7AovG0GxbO7maA4qy_MARscGHCoivSKd2vUfmV20ikFt1yx90Bh-Pvm8lrEMc42MSvGNE2TK4a1w5krWM57GdTHZhqFJkizvYas6H-RhaKWpb-jvAmkLRIqHEryQ-3JSrNKxMm0gR4BxEErOdLIr7fdCFYno2E3oSXI6NfMu1U5pgLvHtbvW71N0iVylUde_eeL26rkiaMDC0sMY2L5K7xP-3Az9wpZ0AUiC-OhTWA1Wl9tlPhofMWCfM7xcC64lyd6NTvG2qck0lrS010T7dwDHDMz7gT6LpMZayWFRxzPQa7ymPbGlQznOfQdh7hrQ",
    endpoint: "https://sellingpartnerapi-eu.amazon.com" // Change if other region
};

async function downloadAndConvert() {
    if (!config.accessToken) {
        console.error("Error: Please paste your valid SP-API accessToken in the configuration section at the top of the script.");
        return;
    }

    const outputFilename = `chunk11.json`;
    const outputPath = path.resolve(__dirname, "..", outputFilename);
    const documentUrl = `${config.endpoint}/reports/2021-06-30/documents/${config.reportDocumentId}`;

    console.log(`1. Requesting fresh pre-signed URL from SP-API: ${documentUrl}`);

    try {
        const docResponse = await axios({
            method: "GET",
            url: documentUrl,
            headers: {
                "x-amz-access-token": config.accessToken,
                "Content-Type": "application/json",
            }
        });

        if (docResponse.status !== 200 || !docResponse.data || !docResponse.data.url) {
            throw new Error(`Failed to fetch document. Status: ${docResponse.status}, Response: ${JSON.stringify(docResponse.data)}`);
        }

        const freshUrl = docResponse.data.url;
        console.log("2. Fresh pre-signed download URL obtained successfully.");

        console.log(`3. Downloading report and saving to root: ${outputFilename}`);
        const response = await axios({
            method: "get",
            url: freshUrl,
            responseType: "stream"
        });

        const gunzip = zlib.createGunzip();
        const writer = fs.createWriteStream(outputPath);

        response.data.pipe(gunzip).pipe(writer);

        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
            gunzip.on("error", reject);
        });

        console.log(`\nSuccess! Downloaded, decompressed, and saved to root level: ${outputFilename}`);

    } catch (err) {
        console.error("\nOperation failed:", err.message);
        if (err.response) {
            console.error("Response status:", err.response.status);
            console.error("Response details:", JSON.stringify(err.response.data));
        }
    }
}

downloadAndConvert();
