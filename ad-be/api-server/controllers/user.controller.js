const moment = require("moment-timezone");
const bcrypt = require("bcrypt");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { ObjectId } = mongoose.Types;
const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const { Buffer } = require("buffer");
const pLimit = require("p-limit").default;
const limit = pLimit(Number(process.env.PROCESS_LIMIT));
const { generateSecret, generateURI, verify } = require("otplib");
const qrcode = require("qrcode");

const userSchema = require("../models/user.model");
const otpSchema = require("../models/otp.model");
const profileSchema = require("../models/profiles.model");
const roleSchema = require("../models/superAdmin/role.model");
const packageSchema = require("../models/packages.model");
const subscriptionSchema = require("../models/subscriptions.model");
const subscriptionHistorySchema = require("../models/subscriptionHistories.model");
const googleconfigSchema = require("../models/googleconfig.model");
const auditLogSchema = require("../models/auditLog.model");
const organizationSchema = require("../models/organization.model");
const userInvitationSchema = require("../models/userInvitation.model");
const roleBasedPermissionSchema = require("../models/roleBasedPermission.model");
const profileBasedPermissionSchema = require("../models/profileBasedPermission.model");
const permissionSchema = require("../models/superAdmin/permission.model");
const jwt = require("jsonwebtoken");

const { sendEmailHelper } = require("../helper/emailHelper");
const { buildWelcomeEmail } = require('../../emailTemplate/buildWelcomeEmail');
const { forgotPasswordTemplate } = require("../../emailTemplate/forgotPasswordTemplate");
const { trialEndReminderEmail } = require("../../emailTemplate/trialEndReminderEmail");
const { buildUserInvitationEmail } = require("../../emailTemplate/buildUserInvitationEmail");

const { cron_logs } = require("../../winston/cronAutomation/logger");
const { write_logs } = require("../../winston/subscription/logger");
const { generateOtp, encryptData } = require("../helper/common");
const { buildOtpVerificationEmail } = require("../../emailTemplate/buildOtpVerificationEmail");
const { ROLES } = require("../constants/roles");

exports.registortUser = async (req, res) => {
  const {
    companyName,
    fullName,
    email,
    password,
    phoneNumber,
    invitationToken,
  } = req.body;
  try {
    const findEmail = await userSchema.findOne({ email }).lean();
    if (findEmail) {
      return res.status(203).send({ message: "Email is already existing!", isSuccess: false });
    }

    const role = await roleSchema.findOne({ roleName: ROLES.ADMIN }).lean();
    const Password = await bcrypt.hash(password, 10);
    const newUser = new userSchema({
      companyName,
      fullName,
      email,
      password: Password,
      phoneNumber,
      roleId: role?._id,
      isVerify: false,
    });
    await newUser.save();

    if (!invitationToken) {
      await organizationSchema.create({
        organizationName: companyName?.trim() || `${fullName || "User"}'s Organization`,
        userId: newUser._id,
        planId: null,
        startDate: null,
        endDate: null,
        isTrialActive: false,
      });
    }

    sendEmailHelper(
      email,
      "Welcome",
      buildWelcomeEmail({
        userName: fullName,
        userId: email,
        password: password,
      })
    ).catch((err) => { write_logs({ message: "[registortUser Silent Error] " + (err?.message || err), log_type: "error" }); });

    const googleConnected = await googleconfigSchema.findOne({ userId: newUser._id }).lean();

    return res.status(200).send({
      message: "Registration successfully.",
      isSuccess: true,
      newUser,
      role: role.roleName,
      userId: newUser._id,
      isGoogleConnected: googleConnected ? true : false,
    });

  } catch (error) {
      write_logs({ message: `[registortUser Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
}

exports.sendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (typeof email !== "string" || !email.trim()) {
      return res.status(203).send({ message: "Valid email is required", isSuccess: false });
    }

    const user = await userSchema.findOne({ email: email.trim() }).lean();
    if (!user) {
      return res.status(203).send({ message: "User not found", isSuccess: false });
    }

    if (user.isVerify) {
      return res.status(203).send({ message: "Email already verified", isSuccess: false });
    }

    const otp = generateOtp();

    await otpSchema.deleteMany({ email });
    await otpSchema.create({ email, otp, expiresAt: new Date(Date.now() + 5 * 60 * 1000) });

    // Send OTP Email
    await sendEmailHelper(
      email,
      "Verify Your Email - OTP",
      buildOtpVerificationEmail({ userName: user?.fullName, otp, expiresIn: "5 minutes" })
    ).catch((err) => { write_logs({ message: "[sendOtp Silent Error] " + (err?.message || err), log_type: "error" }); });

    return res.status(200).send({
      message: "OTP sent successfully",
      isSuccess: true,
    });

  } catch (error) {
      write_logs({ message: `[sendOtp Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "An internal server error occurred",
      isSuccess: false,
    });
  }
};

exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (typeof email !== "string" || typeof otp !== "string" || !email.trim() || !otp.trim()) {
      return res.status(203).send({ message: "Email and OTP required", isSuccess: false });
    }

    const otpData = await otpSchema.findOne({ email: email.trim(), otp: otp.trim() }).lean();
    if (!otpData) {
      return res.status(203).send({ message: "Invalid OTP", isSuccess: false });
    }

    if (otpData.expiresAt < new Date()) {
      return res.status(203).send({ message: "OTP expired", isSuccess: false });
    }

    const user = await userSchema.findOne({ email }).lean().populate("roleId", { roleName: 1 });

    if (!user) {
      return res.status(203).send({ message: "User not found", isSuccess: false });
    }

    await userSchema.updateOne({ email }, { $set: { isVerify: true } });

    await otpSchema.deleteMany({ email });

    return res.status(200).send({
      message: "Email verified successfully",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[verifyOtp Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "An internal server error occurred",
      isSuccess: false,
    });
  }
};

