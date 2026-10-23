const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../../public/productImages");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const safeName = path.basename(file.originalname);
        cb(null, `${uniqueSuffix}-${safeName}`);
    },
});

const fileFilter = (req, file, cb) => {
    const fileSize = parseInt(req.headers["content-length"]);
    if (fileSize > 5 * 1024 * 1024) {
        return cb(new Error("File size limit exceeded! Maximum allowed size is 5MB."), false);
    }

    const allowedMimeTypes = [
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/webp",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/vnd.ms-excel",
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type! Only images or Excel files allowed."), false);
    }
};

exports.uploadProductFiles = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).fields([
    { name: "mainProductImage", maxCount: 1 },
    { name: "additionalImages", maxCount: 8 },
    { name: "keywordList", maxCount: 1 },
]);
