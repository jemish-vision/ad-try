const { write_logs } = require("../../../winston/utility/logger");
const { buildSupportTicketEmail } = require("../../../emailTemplate/buildSupportTicketEmail");
const { sendEmailHelper } = require("../../helper/emailHelper");
const supportTicketSchema = require("../../models/supportTicket.model");
const supportTicketMessageSchema = require("../../models/supportTicketMessage.model");
const { addAsanaComment } = require("../../services/asana.service");

exports.supportTicketList = async (req, res) => {
    try {
        const {
            pageNo = 1,
            perPage = 10,
            status,
            search,
            fieldName = "updatedAt",
            sortType = "DESC"
        } = req.body;

        const match = {};

        // STATUS FILTER
        if (status) match.status = status;

        // SEARCH (name or email)
        if (search) {
            match.$or = [
                { userName: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { userEmail: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                { subject: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } }
            ];
        }

        const sort = {
            [fieldName]: sortType === "ASC" ? 1 : -1
        };

        const result = await supportTicketSchema.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: "supportticketmessages",
                    let: { ticketId: "$_id" },
                    pipeline: [
                        { $match: { $expr: { $eq: ["$ticketId", "$$ticketId"] } } },
                        { $sort: { createdAt: -1 } },
                        { $limit: 1 },
                        { $project: { message: 1, createdAt: 1 } }
                    ],
                    as: "latestMessage"
                }
            },
            {
                $addFields: {
                    lastMessage: { $arrayElemAt: ["$latestMessage.message", 0] },
                    lastMessageAt: { $arrayElemAt: ["$latestMessage.createdAt", 0] }
                }
            },
            { $project: { latestMessage: 0 } },
            { $sort: sort },
            {
                $facet: {
                    data: [
                        { $skip: (pageNo - 1) * perPage },
                        { $limit: Number(perPage) }
                    ],
                    totalRecords: [{ $count: "count" }]
                }
            }
        ]);

        return res.status(200).json({
            isSuccess: true,
            data: result[0]?.data || [],
            totalRecords: result[0]?.totalRecords[0]?.count || 0
        });
    } catch (error) {
        write_logs({ message: `[supportTicketList Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(500).json({
            isSuccess: false,
            message: "An internal server error occurred"
        });
    }
};

exports.closeSupportTicket = async (req, res) => {
    try {
        const { ticketId } = req.body;
        if (!ticketId) {
            return res.status(203).json({
                isSuccess: false,
                message: "Ticket ID is required"
            });
        }

        const ticket = await supportTicketSchema.findById(ticketId);
        if (!ticket) {
            return res.status(203).json({
                isSuccess: false,
                message: "Ticket not found"
            });
        }

        if (ticket.status === "closed") {
            return res.status(200).json({
                isSuccess: true,
                message: "Ticket already closed"
            });
        }

        // Update status
        ticket.status = "closed";
        await ticket.save();

        // Optional: add system message
        const text = "✅ Ticket has been closed by support team."
        await supportTicketMessageSchema.create({ ticketId, from: "bot", text });

        await addAsanaComment({ taskId: ticket?.asanaTaskId, comment: `💬 Support Team Reply\n\n${text}\n\n— Advertise IQ` });

        const payload = Buffer.from(JSON.stringify({ ticketId, email: ticket.userEmail })).toString("base64");
        const chatLink = `${process.env.FRONTEND_REDIRECT_URL}/support-chat?payload=${payload}`;

        sendEmailHelper(
            ticket.userEmail,
            "New Reply from Advertise IQ Support",
            buildSupportTicketEmail({
                userName: ticket.userName,
                ticketId,
                message: text,
                chatLink,
                type: "reply",
            })
        ).catch((err) => { write_logs({ message: "[closeSupportTicket Silent Error] " + (err?.message || err), log_type: "error" }); });

        return res.status(200).json({
            isSuccess: true,
            message: "Ticket closed successfully"
        });

    } catch (error) {
        write_logs({ message: `[closeSupportTicket Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({
            isSuccess: false,
            message: "An internal server error occurred"
        });
    }
};
