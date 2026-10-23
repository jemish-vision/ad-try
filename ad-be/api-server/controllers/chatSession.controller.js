"use strict";

const mongoose = require("mongoose");
const ChatSession = require("../models/chatSession.model");
const { write_logs } = require("../../winston/customer/logger");

/**
 * GET all chat sessions for a given profile and authenticated user.
 * POST /api/customer/getChatSessions
 */
exports.getChatSessions = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ isSuccess: false, message: "Unauthorized. User ID missing." });
    }

    const { profileId, page, limit, search } = req.body;
    if (!profileId) {
      return res.status(400).json({ isSuccess: false, message: "profileId is required." });
    }

    const queryFilter = {
      userId: new mongoose.Types.ObjectId(userId),
      profileId: String(profileId),
    };

    if (typeof search === "string" && search.trim()) {
      const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      queryFilter.title = new RegExp(escaped, "i");
    }

    const totalCount = await ChatSession.countDocuments(queryFilter);

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    const sessions = await ChatSession.find(queryFilter)
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Map _id to id or ensure standard frontend shape
    const formatted = sessions.map(s => ({
      id: s.sessionId,
      title: s.title || "New Chat",
      createdAt: s.createdAt || Date.now(),
      updatedAt: s.updatedAt || Date.now(),
      messages: Array.isArray(s.messages) ? s.messages : [],
      reportContext: s.reportContext || null,
    }));

    const hasMore = skip + sessions.length < totalCount;

    return res.status(200).json({
      isSuccess: true,
      message: "Chat sessions retrieved successfully.",
      data: formatted,
      pagination: {
        page: pageNum,
        limit: limitNum,
        totalCount,
        totalPages: Math.ceil(totalCount / limitNum),
        hasMore,
      },
    });
  } catch (error) {
    write_logs({ message: `[getChatSessions Error] ${error?.message || error}` });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to retrieve chat sessions.",
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        totalCount: 0,
        totalPages: 0,
        hasMore: false,
      },
    });
  }
};

/**
 * SAVE or UPSERT a single chat session.
 * POST /api/customer/saveChatSession
 */
exports.saveChatSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ isSuccess: false, message: "Unauthorized. User ID missing." });
    }

    const { sessionId, profileId, title, messages, reportContext } = req.body;
    if (!sessionId || !profileId) {
      return res.status(400).json({ isSuccess: false, message: "sessionId and profileId are required." });
    }

    const existingSession = await ChatSession.findOne({
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: String(sessionId),
    }).lean();

    const isUpdate = Boolean(existingSession && existingSession.messages?.length > 0);
    const requiredAction = isUpdate ? "Update" : "Create";
    const { checkPermission } = require("../helper/common");
    const permCheck = await checkPermission(userId, "AI Assistant", requiredAction, true, req.organizationId);
    if (req.user?.roleName !== "SUPER_ADMIN" && !permCheck?.hasPermission) {
      return res.status(203).json({
        isSuccess: false,
        message: `You do not have ${requiredAction} permission for AI Assistant.`,
      });
    }

    const safeMessages = Array.isArray(messages)
      ? messages.map(m => {
          const role = (m.from || m.sender) === "bot" ? "bot" : "user";
          return {
            id: String(m.id || Date.now()),
            from: role,
            sender: role,
            text: typeof m.text === "string" ? m.text : "",
            time: typeof m.time === "number" ? m.time : Date.now(),
            isReport: Boolean(m.isReport),
            report: m.report || null,
            status: m.status || null,
          };
        })
      : [];

    const now = Date.now();
    const updateDoc = {
      $set: {
        title: title || "New Chat",
        messages: safeMessages,
        reportContext: reportContext || null,
        updatedAt: now,
      },
      $setOnInsert: {
        userId: new mongoose.Types.ObjectId(userId),
        profileId: String(profileId),
        sessionId: String(sessionId),
        createdAt: now,
      },
    };

    const session = await ChatSession.findOneAndUpdate(
      {
        userId: new mongoose.Types.ObjectId(userId),
        sessionId: String(sessionId),
      },
      updateDoc,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    return res.status(200).json({
      isSuccess: true,
      message: "Chat session saved successfully.",
      data: {
        id: session.sessionId,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages,
        reportContext: session.reportContext,
      },
    });
  } catch (error) {
    write_logs({ message: `[saveChatSession Error] ${error?.message || error}` });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to save chat session.",
    });
  }
};

