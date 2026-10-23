const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const FormData = require("form-data");
const axios = require("axios");
const { write_logs } = require("../../winston/utility/logger");
const sharp = require("sharp");

// ---------------------------------------------------------------------------
// Gemini image model (matching aplus-demo)
// ---------------------------------------------------------------------------
const IMAGE_MODEL = () => process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const IMAGE_TIMEOUT_MS = Number(process.env.GEMINI_IMAGE_TIMEOUT_MS) || 120000;

// ---------------------------------------------------------------------------
// resizeToExact — force generated image to EXACT target pixels, lossless PNG
// Matches aplus-demo/server/src/services/imageResize.js exactly.
// ---------------------------------------------------------------------------
function parseSize(size) {
    const m = /^(\d+)\s*[xX]\s*(\d+)$/.exec(String(size || "").trim());
    if (!m) return null;
    const width = Number(m[1]);
    const height = Number(m[2]);
    if (!width || !height) return null;
    return { width, height };
}

async function resizeToExact(base64, size) {
    const buf = Buffer.from(base64, "base64");
    const pipeline = sharp(buf, { failOn: "none" });
    const meta = await pipeline.metadata();
    const target = parseSize(size);

    let enlarged = false;
    let work = pipeline;

    if (target) {
        enlarged =
            (Number(meta.width) > 0 && meta.width < target.width) ||
            (Number(meta.height) > 0 && meta.height < target.height);
        work = work.resize(target.width, target.height, {
            fit: "cover",
            position: "centre",
            kernel: "lanczos3",
            withoutEnlargement: false,
        });
    }

    const out = await work
        .sharpen({ sigma: 0.4 })
        .png({ compressionLevel: 9 })
        .toBuffer();

    return { data: out.toString("base64"), mimeType: "image/png", enlarged };
}

