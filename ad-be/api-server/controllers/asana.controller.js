const axios = require("axios");

const { write_logs } = require("../../winston/asana/logger");
const { generateAccessToken, createAsanaClient } = require("../services/asana.service");

const asanaUserSchema = require("../models/asanaUser.model");
const asanaConfigSchema = require("../models/asanaConfig.model");

const supportTicketSchema = require("../models/supportTicket.model");
const supportTicketMessageSchema = require("../models/supportTicketMessage.model");
const { sendEmailHelper } = require("../helper/emailHelper");
const { buildSupportTicketEmail } = require("../../emailTemplate/buildSupportTicketEmail");
const { getASANAToken } = require("../helper/common");

exports.asanaCallback = async (req, res) => {
    const { code } = req.query;

    const asanaConfig = await getASANAToken();
    if (!asanaConfig) return write_logs({ message: "Asana configuration not found in database" });

    const tokenRes = await axios.post(
        "https://app.asana.com/-/oauth_token",
        new URLSearchParams({
            grant_type: "authorization_code",
            client_id: asanaConfig?.clientId,
            client_secret: asanaConfig?.clientSecret,
            redirect_uri: `${process.env.BASE_URL}/api/asana/callback`,
            code,
        }),
        { headers: { "Content-Type": "application/x-www-form-urlencoded" }, timeout: 10000 }
    );

    return res.send(JSON.stringify(tokenRes.data));
}

exports.generateAccessToken = generateAccessToken;

exports.addWebhook = async (req, res) => {
    const asanaConfig = await this.generateAccessToken();

    const response = await axios.post(
        `${asanaConfig?.baseUrl}/webhooks`,
        { data: { resource: asanaConfig?.projectId, target: `${process.env.BASE_URL}/api/asana/handleWebhook` } },
        { headers: { Authorization: `Bearer ${asanaConfig?.accessToken}` } }
    );

    return res.json(response.data);
}

exports.handleWebhook = async (req, res) => {
    const secret = req.headers["x-hook-secret"];

    // handshake
    if (secret) {
        res.set("X-Hook-Secret", secret);
        return res.sendStatus(200);
    }

    write_logs({
        message: `Wenhook Called: ${JSON.stringify(req.body)}`
    })

    const events = req.body.events || [];

    for (const event of events) {
        // ✅ new comment/story added
        if (event.action === "added" && event.resource?.resource_type === "story" && event.resource?.resource_subtype === "comment_added") {
            try {
                const storyGid = event?.resource?.gid;
                const taskGid = event.parent.gid;

                // 🔥 Fetch actual comment
                const asanaConfig = await generateAccessToken();
                const asanaClient = createAsanaClient(asanaConfig);
                const commentRes = await asanaClient.get(`/stories/${storyGid}`);
                const comment = commentRes.data.data;

                if (comment?.source === "web") {
                    const ticket = await supportTicketSchema.findOne({ asanaTaskId: taskGid }).lean();
                    if (ticket) {
                        const text = `${comment?.text}\n\n<b>— ${comment?.created_by?.name}</b>`;

                        await supportTicketMessageSchema.create({ ticketId: ticket?._id, from: "bot", text })
                        await supportTicketSchema.updateOne({ _id: ticket?._id }, { $set: { status: "pending" } });

                        const payload = Buffer.from(JSON.stringify({ ticketId: ticket?._id, email: ticket.userEmail })).toString("base64");
                        const chatLink = `${process.env.FRONTEND_REDIRECT_URL}/support-chat?payload=${payload}`;

                        sendEmailHelper(
                            ticket.userEmail,
                            "New Reply from Advertise IQ Support",
                            buildSupportTicketEmail({
                                userName: ticket.userName,
                                ticketId: ticket?._id,
                                message: text,
                                chatLink,
                                type: "reply",
                            })
                        ).catch((err) => { write_logs({ message: "[handleWebhook Silent Error] " + (err?.message || err), log_type: "error" }); });
                    }
                }
            } catch (err) {
                console.log(err);
                write_logs({ message: `Failed to fetch comment:: ${err?.message || err} [body] ${JSON.stringify(req?.body)}` })
            }
        }
    }

    return res.sendStatus(200);
}

