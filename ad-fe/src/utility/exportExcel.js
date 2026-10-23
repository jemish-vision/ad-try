import { Toast } from "../helper/links/Link";
import { t } from "i18next";

/**
 * Generic function to export grid data to an Excel (XLSX) file.
 * 
 * @param {Array} data - The array of row data to export.
 * @param {Array} columns - The array of column definitions.
 * @param {String} fileName - The name of the downloaded file.
 * @param {Object} totalRow - (Optional) The totals row object.
 */
export const exportGridToExcel = async (data, columns, fileName = "export.xlsx", totalRow = null) => {
  try {
    const XLSX = await import("xlsx");
    // Determine which columns are displayed (skip Action/Checkbox columns)
    const displayCols = columns.filter(c => 
      !c.hide && 
      c.field && 
      c.field !== "action" &&
      c.title !== "Checkbox" && 
      c.title !== "Action" && 
      c.headerName !== "Action" &&
      c.headerName !== ""
    );
    
    const allData = [...data];
    if (allData.length > 0 && totalRow) {
      allData.push(totalRow);
    }

    // Map the raw row data to objects matching the display column headers
    const exportData = allData.map(row => {
      const rowObj = {};
      displayCols.forEach(c => {
        const header = c.headerName || c.title || c.field;
        let val = c.field.split('.').reduce((acc, part) => acc && acc[part], row);
        
        // Use custom formatter if provided in column definition
        if (typeof c.exportFormatter === "function") {
          val = c.exportFormatter(val, row);
        } else {
          if (val === null || val === undefined) val = "";
          else if (typeof val === "object" && val.$numberDecimal) val = val.$numberDecimal;
          
          // Generic numeric formatting fallback if value looks like a raw number with many decimals
          if (typeof val === "number" && !Number.isInteger(val)) {
             val = Number(Number(val).toFixed(2));
          }
        }
        
        rowObj[header] = val;
      });
      return rowObj;
    });

    // Create a new workbook and add the data as a worksheet
    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");

    // Generate buffer and trigger download
    XLSX.writeFile(workbook, fileName);
    Toast.success(t("Export successful"));
  } catch (e) {
    console.error("Export to Excel failed:", e);
    Toast.error(t("Something went wrong during export"));
  }
};
