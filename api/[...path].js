// Vercel automatically turns this file into a serverless function that
// handles every request under /api/* (the [...path] filename is a Vercel
// "catch-all" route). It just hands the request to our existing Express
// app — no separate rewrite config needed.
const serverless = require("serverless-http");
const app = require("../server/app");

module.exports = serverless(app);
