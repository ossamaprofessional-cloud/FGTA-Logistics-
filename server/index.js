// Local development entry point only. Run with: npm start
// (Vercel deployments use /api/[...path].js instead, which imports app.js
// directly and never runs this file.)
process.env.SERVE_STATIC = "true";
const app = require("./app");

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Transport attendance server running on http://localhost:${PORT}`);
});
