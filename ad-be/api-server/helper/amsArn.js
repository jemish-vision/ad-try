export const ARN_MAP = {
    [process?.env?.ROOT_LINK]: {
        region: "NA",
        regionName: process?.env?.NA_REGION_NAME || "",
        queueName: process?.env?.NA_QUEUE_NAME || "",
        sqsArn: process.env.NA_SQS_ARN?.trim(),
        sqsQueueUrl: process?.env?.NA_SQS_QUEUE_URL || ""
    },
    [process?.env?.EU_ROOT_LINK]: {
        region: "EU",
        regionName: process?.env?.EU_REGION_NAME || "eu-west-1",
        queueName: process?.env?.EU_QUEUE_NAME || "",
        sqsArn: process.env.EU_SQS_ARN?.trim(),
        sqsQueueUrl: process?.env?.EU_SQS_QUEUE_URL || ""
    },
    [process?.env?.FE_ROOT_LINK]: {
        region: "FE",
        regionName: process?.env?.FE_REGION_NAME || "",
        queueName: process?.env?.FE_QUEUE_NAME || "",
        sqsArn: process.env.FE_SQS_ARN?.trim(),
        sqsQueueUrl: process?.env?.FE_SQS_QUEUE_URL || ""
    },
};

export const getAmsDestination = (url) => {
    const destination = typeof url === "string" && Object.hasOwn(ARN_MAP, url) && ARN_MAP[url];
    if (!destination) throw new Error("Amazon Marketing Stream is not configured for this profile's Ads region.");

    const { region, sqsArn } = destination;
    if (!/^arn:aws(?:-[a-z0-9-]+)?:sqs:[a-z0-9-]+:\d{12}:[A-Za-z0-9_-]{1,80}$/.test(sqsArn || "")) {
        throw new Error(`Configure a valid ${region}_SQS_ARN for Amazon Marketing Stream before subscribing.`);
    }
    return { region, sqsArn };
};