exports.fetchAllUsers = async (req, res) => {
    try {
        const asanaConfig = await this.generateAccessToken();
        if (!asanaConfig) {
            return res.status(203).send({
                message: "Asana configuration not found",
                isSuccess: false,
            });
        }

        let allUsers = [];
        let offset = null;

        do {
            const response = await axios.get(
                `${asanaConfig.baseUrl}/workspaces/${asanaConfig.workspaceId}/users`,
                {
                    headers: { Authorization: `Bearer ${asanaConfig.accessToken}` },
                    params: { limit: 100, offset },
                }
            );

            const { data, next_page } = response.data;
            allUsers.push(...data);
            offset = next_page?.offset || null;
        } while (offset);

        if (!allUsers.length) {
            return res.status(200).send({
                message: "No users found from Asana",
                isSuccess: true,
            });
        }

        const bulkOps = [];
        for (const user of allUsers) {
            try {
                const userRes = await axios.get(
                    `${asanaConfig.baseUrl}/users/${user.gid}`,
                    { headers: { Authorization: `Bearer ${asanaConfig.accessToken}` } }
                );

                const userData = userRes.data.data;

                bulkOps.push({
                    updateOne: {
                        filter: { gid: userData.gid },
                        update: {
                            $set: {
                                gid: userData.gid,
                                name: userData.name,
                                email: userData.email || "",
                                photo: userData.photo?.image_1024x1024 || userData.photo?.image_128x128 || null,
                            },
                        },
                        upsert: true,
                    },
                });
            } catch (err) {
                write_logs({
                    message: `Failed to fetch Asana user ${user.gid} :: ${err?.message || err}`,
                });
            }
        }

        if (bulkOps.length) await asanaUserSchema.bulkWrite(bulkOps);

        return res.status(200).send({
            message: "Asana users fetched and stored successfully",
            isSuccess: true,
        });
    } catch (error) {
        write_logs({
            message: `Fetch Asana Users Error :: ${error?.message || error}`,
        });

        return res.status(203).send({
            message: "Failed to fetch Asana users",
            isSuccess: false,
        });
    }
};

exports.getAllUsers = async (req, res) => {
    try {
        let {
            pageNo = 1,
            perPage = 10,
            searchName = "",
            fieldName = "createdAt",
            sortType = "desc",
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        const skip = (pageNo - 1) * perPage;
        const sortOrder = sortType === "asc" ? 1 : -1;

        const matchStage = {};

        if (searchName) matchStage.name = { $regex: new RegExp(RegExp.escape(`${searchName}`?.trim()), "i") };

        const pipeline = [
            { $match: matchStage },
            {
                $facet: {
                    userResult: [
                        { $sort: { [fieldName]: sortOrder } },
                        { $skip: skip },
                        { $limit: perPage },
                    ],
                    totalRecords: [
                        { $count: "count" },
                    ],
                },
            },
        ];

        const result = await asanaUserSchema.aggregate(pipeline);
        const userResult = result?.[0]?.userResult || [];
        const totalRecords = result?.[0]?.totalRecords?.[0]?.count || 0;

        const asanaConfig = await getASANAToken();
        const projectAssignUser = await asanaUserSchema.findOne({ gid: asanaConfig?.projectAssignId }).lean();

        return res.status(200).send({
            isSuccess: true,
            message: "Users fetched successfully",
            getUsers: userResult,
            totalRow: totalRecords ? { count: totalRecords } : {},
            currentPageNo: pageNo,
            totalRecords: totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
            projectAssignUser,
        });
    } catch (error) {
        write_logs({
            message: `Get All Users Aggregation Error :: ${error?.message || error}`,
        });

        return res.status(203).send({
            isSuccess: false,
            message: "Failed to fetch users",
        });
    }
};

exports.assignSupportUser = async (req, res) => {
    try {
        const { userGid } = req.body;
        if (!userGid) {
            return res.status(203).send({ isSuccess: false, message: "User GID is required" });
        }

        const user = await asanaUserSchema.findOne({ gid: userGid }).lean();
        if (!user) {
            return res.status(203).send({ isSuccess: false, message: "User not found" });
        }

        const asanaConfig = await getASANAToken();
        if (!asanaConfig) {
            return res.status(203).send({ isSuccess: false, message: "Asana configuration not found" });
        }

        await asanaConfigSchema.updateOne({ _id: asanaConfig._id }, { $set: { projectAssignId: userGid } });

        return res.status(200).send({
            isSuccess: true,
            message: "Support ticket user assigned successfully",
            assignedUser: user,
        });
    } catch (error) {
        write_logs({
            message: `Assign Support User Error :: ${error?.message || error}`,
        });

        return res.status(203).send({
            isSuccess: false,
            message: "Failed to assign support user",
        });
    }
};