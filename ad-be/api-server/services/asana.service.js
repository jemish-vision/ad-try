const axios = require("axios");
const FormData = require("form-data");
const { write_logs } = require("../../winston/utility/logger");
const { getASANAToken } = require("../helper/common");

const generateAccessToken = async () => {
    const asanaConfig = await getASANAToken();
    if (!asanaConfig) return write_logs({ message: "Asana configuration not found in database" });

    const tokenRes = await axios.post(
        "https://app.asana.com/-/oauth_token",
        new URLSearchParams({
            grant_type: "refresh_token",
            client_id: asanaConfig?.clientId,
            client_secret: asanaConfig?.clientSecret,
            redirect_uri: `${process.env.BASE_URL}/api/asana/callback`,
            refresh_token: asanaConfig?.refreshToken,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
    );

    return { ...asanaConfig?._doc, accessToken: tokenRes?.data?.access_token };
};

const createAsanaClient = (asanaConfig) => {
    return axios.create({
        baseURL: asanaConfig?.baseUrl,
        headers: { Authorization: `Bearer ${asanaConfig?.accessToken}` },
    });
};

exports.generateAccessToken = generateAccessToken;
exports.createAsanaClient = createAsanaClient;

/* ---------- CREATE ASANA TASK ---------- */
exports.createAsanaTicket = async ({ ticketId, userName, userEmail, message, fileUrl }) => {
    const asanaConfig = await generateAccessToken();
    if (!asanaConfig) return write_logs({ message: "Asana configuration not found in database" });

    const asanaClient = createAsanaClient(asanaConfig);

    const taskName = `Support Ticket #${ticketId} – ${userName}`;

    const taskDescription = `User Name: ${userName}\nUser Email: ${userEmail}\nTicket ID: ${ticketId}\n\nInitial Message:\n${message || "No message provided"}`;

    const res = await asanaClient.post("/tasks", {
        data: {
            name: taskName,
            notes: taskDescription,
            projects: [asanaConfig?.projectId],
            assignee: asanaConfig?.projectAssignId
        },
    });

    const taskId = res.data.data.gid;

    if (fileUrl) {
        try {
            const response = await axios.get(fileUrl, { responseType: "stream" });
            const contentType = response.headers["content-type"];
            const filename = fileUrl.split("/").pop().split("?")[0] || "attachment";

            const form = new FormData();
            form.append("file", response.data, { filename, contentType });

            await asanaClient.post(`/tasks/${taskId}/attachments`,
                form,
                { headers: { "Content-Type": "multipart/form-data", maxBodyLength: Infinity } }
            );
        } catch (err) {
            console.log(err);
            write_logs({
                message: `Asana attachment failed: ${JSON.stringify(err?.response?.data || err)}`
            });
        }
    }

    return taskId;
};

exports.addAsanaComment = async ({ taskId, comment }) => {
    if (!taskId || !comment) throw new Error("taskId and comment are required");

    const asanaConfig = await generateAccessToken();
    if (!asanaConfig) return write_logs({ message: "Asana configuration not found in database" });

    const asanaClient = createAsanaClient(asanaConfig);

    const res = await asanaClient.post(
        `/tasks/${taskId}/stories`,
        { data: { text: comment } }
    );

    return res.data.data;
};