// ---------------------------------------------------------------------------
// extractImagesFromModules — build per-image prompts from AI module list
// ---------------------------------------------------------------------------
function extractImagesFromModules(aiResult) {

    const images = [];

    for (const module of aiResult.contentModuleList) {

        const type = module.contentModuleType;

        if (type === "STANDARD_SINGLE_IMAGE_HIGHLIGHTS") {
            const imageObj = module.standardSingleImageHighlights.image;

            images.push({
                imageKey: "single-highlight",
                imageRef: imageObj,
                width: imageObj.imageCropSpecification.size.width.value,
                height: imageObj.imageCropSpecification.size.height.value,
                prompt: `
                    Generate premium Amazon A+ Content image.

                    HEADLINE:
                    ${module.standardSingleImageHighlights.headline?.value}

                    BLOCK 1:
                    ${module.standardSingleImageHighlights.textBlock1?.headline?.value}
                    ${module.standardSingleImageHighlights.textBlock1?.body?.textList?.map(x => x.value).join(" ")}

                    BLOCK 2:
                    ${module.standardSingleImageHighlights.textBlock2?.headline?.value}
                    ${module.standardSingleImageHighlights.textBlock2?.body?.textList?.map(x => x.value).join(" ")}

                    BLOCK 3:
                    ${module.standardSingleImageHighlights.textBlock3?.headline?.value}
                    ${module.standardSingleImageHighlights.textBlock3?.body?.textList?.map(x => x.value).join(" ")}

                    STYLE:
                    Premium ecommerce
                    Amazon A+ Content
                    Ultra realistic
                    Clean background
                    Professional lighting
                    India marketplace
                    No text inside image
                `
            });
        }

        if (type === "STANDARD_FOUR_IMAGE_TEXT") {
            ["block1", "block2", "block3", "block4"].forEach((blockKey, index) => {

                const block = module.standardFourImageText[blockKey];
                const imageObj = block.image;

                images.push({
                    imageKey: `four-${index + 1}`,
                    imageRef: imageObj,
                    width: imageObj.imageCropSpecification.size.width.value,
                    height: imageObj.imageCropSpecification.size.height.value,
                    prompt: `
                        Generate premium Amazon feature image.

                        FEATURE:
                        ${block.headline?.value}

                        DESCRIPTION:
                        ${block.body?.textList?.map(x => x.value).join(" ")}

                        STYLE:
                        Modern ecommerce
                        White clean background
                        Professional product photography
                        No text
                        High conversion focused
                    `
                });
            });
        }

        if (type === "STANDARD_THREE_IMAGE_TEXT") {
            ["block1", "block2", "block3"].forEach((blockKey, index) => {

                const block = module.standardThreeImageText[blockKey];
                const imageObj = block.image;

                images.push({
                    imageKey: `three-${index + 1}`,
                    imageRef: imageObj,
                    width: imageObj.imageCropSpecification.size.width.value,
                    height: imageObj.imageCropSpecification.size.height.value,
                    prompt: `
                        Generate premium Amazon A+ informational image.

                        FEATURE:
                        ${block.headline?.value}

                        DESCRIPTION:
                        ${block.body?.textList?.map(x => x.value).join(" ")}

                        STYLE:
                        Lifestyle
                        Natural
                        Premium
                        Organic
                        Clean ecommerce image
                    `
                });
            });
        }

        if (type === "STANDARD_HEADER_IMAGE_TEXT") {
            const imageObj = module.standardHeaderImageText.block.image;

            images.push({
                imageKey: "header-banner",
                imageRef: imageObj,
                width: imageObj.imageCropSpecification.size.width.value,
                height: imageObj.imageCropSpecification.size.height.value,

                prompt: `
                    Generate premium Amazon hero banner.

                    HEADLINE:
                    ${module.standardHeaderImageText.headline?.value}

                    CONTENT:
                    ${module.standardHeaderImageText.block?.body?.textList?.map(x => x.value).join(" ")}

                    STYLE:
                    Luxury ecommerce banner
                    Natural lighting
                    Professional
                    Wide composition
                    No text
                `
            });
        }

        if (type === "STANDARD_IMAGE_TEXT_OVERLAY") {
            const imageObj = module.standardImageTextOverlay.block.image;

            images.push({
                imageKey: "overlay-image",
                imageRef: imageObj,
                width: imageObj.imageCropSpecification.size.width.value,
                height: imageObj.imageCropSpecification.size.height.value,
                prompt: `
                    Generate premium lifestyle Amazon image.

                    HEADLINE:
                    ${module.standardImageTextOverlay.block?.headline?.value}

                    CONTENT:
                    ${module.standardImageTextOverlay.block?.body?.textList?.map(x => x.value).join(" ")}

                    STYLE:
                    Light luxury lifestyle
                    Premium product scene
                    Ultra realistic
                    Professional ecommerce
                    No text
                `
            });
        }
    }

    return images;
}

