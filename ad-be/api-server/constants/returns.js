const RETURN_REASON_LABELS = {
    "CR-DEFECTIVE": "Defective Item",
    "CR-MISSING_PARTS": "Missing Parts",
    "CR-ORDERED_WRONG_ITEM": "Wrong Item Ordered",
    "CR-SWITCHEROO": "Item Switched",
    "CR-UNWANTED_ITEM": "Unwanted Item",
    "UND-UNKNOWN": "MFN - Undelivered / Unknown",
    "UNDELIVERABLE_REFUSED": "Refused",
    "UNDELIVERABLE_UNKNOWN": "FBA - Undelivered / Unknown"
};

const RETURN_TYPE_LABELS = {
    "C-Returns": "Customer Return",
    "Rejected": "Rejected Return",
    "Undelivered": "Undelivered",
    "UNDELIVERABLE_REFUSED": "Refused",
    "UNDELIVERABLE_UNKNOWN": "Unknown"
};

const RETURN_STATUS_LABELS = {
    "Approved": "Approved",
    "Pending": "Pending",
    "Completed": "Completed",
    "Rejected": "Rejected"
};

const RETURN_SOURCE_LABELS = {
    "MFN": "Merchant Fulfilled",
    "FBA": "Fulfillment by Amazon"
};

module.exports = { RETURN_REASON_LABELS, RETURN_TYPE_LABELS, RETURN_STATUS_LABELS, RETURN_SOURCE_LABELS };