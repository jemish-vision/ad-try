import { useRef } from "react";

export const useDebouncedColumnSave = (handleSaveColumns) => {
    const debounceRef = useRef(null);

    const debouncedSave = (finalCols) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => handleSaveColumns(finalCols), 1000);
    };

    return debouncedSave;
};
