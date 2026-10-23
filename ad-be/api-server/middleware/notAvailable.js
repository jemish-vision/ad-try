const notAvailable = (req, res, next) => {
  return res.status(200).json({
    success: false,
    message: "This feature is not available!"
  });
};

module.exports = notAvailable;
