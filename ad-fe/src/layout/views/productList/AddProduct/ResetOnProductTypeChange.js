import { useEffect } from "react";
import { useFormikContext } from "formik";

const ResetOnProductTypeChange = ({ initialValues }) => {
    const { values, resetForm } = useFormikContext();

    useEffect(() => {
        if (values.productType) resetForm({ values: { ...initialValues, productType: values?.productType } });
    }, [values?.productType]);

    return null;
};

export default ResetOnProductTypeChange;
