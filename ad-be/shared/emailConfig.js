// Resolve lazily: controllers may import this before the entrypoint loads dotenv.
const emailConfig = {
  get email() {
    return {
      port: process.env.EMAIL_PORT,
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS || process.env.EMAIL_PASSWORD || process.env.PASS,
      host: process.env.EMAIL_HOST || process.env.HOST,
      adminEmail: process.env.ADMIN_EMAIL,
      receiverEmail: process.env.RECEIVER_EMAIL,
      from: process.env.EMAIL_FROM,
    };
  },
};
module.exports = emailConfig;
