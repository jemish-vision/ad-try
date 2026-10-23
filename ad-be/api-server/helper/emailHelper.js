const { cron_logs } = require("../../winston/cronAutomation/logger");
const emailConfig = require("../../shared/emailConfig");
const nodemailer = require("nodemailer");

const sendEmailHelper = (to, subject, html) => {
  return new Promise(function (resolve, reject) {
    let transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: emailConfig.email.user,
        pass: emailConfig.email.pass,
      },
    });

    if (process.env.NODE_ENV != "production") {
      to = process.env.RECEIVER_EMAIL;
    }

    let mailOptions = {
      from: emailConfig.email.user,
      to: to,
      bcc: process.env.RECEIVER_EMAIL,
      subject: subject + " - " + emailConfig.email.adminEmail,
      html: html,
    };

    transporter.sendMail(mailOptions, async (error, info) => {
      if (error) {
        cron_logs({
          message: `Email FAILED → To: ${to}, Subject: ${subject}, Error: ${error.message}, Body: ${JSON.stringify(html)}`,
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
