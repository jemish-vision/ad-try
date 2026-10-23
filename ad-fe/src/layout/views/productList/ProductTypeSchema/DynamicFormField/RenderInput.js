import ArrayGroup from "./ArrayGroup";
import BooleanInput from "./BooleanInput";
import EnumSelect from "./EnumSelect";
import ObjectGroup from "./ObjectGroup";
import TextInput from "./TextInput";


export function RenderInput({ field, fullPath, value, setFieldValue, marketplace_id, language_tag, amazonError, onAmazonErrorClear }) {

    if (field.type === "boolean" || field?.semanticType === "boolean") {
        return (
            <BooleanInput
                field={field}
                fullPath={fullPath}
                value={value}
                setFieldValue={setFieldValue}
                amazonError={amazonError}
                onAmazonErrorClear={onAmazonErrorClear}
            />
        );
    }

    if (field.enum) {
        return (
            <EnumSelect
                field={field}
                fullPath={fullPath}
                value={value}
                setFieldValue={setFieldValue}
                amazonError={amazonError}
                onAmazonErrorClear={onAmazonErrorClear}
            />
        );
    }

    if (["string", "number", "integer"].includes(field.type)) {
        return (
            <TextInput
                field={field}
                fullPath={fullPath}
                value={value}
                setFieldValue={setFieldValue}
                amazonError={amazonError}
                onAmazonErrorClear={onAmazonErrorClear}
            />
        );
    }

    if (field.type === "object" && field?.properties) {
        return (
            <ObjectGroup
                field={field}
                fullPath={fullPath}
                value={value}
                setFieldValue={setFieldValue}
                marketplace_id={marketplace_id}
                language_tag={language_tag}
                amazonErrors={amazonError}
                onAmazonErrorClear={onAmazonErrorClear}
            />
        );
    }

    if (field.type === "array" && field?.items?.length) {
        return (
            <ArrayGroup
                field={field}
                fullPath={fullPath}
                value={value}
                setFieldValue={setFieldValue}
                marketplace_id={marketplace_id}
                language_tag={language_tag}
                amazonErrors={amazonError}
                onAmazonErrorClear={onAmazonErrorClear}
            />
        );
    }

    return null;
}