const { write_logs } = require("../../winston/utility/logger");
const moment = require("moment");
const { default: mongoose } = require("mongoose");

const auditLogSchema = require("../models/auditLog.model");

exports.getAuditLog = async (req, res) => {
    try {
        const userId = req?.user?._id;
        let {
            pageNo = 1,
            perPage = 50,
            search,
            event = [],
            fromDate,
            toDate,
            sortType = -1,
        } = req.body;

        pageNo = Number(pageNo);
        perPage = Number(perPage);

        const query = {
            userId: new mongoose.Types.ObjectId(userId),
            ...(event?.length && { event: { $in: event } }),
            ...((fromDate || toDate) && {
                createdAt: {
                    ...(fromDate && { $gte: moment(fromDate).startOf("day").toDate() }),
                    ...(toDate && { $lte: moment(toDate).endOf("day").toDate() })
                }
            }),
            ...(search && {
                $or: [
                    { message: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                    { event: { $regex: new RegExp(RegExp.escape(`${search}`?.trim()), "i") } },
                ]
            })
        };

        const pipeline = [
            { $match: query },
            {
                $facet: {
                    data: [
                        { $sort: { createdAt: Number(sortType) } },
                        { $skip: (pageNo - 1) * perPage },
                        { $limit: perPage },
                        {
                            $project: {
                                _id: 1,
                                event: 1,
                                message: 1,
                                ipAddress: 1,
                                userAgent: 1,
                                metadata: 1,
                                createdAt: 1,
                                configId: 1,
                                sellerConfigId: 1,
                            },
                        },
                    ],
                    totalCount: [{ $count: "count" }],
                },
            },
            {
                $project: {
                    data: 1,
                    totalCount: { $ifNull: [{ $arrayElemAt: ["$totalCount.count", 0] }, 0] },
                },
            },
        ];

        const result = await auditLogSchema.aggregate(pipeline);
        const data = result?.[0]?.data || []
        const totalRecords = result?.[0]?.totalCount || 0

        return res.status(200).json({
            isSuccess: true,
            data,
            currentPageNo: pageNo,
            totalRecords,
            totalPages: Math.ceil(totalRecords / perPage),
        });
    } catch (error) {
        write_logs({ message: `[getAuditLog Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).json({ isSuccess: false, message: error?.message ?? "Internal server error" });
    }
};