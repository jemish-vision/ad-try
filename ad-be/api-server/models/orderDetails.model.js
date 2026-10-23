const mongoose = require("mongoose");

const orderDetailsSchema = new mongoose.Schema(
  {
    configId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "config",
      index: true,
    },

    profileId: {
      type: Number,
      index: true,
    },

    marketplaceId: {
      type: String,
      trim: true,
      index: true,
    },

    // =========================
    // ORDER BASIC DETAILS
    // =========================
    orderId: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },

    orderStatus: {
      type: String,
      trim: true,
      index: true,
    },

    orderCreatedTime: {
      type: Date,
      index: true,
    },

    orderLastUpdatedTime: {
      type: Date,
    },

    // =========================
    // SALES CHANNEL
    // =========================
    salesChannel: {
      channelName: {
        type: String,
        trim: true,
      },

      marketplaceName: {
        type: String,
        trim: true,
      },
    },

    // =========================
    // BUYER DETAILS
    // =========================
    buyer: {
      buyerName: {
        type: String,
        trim: true,
      },

      buyerEmail: {
        type: String,
        trim: true,
      },
    },

    // =========================
    // RECIPIENT / ADDRESS
    // =========================
    recipient: {
      deliveryAddress: {
        name: {
          type: String,
          trim: true,
        },

        companyName: {
          type: String,
          trim: true,
        },

        addressLine1: {
          type: String,
          trim: true,
        },

        addressLine2: {
          type: String,
          trim: true,
        },

        addressLine3: {
          type: String,
          trim: true,
        },

        city: {
          type: String,
          trim: true,
        },

        districtOrCounty: {
          type: String,
          trim: true,
        },

        stateOrRegion: {
          type: String,
          trim: true,
        },

        municipality: {
          type: String,
          trim: true,
        },

        postalCode: {
          type: String,
          trim: true,
        },

        countryCode: {
          type: String,
          trim: true,
        },

        phone: {
          type: String,
          trim: true,
        },

        addressType: {
          type: String,
          trim: true,
        },
      },
    },

    // =========================
    // FULFILLMENT
    // =========================
    fulfillment: {
      fulfillmentStatus: {
        type: String,
        trim: true,
      },

      fulfilledBy: {
        type: String,
        trim: true,
      },

      fulfillmentServiceLevel: {
        type: String,
        trim: true,
      },
    },

    // =========================
    // ORDER ITEMS
    // =========================
    orderItems: [
      {
        orderItemId: {
          type: String,
          trim: true,
        },

        quantityOrdered: {
          type: Number,
          default: 0,
        },

        product: {
          asin: {
            type: String,
            trim: true,
            index: true,
          },

          title: {
            type: String,
            trim: true,
          },

          sellerSku: {
            type: String,
            trim: true,
          },

          condition: {
            type: String,
            trim: true,
          },

          price: {
            type: Number,
            default: 0,
          },
        },

        proceeds: {
          breakdowns: [
            {
              subTotalAmount: {
                type: Number,
                default: 0,
              },

              subTotalType: {
                type: String,
                trim: true,
              },
            },
          ],

          proceedsTotal: {
            type: Number,
            default: 0,
          },
        },
      },
    ],

    // =========================
    // PROCEEDS
    // =========================
    proceeds: {
      breakdowns: [
        {
          subTotalAmount: {
            type: Number,
            default: 0,
          },

          subTotalType: {
            type: String,
            trim: true,
          },
        },
      ],

      proceedsTotal: {
        type: Number,
        default: 0,
      },
    },

    // =========================
    // PAYMENT
    // =========================
    paymentMethod: {
      type: String,
      trim: true,
    },

    // =========================
    // TOTALS
    // =========================
    totalQuantity: {
      type: Number,
      default: 0,
    },

    totalAmount: {
      type: Number,
      default: 0,
    },

    currencyCode: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// =========================
// UNIQUE INDEX
// =========================
orderDetailsSchema.index(
  {
    configId: 1,
    profileId: 1,
    orderId: 1,
  },
  {
    unique: true,
  }
);

// --- Performance Indexing ---
orderDetailsSchema.index({ configId: 1, profileId: 1, orderCreatedTime: -1 });
orderDetailsSchema.index({ configId: 1, profileId: 1, "orderItems.product.sellerSku": 1 });

module.exports = mongoose.model("orderDetails", orderDetailsSchema);