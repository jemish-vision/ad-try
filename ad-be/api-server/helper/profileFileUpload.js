const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../../public/profilePhotos");
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
        const safeName = path.basename(file.originalname).replace(/\s+/g, '-');
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
        "image/webp"
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type! Only images (JPEG, PNG, JPG, WEBP) are allowed."), false);
    }
};

exports.profileFileUpload = multer({
    storage,
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
}).fields([
    { name: "profilePhoto", maxCount: 1 },
]);
