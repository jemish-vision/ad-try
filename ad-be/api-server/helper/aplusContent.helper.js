export function buildAmazonAPlusPayload({ asin, aiData }) {
    return {
        contentDocument: {
            name: `AI A+ ${asin} (en-IN)`,
            contentType: "EBC",
            locale: "en-IN",
            contentModuleList: aiData?.contentModuleList
        }
    };
}
