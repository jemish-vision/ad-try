const multer = require("multer");
const path = require("path");
const fs = require("fs");

// 📁 Ensure upload directory exists
const uploadDir = path.join(__dirname, "../../public/excelImportFiles");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// 📦 Storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
        const safeName = path.basename(file.originalname);
        cb(null, `${uniqueSuffix}-${safeName}`);
    },
});

// 🛑 Strict Excel file filter
const fileFilter = (req, file, cb) => {
    const fileSize = parseInt(req.headers["content-length"]);
    if (fileSize > 5 * 1024 * 1024) {
        return cb(new Error("File size limit exceeded! Maximum allowed size is 5MB."), false);
    }

    const allowedMimeTypes = [
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
        "application/vnd.ms-excel", // .xls
    ];

    const allowedExtensions = [".xlsx", ".xls"];
    const ext = path.extname(file.originalname).toLowerCase();

    if (
        allowedMimeTypes.includes(file.mimetype) &&
        allowedExtensions.includes(ext)
    ) {
        cb(null, true);
    } else {
        cb(
            new Error("Invalid file type. Only Excel files (.xlsx, .xls) are allowed."),
            false
        );
    }
};

// 🚀 Export middleware (single Excel file)
exports.uploadExcelFile = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5 MB
    },
}).single("file");
