const { cron_logs } = require("../../winston/cronAutomation/logger");
const emailConfig = require("../../shared/emailConfig");
const nodemailer = require("nodemailer");

/**
 * Creates a nodemailer transporter based on current emailConfig (Gmail or SMTP/UnitPost).
 */
const getTransporter = () => {
  const { host, port, user, pass } = emailConfig.email;
  if (host && host.includes("gmail")) {
    return nodemailer.createTransport({
      service: "gmail",
      auth: { user, pass },
    });
  }
  return nodemailer.createTransport({
    host: host || "smtp.unitpost.com",
    port: Number(port) || 2587,
    secure: Number(port) === 465,
    auth: { user, pass },
    tls: {
      rejectUnauthorized: false,
    },
  });
};

/**
 * General email helper for notifications and alerts across AdvertiseIQ.
 */
const sendEmailHelper = (to, subject, html) => {
  return new Promise(function (resolve, reject) {
    if (!emailConfig.email.user || !emailConfig.email.pass) {
      const error = new Error("Email credentials missing: configure EMAIL_USER and EMAIL_PASS (legacy PASS is supported)");
      cron_logs({ message: `Email FAILED: ${error.message}`, log_type: "error" });
      resolve({ delivered: false, status: "Fail", error });
      return;
    }
    const transporter = getTransporter();

    if (process.env.NODE_ENV != "production") {
      to = process.env.RECEIVER_EMAIL;
    }

    const sender = emailConfig.email.from || emailConfig.email.user;

    let mailOptions = {
      from: sender,
      to: to,
      bcc: process.env.RECEIVER_EMAIL,
      subject: subject + (emailConfig.email.adminEmail ? " - " + emailConfig.email.adminEmail : ""),
      html: html,
    };

    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        cron_logs({
          message: `Email FAILED → To: ${to}, Subject: ${subject}, Error: ${error.message}`,
          log_type: "error",
        });
        resolve({ delivered: false, status: "Fail", error: error });
      } else {
        cron_logs({
          message: `Email SENT → To: ${to}, Subject: ${subject}`,
          log_type: "info",
        });
        resolve({ delivered: true, status: "Success", info: info });
      }
    });
  });
};

module.exports = { sendEmailHelper };