/**
 * DELETE a single chat session.
 * POST /api/customer/deleteChatSession
 */
exports.deleteChatSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ isSuccess: false, message: "Unauthorized. User ID missing." });
    }

    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ isSuccess: false, message: "sessionId is required." });
    }

    await ChatSession.deleteOne({
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: String(sessionId),
    });

    return res.status(200).json({
      isSuccess: true,
      message: "Chat session deleted successfully.",
    });
  } catch (error) {
    write_logs({ message: `[deleteChatSession Error] ${error?.message || error}` });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to delete chat session.",
    });
  }
};

/**
 * CLEAR ALL chat sessions for a profile.
 * POST /api/customer/clearChatSessions
 */
exports.clearChatSessions = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ isSuccess: false, message: "Unauthorized. User ID missing." });
    }

    const { profileId } = req.body;
    if (!profileId) {
      return res.status(400).json({ isSuccess: false, message: "profileId is required." });
    }

    await ChatSession.deleteMany({
      userId: new mongoose.Types.ObjectId(userId),
      profileId: String(profileId),
    });

    return res.status(200).json({
      isSuccess: true,
      message: "All chat sessions cleared successfully.",
    });
  } catch (error) {
    write_logs({ message: `[clearChatSessions Error] ${error?.message || error}` });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to clear chat sessions.",
    });
  }
};

/**
 * RENAME a chat session.
 * POST /api/customer/renameChatSession
 */
exports.renameChatSession = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ isSuccess: false, message: "Unauthorized. User ID missing." });
    }

    const { sessionId, title } = req.body;
    if (!sessionId || !title) {
      return res.status(400).json({ isSuccess: false, message: "sessionId and title are required." });
    }

    await ChatSession.updateOne(
      {
        userId: new mongoose.Types.ObjectId(userId),
        sessionId: String(sessionId),
      },
      {
        $set: {
          title: String(title).trim(),
          updatedAt: Date.now(),
        },
      }
    );

    return res.status(200).json({
      isSuccess: true,
      message: "Chat session renamed successfully.",
    });
  } catch (error) {
    write_logs({ message: `[renameChatSession Error] ${error?.message || error}` });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to rename chat session.",
    });
  }
};

/**
 * MIGRATE multiple chat sessions (from localStorage to MongoDB).
 * POST /api/customer/migrateChatSessions
 */
exports.migrateChatSessions = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id;
    if (!userId) {
      return res.status(401).json({ isSuccess: false, message: "Unauthorized. User ID missing." });
    }

    const { profileId, sessions } = req.body;
    if (!profileId || !Array.isArray(sessions) || sessions.length === 0) {
      return res.status(200).json({ isSuccess: true, message: "No sessions to migrate." });
    }

    const userObjId = new mongoose.Types.ObjectId(userId);
    const operations = sessions.map(s => {
      const safeMessages = Array.isArray(s.messages)
        ? s.messages.map(m => {
            const role = (m.from || m.sender) === "bot" ? "bot" : "user";
            return {
              id: String(m.id || Date.now()),
              from: role,
              sender: role,
              text: typeof m.text === "string" ? m.text : "",
              time: typeof m.time === "number" ? m.time : Date.now(),
              isReport: Boolean(m.isReport),
              report: m.report || null,
              status: m.status || null,
            };
          })
        : [];

      return {
        updateOne: {
          filter: {
            userId: userObjId,
            sessionId: String(s.id || s.sessionId),
          },
          update: {
            $set: {
              title: s.title || "New Chat",
              messages: safeMessages,
              reportContext: s.reportContext || null,
              updatedAt: typeof s.updatedAt === "number" ? s.updatedAt : Date.now(),
            },
            $setOnInsert: {
              userId: userObjId,
              profileId: String(profileId),
              sessionId: String(s.id || s.sessionId),
              createdAt: typeof s.createdAt === "number" ? s.createdAt : Date.now(),
            },
          },
          upsert: true,
        },
      };
    });

    if (operations.length > 0) {
      await ChatSession.bulkWrite(operations, { ordered: false });
    }

    return res.status(200).json({
      isSuccess: true,
      message: `Migrated ${operations.length} sessions successfully.`,
    });
  } catch (error) {
    write_logs({ message: `[migrateChatSessions Error] ${error?.message || error}` });
    return res.status(500).json({
      isSuccess: false,
      message: error?.message || "Failed to migrate chat sessions.",
    });
  }
};
