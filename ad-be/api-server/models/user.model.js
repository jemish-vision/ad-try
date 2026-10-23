const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    companyName: {
      type: String,
      trim: true,
    },
    fullName: {
      type: String,
      trim: true,
    },
    profilePhoto: {
      type: String,
      default: null,
    },
    email: {
      type: String,
      trim: true,
      unique: true,
    },
    password: {
      type: String,
      trim: true,
      select: false,
    },
    phoneNumber: {
      type: Number,
      trim: true,
    },
    roleId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "roles",
    },
    isActive: {
      type: Boolean,
      default: true,
      trim: true,
    },
    isVerify: {
      type: Boolean,
      default: false,
      trim: true,
    },
    isTourCompleted: {
      type: Boolean,
      default: false,
    },
    resetPasswordToken: {
      type: String,
      default: null,
      select: false,
    },
    resetPasswordExpires: {
      type: Date,
      default: null,
      select: false,
    },

    isRolePermissionChangeNotify: {
      type: Boolean,
      default: false,
    },
    
    twoFactorEnabled: {
      type: Boolean,
      default: false,
    },
    twoFactorSecret: {
      type: String,
      select: false,
    },
    twoFactorAddedOn: {
      type: Date,
      default: null,
    },
    twoFactorLastUsed: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = new mongoose.model("user", userSchema);
