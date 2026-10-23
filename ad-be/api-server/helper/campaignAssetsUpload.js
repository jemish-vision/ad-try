const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, "../../public/campaignSupportedFiles");
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
    if (fileSize > 50 * 1024 * 1024) {
        return cb(new Error("File size limit exceeded! Maximum allowed size is 50MB."), false);
    }

    const allowedMimeTypes = [
        // Images
        "image/jpeg",
        "image/png",
        "image/jpg",
        "image/webp",
        "image/gif",
        // Audio
        "audio/mpeg",       // .mp3
        "audio/wav",        // .wav
        "audio/ogg",        // .ogg
        "audio/mp4",        // .m4a
        "audio/aac",        // .aac
        // Video
        "video/mp4",        // .mp4
        "video/mpeg",       // .mpeg
        "video/quicktime",  // .mov
        "video/x-msvideo",  // .avi
        "video/webm",       // .webm
        "video/x-ms-wmv",   // .wmv
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error("Invalid file type! Only images, audio, or video files are allowed."), false);
    }
};

exports.campaignAssetsUpload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max per file
    },
}).fields([
    { name: "image", maxCount: 5 },
    { name: "audio", maxCount: 5 },
    { name: "video", maxCount: 5 },
]);