// ---------------------------------------------------------------------------
// downloadProductImage — download + resize an existing Amazon product image
// ---------------------------------------------------------------------------
async function downloadProductImage(url, imageKey, width, height) {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);
    const dir = path.join(process.cwd(), "uploads/aplus");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${imageKey}-orig-${Date.now()}.jpg`);
    fs.writeFileSync(filePath, buffer);

    const finalPath = path.join(dir, `${imageKey}-${Date.now()}.jpg`);
    await sharp(filePath).resize(width, height, { fit: "cover" }).jpeg({ quality: 95 }).toFile(finalPath);
    fs.unlinkSync(filePath);
    return finalPath;
}

// ---------------------------------------------------------------------------
// fetchProductImageAsBase64 — download the highest-res MAIN product image
// and return { mimeType, data(base64) } for passing to Gemini as reference.
// ---------------------------------------------------------------------------
async function fetchProductImageAsBase64(productImages) {
    if (!productImages || !productImages.length) return null;

    // Pick highest-resolution MAIN image (matching aplus-demo/amazonCatalog.js)
    const mains = productImages.filter(i => i?.variant === "MAIN" && i?.link);
    const pool = mains.length ? mains : productImages.filter(i => i?.link);
    if (!pool.length) return null;

    const best = pool.reduce(
        (a, b) => ((Number(b.width) * Number(b.height) || 0) > (Number(a.width) * Number(a.height) || 0) ? b : a),
        pool[0]
    );

    try {
        const imgRes = await axios.get(best.link, { responseType: "arraybuffer" });
        const buf = Buffer.from(imgRes.data);
        const mimeType = imgRes.headers["content-type"] || "image/jpeg";
        return { mimeType, data: buf.toString("base64") };
    } catch (err) {
        write_logs({ message: `fetchProductImageAsBase64 failed: ${err.message}`, log_type: "error" });
        return null;
    }
}

// ---------------------------------------------------------------------------
// generateAndUploadModuleImages — main entry point
// Uses _imageModules directly from generateAPlusModulesAI (no contentModuleList).
// Each module has { title, prompt, size } where size = "970x300" etc.
// ---------------------------------------------------------------------------
exports.generateAndUploadModuleImages = async ({
    aiResult,
    productData,
    token,
    endPoint,
    marketPlaceId,
    configId,
    profileId,
    generateImageOption = false,
    type = "basic"
}) => {

    const imageModules = aiResult?._imageModules || [];

    // Fetch the product's main image as base64 for Gemini reference
    let productRef = null;
    if (generateImageOption === true || generateImageOption === "true") {
        productRef = await fetchProductImageAsBase64(productData?.images || []);
    }

    // GENERATE ALL IMAGES IN PARALLEL
    const generatedImages = await Promise.all(

        imageModules.map(async (mod, index) => {
            let localPath;
            const existingImages = productData?.images || [];
            const isGenerateImage = generateImageOption === true || generateImageOption === "true";

            // Parse size "970x300" -> { width: 970, height: 300 }
            const sizeTarget = parseSize(mod.size);
            const width = sizeTarget?.width || 970;
            const height = sizeTarget?.height || 300;
            const imageKey = `aplus-${type}-${index + 1}`;
            
            write_logs({ 
                message: `A+ Image Generation: isGenerateImage=${isGenerateImage}, type=${type}, module=${mod.title}, size=${mod.size}`, 
                log_type: "info" 
            });

            if (isGenerateImage) {
                // Generate AI Image via Gemini (matching aplus-demo)
                try {
                    localPath = await generateImageWithGemini({
                        prompt: mod.prompt,
                        imageKey,
                        width,
                        height,
                        productRef
                    });
                } catch (err) {
                    write_logs({ message: `Gemini image generation failed for "${mod.title}": ${err.message}`, log_type: "error" });
                }
            } else if (existingImages.length > 0) {
                // Use existing gallery image
                const imgLink = existingImages[index % existingImages.length]?.link;
                if (imgLink) {
                    try {
                        localPath = await downloadProductImage(imgLink, imageKey, width, height);
                    } catch (err) {
                        write_logs({ message: `Failed to download existing image: ${err.message}`, log_type: "error" });
                    }
                }
            }

            // Fallback if localPath is still empty
            if (!localPath) {
                if (isGenerateImage) {
                    // Retry Gemini generation once
                    try {
                        localPath = await generateImageWithGemini({
                            prompt: mod.prompt,
                            imageKey,
                            width,
                            height,
                            productRef
                        });
                    } catch (err) {
                        write_logs({ message: `Fallback Gemini generation failed: ${err.message}`, log_type: "error" });
                    }
                }
                
                // Final safety fallback: create a solid placeholder locally using sharp
                if (!localPath) {
                    try {
                        const dir = path.join(process.cwd(), "uploads/aplus");
                        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
                        localPath = path.join(dir, `placeholder-${imageKey}-${Date.now()}.png`);
                        await sharp({
                            create: {
                                width,
                                height,
                                channels: 3,
                                background: { r: 244, g: 246, b: 249 }
                            }
                        }).png({ compressionLevel: 9 }).toFile(localPath);
                    } catch (err) {
                        write_logs({ message: `Failed to create local placeholder image: ${err.message}`, log_type: "error" });
                    }
                }
            }

            // Upload To Amazon
            let uploadDestinationId = null;
            if (token && endPoint && marketPlaceId) {
                try {
                    uploadDestinationId = await uploadImageToAmazon({
                        localPath,
                        token,
                        endPoint,
                        marketPlaceId
                    });
                } catch (err) {
                    write_logs({ message: `Amazon upload failed for "${mod.title}": ${err.message}`, log_type: "error" });
                }
            }

            return {
                title: mod.title,
                prompt: mod.prompt,
                size: mod.size,
                localPath,
                uploadDestinationId
            };
        })
    );

    return generatedImages;
};

// ---------------------------------------------------------------------------
// generateImageWithGemini — Gemini image generation matching aplus-demo
// Uses gemini-3-pro-image-preview with product photo as inline reference.
// Returns a local file path to the resized PNG.
// ---------------------------------------------------------------------------
async function generateImageWithGemini({ prompt, imageKey, width, height, productRef }) {
    const { GoogleGenAI } = require("@google/genai");

    const apiKey = process.env.GOOGLE_AI_STUDIO_KEY;
    if (!apiKey) throw new Error("GOOGLE_AI_STUDIO_KEY not set");

    const ai = new GoogleGenAI({ apiKey });
    const size = `${width}x${height}`;

    const parts = [];
    // Product image goes FIRST so the model treats it as the reference subject (matching aplus-demo)
    if (productRef?.data) {
        parts.push({ inlineData: { mimeType: productRef.mimeType || "image/png", data: productRef.data } });
    }
    parts.push({
        text:
            `${prompt}\n\nGenerate ONE finished landscape image. Target the exact dimensions ${size} pixels ` +
            `(landscape) — compose the whole banner for that shape and fill it edge to edge. ` +
            `The PRODUCT itself (bottle/jar/pack/mockup) must look like a REAL photographed product — ` +
            `rendered a touch DARKER and matte, with true-to-life colors, real texture and soft, realistic ` +
            `lighting. It must NOT look like a 3D render, CGI, a glossy product visualization, or AI-generated. ` +
            `Avoid bright glossy reflections and mirror highlights on the label and cap; keep the product ` +
            `deeper and more muted than a typical bright catalog shot. Prioritize accurate product appearance and crystal-clear label/text over cinematic effects. ` +
            `Render the product medium and prominent (a hero element close to the camera, roughly 25-30% of the ` +
            `frame width), and keep EVERY line of its label text razor-SHARP, crisp and fully LEGIBLE — brand ` +
            `name, sub-lines, badges and small print all clearly readable and matching the reference; never ` +
            `blur, soften, warp or garble the label. Keep the product label/text/logo EXACTLY as the reference.` +
            `Do NOT blur, distort, warp, soften, replace or generate fake/gibberish text. Avoid strong reflections. The product must look like a real professionally photographed physical product — matte, realistic, label to be clearly visible. The entire visible label must be extremely sharp, crisp, high-resolution`,
    });

    const res = await ai.models.generateContent({
        model: IMAGE_MODEL(),
        contents: [{ role: "user", parts }],
    });

    const candParts = res?.candidates?.[0]?.content?.parts || [];
    const img = candParts.find((p) => p?.inlineData?.data);
    if (!img) throw new Error("Gemini image generation returned no image.");

    // Resize to EXACT target pixels (lossless PNG, Lanczos3 kernel) — matching aplus-demo
    const resized = await resizeToExact(img.inlineData.data, size);
    if (resized.enlarged) {
        write_logs({ message: `[geminiImage] source was smaller than ${size} — upscaled to fit.`, log_type: "warn" });
    }

    // Save to disk for Amazon upload
    const dir = path.join(process.cwd(), "uploads/aplus");
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${imageKey}-${Date.now()}.png`);
    const buffer = Buffer.from(resized.data, "base64");
    fs.writeFileSync(filePath, buffer);

    write_logs({ message: `Gemini image generated: ${imageKey} at ${size}`, log_type: "info" });

    return filePath;
}

