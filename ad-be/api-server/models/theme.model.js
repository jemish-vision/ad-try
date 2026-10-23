const mongoose = require("mongoose");
const themeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "user",
  },
  sidebar: {
    sidebarBackgroundColor: {
      type: String,
      trim: true,
    },
    sidebarFontColor: {
      type: String,
      trim: true,
    },
    sidebarIconColor: {
      type: String,
      trim: true,
    },
  },
  header: {
    headerBackgroundColor: {
      type: String,
      trim: true,
    },
    headerFontColor: {
      type: String,
      trim: true,
    },
  },
  button: {
    saveButtonBackgroundColor: {
      type: String,
      trim: true,
    },
    saveButtonFontColor: {
      type: String,
      trim: true,
    },
    cancelButtonBackgroundColor: {
      type: String,
      trim: true,
    },
    cancelButtonFontColor: {
      type: String,
      trim: true,
    },
    addButtonBackgroundColor: {
      type: String,
      trim: true,
    },
    addButtonFontColor: {
      type: String,
      trim: true,
    },
  },
  table: {
    chartsBackgroundColor: {
      type: String,
      trim: true,
    },
  },
  body: {
    bodyBackgroundColor: {
      type: String,
      trim: true,
    },
  },
});

// --- Performance Indexing ---
themeSchema.index({userId:1});

module.exports = new mongoose.model("theme", themeSchema);
