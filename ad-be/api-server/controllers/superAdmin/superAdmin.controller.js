const { write_logs } = require("../../../winston/utility/logger");
const userSchema = require("../../models/user.model");

exports.getSuperAdminProfile = async (req, res) => {
  const userId = req.user._id;
  try {
    await userSchema
      .findById(userId)
      .then(async (profile) => {
        if (!profile) {
          return res
            .status(203)
            .send({ message: "Super admin not found!", isSuccess: false });
        }
        return res.status(200).send({
          profile,
          isSuccess: true,
          message: "Get Super admin data successfully.",
        });
      })
      .catch((error) => {
          write_logs({ message: `[getSuperAdminProfile Promise Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
        return res.status(203).send({
          error: "An internal server error occurred",
          message: "Something went wrong, please try again!",
          isSuccess: false,
        });
      });
  } catch (error) {
      write_logs({ message: `[getSuperAdminProfile Error] ${error?.message || error} [body] ${JSON.stringify(req?.body)}`, log_type: "error" });
    return res.status(203).send({
      message: "Something went wrong, please try again!",
      isSuccess: false,
      error: "An internal server error occurred",
    });
  }
};
