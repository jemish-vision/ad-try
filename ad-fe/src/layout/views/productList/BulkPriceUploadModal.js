import React, { useState, useRef, useContext } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../components/ui/dialog";
import { Button } from "../../../components/ui/button";
import { ProfileContext } from "../../../helper/usecontext/useContext";
import { ApiBulkUpdateProductPrice } from "../../../api-wrapper/productList/ApiProductList";
import { Toast } from "../../../helper/links/Link";
import { useTranslation } from "react-i18next";
import { getCurrencySymbol } from "../../../helper/currencyCode/CurrencyCode";
import {
  Upload,
  FileSpreadsheet,
  Download,
  AlertCircle,
  CheckCircle2,
  XCircle,
  FileText,
  RefreshCw,
  Trash2,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import * as XLSX from "xlsx";

export default function BulkPriceUploadModal({ show, onClose, onSuccess }) {
  const { t } = useTranslation();
  const { profileId, currencyCode } = useContext(ProfileContext);

  const [step, setStep] = useState("UPLOAD"); // 'UPLOAD' | 'PREVIEW' | 'RESULTS'
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState([]);
  const [validRows, setValidRows] = useState([]);
  const [clientInvalidRows, setClientInvalidRows] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resultData, setResultData] = useState(null);

  const fileInputRef = useRef(null);
  const symbol = getCurrencySymbol(currencyCode) || "₹";

  const resetState = () => {
    setStep("UPLOAD");
    setFile(null);
    setIsDragging(false);
    setParsedRows([]);
    setValidRows([]);
    setClientInvalidRows([]);
    setIsSubmitting(false);
    setResultData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleClose = () => {
    const shouldRefresh = resultData?.summary?.successCount > 0;
    resetState();
    onClose();
    if (shouldRefresh && onSuccess) {
      onSuccess();
    }
  };

  // Helper to normalize column keys
  const normalizeKey = (key) => {
    return key.toString().toLowerCase().replace(/[\s_\-.]+/g, "");
  };

  // Download Sample Template
  const handleDownloadTemplate = () => {
    try {
      const sampleData = [
        {
          "Product SKU": "SAMPLE-SKU-001",
          "Base Price": 450,
          "Selling Price": 699,
          "Maximum Retail Price": 999,
        },
        {
          "Product SKU": "SAMPLE-SKU-002",
          "Base Price": 1200,
          "Selling Price": 1599,
          "Maximum Retail Price": 1999,
        },
        {
          "Product SKU": "SAMPLE-SKU-003",
          "Base Price": 250,
          "Selling Price": "",
          "Maximum Retail Price": "",
        },
      ];

      const worksheet = XLSX.utils.json_to_sheet(sampleData);
      
      // Auto-fit column widths
      worksheet["!cols"] = [
        { wch: 22 }, // Product SKU
        { wch: 15 }, // Base Price
        { wch: 15 }, // Selling Price
        { wch: 22 }, // Maximum Retail Price
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Price_Update_Template");
      XLSX.writeFile(workbook, "Product_Price_Update_Template.xlsx");
      Toast.success(t("Sample template downloaded successfully"));
    } catch (err) {
      console.error("Template download error:", err);
      Toast.error(t("Failed to download sample template"));
    }
  };

  // Parse uploaded file
  const processFile = (uploadedFile) => {
    if (!uploadedFile) return;

    const validExtensions = [".csv", ".xlsx", ".xls"];
    const fileExt = uploadedFile.name.substring(uploadedFile.name.lastIndexOf(".")).toLowerCase();

    if (!validExtensions.includes(fileExt)) {
      Toast.error(t("Please upload a valid .csv, .xlsx, or .xls file"));
      return;
    }

    setFile(uploadedFile);
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = e.target.result;
        const workbook = XLSX.read(data, { type: "binary" });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (!jsonData || jsonData.length === 0) {
          Toast.error(t("The uploaded file contains no data rows"));
          resetState();
          return;
        }

        const normalizedRows = [];
        const valid = [];
        const invalid = [];

        jsonData.forEach((row, index) => {
          let skuVal = "";
          let basePriceVal = "";
          let sellingPriceVal = "";
          let mrpVal = "";

          Object.keys(row).forEach((rawKey) => {
            const normalized = normalizeKey(rawKey);
            const val = row[rawKey] !== undefined && row[rawKey] !== null ? String(row[rawKey]).trim() : "";

            if (["sku", "productsku", "sellersku", "itemsku"].includes(normalized)) {
              skuVal = val;
            } else if (["baseprice", "cost", "costprice"].includes(normalized)) {
              basePriceVal = val;
            } else if (["sellingprice", "price", "ourprice"].includes(normalized)) {
              sellingPriceVal = val;
            } else if (["maximumretailprice", "mrp", "maxretailprice"].includes(normalized)) {
              mrpVal = val;
            }
          });

          const rowData = {
            rowIndex: index + 1, // 1-indexed data row
            sku: skuVal,
            basePrice: basePriceVal !== "" ? Number(basePriceVal) : undefined,
            rawBasePrice: basePriceVal,
            sellingPrice: sellingPriceVal !== "" ? Number(sellingPriceVal) : undefined,
            rawSellingPrice: sellingPriceVal,
            maximumRetailPrice: mrpVal !== "" ? Number(mrpVal) : undefined,
            rawMrp: mrpVal,
            errors: [],
          };

          // Validation
          if (!skuVal) {
            rowData.errors.push(t("Missing Product SKU"));
          }
          if (
            rowData.basePrice === undefined &&
            rowData.sellingPrice === undefined &&
            rowData.maximumRetailPrice === undefined
          ) {
            rowData.errors.push(t("At least one price field (Base Price, Selling Price, or MRP) must be specified"));
          }

          if (basePriceVal !== "" && (isNaN(Number(basePriceVal)) || Number(basePriceVal) < 0)) {
            rowData.errors.push(t("Base Price must be a valid non-negative number"));
          }
          if (sellingPriceVal !== "" && (isNaN(Number(sellingPriceVal)) || Number(sellingPriceVal) < 0)) {
            rowData.errors.push(t("Selling Price must be a valid non-negative number"));
          }
          if (mrpVal !== "" && (isNaN(Number(mrpVal)) || Number(mrpVal) < 0)) {
            rowData.errors.push(t("Maximum Retail Price must be a valid non-negative number"));
          }

          normalizedRows.push(rowData);

          if (rowData.errors.length === 0) {
            valid.push({
              sku: skuVal,
              ...(rowData.basePrice !== undefined && { basePrice: rowData.basePrice }),
              ...(rowData.sellingPrice !== undefined && { sellingPrice: rowData.sellingPrice }),
              ...(rowData.maximumRetailPrice !== undefined && { maximumRetailPrice: rowData.maximumRetailPrice }),
            });
          } else {
            invalid.push({
              sku: skuVal || "N/A",
              basePrice: basePriceVal,
              sellingPrice: sellingPriceVal,
              maximumRetailPrice: mrpVal,
              reason: rowData.errors.join("; "),
            });
          }
        });

        setParsedRows(normalizedRows);
        setValidRows(valid);
        setClientInvalidRows(invalid);
        setStep("PREVIEW");
      } catch (err) {
        console.error("File parse error:", err);
        Toast.error(t("Failed to parse file. Please verify format."));
        resetState();
      }
    };

    reader.readAsBinaryString(uploadedFile);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  // Submit Bulk Update to API
  const handleSubmit = async () => {
    if (validRows.length === 0) {
      Toast.error(t("No valid rows to update"));
      return;
    }

    const pId = typeof profileId === "object" && profileId !== null ? profileId.value : profileId;
    if (!pId) {
      Toast.error(t("No active profile selected"));
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        profileId: pId,
        items: validRows,
      };

      const res = await ApiBulkUpdateProductPrice(payload);

      if (res?.isSuccess) {
        const backendFailed = res.failedProducts || [];
        const combinedFailed = [...clientInvalidRows, ...backendFailed];
        const totalRowsCount = parsedRows.length;
        const totalFailedCount = combinedFailed.length;
        const totalSuccessCount = Math.max(0, totalRowsCount - totalFailedCount);

        setResultData({
          summary: {
            total: totalRowsCount,
            successCount: totalSuccessCount,
            failedCount: totalFailedCount,
          },
          failedProducts: combinedFailed,
        });

        if (totalFailedCount === 0) {
          Toast.success(t("All product prices updated successfully!"));
        } else if (totalSuccessCount > 0) {
          Toast.warning(
            t("Price update partially completed. Some products could not be updated.")
          );
        } else {
          Toast.error(t("Price update failed for all rows."));
        }

        setStep("RESULTS");
      } else {
        Toast.error(res?.message || t("Failed to perform bulk price update"));
      }
    } catch (err) {
      console.error("Bulk update API error:", err);
      Toast.error(t("An error occurred while updating prices"));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Export Failed Products Report
  const handleExportFailedReport = () => {
    if (!resultData?.failedProducts || resultData.failedProducts.length === 0) {
      Toast.info(t("No failed products to export"));
      return;
    }

    try {
      const exportData = resultData.failedProducts.map((item) => ({
        "Product SKU": item.sku || "",
        "Base Price": item.basePrice !== undefined ? item.basePrice : "",
        "Selling Price": item.sellingPrice !== undefined ? item.sellingPrice : "",
        "Maximum Retail Price": item.maximumRetailPrice !== undefined ? item.maximumRetailPrice : "",
        "Failure Reason": item.reason || "Unknown Error",
      }));

      const worksheet = XLSX.utils.json_to_sheet(exportData);
      worksheet["!cols"] = [
        { wch: 22 },
        { wch: 14 },
        { wch: 14 },
        { wch: 22 },
        { wch: 45 },
      ];

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Failed_Price_Updates");
      XLSX.writeFile(workbook, "Failed_Products_Price_Update_Report.xlsx");
      Toast.success(t("Failed items report downloaded successfully"));
    } catch (err) {
      console.error("Export report error:", err);
      Toast.error(t("Failed to download error report"));
    }
  };

  return (
    <Dialog open={show} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="pb-3 border-b border-border">
          <DialogTitle className="text-xl font-bold flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-primary" />
            {t("Bulk Product Price Update")}
          </DialogTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {t("Upload a CSV or Excel file to update Base Price, Selling Price, and MRP in bulk.")}
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          {/* STEP 1: UPLOAD */}
          {step === "UPLOAD" && (
            <div className="space-y-6">
              {/* Instructions & Template */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-lg bg-muted/50 border border-border">
                <div className="space-y-1">
                  <h4 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <FileText className="h-4 w-4 text-primary" />
                    {t("File Requirements & Columns")}
                  </h4>
                  <ul className="text-xs text-muted-foreground list-disc list-inside space-y-0.5">
                    <li>
                      <strong>Product SKU</strong> {t("is mandatory.")}
                    </li>
                    <li>
                      {t("At least one of")} <strong>Base Price</strong>, <strong>Selling Price</strong>, {t("or")} <strong>MRP</strong> {t("must be provided.")}
                    </li>
                    <li>{t("Supported file formats:")} <code>.csv</code>, <code>.xlsx</code>, <code>.xls</code>.</li>
                  </ul>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadTemplate}
                  className="flex items-center gap-2 whitespace-nowrap bg-background shadow-xs hover:bg-muted"
                >
                  <Download className="h-4 w-4 text-primary" />
                  {t("Sample Template")}
                </Button>
              </div>

              {/* Drag & Drop Area */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                  isDragging
                    ? "border-primary bg-primary/5"
                    : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/30"
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv, .xlsx, .xls"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      processFile(e.target.files[0]);
                    }
                  }}
                />
                <div className="p-4 rounded-full bg-primary/10 text-primary mb-3">
                  <Upload className="h-8 w-8" />
                </div>
                <p className="text-base font-medium text-foreground text-center">
                  {t("Click to browse or drag and drop your spreadsheet here")}
                </p>
                <p className="text-xs text-muted-foreground mt-1 text-center">
                  {t("Supports CSV, Excel (.xlsx, .xls)")}
                </p>
              </div>
            </div>
          )}

          {/* STEP 2: PREVIEW */}
          {step === "PREVIEW" && (
            <div className="space-y-4">
              {/* File details bar */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">{file?.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {parsedRows.length} {t("total rows parsed")} •{" "}
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {validRows.length} {t("valid")}
                      </span>{" "}
                      •{" "}
                      <span
                        className={
                          clientInvalidRows.length > 0
                            ? "text-rose-600 dark:text-rose-400 font-medium"
                            : "text-muted-foreground"
                        }
                      >
                        {clientInvalidRows.length} {t("invalid")}
                      </span>
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={resetState}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4 mr-1" />
                  {t("Change File")}
                </Button>
              </div>

              {clientInvalidRows.length > 0 && (
                <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">
                      {clientInvalidRows.length} {t("row(s) will be skipped")}
                    </span>{" "}
                    {t(
                      "due to missing SKU, lack of price fields, or invalid numbers. Only valid rows will be submitted."
                    )}
                  </div>
                </div>
              )}

              {/* Table Preview */}
              <div className="border border-border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-muted sticky top-0 z-10 text-muted-foreground font-semibold border-b border-border">
                    <tr>
                      <th className="p-2.5">#</th>
                      <th className="p-2.5">{t("Product SKU")}</th>
                      <th className="p-2.5">{t("Base Price")} ({symbol})</th>
                      <th className="p-2.5">{t("Selling Price")} ({symbol})</th>
                      <th className="p-2.5">{t("MRP")} ({symbol})</th>
                      <th className="p-2.5">{t("Status")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {parsedRows.map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          row.errors.length > 0
                            ? "bg-destructive/5 dark:bg-destructive/10"
                            : "hover:bg-muted/30"
                        }
                      >
                        <td className="p-2.5 text-muted-foreground font-mono">{row.rowIndex}</td>
                        <td className="p-2.5 font-mono">{row.sku || <span className="text-rose-500 italic">{t("Empty")}</span>}</td>
                        <td className="p-2.5">{row.basePrice !== undefined ? `${symbol} ${row.basePrice}` : "-"}</td>
                        <td className="p-2.5">{row.sellingPrice !== undefined ? `${symbol} ${row.sellingPrice}` : "-"}</td>
                        <td className="p-2.5">{row.maximumRetailPrice !== undefined ? `${symbol} ${row.maximumRetailPrice}` : "-"}</td>
                        <td className="p-2.5">
                          {row.errors.length === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {t("Ready")}
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium"
                              title={row.errors.join("; ")}
                            >
                              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                              {row.errors[0]}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* STEP 3: RESULTS */}
          {step === "RESULTS" && resultData && (
            <div className="space-y-4">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl border border-border bg-card text-center">
                  <p className="text-xs text-muted-foreground">{t("Total Processed")}</p>
                  <p className="text-2xl font-bold text-foreground mt-1">{resultData.summary.total}</p>
                </div>
                <div className="p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-center">
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">{t("Updated Successfully")}</p>
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
                    {resultData.summary.successCount}
                  </p>
                </div>
                <div className="p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-center">
                  <p className="text-xs text-rose-700 dark:text-rose-400 font-medium">{t("Failed / Unupdated")}</p>
                  <p className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">
                    {resultData.summary.failedCount}
                  </p>
                </div>
              </div>

              {/* Failed Products Table */}
              {resultData.failedProducts && resultData.failedProducts.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-1.5">
                      <XCircle className="h-4 w-4" />
                      {t("Unupdated / Failed Products List")} ({resultData.failedProducts.length})
                    </h4>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleExportFailedReport}
                      className="flex items-center gap-1.5 text-xs h-8 bg-background hover:bg-muted"
                    >
                      <Download className="h-3.5 w-3.5 text-primary" />
                      {t("Export Error Report")}
                    </Button>
                  </div>

                  <div className="border border-rose-500/20 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead className="bg-rose-500/10 sticky top-0 z-10 text-rose-700 dark:text-rose-300 font-semibold border-b border-rose-500/20">
                        <tr>
                          <th className="p-2.5">{t("Product SKU")}</th>
                          <th className="p-2.5">{t("Base Price")}</th>
                          <th className="p-2.5">{t("Selling Price")}</th>
                          <th className="p-2.5">{t("MRP")}</th>
                          <th className="p-2.5">{t("Failure Reason")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-500/10">
                        {resultData.failedProducts.map((item, idx) => (
                          <tr key={idx} className="hover:bg-rose-500/5">
                            <td className="p-2.5 font-mono">{item.sku || "N/A"}</td>
                            <td className="p-2.5">{item.basePrice !== undefined ? `${symbol} ${item.basePrice}` : "-"}</td>
                            <td className="p-2.5">{item.sellingPrice !== undefined ? `${symbol} ${item.sellingPrice}` : "-"}</td>
                            <td className="p-2.5">{item.maximumRetailPrice !== undefined ? `${symbol} ${item.maximumRetailPrice}` : "-"}</td>
                            <td className="p-2.5 text-rose-600 dark:text-rose-400 font-medium">
                              {item.reason}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-6 text-center space-y-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <CheckCircle2 className="h-10 w-10 text-emerald-500 mx-auto" />
                  <p className="text-base font-semibold text-emerald-700 dark:text-emerald-400">
                    {t("All products have been updated successfully without errors!")}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="pt-3 border-t border-border flex flex-row items-center justify-between sm:justify-between">
          {step === "UPLOAD" && (
            <>
              <Button type="button" variant="outline" onClick={handleClose}>
                {t("Cancel")}
              </Button>
              <Button
                type="button"
                disabled={!file}
                onClick={() => setStep("PREVIEW")}
                className="btn-campaign-primary flex items-center gap-1.5"
              >
                {t("Next: Preview")}
                <ArrowRight className="h-4 w-4" />
              </Button>
            </>
          )}

          {step === "PREVIEW" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => setStep("UPLOAD")}
                disabled={isSubmitting}
              >
                {t("Back")}
              </Button>
              <Button
                type="button"
                disabled={validRows.length === 0 || isSubmitting}
                onClick={handleSubmit}
                className="btn-campaign-primary flex items-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    {t("Updating Prices...")}
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    {t("Update Prices")} ({validRows.length})
                  </>
                )}
              </Button>
            </>
          )}

          {step === "RESULTS" && (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={resetState}
                className="flex items-center gap-1.5"
              >
                <Upload className="h-4 w-4" />
                {t("Upload Another File")}
              </Button>
              <Button
                type="button"
                onClick={handleClose}
                className="btn-campaign-primary"
              >
                {t("Done")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
