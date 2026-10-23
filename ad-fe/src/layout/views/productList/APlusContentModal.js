import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../../../components/ui/dialog";
import "./APlusContentModal.css";
import { ApiGetAPlusContent, ApiCreateAPlusContent } from "../../../api-wrapper/aPlusContent/ApiAPlusContent";
import Toast from "../../../common/helper/toast/Toast";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

export default function APlusContentModal({
  isOpen,
  onClose,
  mode = "create",
  product = {},
  isCreating,
  isEditing,
  isApproving,
  isPublishingBatch,
  onCreateWithAI,
  onEditWithAI,
  onApproveContent,
  onPublishBatchJob,
  onRegenerateReview,
  profileId,
}) {
  const { t } = useTranslation();
  const isView = mode === "view";
  const [aplusData, setAplusData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Preview Generator states
  const [asinInput, setAsinInput] = useState(product?.asin || "");
  const [aplusType, setAplusType] = useState("basic"); // "basic" (5 banners) | "premium" (7 banners)
  const [userPrompt, setUserPrompt] = useState("");
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewError, setPreviewError] = useState(null);

  useEffect(() => {
    if (isOpen) {
      setAsinInput(product?.asin || "");
      setUserPrompt("");
      setPreviewData(null);
      setPreviewError(null);
    }
  }, [isOpen, product?.asin]);

  useEffect(() => {
    if (isView && isOpen && product?.contentReferenceKey) {
      fetchAplusContent();
    }
  }, [isView, isOpen, product?.contentReferenceKey, isCreating, isEditing, isApproving]);


  const fetchAplusContent = async (overrideRefKey) => {
    const targetRefKey = overrideRefKey || product?.contentReferenceKey;
    if (!targetRefKey) return;
    setLoading(true);
    setError(null);
    try {
      const response = await ApiGetAPlusContent({
        profileId: profileId || product?.profileId,
        contentReferenceKey: targetRefKey,
      });
      if (response?.isSuccess && response?.data?.contentRecord) {
        setAplusData(response.data.contentRecord);
      } else {
        setError(response?.message || t("Failed to fetch A+ content"));
      }
    } catch (err) {
      setError(err.message || t("Error fetching content"));
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePreview = async () => {
    const targetAsin = (asinInput || product?.asin || "").trim().toUpperCase();
    if (!targetAsin) {
      Toast.error(t("Please enter a valid ASIN"));
      return;
    }
    const options = {
      asin: targetAsin,
      type: aplusType,
      prompt: userPrompt,
      generateImageOption: true,
    };

    if (onCreateWithAI) {
      onCreateWithAI(product, options);
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const response = await ApiCreateAPlusContent({
        ...options,
        profileId: profileId || product?.profileId,
      });
      if (response && response.isSuccess) {
        Toast.success(response.message || t("A+ Content Created Successfully"));
        const refKey = response.data?.contentReferenceKey || response.contentReferenceKey;
        if (refKey) {
          fetchAplusContent(refKey);
        } else if (response.data) {
          setPreviewData(response.data);
        }
      } else {
        const msg = response?.message || t("Failed to generate A+ content");
        setPreviewError(msg);
        Toast.error(msg);
      }
    } catch (err) {
      const msg = err?.message || t("Error generating A+ content");
      setPreviewError(msg);
      Toast.error(msg);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleDownloadPng = (banner, idx) => {
    try {
      if (!banner?.dataUrl) {
        Toast.error(t("Image preview data unavailable"));
        return;
      }
      const targetAsin = (asinInput || product?.asin || "PRODUCT").trim().toUpperCase();
      const titleSlug = (banner.title || `banner_${idx + 1}`).toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const sizeStr = banner.size ? `_${banner.size}` : "";
      const filename = `${targetAsin}_${titleSlug}${sizeStr}.png`;

      saveAs(banner.dataUrl, filename);
      Toast.success(t("Downloaded {{filename}}", { filename }));
    } catch (err) {
      Toast.error(t("Failed to download image"));
    }
  };

  const contentMetadata = aplusData?.contentMetadata || {};
  const contentDocument = aplusData?.contentDocument || {};
  const contentModules = contentDocument?.contentModuleList || [];
  const contentReferenceKey =
    aplusData?.contentReferenceKey || product?.contentReferenceKey;

  const statusColorMap = {
    APPROVED: { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7", icon: "fa-circle-check" },
    LIVE: { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7", icon: "fa-circle-check" },
    PUBLISHED: { bg: "#d1fae5", color: "#065f46", border: "#6ee7b7", icon: "fa-circle-check" },
    PENDING: { bg: "#fef9c3", color: "#713f12", border: "#fde047", icon: "fa-clock" },
    REJECTED: { bg: "#fee2e2", color: "#991b1b", border: "#fca5a5", icon: "fa-circle-xmark" },
    DRAFT: { bg: "#e0f2fe", color: "#0c4a6e", border: "#7dd3fc", icon: "fa-pen-to-square" },
    IN_REVIEW: { bg: "#ede9fe", color: "#4c1d95", border: "#c4b5fd", icon: "fa-hourglass-half" },
    SUBMITTED: { bg: "#e0f2fe", color: "#0c4a6e", border: "#7dd3fc", icon: "fa-paper-plane" },
  };

  const currentStatus =
    contentMetadata?.status || (product?.hasAPlusContent ? "APPROVED" : product?.aPlusContentStatus || "DRAFT");
  const statusStyle = statusColorMap[currentStatus] || statusColorMap.DRAFT;
  const liveStatuses = ["APPROVED", "SUBMITTED", "PUBLISHED", "LIVE", "IN_REVIEW"];
  const isLive = Boolean(product?.hasAPlusContent) || liveStatuses.includes(String(currentStatus)?.toUpperCase());
  const showApproveButton = isView && !loading && !isLive;

  const getImageUrl = (uploadDestinationId) => {
    if (!uploadDestinationId) return null;
    return `https://m.media-amazon.com/images/S/${uploadDestinationId}`;
  };
  const isAiLoading = isCreating || isEditing || isApproving || isPreviewLoading || isPublishingBatch;
  const isGeneratingInBackground = mode === "generating";
  const isReview = mode === "review";


  const getLoadingConfig = () => {
    if (isPublishingBatch) {
      return {
        icon: "fa-cloud-arrow-up",
        iconBg: "linear-gradient(135deg, #d9a441, #b7791f)",
        glowColor: "rgba(183, 121, 31, 0.35)",
        title: t("Publishing to Amazon…"),
        subtitle: t("Uploading your reviewed banners and creating the A+ Content draft."),
        steps: [
          { icon: "fa-file-export", label: t("Building content document") },
          { icon: "fa-cloud-arrow-up", label: t("Publishing to Amazon") },
          { icon: "fa-check-double", label: t("Linking variations") },
        ],
        accentColor: "#b7791f",
      };
    }
    if (isApproving) {
      return {
        icon: "fa-circle-check",
        iconBg: "linear-gradient(135deg, var(--accent-primary), #0369c7)",
        glowColor: "var(--accent-glow)",
        title: t("Approving Content…"),
        subtitle: t("Submitting your content for Amazon approval. Please wait."),
        steps: [
          { icon: "fa-shield-check", label: t("Validating content structure") },
          { icon: "fa-paper-plane", label: t("Submitting to Amazon") },
          { icon: "fa-satellite-dish", label: t("Awaiting confirmation") },
        ],
        accentColor: "var(--accent-primary)",
      };
    }
    if (isEditing) {
      return {
        icon: "fa-wand-magic-sparkles",
        iconBg: "linear-gradient(135deg, var(--accent-primary), #1a6bbf)",
        glowColor: "var(--accent-glow)",
        title: t("AI is Editing Content…"),
        subtitle: t("Refining your modules, headlines & media. This may take a moment."),
        steps: [
          { icon: "fa-magnifying-glass", label: t("Analysing existing content") },
          { icon: "fa-pen-nib", label: t("Rewriting headlines & copy") },
          { icon: "fa-layer-group", label: t("Restructuring modules") },
          { icon: "fa-wand-sparkles", label: t("Polishing final layout") },
        ],
        accentColor: "var(--accent-primary)",
      };
    }
    // isCreating
    return {
      icon: "fa-wand-magic-sparkles",
      iconBg: "linear-gradient(135deg, var(--accent-primary), #1a6bbf)",
      glowColor: "var(--accent-glow)",
      title: t("AI is Generating Content…"),
      subtitle: t("Crafting rich modules, headlines & media. This may take a moment."),
      steps: [
        { icon: "fa-database", label: t("Analysing product details") },
        { icon: "fa-pen-nib", label: t("Writing headlines & copy") },
        { icon: "fa-layer-group", label: t("Structuring content modules") },
        { icon: "fa-palette", label: t("Finalising layout & design") },
      ],
      accentColor: "var(--accent-primary)",
    };
  };

  const loadingConfig = getLoadingConfig();

  /* ─────────────────────────────────────────────────────────────
     renderModule — layout matches Amazon Seller Central preview
     ───────────────────────────────────────────────────────────── */
  const renderModule = (module, index) => {
    const type = module.contentModuleType;

    /* ── STANDARD_COMPANY_LOGO ── */
    if (type === "STANDARD_COMPANY_LOGO" && module.standardCompanyLogo) {
      const logo = module.standardCompanyLogo.companyLogo;
      return (
        <div key={index} className="apc-module apc-module-logo">
          {logo?.uploadDestinationId && (
            <img
              src={getImageUrl(logo.uploadDestinationId)}
              alt={logo.altText || t("Company Logo")}
              className="apc-logo-image"
            />
          )}
        </div>
      );
    }

    /* ── STANDARD_SINGLE_IMAGE_HIGHLIGHTS ── */
    if (
      type === "STANDARD_SINGLE_IMAGE_HIGHLIGHTS" &&
      module.standardSingleImageHighlights
    ) {
      const data = module.standardSingleImageHighlights;
      return (
        <div key={index} className="apc-module apc-module-hero">
          <div className="apc-hero-wrapper">
            <div className="apc-hero-image-col">
              {data.image?.uploadDestinationId && (
                <div className="apc-hero-img-top">
                  <img
                    src={getImageUrl(data.image.uploadDestinationId)}
                    alt={data.image.altText || ""}
                  />
                </div>
              )}
              <div className="apc-hero-img-tiles">
                {[data.textBlock1, data.textBlock2, data.textBlock3]
                  .filter((b) => b?.image?.uploadDestinationId)
                  .map((block, i) => (
                    <div key={i} className="apc-hero-tile">
                      <img
                        src={getImageUrl(block.image.uploadDestinationId)}
                        alt={block.image?.altText || ""}
                      />
                      <div className="apc-hero-tile-text">
                        {block.headline?.value && (
                          <strong>{block.headline.value}</strong>
                        )}
                        {block.body?.textList?.[0]?.value && (
                          <span>{block.body.textList[0].value}</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>

            <div className="apc-hero-features-col">
              {data.headline?.value && (
                <h2 className="apc-hero-headline">{data.headline.value}</h2>
              )}
              <div className="apc-hero-features">
                {[data.textBlock1, data.textBlock2, data.textBlock3]
                  .filter(Boolean)
                  .map((block, i) => (
                    <div key={i} className="apc-feature-item">
                      {block.headline?.value && (
                        <h3 className="apc-feature-subhead">
                          {block.headline.value}
                        </h3>
                      )}
                      {block.body?.textList?.[0]?.value && (
                        <p className="apc-feature-body">
                          {block.body.textList[0].value}
                        </p>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {data.bulletedListBlock && (
              <div className="apc-key-advantages">
                {data.bulletedListBlock.headline?.value && (
                  <h3 className="apc-advantages-title">
                    {data.bulletedListBlock.headline.value}
                  </h3>
                )}
                <ul className="apc-advantages-list">
                  {data.bulletedListBlock.block?.textList?.map((item, i) => (
                    <li key={i}>{item.text?.value ?? item.value}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      );
    }

    /* ── STANDARD_PRODUCT_DESCRIPTION ── */
    if (
      type === "STANDARD_PRODUCT_DESCRIPTION" &&
      module.standardProductDescription
    ) {
      const body = module.standardProductDescription.body;
      return (
        <div key={index} className="apc-module apc-module-description">
          <div className="apc-description-content">
            <p>{body?.textList?.[0]?.value}</p>
          </div>
        </div>
      );
    }

    /* ── STANDARD_FOUR_IMAGE_TEXT ── */
    if (type === "STANDARD_FOUR_IMAGE_TEXT" && module.standardFourImageText) {
      const data = module.standardFourImageText;
      const blocks = [data.block1, data.block2, data.block3, data.block4].filter(Boolean);
      return (
        <div key={index} className="apc-module apc-module-four-grid">
          {data.headline?.value && (
            <h3 className="apc-section-title">{data.headline.value}</h3>
          )}
          <div className="apc-four-grid">
            {blocks.map((block, i) => (
              <div key={i} className="apc-grid-item">
                {block.image?.uploadDestinationId && (
                  <div className="apc-grid-icon">
                    <img
                      src={getImageUrl(block.image.uploadDestinationId)}
                      alt={block.image.altText || ""}
                    />
                  </div>
                )}
                {block.headline?.value && <h3>{block.headline.value}</h3>}
                {block.body?.textList?.[0]?.value && (
                  <p>{block.body.textList[0].value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ── STANDARD_THREE_IMAGE_TEXT ── */
    if (
      type === "STANDARD_THREE_IMAGE_TEXT" &&
      module.standardThreeImageText
    ) {
      const data = module.standardThreeImageText;
      const blocks = [data.block1, data.block2, data.block3].filter(Boolean);
      return (
        <div key={index} className="apc-module apc-module-three-grid">
          {data.headline?.value && (
            <h3 className="apc-section-title">{data.headline.value}</h3>
          )}
          <div className="apc-three-grid">
            {blocks.map((block, i) => (
              <div key={i} className="apc-grid-item">
                {block.image?.uploadDestinationId && (
                  <div className="apc-grid-icon">
                    <img
                      src={getImageUrl(block.image.uploadDestinationId)}
                      alt={block.image.altText || ""}
                    />
                  </div>
                )}
                {block.headline?.value && <h3>{block.headline.value}</h3>}
                {block.body?.textList?.[0]?.value && (
                  <p>{block.body.textList[0].value}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    /* ── STANDARD_HEADER_IMAGE_TEXT ── */
    if (
      type === "STANDARD_HEADER_IMAGE_TEXT" &&
      module.standardHeaderImageText
    ) {
      const data = module.standardHeaderImageText;
      return (
        <div key={index} className="apc-module apc-module-header-image">
          {data.headline?.value && (
            <h3 className="apc-section-title">{data.headline.value}</h3>
          )}
          <div className="apc-header-image-container">
            {data.block?.image?.uploadDestinationId && (
              <img
                src={getImageUrl(data.block.image.uploadDestinationId)}
                alt={data.block.image.altText || ""}
                className="apc-header-image"
              />
            )}
            <div className="apc-header-text">
              {data.block?.headline?.value && (
                <h3 className="apc-section-title">{data.block.headline.value}</h3>
              )}
              {data.block?.body?.textList?.[0]?.value && (
                <p>{data.block.body.textList[0].value}</p>
              )}
            </div>
          </div>
        </div>
      );
    }

    /* ── STANDARD_IMAGE_TEXT_OVERLAY ── */
    if (
      type === "STANDARD_IMAGE_TEXT_OVERLAY" &&
      module.standardImageTextOverlay
    ) {
      const data = module.standardImageTextOverlay;
      return (
        <div key={index} className="apc-module apc-module-overlay">
          <div className="apc-overlay-container">
            {data.block?.image?.uploadDestinationId && (
              <div
                className="apc-overlay-bg"
                style={{
                  backgroundImage: `url(${getImageUrl(
                    data.block.image.uploadDestinationId
                  )})`,
                }}
              >
                <div
                  className={`apc-overlay-content ${data.overlayColorType === "DARK" ? "dark" : "light"
                    }`}
                >
                  {data.block?.headline?.value && (
                    <h2>{data.block.headline.value}</h2>
                  )}
                  {data.block?.body?.textList?.[0]?.value && (
                    <p>{data.block.body.textList[0].value}</p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return null;
  };

  /* ─── Render ─── */
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent hideCloseButton={isAiLoading} className="premium-modal max-w-[1000px] p-0 gap-0 overflow-hidden bg-white dark:bg-[#0f172a] shadow-2xl border-slate-200 dark:border-white/10 flex flex-col">
        {/* ── Header ── */}
        <DialogHeader className="p-4 px-6 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/50 flex flex-row items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <i className="fa-regular fa-images text-lg" />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                {t("A+ Content")}
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                  {isGeneratingInBackground ? t("Generating…") : isReview ? t("Ready to Review") : isView ? t("Premium Content") : t("Content Builder")}
                </span>
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        {/* ── Product Info Strip ── */}
        {(product?.itemName || product?.asin || product?.name) && (
          <div className="apc-product-strip">
            {product?.imageURL ? (
              <img
                src={product.imageURL}
                alt={t("product")}
                className="apc-product-thumb"
              />
            ) : (
              <div className="apc-product-thumb-ph">
                <i className="fa-regular fa-image"></i>
              </div>
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                className="apc-product-name"
                title={product?.itemName || product?.name || t("Product")}
              >
                {product?.itemName || product?.name || "Spiru Swastha Wheatgrass"}
              </div>
              <div className="apc-product-meta">
                {product?.asin && (
                  <span className="apc-meta-chip">
                    {t("ASIN")}: <strong>{product.asin}</strong>
                  </span>
                )}
                {product?.sku && (
                  <span className="apc-meta-chip">
                    {t("sku")}: <strong>{product.sku}</strong>
                  </span>
                )}
                <span
                  className="apc-status-chip"
                  style={{
                    background: statusStyle.bg,
                    color: statusStyle.color,
                    borderColor: statusStyle.border,
                  }}
                >
                  <i
                    className={`fa-solid ${statusStyle.icon}`}
                    style={{ fontSize: "9px" }}
                  ></i>
                  {currentStatus}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Scrollable Body ── */}
        <div className="apc-body">

          {/* ── Background Generation In Progress (prevents resubmission) ── */}
          {isGeneratingInBackground ? (
            <div className="apc-loading apc-ai-loading">
              <div
                className="apc-ai-pulse-ring"
                style={{
                  background: "linear-gradient(135deg, #7c3aed, #a855f7)",
                  boxShadow: "0 0 0 0 rgba(168, 85, 247, 0.35)",
                }}
              >
                <i className="fa-solid fa-images"></i>
              </div>
              <p className="apc-loading-title">Generating your A+ content…</p>
              <p className="apc-loading-sub">
                Running in the background — this can take a few minutes.
                We'll notify you the moment it's ready to review, so there's no need to submit again.
              </p>
              <div className="apc-progress-bar-wrap">
                <div className="apc-progress-bar-fill" style={{ background: "#a855f7" }}></div>
              </div>
            </div>

            /* ── AI / Approve Loading State ── */
          ) : isAiLoading ? (
            <div className="apc-loading apc-ai-loading">
              {/* Animated icon */}
              <div
                className="apc-ai-pulse-ring"
                style={{
                  background: loadingConfig.iconBg,
                  boxShadow: `0 0 0 0 ${loadingConfig.glowColor}`,
                }}
              >
                <i className={`fa-solid ${loadingConfig.icon}`}></i>
              </div>

              {/* Title & subtitle */}
              <p className="apc-loading-title">{loadingConfig.title}</p>
              <p className="apc-loading-sub">{loadingConfig.subtitle}</p>

              {/* Progress steps */}
              <div className="apc-loading-steps">
                {loadingConfig.steps.map((step, i) => (
                  <div key={i} className="apc-step-row">
                    <div
                      className="apc-step-dot"
                      style={{
                        animationDelay: `${i * 0.4}s`,
                        background: loadingConfig.accentColor,
                        boxShadow: `0 0 6px ${loadingConfig.accentColor}`,
                      }}
                    />
                    <i
                      className={`fa-solid ${step.icon} apc-step-icon`}
                      style={{ color: loadingConfig.accentColor, animationDelay: `${i * 0.4}s` }}
                    ></i>
                    <span>{step.label}</span>
                  </div>
                ))}
              </div>

              {/* Shimmer progress bar */}
              <div className="apc-progress-bar-wrap">
                <div
                  className="apc-progress-bar-fill"
                  style={{ background: loadingConfig.accentColor }}
                ></div>
              </div>
            </div>

          ) : isReview ? (
            /* ── REVIEW MODE — generated but not yet published to Amazon ── */
            <div>
              <div className="apc-review-notice">
                <div className="apc-review-notice-icon">
                  <i className="fa-solid fa-circle-info" />
                </div>
                <div>
                  <div className="apc-review-notice-title">Not published yet</div>
                  <p className="apc-review-notice-text">
                    These banners were generated in the background. Review how they'll actually look below, then click Publish to push this A+ Content to Amazon.
                  </p>
                </div>
              </div>

              {/* Same full-width layout as the real Amazon preview (VIEW mode) — no cards, no letterboxing */}
              <div className="apc-preview-container">
                {(product?.__generatedImages || []).map((banner, idx) => {
                  const [w, h] = (banner.size || "970x600").toLowerCase().split("x");
                  return (
                    <div
                      key={idx}
                      className="apc-review-banner"
                      style={{ aspectRatio: `${w || 970} / ${h || 600}` }}
                    >
                      {banner.uploadDestinationId ? (
                        <img
                          src={getImageUrl(banner.uploadDestinationId)}
                          alt={banner.title || `Banner ${idx + 1}`}
                          className="apc-review-banner-img"
                        />
                      ) : (
                        <div className="apc-review-banner-empty">No preview available</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

          ) : isView ? (
            /* ── VIEW MODE ── */
            <>
              {loading ? (
                <div className="apc-loading">
                  <div className="apc-spinner"></div>
                  <p>Loading A+ Content...</p>
                </div>
              ) : error ? (
                <div className="apc-loading">
                  <i
                    className="fa-regular fa-circle-exclamation"
                    style={{
                      fontSize: "40px",
                      color: "#dc2626",
                      marginBottom: "16px",
                    }}
                  ></i>
                  <p style={{ color: "#dc2626" }}>{error}</p>
                  <button
                    className="apc-btn-secondary"
                    onClick={fetchAplusContent}
                    style={{ marginTop: "12px", padding: "6px 16px" }}
                  >
                    <i className="fa fa-refresh"></i> Retry
                  </button>
                </div>
              ) : contentModules.length > 0 ? (
                <div className="apc-preview-container">
                  {contentModules.map((module, idx) =>
                    renderModule(module, idx)
                  )}
                </div>
              ) : (
                <div className="apc-loading">
                  <i
                    className="fa-regular fa-file-lines"
                    style={{
                      fontSize: "48px",
                      color: "#cbddee",
                      marginBottom: "16px",
                    }}
                  ></i>
                  <p>No modules found in this A+ Content.</p>
                </div>
              )}
            </>

          ) : (
            /* ── CREATE MODE ── */
            <div className="apc-create-mode-v2 p-2 flex flex-col gap-6 text-left">
              <div className="flex flex-col md:flex-row gap-6">
                {/* Left Side: Product Focus & Target Info */}
                <div className="flex-1 flex flex-col justify-between bg-slate-50/50 dark:bg-slate-900/30 border border-slate-200/50 dark:border-white/5 rounded-2xl p-5">
                  <div>
                    <div className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-4">Target Product</div>

                    {/* ASIN Editable Input */}
                    <div className="mb-4">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                        Amazon ASIN
                      </label>
                      <input
                        type="text"
                        value={asinInput}
                        onChange={(e) => setAsinInput(e.target.value.toUpperCase())}
                        placeholder={t("Enter ASIN (e.g. B08N5WRWNW)")}
                        className="w-full px-3 py-2 text-xs font-semibold rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white uppercase tracking-wider focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      />
                    </div>

                    {(product?.imageURL || previewData?.product?.imageUrl) && (
                      <div className="flex flex-col gap-3">
                        <div className="relative w-full aspect-video rounded-xl bg-white dark:bg-slate-950 border border-slate-200/60 dark:border-white/5 overflow-hidden flex items-center justify-center p-4 group">
                          <img
                            src={previewData?.product?.imageUrl || product?.imageURL}
                            alt="product"
                            className="max-h-full max-w-full object-contain transition-transform duration-300 group-hover:scale-105"
                          />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold text-slate-800 dark:text-white line-clamp-2 leading-snug">
                            {previewData?.product?.title || product?.itemName || product?.name}
                          </h4>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Side: A+ Content Type & Action */}
                <div className="flex-1 flex flex-col justify-between gap-6">
                  <div>
                    <div className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase mb-4">A+ Content Configuration</div>

                    {/* Content Type Selector */}
                    <div className="flex flex-col gap-3 mb-4">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        A+ Content Type
                      </label>

                      <div className="grid grid-cols-2 gap-3">
                        {/* Basic Option */}
                        <div
                          onClick={() => setAplusType("basic")}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${aplusType === "basic"
                            ? "bg-blue-50/60 dark:bg-blue-950/40 border-blue-500 shadow-sm"
                            : "bg-white dark:bg-slate-900/40 border-slate-200 dark:border-white/5 hover:border-slate-300"
                            }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-800 dark:text-white">Basic</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300">5 Banners</span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0">Standard banner set</p>
                          </div>
                        </div>

                        {/* Premium Option */}
                        <div
                          onClick={() => setAplusType("premium")}
                          className={`p-3 rounded-xl border cursor-pointer transition-all flex flex-col justify-between ${aplusType === "premium"
                            ? "bg-purple-50/60 dark:bg-purple-950/40 border-purple-500 shadow-sm"
                            : "bg-white dark:bg-slate-900/40 border-slate-200 dark:border-white/5 hover:border-slate-300"
                            }`}
                        >
                          <div>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs font-bold text-slate-800 dark:text-white">Premium</span>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300">7 Banners</span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 m-0">Full cinematic set</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Optional Prompt Field */}
                    <div className="flex flex-col gap-1.5 mb-4">
                      <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                        Custom AI Prompt (Optional)
                      </label>
                      <textarea
                        rows={2}
                        value={userPrompt}
                        onChange={(e) => setUserPrompt(e.target.value)}
                        placeholder={t("e.g. Highlight eco-friendly organic materials and sleek design...")}
                        className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      className="w-full py-3 px-6 rounded-xl font-bold text-sm bg-[var(--accent-primary)] hover:opacity-90 active:scale-[0.98] shadow-md shadow-[var(--accent-glow)] text-white transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50"
                      onClick={handleGeneratePreview}
                      disabled={isAiLoading}
                    >
                      <i className="fas fa-magic" />
                      <span>{isAiLoading ? "Generating A+ Content..." : `Create ${aplusType === "basic" ? "Basic (5 Banners)" : "Premium (7 Banners)"} A+ Content with AI`}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Error Banner */}
              {previewError && (
                <div className="p-3.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/30 text-rose-700 dark:text-rose-300 flex items-center justify-between text-xs font-semibold">
                  <div className="flex items-center gap-2">
                    <i className="fas fa-exclamation-circle text-rose-500" />
                    <span>{previewError}</span>
                  </div>
                  <button onClick={handleGeneratePreview} className="px-2.5 py-1 rounded bg-rose-100 dark:bg-rose-900/60 font-bold hover:bg-rose-200">
                    Retry
                  </button>
                </div>
              )}

              {/* Returned Preview Banners Gallery */}
              {previewData?.images && previewData.images.length > 0 && (
                <div className="mt-4 pt-4 border-t border-slate-200/60 dark:border-white/10">
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xs font-bold text-slate-800 dark:text-white uppercase tracking-wider m-0">
                      Generated Banners ({previewData.images.length})
                    </h4>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {previewData.images.map((banner, idx) => (
                      <div
                        key={idx}
                        className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden flex flex-col justify-between shadow-sm"
                      >
                        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-white/5 flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-800 dark:text-white">
                            {banner.title || `Banner ${idx + 1}`}
                          </span>
                          {banner.size && (
                            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {banner.size}
                            </span>
                          )}
                        </div>

                        <div className="bg-slate-950 p-2 flex items-center justify-center min-h-[140px]">
                          {banner.dataUrl ? (
                            <img
                              src={banner.dataUrl}
                              alt={banner.title || "Banner Preview"}
                              className="max-h-48 w-auto object-contain"
                            />
                          ) : (
                            <span className="text-xs text-slate-500">No preview data</span>
                          )}
                        </div>

                        <div className="p-3 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-white/5 flex items-center justify-between">
                          <span className="text-[11px] text-slate-400">PNG Format</span>
                          <button
                            onClick={() => handleDownloadPng(banner, idx)}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-blue-600 hover:bg-blue-700 text-white shadow-sm flex items-center gap-1.5"
                          >
                            <i className="fas fa-download" /> Download PNG
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer — Generating in background ── */}
        {isGeneratingInBackground && (
          <div className="apc-footer flex items-center justify-end">
            <button className="apc-btn-secondary apc-btn-sm" onClick={onClose}>
              <i className="fa fa-times"></i> Close
            </button>
          </div>
        )}

        {/* ── Footer — REVIEW mode ── */}
        {isReview && !isAiLoading && (
          <div className="apc-footer flex items-center justify-end gap-2">
            <button className="apc-btn-secondary" onClick={onClose}>
              <i className="fa fa-times"></i> Close
            </button>
            <button
              className="apc-btn-primary"
              onClick={() => {
                if (onRegenerateReview) {
                  onRegenerateReview(product);
                } else if (onEditWithAI) {
                  onEditWithAI(product, contentReferenceKey, true);
                }
              }}
            >
              <i className="fas fa-magic"></i> Edit with AI
            </button>
            <button
              className="apc-btn-primary apc-btn-approve"
              onClick={() => onPublishBatchJob?.(product, product?.__batchJobId)}
            >
              <i className="fa-solid fa-cloud-arrow-up"></i> Publish
            </button>
          </div>
        )}

        {/* ── Footer — VIEW mode ── */}
        {isView && !isAiLoading && !isGeneratingInBackground && !isReview && (
          <div className="apc-footer flex items-center justify-between flex-wrap gap-4">
            <div className="apc-footer-buttons flex-1 flex justify-end">
              <button className="apc-btn-secondary" onClick={onClose}>
                <i className="fa fa-times"></i> Close
              </button>
              <button
                className="apc-btn-primary"
                onClick={() => onEditWithAI?.(product, contentReferenceKey, true)}
              >
                <i className="fas fa-magic"></i> Edit with AI
              </button>
              <button
                className="apc-btn-primary apc-btn-amazon"
                onClick={() => {
                  window.open(
                    `https://sellercentral.amazon.in/aplus/api/GetContentPreview?contentId=${contentReferenceKey}&projectId=${contentReferenceKey}&deviceType=DESKTOP`,
                    "_blank"
                  );
                }}
              >
                <i className="fa-brands fa-amazon"></i> View on Amazon
              </button>
            </div>
            {showApproveButton && (
              <button
                className="apc-btn-primary apc-btn-approve"
                onClick={() => onApproveContent?.(product, contentReferenceKey)}
              >
                <i className="fa-regular fa-circle-check"></i> Publish
              </button>
            )}
          </div>
        )}

        {/* ── Footer — CREATE mode ── */}
        {!isView && !isAiLoading && !isGeneratingInBackground && !isReview && (
          <div className="apc-footer">
            <div className="apc-footer-buttons">
              <button className="apc-btn-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* ── Footer — AI Loading mode (locked) ── */}
        {isAiLoading && (
          <div className="apc-footer apc-footer-loading">
            <span className="apc-footer-loading-text">
              <i className="fa-solid fa-lock" style={{ fontSize: "11px" }}></i>
              Please wait while AI processes your request…
            </span>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}