const mongoose = require("mongoose");

const userInvitationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    organizationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "organization",
      required: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "roles",
      required: true,
    },
    profileAccess: [
      {
        configId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "config",
          required: true,
        },
        profileId: {
          type: Number,
          required: true,
        },
      },
    ],
    token: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "ACCEPTED", "CANCELLED", "EXPIRED", "REJECTED"],
      default: "PENDING",
    },
    invitedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "user",
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    acceptedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

userInvitationSchema.index({ organizationId: 1, email: 1, status: 1 });
userInvitationSchema.index({ token: 1 });

module.exports = mongoose.model("userInvitation", userInvitationSchema);
