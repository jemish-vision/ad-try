const express = require("express");
const router = express.Router();

const jwt = require("jsonwebtoken");
const { getProductPerformanceTrend } = require("../controllers/productPerformance.controller");

// Soft token verification: attaches user if token valid, but allows unauthenticated dev access
const softVerifyToken = async (req, res, next) => {
  const authHeader = req.header("authorization") || req.headers["x-access-token"] || req.body?.token;
  if (!authHeader) return next();
  try {
    const token = authHeader.startsWith("Bearer ") ? authHeader.split(" ")[1] : authHeader;
    jwt.verify(token, process.env.CUSTOMER_TOKEN_KEY, { algorithms: ["HS256"] }, (err, decoded) => {
      if (!err && decoded) {
        req.user = decoded;
      }
      return next();
    });
  } catch (err) {
    return next();
  }
};

router.post(
  "/get-product-trend",
  softVerifyToken,
  getProductPerformanceTrend
);

module.exports = router;
