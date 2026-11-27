const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { createGunzip } = require("node:zlib");

async function withReportWorkspace(work) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "advertiseiq-report-"));
  try {
    return await work(directory);
  } finally {
    await fs.promises.rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}

async function extractReportFile(download, filePath) {
  const header = Buffer.alloc(2);
  const handle = await fs.promises.open(download, "r");
  try {
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead === 0) throw new Error("Downloaded report file is empty");
  } finally {
    await handle.close();
  }

  if (header[0] === 0x1f && header[1] === 0x8b) {
    await pipeline(fs.createReadStream(download), createGunzip(), fs.createWriteStream(filePath));
    if ((await fs.promises.stat(filePath)).size === 0) throw new Error("Extracted report file is empty");
  } else {
    await fs.promises.copyFile(download, filePath);
  }
}

async function withDownloadedReportFile(url, downloadFile, consume) {
  return withReportWorkspace(async directory => {
    const download = path.join(directory, "download");
    const extracted = path.join(directory, "report.json");
    await downloadFile(url, download);
    await extractReportFile(download, extracted);
    return consume(extracted);
  });
}

module.exports = { withReportWorkspace, withDownloadedReportFile };
