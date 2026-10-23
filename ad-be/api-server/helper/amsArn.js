export const ARN_MAP = {
    [process?.env?.ROOT_LINK]: {
        region: "NA",
        regionName: process?.env?.NA_REGION_NAME || "",
        queueName: process?.env?.NA_QUEUE_NAME || "",
        sqsArn: process?.env?.NA_SQS_ARN || "",
        sqsQueueUrl: process?.env?.NA_SQS_QUEUE_URL || ""
    },
    [process?.env?.EU_ROOT_LINK]: {
        region: "EU",
        regionName: process?.env?.EU_REGION_NAME || "eu-west-1",
        queueName: process?.env?.EU_QUEUE_NAME || "AdvertiseIQ-eu-west-1",
        sqsArn: process?.env?.EU_SQS_ARN || "arn:aws:sqs:eu-west-1:763644671365:AdvertiseIQ-eu-west-1",
        sqsQueueUrl: process?.env?.EU_SQS_QUEUE_URL || "https://sqs.eu-west-1.amazonaws.com/763644671365/AdvertiseIQ-eu-west-1"
    },
    [process?.env?.FE_ROOT_LINK]: {
        region: "FE",
        regionName: process?.env?.FE_REGION_NAME || "",
        queueName: process?.env?.FE_QUEUE_NAME || "",
        sqsArn: process?.env?.FE_SQS_ARN || "",
        sqsQueueUrl: process?.env?.FE_SQS_QUEUE_URL || ""
    },
};

export const getSqsByAmazonUrl = (url, key) => {
    return ARN_MAP[url]?.[key];
};
