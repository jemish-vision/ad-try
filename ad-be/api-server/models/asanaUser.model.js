const mongoose = require("mongoose");

const asanaUserSchema = new mongoose.Schema(
    {
        gid: { type: String, required: true, unique: true },
        name: { type: String, required: true },
        email: { type: String, required: true },
        photo: { type: String, required: false, default: null },
    },
    { timestamps: true }
);


// --- Performance Indexing ---
asanaUserSchema.index({isActive:1,roleId:1});
asanaUserSchema.index({email:1});
asanaUserSchema.index({_id:1,isActive:1});

module.exports = mongoose.model("asanaUser", asanaUserSchema);