exports.forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (typeof email !== "string" || !email.trim()) {
      return res.status(400).send({
        message: "Valid email is required",
        isSuccess: false,
      });
    }

    const user = await userSchema.findOne({ email: email.trim() }).lean();

    if (!user) {
      return res.status(404).send({
        message: "User not found with this email",
        isSuccess: false,
      });
    }

    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");
    await userSchema.updateOne(
      { _id: user._id },
      {
        $set: {
          resetPasswordToken: hashedToken,
          resetPasswordExpires: new Date(Date.now() + 15 * 60 * 1000),
        },
      }
    );

    const resetLink = `${process.env.FRONTEND_REDIRECT_URL}/reset-password?token=${rawToken}`;

    await sendEmailHelper(
      email,
      "Reset Your Password",
      forgotPasswordTemplate({
        fullName: user.fullName,
        resetLink,
      })
    );

    return res.status(200).send({
      message: "Password reset link sent to your email",
      isSuccess: true,
    });

  } catch (error) {
      write_logs({ message: `[forgotPassword Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Forgot Password Error:", error);

    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
    });
  }
};

exports.resetPassword = async (req, res) => {
  const { token, payload, password } = req.body;

  try {
    const rawToken = typeof token === "string" && token ? token : (typeof payload === "string" ? payload : null);

    if (!rawToken || typeof password !== "string" || !password) {
      return res.status(203).send({
        message: "Valid reset token and new password are required",
        isSuccess: false,
      });
    }

    const hashedToken = crypto.createHash("sha256").update(rawToken).digest("hex");

    const user = await userSchema.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.status(203).send({
        message: "Reset link is invalid or has expired",
        isSuccess: false,
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    await userSchema.updateOne(
      { _id: user._id },
      {
        $set: { password: hashedPassword },
        $unset: { resetPasswordToken: 1, resetPasswordExpires: 1, stringPassword: 1 },
      }
    );

    await auditLogSchema.create({
      userId: user._id,
      event: "PASSWORD_CHANGE",
      message: "Password reset successfully",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { status: "SUCCESS", resetType: "FORGOT_PASSWORD" },
    });

    return res.status(200).send({
      message: "Password reset successfully",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[resetPassword Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.createUser = async (req, res) => {
  const loginUserId = req.user._id;
  const {
    fullName,
    email,
    password,
    phoneNumber,
    roleId,
    companyName,
  } = req.body;
  try {

    const findEmail = await userSchema.findOne({ email }).lean();
    if (findEmail) {
      return res.status(203).send({ message: "Email is already existing!", isSuccess: false });
    }

    const Password = await bcrypt.hash(password, 10);
    const newUser = new userSchema({
      fullName,
      email,
      password: Password,
      phoneNumber,
      roleId,
      companyName,
    });
    await newUser.save();

    return res.status(200).send({
      message: "User added successfully.",
      isSuccess: true,
      newUser,
    });

  } catch (error) {
      write_logs({ message: `[createUser Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });

    return res.status(203).send({
      error: "An internal server error occurred",
      message: "Something went wrong, please try again!",
      isSuccess: false,
    });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const {
      userId,
      fullName,
      phoneNumber,
      roleId,
      companyName,
    } = req.body;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).send({
        message: "User ID is required.",
        isSuccess: false,
      });
    }

    const isOwnerOrAdmin = req?.role?.roleName === ROLES.SUPER_ADMIN || req?.role?.roleName === ROLES.ADMIN;
    if (!isOwnerOrAdmin && userId.toString() !== req.user._id.toString()) {
      return res.status(403).send({
        message: "Forbidden: You do not have permission to update other users.",
        isSuccess: false,
      });
    }

    const allowRoleIdUpdate = isOwnerOrAdmin && roleId;

    // Find the user
    const user = await userSchema.findOne({ _id: userId, $or: [{ isActive: true }] }).lean();
    if (!user) {
      return res.status(404).send({
        message: "User not found.",
        isSuccess: false,
      });
    }

    // Update user
    await userSchema.updateOne({ _id: userId }, {
      $set: {
        ...(fullName && { fullName }),
        ...(phoneNumber && { phoneNumber }),
        ...(allowRoleIdUpdate && { roleId }),
        ...(companyName && { companyName })
      }
    });

    if (companyName) {
      await organizationSchema.updateOne({ userId: userId }, { $set: { organizationName: companyName } });
    }

    const orgId = req.organizationId;
    if (allowRoleIdUpdate && orgId) {
      await roleBasedPermissionSchema.findOneAndUpdate(
        { userId, organizationId: orgId },
        { $set: { roleId } },
        { upsert: true }
      );
    }

    return res.status(200).send({
      message: "User profile updated successfully.",
      isSuccess: true,
    });

  } catch (error) {
      write_logs({ message: `[updateUser Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user._id;
    const { fullName, phoneNumber, removeProfilePhoto } = req.body;

    // Find the user
    const user = await userSchema.findOne({ _id: userId, $or: [{ isActive: true }] }).lean();
    if (!user) {
      return res.status(203).send({
        message: "User not found.",
        isSuccess: false,
      });
    }

    const updateData = {};
    if (fullName) updateData.fullName = fullName;
    if (phoneNumber) updateData.phoneNumber = phoneNumber;

    if (removeProfilePhoto === 'true') {
      updateData.profilePhoto = "";
    } else if (req.files && req.files.profilePhoto && req.files.profilePhoto[0]) {
      updateData.profilePhoto = req.files.profilePhoto[0].filename;
    }

    // Update user
    if (Object.keys(updateData).length > 0) {
      await userSchema.updateOne({ _id: userId }, { $set: updateData });
    }

    return res.status(200).send({
      message: "Profile updated successfully.",
      isSuccess: true,
      profilePhoto: updateData.profilePhoto || user.profilePhoto
    });

  } catch (error) {
      write_logs({ message: `[updateProfile Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.updateProfileAccess = async (req, res) => {
  try {
    let {
      userId,
      profileAccess,
    } = req.body;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).send({
        message: "User ID is required.",
        isSuccess: false,
      });
    }

    userId = new mongoose.Types.ObjectId(userId);

    let orgId = req.organizationId || req.body.organizationId;
    if (orgId) {
      orgId = new mongoose.Types.ObjectId(orgId);
      await profileBasedPermissionSchema.deleteMany({ userId, organizationId: orgId });
    } else {
      await profileBasedPermissionSchema.deleteMany({ userId });
    }

    for (let { configId, profileId } of profileAccess) {
      if (!configId || !profileId) continue;
      configId = new mongoose.Types.ObjectId(configId);
      const numericProfileId = Number(profileId);

      if (orgId) {
        const checkPerm = await profileBasedPermissionSchema.findOne({
          userId,
          organizationId: orgId,
          configId: configId,
          profileId: numericProfileId
        });
        if (!checkPerm) {
          const perm = new profileBasedPermissionSchema({
            userId,
            organizationId: orgId,
            configId: configId,
            profileId: numericProfileId,
            hasAccess: true
          });
          await perm.save();
        }
      }
    }

    return res.status(200).send({
      message: "Profile access updated successfully.",
      isSuccess: true,
    });

  } catch (error) {
      write_logs({ message: `[updateProfileAccess Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id: userId } = req.body;
    const orgId = req.organizationId;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).send({
        message: "User ID is required.",
        isSuccess: false,
      });
    }

    // Find the user
    const user = await userSchema.findOne({ _id: userId, $or: [{ isActive: true }] }).lean();
    if (!user) {
      return res.status(404).send({
        message: "User not found.",
        isSuccess: false,
      });
    }

    if (!orgId || orgId === "null" || orgId === "undefined") {
      return res.status(400).send({
        message: "Organization ID is required to remove user access from an organization.",
        isSuccess: false,
      });
    }

    // Remove user role and profile permissions ONLY for this organizationId
    await roleBasedPermissionSchema.deleteMany({ userId, organizationId: orgId });
    await profileBasedPermissionSchema.deleteMany({ userId, organizationId: orgId });

    return res.status(200).send({
      message: "User removed from organization successfully.",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[deleteUser Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: error.message || "An internal server error occurred",
    });
  }
};


exports.changePassword = async (req, res) => {
  try {
    const userId = req.user._id;
    const { oldPassword, newPassword } = req.body;

    if (!userId) {
      return res.status(203).send({
        message: "User ID is required.",
        isSuccess: false,
      });
    }

    // Find the user
    const user = await userSchema.findOne({ _id: userId, $or: [{ isActive: true }] }).select("+password").lean();
    if (!user) {
      return res.status(203).send({
        message: "User not found.",
        isSuccess: false,
      });
    }

    const isMatch = await bcrypt.compare(oldPassword, user.password);
    if (!isMatch) {
      await auditLogSchema.create({
        userId,
        event: "PASSWORD_CHANGE",
        message: "Password change failed due to invalid old password",
        ipAddress: req.ip,
        userAgent: req.headers["user-agent"],
        metadata: { status: "FAILED" }
      });

      return res.status(203).send({
        message: "Old password is incorrect.",
        isSuccess: false,
      });
    }

    const encryptedPassword = await bcrypt.hash(newPassword, 10);
    await userSchema.findByIdAndUpdate(
      { _id: user._id },
      {
        $set: { password: encryptedPassword },
        $unset: { stringPassword: 1 }
      },
      { new: true }
    );

    await auditLogSchema.create({
      userId,
      event: "PASSWORD_CHANGE",
      message: "Password changed successfully",
      ipAddress: req.ip,
      userAgent: req.headers["user-agent"],
      metadata: { status: "SUCCESS" }
    });

    return res.status(200).send({
      message: "Password changed successfully.",
      isSuccess: true,
    });

  } catch (error) {
      write_logs({ message: `[changePassword Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
}

async function findProductByName(name) {
  const escapedName = typeof name === 'string' ? name.replace(/(['"\\])/g, '\\$1') : name;
  const products = await stripe.products.search({
    query: `name:'${escapedName}'`,
  });

  let product;
  if (products.data.length === 0) {
    product = await stripe.products.create({
      name: name,
    });
  }
  else {
    product = products.data[0];
  }
  return product;
}

async function findRecurringPrice(productId, amount, currency, interval = "month") {
  const prices = await stripe.prices.search({
    query: `product:'${productId}' AND active:'true' AND type:'recurring'`,
  });

  // Check if there is an existing price with the exact interval and amount
  let price = prices.data.find(
    (p) => p.recurring?.interval === interval && p.unit_amount === amount
  );

  if (!price) {
    price = await stripe.prices.create({
      unit_amount: amount,
      currency: currency,
      recurring: {
        interval: interval,
      },
      product: productId,
    });
  }
  return price;
}

async function findMonthlyPrice(productId, amount, currency) {
  return findRecurringPrice(productId, amount, currency, "month");
}

async function findCustomerByEmail(email) {
  const result = await stripe.customers.search({
    query: `email:'${email}'`,
  });

  let customer;
  if (result.data.length == 0) {
    customer = await stripe.customers.create({
      email: email,
    });
  }
  else {
    customer = result.data[0];
  }

  return customer;
}

exports.saveTrialSubscription = async (userId, resObj = null) => {
  const isRoute = resObj && typeof resObj.status === "function" && typeof resObj.send === "function";
  const res = resObj;
  try {
    let id = userId;

    if (isRoute) {
      id = userId?.user?._id || userId;
    }

    const user = await userSchema.findOne({ _id: id });
    if (!user) {
      if (isRoute && res) {
        return res.status(200).send({
          message: "User not found!",
          isSuccess: true,
        });
      }
      return false;
    }

    const orgCheck = await organizationSchema.findOne({ userId: id }).lean();
    if (orgCheck && (orgCheck.hasUsedTrial || orgCheck.isTrialActive || orgCheck.planId)) {
      if (isRoute && res) {
        return res.status(200).send({
          message: "Free trial has already been used or completed for this organization. Please purchase a plan.",
          isSuccess: false,
        });
      }
      return false;
    }

    let packageQuery = { name: "Free Trial" };
    if (isRoute && userId?.body?.packageId) {
      packageQuery = { _id: userId.body.packageId };
    } else if (isRoute && userId?.body?.packageName) {
      packageQuery = { name: userId.body.packageName };
    }
    const package = await packageSchema.findOne(packageQuery).lean() || await packageSchema.findOne({ name: "Free Trial" }).lean();
    if (!package) {
      if (isRoute && res) {
        return res.status(200).send({
          message: "Package not found!",
          isSuccess: true,
        });
      }
      return false;
    }

    const packageStartDate = new Date();
    const packageEndDate = new Date(packageStartDate);
    packageEndDate.setDate(packageEndDate.getDate() + Number(package.trialDays));

    const newSub = await subscriptionSchema.findOneAndUpdate(
      {
        userId: id,
        packageId: package._id,
      },
      {
        $set: {
          stripeCustomerId: null,
          stripeSubscriptionId: "trial",
          paymentDate: packageStartDate,
          nextBillingDate: packageEndDate,
          subscriptionStatus: "active",
        }
      },
      { new: true, upsert: true }
    );

    await subscriptionSchema.updateMany(
      {
        userId: id,
        _id: { $ne: newSub._id },
        subscriptionStatus: "active"
      },
      {
        $set: {
          subscriptionStatus: "canceled"
        }
      }
    );

    await organizationSchema.findOneAndUpdate(
      { userId: id },
      {
        $set: {
          planId: package._id,
          subscriptionId: newSub._id,
          startDate: packageStartDate,
          endDate: packageEndDate,
          isTrialActive: true,
          hasUsedTrial: true,
        }
      }
    );

    if (isRoute && res) {
      return res.status(200).send({
        message: "Subscription saved successfully.",
        isSuccess: true,
      });
    }
    return true;

  } catch (error) {
      write_logs({ message: `[saveTrialSubscription Error] ${error?.message || error} [body] ${JSON.stringify(userId?.body)}`, log_type: "error" });
    if (isRoute && res) {
      return res.status(500).send({
        message: "Something went wrong, please try again!",
        isSuccess: false,
        error: "An internal server error occurred"
      });
    }
    return false;
  }
}

exports.createSubscription = async (req, res) => {
  try {
    const { _id: userId } = req.user;
    const { packageName, billingCycle = "monthly" } = req.body;

    const user = await userSchema.findOne({ _id: userId }).lean();
    if (!user) {
      return res.status(200).send({
        message: "User not found!",
        isSuccess: true,
      });
    }

    const package = await packageSchema.findOne({ name: packageName }).lean();
    if (!package) {
      return res.status(200).send({
        message: "Package not found!",
        isSuccess: true,
      });
    }

    const product = await findProductByName(packageName);
    const isYearly = billingCycle === "yearly";
    const interval = isYearly ? "year" : "month";
    const baseAmount = isYearly
      ? (package.yearlyPrice > 0 ? package.yearlyPrice : (package.monthlyPrice ? package.monthlyPrice * 10 : package.price * 10))
      : (package.monthlyPrice > 0 ? package.monthlyPrice : package.price);
    const currency = (package.currency || "USD").toUpperCase();
    const price = await findRecurringPrice(product.id, baseAmount * 100, currency, interval);
    const customer = await findCustomerByEmail(user.email);

    const orgId = req.organizationId || req.headers["x-organization-id"] || user.organizationId;
    const orgQuery = orgId && mongoose.Types.ObjectId.isValid(orgId)
      ? { _id: new mongoose.Types.ObjectId(orgId) }
      : { $or: [{ userId: new mongoose.Types.ObjectId(userId) }, { userId: String(userId) }] };
    const existingOrg = await organizationSchema.findOne(orgQuery).lean();

    if (existingOrg?.isUpcomingPlanPaid) {
      return res.status(200).send({
        message: "You have already scheduled and paid for next month's plan.",
        isSuccess: false,
      });
    }

    const hasActivePlan = Boolean(existingOrg?.planId && existingOrg?.endDate && new Date(existingOrg.endDate) > new Date());

    const metadata = {
      userId: user?._id.toString(),
      packageId: package._id.toString(),
      organizationId: orgId ? orgId.toString() : "",
      isSwitch: hasActivePlan ? "true" : "false"
    };

    const subscription_data = {
      metadata
    };

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customer.id,
      line_items: [
        {
          price: price.id,
          quantity: 1,
        },
      ],
      metadata: metadata,
      subscription_data: subscription_data,
      success_url: `${process.env.FRONTEND_REDIRECT_URL}/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_REDIRECT_URL}/payment-failed`,
    });

    return res.status(200).send({
      message: "Subscription session created successfully.",
      isSuccess: true,
      data: session.url
    });

  } catch (error) {
      write_logs({ message: `[createSubscription Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
}

exports.stripeWebhook = async (req, res) => {

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {

    write_logs({
      message: `Webhook signature failed: ${err.message}`
    });

    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        console.log('Checkout session completed:');
        await handleCheckoutCompleted(event.data.object);
        break;

      case "invoice.payment_succeeded":
        console.log('Invoice payment succeeded:');
        await handleInvoicePaymentSucceeded(event.data.object);
        break;

      case "invoice.payment_failed":
        console.log('Invoice payment failed:');
        await handleInvoicePaymentFailed(event.data.object);
        break;

      case "customer.subscription.updated":
        console.log('Customer subscription updated:');
        await handleSubscriptionUpdated(event.data.object);
        break;

      case "customer.subscription.deleted":
        console.log('Customer subscription deleted:');
        await handleSubscriptionDeleted(event.data.object);
        break;

      default:
        console.log(`Unhandled event: ${event.type}`);
    }

    res.json({ received: true });
  } catch (err) {
      write_logs({ message: `[stripeWebhook Error] ${err?.message || err} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("🔥 Webhook handler failed:", err);
    res.status(500).json({ error: "Webhook processing failed" });
  }
}

const handleCheckoutCompleted = async (session) => {
  try {
    write_logs({
      message: `handleCheckoutCompleted -> Session: ${JSON.stringify(session)}`
    });

    const subscription = await stripe.subscriptions.retrieve(session.subscription);

    write_logs({
      message: `handleCheckoutCompleted -> Subscription: ${JSON.stringify(subscription)}`
    });

    const userId = session.metadata?.userId;
    const packageId = session.metadata?.packageId;
    const organizationId = session.metadata?.organizationId;

    write_logs({
      message: `handleCheckoutCompleted -> extracted metadata: userId=${userId}, packageId=${packageId}, organizationId=${organizationId}`
    });

    if (!userId) {
      write_logs({
        message: `handleCheckoutCompleted -> Warning: userId is missing in session metadata. Returning.`
      });
      return;
    }

    write_logs({
      message: `handleCheckoutCompleted -> Checking subscription status: ${subscription.status}`
    });

    if (subscription.status == "active" || subscription.status == "trialing") {
      const packageStartDate = new Date(subscription.items.data[0]?.current_period_start * 1000);
      const packageEndDate = new Date(subscription.items.data[0]?.current_period_end * 1000);

      write_logs({
        message: `handleCheckoutCompleted -> Active subscription. packageStartDate=${packageStartDate}, packageEndDate=${packageEndDate}`
      });

      const newSub = await subscriptionSchema.findOneAndUpdate(
        {
          userId,
          packageId
        },
        {
          $set: {
            stripeCustomerId: session.customer,
            stripeSubscriptionId: subscription.id,
            paymentDate: packageStartDate,
            nextBillingDate: packageEndDate,
            subscriptionStatus: subscription.status,
          }
        },
        { new: true, upsert: true }
      ).lean();

      write_logs({
        message: `handleCheckoutCompleted -> Subscription updated/created: ${newSub._id}`
      });

      const orgQuery = organizationId && mongoose.Types.ObjectId.isValid(organizationId)
        ? { _id: new mongoose.Types.ObjectId(organizationId) }
        : { $or: [{ userId: new mongoose.Types.ObjectId(userId) }, { userId: String(userId) }] };

      const existingOrg = await organizationSchema.findOne(orgQuery).lean();
      const isSwitch = session.metadata?.isSwitch === "true" || Boolean(existingOrg?.planId && existingOrg?.endDate && new Date(existingOrg.endDate) > new Date());

      if (!isSwitch) {
        // Mark all other subscriptions for this user as canceled (prevent multiple active subscriptions)
        await subscriptionSchema.updateMany(
          {
            userId,
            _id: { $ne: newSub._id },
            subscriptionStatus: "active"
          },
          {
            $set: {
              subscriptionStatus: "canceled"
            }
          }
        );
      }

      if (isSwitch) {
        await organizationSchema.updateMany(
          orgQuery,
          {
            $set: {
              upcomingPlanId: new mongoose.Types.ObjectId(packageId),
              upcomingSubscriptionId: newSub._id,
              upcomingStartDate: existingOrg?.endDate || packageEndDate,
              isUpcomingPlanPaid: true,
            }
          }
        );
        write_logs({
          message: `handleCheckoutCompleted -> Switched plan scheduled for next month: upcomingPlanId=${packageId}`
        });
      } else {
        await organizationSchema.updateMany(
          orgQuery,
          {
            $set: {
              planId: new mongoose.Types.ObjectId(packageId),
              subscriptionId: newSub._id,
              startDate: packageStartDate,
              endDate: packageEndDate,
              isTrialActive: false,
              hasUsedTrial: true,
              upcomingPlanId: null,
              upcomingSubscriptionId: null,
              upcomingStartDate: null,
              isUpcomingPlanPaid: false,
            }
          }
        );
        write_logs({
          message: `handleCheckoutCompleted -> Organization plan updated immediately to ${packageId}`
        });
      }

      if (!isSwitch) {
        // Mark other active histories as expired
        await subscriptionHistorySchema.updateMany(
          { userId, status: "active", subscriptionId: { $ne: subscription.id } },
          { $set: { status: "expired", endDate: packageStartDate } }
        );
      }

      const package = await packageSchema.findById(packageId).lean();
      await subscriptionHistorySchema.create({
        userId,
        packageId,
        subscriptionId: subscription.id,
        price: package?.price || 0,
        paymentDate: packageStartDate,
        startDate: packageStartDate,
        endDate: packageEndDate,
        status: "active",
      });

      write_logs({
        message: `handleCheckoutCompleted -> Subscription history created for packageId: ${packageId}`
      });
    }

  } catch (error) {
    write_logs({
      message: `handleCheckoutCompleted -> Error: ${error.message}`
    });
  }
}

exports.verifyPaymentSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).send({
        isSuccess: false,
        message: "Session ID is required"
      });
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).send({
        isSuccess: false,
        message: "Checkout session not found"
      });
    }

    if (session.payment_status === "paid" || session.status === "complete") {
      await handleCheckoutCompleted(session);
      return res.status(200).send({
        isSuccess: true,
        message: "Payment verified and subscription activated successfully!",
        data: {
          packageId: session.metadata?.packageId,
          subscriptionId: session.subscription
        }
      });
    }

    return res.status(200).send({
      isSuccess: false,
      message: "Payment has not been completed yet."
    });
  } catch (error) {
    write_logs({ message: `[verifyPaymentSession Error] ${error?.message || error}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Error verifying payment session",
      error: error.message
    });
  }
};


const handleInvoicePaymentSucceeded = async (invoice) => {
  try {

    const subscription = await stripe.subscriptions.retrieve(
      invoice.subscription
    );

    write_logs({
      message: `handleInvoicePaymentSucceeded -> Subscription: ${JSON.stringify(subscription)}`
    });

    const userId = subscription.metadata?.userId;
    const packageId = subscription.metadata?.packageId;

    if (subscription.status == "active") {

      const packageStartDate = new Date(subscription.items.data[0]?.current_period_start * 1000);
      const packageEndDate = new Date(subscription.items.data[0]?.current_period_end * 1000);

      const newSub = await subscriptionSchema.findOneAndUpdate(
        {
          userId,
          packageId,
          stripeSubscriptionId: subscription.id,
        },
        {
          $set: {
            paymentDate: packageStartDate,
            nextBillingDate: packageEndDate,
          }
        },
        { new: true }
      )

      // Mark all other subscriptions for this user as canceled (prevent multiple active subscriptions)
      await subscriptionSchema.updateMany(
        {
          userId,
          _id: { $ne: newSub?._id },
          subscriptionStatus: "active"
        },
        {
          $set: {
            subscriptionStatus: "canceled"
          }
        }
      );

      await organizationSchema.findOneAndUpdate(
        { userId },
        {
          $set: {
            planId: packageId,
            subscriptionId: newSub?._id || null,
            startDate: packageStartDate,
            endDate: packageEndDate,
            isTrialActive: false,
            hasUsedTrial: true,
          }
        }
      );

      // Mark other active histories as expired
      await subscriptionHistorySchema.updateMany(
        { userId, status: "active", subscriptionId: { $ne: subscription.id } },
        { $set: { status: "expired", endDate: packageStartDate } }
      );

      const package = await packageSchema.findById(packageId).lean();
      await subscriptionHistorySchema.create({
        userId,
        packageId,
        subscriptionId: subscription.id,
        price: package.price,
        paymentDate: packageStartDate,
        startDate: packageStartDate,
        endDate: packageEndDate,
        status: "active",
      });
    }

  } catch (error) {
    write_logs({
      message: `handleInvoicePaymentSucceeded -> Error: ${error.message}`
    });
  }
}

const handleInvoicePaymentFailed = async (invoice) => {
  try {

    write_logs({
      message: `handleInvoicePaymentFailed -> Invoice: ${JSON.stringify(invoice)}`
    });

    const subscription = await stripe.subscriptions.retrieve(
      session.subscription
    );

    write_logs({
      message: `handleInvoicePaymentFailed -> Subscription: ${JSON.stringify(subscription)}`
    });

  } catch (error) {
    write_logs({
      message: `handleInvoicePaymentFailed -> Error: ${error.message}`
    });
  }
}

const handleSubscriptionUpdated = async (subscription) => {
  try {

    write_logs({
      message: `handleSubscriptionUpdated -> Subscription: ${JSON.stringify(subscription)}`
    });

  } catch (error) {
    write_logs({
      message: `handleSubscriptionUpdated -> Error: ${error.message}`
    });
  }
}

const handleSubscriptionDeleted = async (subscription) => {
  try {

    write_logs({
      message: `handleSubscriptionDeleted -> Subscription: ${JSON.stringify(subscription)}`
    });

    const userId = subscription.metadata?.userId;
    const packageId = subscription.metadata?.packageId;

    if (subscription.status === "canceled" && userId && packageId) {
      const packageEndDate = new Date(subscription.canceled_at * 1000);

      const updatedSub = await subscriptionSchema.findOneAndUpdate(
        {
          userId,
          stripeSubscriptionId: subscription.id,
        },
        {
          $set: {
            subscriptionStatus: subscription.status,
            nextBillingDate: packageEndDate
          }
        },
        { new: true, upsert: true }
      ).lean()

      await subscriptionHistorySchema.findOneAndUpdate(
        {
          userId,
          packageId,
          subscriptionId: subscription.id,
          status: "active",
        },
        {
          $set: {
            status: "cancelled",
            endDate: packageEndDate,
          },
        },
        { sort: { createdAt: -1 } }
      ).lean();
    }


  } catch (error) {
    write_logs({
      message: `handleSubscriptionDeleted -> Error: ${error.message}`
    });
  }
}

exports.cronSendSubscriptionRenewalEmail = async () => {
  cron_logs({
    message: `cronSendSubscriptionRenewalEmail`,
    log_type: "info",
  });

  try {

    const pipeline = [
      {
        $match: {
          isActive: true
        }
      },
      {
        $lookup: {
          from: "organizations",
          localField: "_id",
          foreignField: "userId",
          as: "organization"
        }
      },
      {
        $unwind: {
          path: "$organization",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $match: {
          "organization.subscriptionId": { $ne: null }
        }
      },
      {
        $lookup: {
          from: "subscriptions",
          localField: "organization.subscriptionId",
          foreignField: "_id",
          as: "subscription"
        }
      },
      {
        $unwind: {
          path: "$subscription",
          preserveNullAndEmptyArrays: false
        }
      },
      {
        $addFields: {
          packageEndDate: "$subscription.nextBillingDate",
          remainingDays: {
            $cond: [
              { $ne: ["$subscription.nextBillingDate", null] },
              {
                $ceil: {
                  $divide: [
                    { $subtract: ["$subscription.nextBillingDate", "$$NOW"] },
                    1000 * 60 * 60 * 24
                  ]
                }
              },
              0
            ]
          }
        }
      },
      {
        $match: {
          remainingDays: { $in: [0, 1, 3, 7] }
        }
      }
    ]

    const activeUsers = await userSchema.aggregate(pipeline);
    if (activeUsers.length > 0) {
      activeUsers.map((user) => limit(async () => {

        cron_logs({
          message: `User Email: ${user?.email}, Remainning days: ${user?.remainingDays}`,
        });

        const usr = await userSchema.findOne({ _id: user?._id }).lean().populate("roleId", { roleName: 1 });
        const googleConnected = await googleconfigSchema.findOne({ userId: user?._id }).lean();

        const data = {
          role: usr?.roleId?.roleName,
          userId: user?._id,
          isGoogleConnected: googleConnected ? true : false,
          routes: "/product-list"
        }

        const encodedData = Buffer.from(JSON.stringify(data)).toString("base64");

        await sendEmailHelper(
          user?.email,
          `Your subscription ends in ${user?.remainingDays} days — action required`,
          trialEndReminderEmail({
            userName: user?.fullName,
            daysLeft: user?.remainingDays,
            endDate: moment.utc(user?.packageEndDate).format("YYYY-MM-DD hh:mm:ss A"),
            billingUrl: `${process.env.FRONTEND_REDIRECT_URL}/login?payload=${encodedData}`
          })
        );

      }));
    }

    cron_logs({
      message: "Subscription renewal email sent successfully.",
      log_type: "info",
    });

  } catch (error) {
    cron_logs({
      message: `Subscription renewal email error: ${error}`,
      log_type: "error",
    });
  }
}

exports.cancelSubscription = async (req, res) => {
  try {
    const { cancelType = "period_end" } = req.body;
    const { _id: userId } = req.user;

    const activeSubscription = await subscriptionSchema.findOne({ userId, subscriptionStatus: "active" }).lean();
    if (!activeSubscription || !activeSubscription?.stripeSubscriptionId) {
      return res.status(400).json({
        isSuccess: false,
        message: "No active subscription found",
      });
    }

    const subscriptionId = activeSubscription?.stripeSubscriptionId;

    let periodEnd;
    if (cancelType === "immediate") {
      periodEnd = new Date();
    } else {
      periodEnd = activeSubscription.nextBillingDate ? new Date(activeSubscription.nextBillingDate) : new Date();
    }

    if (subscriptionId !== "trial") {
      try {
        if (cancelType === "immediate") {
          const stripeSubscription = await stripe.subscriptions.cancel(subscriptionId);
          periodEnd = new Date(stripeSubscription.canceled_at * 1000);
        } else {
          const stripeSubscription = await stripe.subscriptions.update(subscriptionId, { cancel_at_period_end: true });
          periodEnd = new Date(stripeSubscription.cancel_at * 1000);
        }
      } catch (stripeError) {
        write_logs({
          message: `Stripe cancellation failed (subscriptionId: ${subscriptionId}): ${stripeError.message}`,
        });

        return res.status(500).json({
          isSuccess: false,
          message: `Stripe cancellation failed: ${stripeError.message}`,
        });
      }
    }

    let effectiveEnd = periodEnd;
    if (cancelType === "immediate") {
      effectiveEnd = new Date(Date.now() - 24 * 60 * 60 * 1000); // Set to past date for immediate cancellation
    }

    /** 3️⃣ Update main subscription table */
    await subscriptionSchema.findOneAndUpdate(
      {
        userId,
        stripeSubscriptionId: subscriptionId,
      },
      {
        $set: {
          subscriptionStatus: "canceled",
          nextBillingDate: effectiveEnd,
        },
      }
    ).lean();

    /** 4️⃣ Update ACTIVE history → CANCELED */
    await subscriptionHistorySchema.updateMany(
      {
        userId,
        subscriptionId,
        status: "active",
      },
      {
        $set: {
          status: "canceled",
          endDate: effectiveEnd,
        },
      }
    );

    /** 5️⃣ Update organization endDate so immediate cancel immediately expires plan */
    await organizationSchema.updateMany(
      { $or: [{ userId }, { subscriptionId: activeSubscription._id }] },
      { $set: { endDate: effectiveEnd } }
    );

    return res.json({
      isSuccess: true,
      message: "Subscription canceled successfully",
      cancelAt: effectiveEnd,
      cancelType,
    });
  } catch (error) {
    write_logs({
      message: `cancelSubscription -> Error: ${error.message}`,
    });

    return res.status(500).json({
      isSuccess: false,
      message: "Something went wrong",
    });
  }
};

exports.inviteUser = async (req, res) => {
  try {
    const { email, roleId, profileAccess } = req.body;
    const organizationId = req?.organizationId || req.body.organizationId;
    const invitedBy = req?.user?._id;

    if (!email || typeof email !== "string" || !email.trim()) {
      return res.status(203).send({ message: "Valid email is required", isSuccess: false });
    }
    if (!roleId) {
      return res.status(203).send({ message: "Role is required", isSuccess: false });
    }
    if (!organizationId) {
      return res.status(203).send({ message: "Organization ID is required", isSuccess: false });
    }

    const trimmedEmail = email.trim().toLowerCase();

    // Fetch org and its plan to check limits
    const org = await organizationSchema.findById(organizationId).populate("planId").lean();
    if (!org) {
      return res.status(203).send({ message: "Organization not found", isSuccess: false });
    }

    const numberOfInvitesLimit = org?.planId?.numberOfInvites || 0;

    const activeUsersCount = await roleBasedPermissionSchema.countDocuments({ organizationId });
    const pendingInvitesCount = await userInvitationSchema.countDocuments({
      organizationId,
      status: "PENDING",
      expiresAt: { $gt: new Date() }
    });

    if (activeUsersCount + pendingInvitesCount >= numberOfInvitesLimit) {
      return res.status(203).send({
        message: activeUsersCount >= numberOfInvitesLimit ? "Limit Over and Upgrade Plan" : "You have reached your invite limit with pending invitations. Please wait for replies or upgrade your plan.",
        isSuccess: false
      });
    }

    const existingUser = await userSchema.findOne({ email: trimmedEmail }).lean();
    if (existingUser) {
      const isAlreadyMember = await roleBasedPermissionSchema.findOne({ userId: existingUser._id, organizationId });
      if (isAlreadyMember) {
        return res.status(203).send({ message: "This user is already a member of your organization.", isSuccess: false });
      }
    }

    // Check if invitation already exists and is pending
    const existingInvite = await userInvitationSchema.findOne({
      email: trimmedEmail,
      organizationId,
      status: "PENDING",
    });

    if (existingInvite && new Date(existingInvite.expiresAt) > new Date()) {
      return res.status(203).send({ message: "Invitation is still active. Please wait 3 days to resend.", isSuccess: false });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 Days expiration

    if (existingInvite) {
      existingInvite.token = token;
      existingInvite.roleId = roleId;
      existingInvite.profileAccess = profileAccess || [];
      existingInvite.expiresAt = expiresAt;
      existingInvite.invitedBy = invitedBy;
      await existingInvite.save();
    } else {
      await userInvitationSchema.create({
        email: trimmedEmail,
        organizationId,
        roleId,
        profileAccess: profileAccess || [],
        token,
        status: "PENDING",
        invitedBy,
        expiresAt,
      });
    }

    const role = await roleSchema.findById(roleId).lean();

    const frontendUrl = process.env.FRONTEND_REDIRECT_URL;
    const inviteUrl = `${frontendUrl}/accept-invitation?token=${token}`;
    const rejectUrl = `${frontendUrl}/accept-invitation?token=${token}&action=reject`;

    await sendEmailHelper(
      trimmedEmail,
      `Invitation to join ${org?.organizationName || "Organization"}`,
      buildUserInvitationEmail({
        organizationName: org?.organizationName,
        roleName: role?.roleName,
        inviteUrl,
        rejectUrl,
      })
    ).catch((err) => { write_logs({ message: "[inviteUser Silent Error] " + (err?.message || err), log_type: "error" }); });

    return res.status(200).send({
      message: "User invitation sent successfully",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[inviteUser Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.getInvitationList = async (req, res) => {
  try {
    const organizationId = req?.organizationId || req.body.organizationId;
    if (!organizationId) {
      return res.status(203).send({ message: "Organization ID required", isSuccess: false });
    }

    const userId = req.user._id;
    const role = await userSchema.aggregate([
      { $match: { _id: userId } },
      {
        $lookup: {
          from: "roles",
          localField: "roleId",
          foreignField: "_id",
          as: "roles",
        },
      },
      { $unwind: { path: "$roles", preserveNullAndEmptyArrays: true } },
      { $project: { roleName: "$roles.roleName" } }
    ]);

    let isOrgUserRestricted = false;
    let myProfileIdsSet = new Set();

    if (role[0]?.roleName !== ROLES.SUPER_ADMIN) {
      const orgDoc = await organizationSchema.findById(organizationId).lean();
      const ownerId = orgDoc?.userId ? orgDoc.userId.toString() : null;

      const myRolePerm = await roleBasedPermissionSchema.findOne({ userId, organizationId }).populate("roleId");
      const isMyRoleAdmin = myRolePerm?.roleId?.roleName === ROLES.ADMIN;
      const isOwner = userId.toString() === ownerId;

      isOrgUserRestricted = !isMyRoleAdmin && !isOwner;

      if (isOrgUserRestricted) {
        const myProfPerms = await profileBasedPermissionSchema.find({ userId, organizationId, hasAccess: true });
        myProfileIdsSet = new Set(myProfPerms.map(p => p.profileId?.toString()));
      }
    }

    let invitations = await userInvitationSchema
      .find({ organizationId })
      .populate("roleId", { roleName: 1 })
      .populate("invitedBy", { fullName: 1, email: 1 })
      .sort({ createdAt: -1 })
      .lean();

    if (isOrgUserRestricted) {
      invitations = invitations.filter(inv => {
        if (inv.invitedBy && inv.invitedBy._id?.toString() === userId.toString()) return true;

        if (!inv.profileAccess || inv.profileAccess.length === 0) {
          return false;
        }

        return inv.profileAccess.some(item => myProfileIdsSet.has(item.profileId?.toString()));
      });
    }

    for (const inv of invitations) {
      if (inv.profileAccess && inv.profileAccess.length > 0) {
        const enrichedPA = [];
        for (const item of inv.profileAccess) {
          if (!item.configId || !item.profileId) continue;

          if (isOrgUserRestricted && (inv.invitedBy?._id?.toString() !== userId.toString())) {
            if (!myProfileIdsSet.has(item.profileId?.toString())) continue;
          }

          const prof = await profileSchema.findOne({ configId: item.configId, profileId: item.profileId }, { countryCode: 1, name: 1 }).lean();
          enrichedPA.push({
            configId: item.configId,
            profileId: item.profileId,
            countryCode: prof?.countryCode || "",
            name: prof?.name || `Profile ${item.profileId}`,
          });
        }
        inv.profileAccess = enrichedPA;
      }
    }

    return res.status(200).send({
      message: "Invitation list fetched successfully",
      isSuccess: true,
      data: invitations,
    });
  } catch (error) {
      write_logs({ message: `[getInvitationList Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
    });
  }
};

exports.cancelInvitation = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(203).send({ message: "Invitation ID required", isSuccess: false });
    }

    await userInvitationSchema.updateOne({ _id: id }, { $set: { status: "CANCELLED" } });

    return res.status(200).send({
      message: "Invitation cancelled successfully",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[cancelInvitation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
    });
  }
};

exports.resendInvitation = async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) {
      return res.status(203).send({ message: "Invitation ID required", isSuccess: false });
    }

    const invitation = await userInvitationSchema.findById(id);
    if (!invitation || invitation.status !== "PENDING") {
      return res.status(203).send({ message: "Pending invitation not found", isSuccess: false });
    }

    if (new Date(invitation.expiresAt) > new Date()) {
      return res.status(203).send({ message: "Invitation is still active. Please wait 3 days to resend.", isSuccess: false });
    }

    const existingUser = await userSchema.findOne({ email: invitation.email }).lean();
    if (existingUser) {
      const isAlreadyMember = await roleBasedPermissionSchema.findOne({ userId: existingUser._id, organizationId: invitation.organizationId });
      if (isAlreadyMember) {
        return res.status(203).send({ message: "This user is already a member of your organization.", isSuccess: false });
      }
    }

    const org = await organizationSchema.findById(invitation.organizationId).populate("planId").lean();
    if (!org) {
      return res.status(203).send({ message: "Organization not found", isSuccess: false });
    }

    const numberOfInvitesLimit = org?.planId?.numberOfInvites || 0;
    const activeUsersCount = await roleBasedPermissionSchema.countDocuments({ organizationId: invitation.organizationId });
    const pendingInvitesCount = await userInvitationSchema.countDocuments({
      organizationId: invitation.organizationId,
      status: "PENDING",
      expiresAt: { $gt: new Date() }
    });

    if (activeUsersCount + pendingInvitesCount >= numberOfInvitesLimit) {
      return res.status(203).send({
        message: activeUsersCount >= numberOfInvitesLimit ? "Limit Over and Upgrade Plan" : "You have reached your invite limit with pending invitations. Please wait for replies or upgrade your plan.",
        isSuccess: false
      });
    }

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000); // 3 Days expiration

    invitation.token = token;
    invitation.expiresAt = expiresAt;
    await invitation.save();
    const role = await roleSchema.findById(invitation.roleId).lean();

    const frontendUrl = process.env.FRONTEND_REDIRECT_URL;
    const inviteUrl = `${frontendUrl}/accept-invitation?token=${token}`;
    const rejectUrl = `${frontendUrl}/accept-invitation?token=${token}&action=reject`;

    await sendEmailHelper(
      invitation.email,
      `Invitation to join ${org?.organizationName || "Organization"}`,
      buildUserInvitationEmail({
        organizationName: org?.organizationName,
        roleName: role?.roleName,
        inviteUrl,
        rejectUrl,
      })
    ).catch((err) => { write_logs({ message: "[resendInvitation Silent Error] " + (err?.message || err), log_type: "error" }); });

    return res.status(200).send({
      message: "Invitation resent successfully",
      isSuccess: true,
    });
  } catch (error) {
      write_logs({ message: `[resendInvitation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
    });
  }
};

exports.rejectInvitation = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(203).send({ message: "Invitation token required", isSuccess: false });
    }
    const invitation = await userInvitationSchema.findOne({ token });
    if (!invitation) {
      return res.status(203).send({ message: "Invitation not found", isSuccess: false });
    }
    if (invitation.status !== "PENDING") {
      return res.status(203).send({ message: `Invitation is already ${invitation.status.toLowerCase()}`, isSuccess: false });
    }
    invitation.status = "REJECTED";
    await invitation.save();
    return res.status(200).send({ message: "Invitation rejected successfully.", isSuccess: true });
  } catch (error) {
      write_logs({ message: `[rejectInvitation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    console.error("Reject invitation error:", error);
    return res.status(500).send({ message: "Something went wrong while rejecting invitation", isSuccess: false });
  }
};

exports.checkInvitation = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) {
      return res.status(203).send({ message: "Token required", isSuccess: false });
    }

    const invitation = await userInvitationSchema
      .findOne({ token })
      .populate("organizationId", { organizationName: 1 })
      .populate("roleId", { roleName: 1 })
      .lean();

    if (!invitation) {
      return res.status(203).send({ message: "Invitation link is invalid or not found", isSuccess: false });
    }

    if (invitation.status === "REJECTED") {
      return res.status(203).send({ message: "This invitation has been rejected by the user.", isSuccess: false, status: "REJECTED" });
    }
    if (invitation.status === "EXPIRED") {
      return res.status(203).send({ message: "This invitation link has expired.", isSuccess: false, status: "EXPIRED" });
    }
    if (invitation.status === "CANCELLED") {
      return res.status(203).send({ message: "This invitation has been cancelled by the organization.", isSuccess: false, status: "CANCELLED" });
    }
    if (invitation.status === "ACCEPTED") {
      return res.status(203).send({ message: "This invitation has already been accepted.", isSuccess: false, status: "ACCEPTED" });
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      await userInvitationSchema.updateOne({ _id: invitation._id }, { $set: { status: "EXPIRED" } });
      return res.status(203).send({ message: "Invitation link has expired.", isSuccess: false, status: "EXPIRED" });
    }

    const user = await userSchema.findOne({ email: invitation.email }).lean();

    return res.status(200).send({
      message: "Invitation valid",
      isSuccess: true,
      data: {
        email: invitation.email,
        organizationName: invitation.organizationId?.organizationName || "Organization",
        roleName: invitation.roleId?.roleName || "Member",
        profileCount: invitation.profileAccess?.length || 0,
        isUserExist: !!user,
        expiresAt: invitation.expiresAt,
      },
    });
  } catch (error) {
      write_logs({ message: `[checkInvitation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
    });
  }
};

exports.acceptInvitation = async (req, res) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;

    if (!token) {
      return res.status(203).send({ message: "Token required", isSuccess: false });
    }

    const invitation = await userInvitationSchema.findOne({ token, status: "PENDING" });
    if (!invitation) {
      return res.status(203).send({ message: "Invitation link is invalid or has expired", isSuccess: false });
    }

    if (new Date() > new Date(invitation.expiresAt)) {
      invitation.status = "EXPIRED";
      await invitation.save();
      return res.status(203).send({ message: "Invitation link has expired", isSuccess: false });
    }

    // Verify that the logged-in user email matches the invitation recipient email
    if (invitation.email && req.user.email && invitation.email.toLowerCase().trim() !== req.user.email.toLowerCase().trim()) {
      return res.status(203).send({
        message: `Security check failed: This invitation was sent to ${invitation.email}, but you are currently logged in as ${req.user.email}. Please login with ${invitation.email} to accept.`,
        isSuccess: false,
        emailMismatch: true,
        invitedEmail: invitation.email,
        loginEmail: req.user.email
      });
    }

    // Assign Role based permission in the organization
    await roleBasedPermissionSchema.findOneAndUpdate(
      { userId, organizationId: invitation.organizationId },
      { $set: { roleId: invitation.roleId } },
      { upsert: true, new: true }
    );

    // Assign Profile based permission
    if (invitation.profileAccess && invitation.profileAccess.length > 0) {
      const safeOrgId = new mongoose.Types.ObjectId(invitation.organizationId);
      for (const item of invitation.profileAccess) {
        if (!item.configId || !item.profileId) continue;
        const safeConfigId = new mongoose.Types.ObjectId(item.configId);
        const numericProfileId = Number(item.profileId);

        const checkPerm = await profileBasedPermissionSchema.findOne({
          userId,
          organizationId: safeOrgId,
          configId: safeConfigId,
          profileId: numericProfileId
        });
        if (!checkPerm) {
          const perm = new profileBasedPermissionSchema({
            userId,
            organizationId: safeOrgId,
            configId: safeConfigId,
            profileId: numericProfileId,
            hasAccess: true
          });
          await perm.save();
        }
      }
    }

    invitation.status = "ACCEPTED";
    invitation.acceptedAt = new Date();
    await invitation.save();

    return res.status(200).send({
      message: "Invitation accepted successfully! Welcome to the organization.",
      isSuccess: true,
      organizationId: invitation.organizationId,
    });
  } catch (error) {
      write_logs({ message: `[acceptInvitation Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      message: "Something went wrong, please try again",
      isSuccess: false,
      error: error.message,
    });
  }
};

