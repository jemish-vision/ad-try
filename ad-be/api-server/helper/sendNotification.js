const { write_logs } = require("../../winston/utility/logger");
const ProfileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const DeviceToken = require("../models/deviceToken");
const firebaseAdmin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

let serviceAccount = null;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (err) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT environment variable:", err.message);
    }
} else {
    const serviceAccountPath = path.join(__dirname, "../firebase-service-account.json");
    if (fs.existsSync(serviceAccountPath)) {
        serviceAccount = require(serviceAccountPath);
    }
}

let isFirebaseInitialized = false;
if (serviceAccount) {
    firebaseAdmin.initializeApp({
        credential: firebaseAdmin.credential.cert(serviceAccount)
    });
    isFirebaseInitialized = true;
} else {
    console.warn("Warning: Firebase service account credentials not found. Notification service disabled.");
}

exports.sendNotificationToUser = async (profileId, title, body) => {
    try {
        if (!isFirebaseInitialized) {
            return { success: false, message: "Firebase notification service is not configured" };
        }

        const userAccessList = await ProfileBasedPermissionSchema.find({ profileId: Number(profileId), hasAccess: true }, { userId: 1 }).lean();

        if (!userAccessList.length) {
            return { success: false, message: "No users found for this config" };
        }

        // 1. Fetch tokens for that user
        const tokens = await DeviceToken.find({ userId: { $in: userAccessList.map(item => item?.userId) } }).lean().distinct("deviceToken");

        if (!tokens || tokens.length === 0) {
            write_logs({
                message: `sendNotificationToUser: No device tokens found for profileId: ${profileId}`,
                log_type: "info",
            });
            return { success: false, message: "No device tokens found" };
        }

        // 2. Create message payload
        const message = {
            tokens,
            notification: {
                title,
                body
            },
            data: {}
        };

        // 3. Send using new multicast method
        const response = await firebaseAdmin.messaging().sendEachForMulticast(message);

        write_logs({
            message: `sendNotificationToUser: Success: ${response.successCount}, Failed: ${response.failureCount}`,
            log_type: "info",
        });

        // 4. Clean invalid / expired tokens
        const invalidTokens = response.responses
            .map((res, index) => (res.error ? tokens[index] : null))
            .filter(token => token !== null);

        if (invalidTokens.length > 0) {
            await DeviceToken.deleteMany({ deviceToken: { $in: invalidTokens } });
            write_logs({
                message: `sendNotificationToUser: Removed invalid tokens: ${invalidTokens}`,
                log_type: "info",
            });
        }

        return {
            success: true,
            message: "Notification sent",
            successCount: response.successCount,
            failureCount: response.failureCount
        };

    } catch (error) {
        write_logs({
            message: `sendNotificationToUser: Error: ${error}`,
            log_type: "error",
        });
        return { success: false, message: "An internal server error occurred" };
    }
};
