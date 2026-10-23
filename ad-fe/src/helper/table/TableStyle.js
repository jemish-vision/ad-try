export const tableStyles = {
    table: {
        style: {
            borderCollapse: "separate",
            borderSpacing: 0,
        },
    },
    headCells: {
        style: {
            // borderRight: "1px solid #e0e0e0",
            // borderBottom: "1px solid #e0e0e0",
            // backgroundColor: "#f9fafb",
            // fontWeight: 600,
            // whiteSpace: "wrap",
        },
    },
    cells: {
        style: {
            borderRight: "1px solid #e0e0e0",
            borderBottom: "1px solid #e0e0e0",
            whiteSpace: "wrap",
        },
    },
    rows: {
        style: {
            minHeight: "42px",
        },
    },
};

export const paginationRowsPerPageOptions = [50, 100, 150, 200];
export const firstPageRows = paginationRowsPerPageOptions[0];

export const getTextWidth = (text, font = "14px Inter") => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    context.font = font;
    return context.measureText(String(text)).width;
};

export const getColumnWidth = (rawWidth, { defaultWidth = 180, minWidth = 150, maxWidth = 500 } = {}) => {
    const widthNum = rawWidth ? parseInt(rawWidth, 10) : defaultWidth;
    const finalWidth = Math.min(Math.max(widthNum, minWidth), maxWidth);
    return `${finalWidth}px`;
};

export const applyStickyColumnCSS = (tableId, columnIndex, left = 0) => {
    const styleId = `sticky-col-${tableId}-${columnIndex}`;

    // Always remove existing first — this is the fix for the stale-offset gap bug
    const existing = document.getElementById(styleId);
    if (existing) existing.remove();

    const style = document.createElement("style");
    style.id = styleId;
    style.innerHTML = `
    #${tableId} .rdt_TableHeadRow > :nth-child(${columnIndex + 1}) {
      position: sticky;
      left: ${left}px !important;
      z-index: 20;
      background: #F6F7FB;
    }
  `;
    document.head.appendChild(style);
};

export const removeStickyColumnCSSByTableId = (tableId) => {
    const styles = document.querySelectorAll(`style[id^="sticky-col-${tableId}-"]`);

    styles.forEach(style => style.remove());
};
