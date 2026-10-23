const emailConfig = {
  email: {
    port: process.env.EMAIL_PORT,
    user: process.env.EMAIL_USER,
    pass: process.env.PASS,
    host: process.env.HOST,
    adminEmail: process.env.ADMIN_EMAIL,
    receiverEmail: process.env.RECEIVER_EMAIL,
  },
};

module.exports = emailConfig;
