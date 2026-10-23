const mongoose = require("mongoose");

const profitLossHistorySchema = new mongoose.Schema(
    {
        configId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "config",
            required: true,
        },

        profileId: {
            type: Number,
            trim: true,
        },

        totalUnitsOrdered: { type: Number, trim: true },
        totalOrderedProductSales: { type: Number, trim: true },
        totalProductCosts: { type: Number, trim: true },
        totalAmazonFees: { type: Number, trim: true },
        totalAmazonExp: { type: Number, trim: true },
        itemFees: { type: Number, trim: true },
        totalAdvertisingSpend: { type: Number, trim: true },
        
        netProfit: { type: Number, trim: true },
        profitPercentage: { type: Number, trim: true },
        tcos: { type: Number, trim: true }
    },
    { timestamps: true }
);


// TTL index for 396-day data retention
profitLossHistorySchema.index({ createdAt: 1 }, { expireAfterSeconds: 34214400 });

module.exports = mongoose.model("profitlosshistories", profitLossHistorySchema);