exports.superAdminLoginAsUser = async (req, res) => {
  try {
    if (req?.role?.roleName !== ROLES.SUPER_ADMIN) {
      return res.status(403).send({
        isSuccess: false,
        message: "Forbidden: Only Super Admin can perform this action.",
      });
    }

    const { userId, organizationId } = req.body;
    if (!userId || !organizationId) {
      return res.status(400).send({
        isSuccess: false,
        message: "User ID and Organization ID are required.",
      });
    }

    const targetUser = await userSchema.findById(userId).populate("roleId").lean();
    if (!targetUser) {
      return res.status(404).send({
        isSuccess: false,
        message: "Target user not found.",
      });
    }

    const org = await organizationSchema.findById(organizationId).populate("planId").lean();
    if (!org) {
      return res.status(404).send({
        isSuccess: false,
        message: "Organization not found.",
      });
    }

    let userRoleName = null;
    let roleObj = null;

    if (org.userId && org.userId.toString() === targetUser._id.toString()) {
      userRoleName = ROLES.ADMIN;
      roleObj = await roleSchema.findOne({ roleName: ROLES.ADMIN }).lean();
    } else {
      const rbp = await roleBasedPermissionSchema
        .findOne({ userId: targetUser._id, organizationId })
        .populate("roleId")
        .lean();
      if (rbp && rbp.roleId) {
        userRoleName = rbp.roleId.roleName || "USER";
        roleObj = rbp.roleId;
      } else {
        const pbp = await profileBasedPermissionSchema
          .findOne({ userId: targetUser._id, organizationId, hasAccess: true })
          .lean();
        if (pbp) {
          userRoleName = "USER";
          roleObj = await roleSchema.findOne({ roleName: "USER" }).lean();
        } else {
          userRoleName = "USER";
          roleObj = targetUser.roleId || await roleSchema.findOne({ roleName: "USER" }).lean();
        }
      }
    }

    let permissions = null;
    if (roleObj?._id) {
      const permDoc = await permissionSchema
        .findOne({ roleId: roleObj._id })
        .populate("pages.pageId", { pageName: 1, pageSlug: 1, displayName: 1, order: 1 })
        .populate("pages.allocatedActions.actionId", { actionType: 1 })
        .lean();
      if (permDoc && permDoc.pages) {
        permissions = {
          pages: permDoc.pages.map((page) => ({
            pageName: page.pageId?.pageName,
            pageSlug: page.pageId?.pageSlug,
            allocatedActions: (page.allocatedActions || []).map((action) => ({
              actionType: action.actionId?.actionType,
              status: action.status,
            })),
          })),
        };
      }
    }

    const authToken = jwt.sign(
      {
        user_id: targetUser._id,
        email: targetUser.email,
        roleId: roleObj?._id || targetUser.roleId?._id || targetUser.roleId,
        roleName: userRoleName || targetUser.roleId?.roleName || "USER",
        organizationId: org._id,
      },
      process.env.CUSTOMER_TOKEN_KEY,
      { expiresIn: process.env.TOKEN_EXPIRE_TIME }
    );

    await auditLogSchema.create({
      userId: req.user._id,
      event: "USER_LOGIN",
      message: `Super Admin logged in as user ${targetUser.email} for organization ${org.organizationName}`,
      ipAddress: req?.ip,
      userAgent: req?.headers["user-agent"],
      metadata: { targetUserId: targetUser._id, targetEmail: targetUser.email, targetOrganizationId: org._id, status: "SUCCESS" },
    }).catch((err) => { write_logs({ message: "[superAdminLoginAsUser Silent Error] " + (err?.message || err), log_type: "error" }); });

    const hasFutureEndDate = org.endDate && new Date(org.endDate) > new Date();
    if (hasFutureEndDate && !org.isTrialActive && !org.planId) {
      org.isTrialActive = true;
      org.hasUsedTrial = false;
      await organizationSchema.updateOne({ _id: org._id }, { $set: { isTrialActive: true, hasUsedTrial: false } });
    }
    const requiresPlan = !org.planId && !org.isTrialActive && !hasFutureEndDate;

    return res.status(200).send({
      isSuccess: true,
      authToken,
      role: userRoleName || targetUser.roleId?.roleName || "USER",
      organization: org,
      permissions,
      requiresPlan,
      userId: targetUser._id,
      email: targetUser.email,
      fullName: targetUser.fullName,
      message: `Logged in as ${targetUser.fullName} (${org.organizationName}) successfully.`,
    });
  } catch (error) {
      write_logs({ message: `[superAdminLoginAsUser Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while logging in as user.",
      error: error.message,
    });
  }
};

exports.generate2fa = async (req, res) => {
  try {
    const secret = generateSecret();
    const user = await userSchema.findById(req.user._id);

    const otpauth = generateURI({ issuer: "Advertise IQ", label: user.email, secret });
    const qrCodeUrl = await qrcode.toDataURL(otpauth);

    return res.status(200).send({
      isSuccess: true,
      qrCodeUrl,
      secret,
    });
  } catch (error) {
      write_logs({ message: `[generate2fa Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while generating 2FA.",
      error: error.message,
    });
  }
};

exports.verifyAndEnable2fa = async (req, res) => {
  try {
    const { secret, code } = req.body;
    if (!secret || !code) {
      return res.status(400).send({ isSuccess: false, message: "Secret and code are required." });
    }

    const isValid = await verify({ token: code, secret });
    if (!isValid?.valid) {
      return res.status(203).send({ isSuccess: false, message: "Invalid verification code." });
    }

    const encryptedSecret = encryptData(secret);
    await userSchema.findByIdAndUpdate(req.user._id, {
      twoFactorEnabled: true,
      twoFactorSecret: encryptedSecret,
      twoFactorAddedOn: new Date(),
    });

    return res.status(200).send({
      isSuccess: true,
      message: "2FA enabled successfully.",
    });
  } catch (error) {
      write_logs({ message: `[verifyAndEnable2fa Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while enabling 2FA.",
      error: error.message,
    });
  }
};

exports.disable2fa = async (req, res) => {
  try {
    await userSchema.findByIdAndUpdate(req.user._id, {
      twoFactorEnabled: false,
      $unset: { twoFactorSecret: 1, twoFactorAddedOn: 1, twoFactorLastUsed: 1 },
    });

    return res.status(200).send({
      isSuccess: true,
      message: "2FA disabled successfully.",
    });
  } catch (error) {
      write_logs({ message: `[disable2fa Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(500).send({
      isSuccess: false,
      message: "Something went wrong while disabling 2FA.",
      error: error.message,
    });
  }
};