// ---------------------------------------------------------------------------
exports.uploadImageToAmazon = uploadImageToAmazon;
async function uploadImageToAmazon({ localPath, token, endPoint, marketPlaceId }) {
    const fileBuffer = fs.readFileSync(localPath);
    const md5 = crypto.createHash("md5").update(fileBuffer).digest("hex");

    // Detect content type from file extension
    const ext = path.extname(localPath).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";

    // CREATE DESTINATION
    const createRes = await axios.post(
        `${endPoint}/uploads/2020-11-01/uploadDestinations/aplus/2020-11-01/contentDocuments`,
        {},
        {
            params: { marketplaceIds: marketPlaceId, contentMD5: md5, contentType },
            headers: { "x-amz-access-token": token }
        }
    );

    const uploadData = createRes.data.payload;
    const uploadDestinationId = await uploadImageToAmazonS3({ uploadData, localPath, contentType });
    return uploadDestinationId?.uploadDestinationId;
}

async function uploadImageToAmazonS3({ uploadData, localPath, contentType = "image/jpeg" }) {
    try {
        const form = new FormData();

        const parsedUrl = new URL(uploadData.url);

        const cleanUrl = `${parsedUrl.protocol}//${parsedUrl.host}${parsedUrl.pathname}`;

        parsedUrl.searchParams.forEach((value, key) => { form.append(key, value) });

        if (Array.isArray(uploadData.headers)) {
            uploadData.headers.forEach((header) => { form.append(header.name, header.value) });
        }

        form.append("file", fs.createReadStream(localPath), { filename: path.basename(localPath), contentType });

        await axios.post(cleanUrl, form, { headers: { ...form.getHeaders() }, maxContentLength: Infinity, maxBodyLength: Infinity });

        return { uploadDestinationId: uploadData.uploadDestinationId };
    } catch (error) {
        write_logs({ message: `uploadImageToAmazonS3: Error: ${error.message}`, log_type: "error" });
        return {
            success: false,
            status: 203,
            message: error?.response?.data || error?.message || "Amazon image upload failed"
        };
    }
}

