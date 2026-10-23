import * as Yup from "yup";
import i18n from "../../../../../i18n";
import { isFieldVisible } from "./groupFormFields";

export function generateInitialValues(fields, marketplace_id, language_tag) {
    const initial = {};

    Object.entries(fields).forEach(([key, field]) => {

        // Auto-fill marketplace_id and language_tag
        if (key === "marketplace_id") {
            initial[key] = marketplace_id;
            return;
        }
        if (key === "language_tag") {
            initial[key] = language_tag;
            return;
        }

        if (key === "parentage_level") {
            initial[key] = [{ value: "parent", marketplace_id }];
            return;
        }

        // STRING
        if (["string"].includes(field?.type)) {
            initial[key] = "";
            return;
        }

        // NUMBER
        if (["number", "integer"].includes(field?.type)) {
            initial[key] = null;
            return;
        }

        // BOOLEAN
        if (field?.type === "boolean" || field?.semanticType === "boolean") {
            initial[key] = null;
            return;
        }

        // ENUM
        if (field?.enum) {
            initial[key] = "";
            return;
        }

        // OBJECT → recursively generate children
        if (field?.type === "object" && field?.properties) {
            const innerField = Object.fromEntries(field?.properties?.map(item => [item?.key, item]))
            initial[key] = generateInitialValues(innerField, marketplace_id, language_tag);
            return;
        }

        // ARRAY → generate one default row
        if (field?.type === "array" && field?.items?.length) {
            const innerField = Object.fromEntries(field?.items?.map(item => [item?.childKey, item]))
            initial[key] = [generateInitialValues(innerField, marketplace_id, language_tag)];
            return;
        }
    });

    return initial;
}

export function generateYupSchema(fields) {
    const shape = {};

    Object.entries(fields).forEach(([key, field]) => {
        const fieldTitle = field?.label ?? ""

        // STRING
        if (field?.type === "string" || field?.semanticType === "string") {
            let rule = Yup.string().required(i18n.t("{{field}} is a required field", { field: fieldTitle }));
            if (field.minLength) rule = rule.min(field.minLength, i18n.t("{{field}} must be at least {{min}} characters", { field: fieldTitle, min: field.minLength }));
            if (field.maxLength) rule = rule.max(field.maxLength, i18n.t("{{field}} must be at most {{max}} characters", { field: fieldTitle, max: field.maxLength }));
            if (field.enum) rule = rule.oneOf(field.enum, i18n.t("{{field}} is invalid", { field: fieldTitle }));
            shape[key] = rule;
            return;
        }

        // NUMBER
        if (["number", "integer"].includes(field?.type)) {
            let rule = Yup.number().required(i18n.t("{{field}} is a required field", { field: fieldTitle }));
            if (field.minimum !== undefined) rule = rule.min(field.minimum, i18n.t("{{field}} must be at least {{min}}", { field: fieldTitle, min: field.minimum }));
            if (field.maximum !== undefined) rule = rule.max(field.maximum, i18n.t("{{field}} must be at most {{max}}", { field: fieldTitle, max: field.maximum }));
            shape[key] = rule;
            return;
        }

        // BOOLEAN
        if (field?.type === "boolean" || field?.semanticType === "boolean") {
            shape[key] = Yup.boolean().required(i18n.t("{{field}} is a required field", { field: fieldTitle }));
            return;
        }

        // OBJECT
        if (field?.type === "object" && field?.properties) {
            const innerField = Object.fromEntries(field?.properties?.map(item => [item?.key, item]))
            const childSchema = generateYupSchema(innerField);
            shape[key] = Yup.object(childSchema.fields).required();
            return;
        }

        // ARRAY
        if (field?.type === "array" && field?.items?.length) {
            const innerField = Object.fromEntries(field?.items?.map(item => [item?.childKey, item]))

            if (!field.items) {
                shape[key] = Yup.array().of(Yup.mixed().required()).required();
                return;
            }

            const childSchema = generateYupSchema(innerField);

            let rule = Yup.array().of(Yup.object(childSchema.fields)).required();

            if (field.minUniqueItems) rule = rule.min(field.minUniqueItems);
            if (field.maxUniqueItems) rule = rule.max(field.maxUniqueItems);

            shape[key] = rule;
            return;
        }

        // DEFAULT
        // shape[key] = Yup.mixed().required();
    });

    return Yup.object().shape(shape);
}

export function buildVisibleFieldsObject(allFields, values) {
    const visible = {};
    Object.entries(allFields).forEach(([key, field]) => {
        if (isFieldVisible(field, values)) {
            visible[key] = field;
        }
    });
    return visible;
}

export const buildNestedErrors = (errorsArray) => {
    const errors = {};

    errorsArray.forEach(error => {
        const path = error.path;
        const message = error.message;

        if (!path || !message) return;

        const segments = path.replace(/\[(\d+)\]/g, '.$1').split('.');
        let currentLevel = errors;

        for (let i = 0; i < segments.length; i++) {
            let segment = segments[i];

            if (!isNaN(parseInt(segment, 10)) && String(parseInt(segment, 10)) === segment) {
                segment = parseInt(segment, 10);
            }

            if (i === segments.length - 1) {
                currentLevel[segment] = message;
            } else {
                const nextSegment = segments[i + 1];
                const isNextSegmentNumber = !isNaN(parseInt(nextSegment, 10)) && String(parseInt(nextSegment, 10)) === nextSegment;

                if (!currentLevel[segment]) {
                    currentLevel[segment] = isNextSegmentNumber ? [] : {};
                }

                currentLevel = currentLevel[segment];
            }
        }
    });

    return errors;
};

export function filterVisibleValues(values, visibleFields) {
    const result = {};

    Object.keys(visibleFields).forEach(key => {
        if (values[key] !== undefined) {
            result[key] = values[key];
        }
    });

    return result;
}