exports.getAllVariationAsins = async ({ asin, token, endPoint, marketplaceId }) => {
    const firstRes = await axios.get(
        `${endPoint}/catalog/2022-04-01/items/${asin}`,
        { params: { marketplaceIds: marketplaceId, includedData: "relationships" }, headers: { "x-amz-access-token": token } }
    );

    const relationships = firstRes?.data?.relationships?.[0]?.relationships || [];
    const variation = relationships.find((x) => x.type === "VARIATION");
    const parentAsins = variation?.parentAsins || [];
    const childAsins = variation?.childAsins || [];

    if (childAsins.length > 0) {
        return Array.from(new Set([asin, ...parentAsins, ...childAsins]));
    }

    if (parentAsins.length > 0) {
        const parentAsin = parentAsins[0];

        const parentRes = await axios.get(
            `${endPoint}/catalog/2022-04-01/items/${parentAsin}`,
            { params: { marketplaceIds: marketplaceId, includedData: "relationships" }, headers: { "x-amz-access-token": token } }
        );

        const parentRelationships = parentRes?.data?.relationships?.[0]?.relationships || [];
        const parentVariation = parentRelationships.find((x) => x.type === "VARIATION");
        const allChildren = parentVariation?.childAsins || [];

        return Array.from(new Set([parentAsin, ...allChildren]));
    }

    return [asin];
}

exports.addAsinsToAPlusContent = async ({ contentReferenceKey, asinSet, token, endPoint, marketplaceId }) => {

    const response = await axios.post(
        `${endPoint}/aplus/2020-11-01/contentDocuments/${contentReferenceKey}/asins`,
        { asinSet },
        { params: { marketplaceId }, headers: { "x-amz-access-token": token, "Content-Type": "application/json" } }
    );

    return response?.data;
}