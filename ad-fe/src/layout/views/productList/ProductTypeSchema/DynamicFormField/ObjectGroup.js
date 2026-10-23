import { getIn } from "formik";
import { RenderInput } from "./RenderInput";

export default function ObjectGroup({
    field,
    fullPath,
    value,
    setFieldValue,
    marketplace_id,
    language_tag,
    amazonErrors = {},
    onAmazonErrorClear,
}) {
    const innerField = Object.fromEntries(
        field?.properties?.map(item => [item?.key, item])
    );

    return (
        <div className="pf-object-inner">
            {Object.entries(innerField).map(([propKey, prop]) => {
                const nestedPath = `${fullPath}.${propKey}`;
                return (
                    <RenderInput
                        key={propKey}
                        field={{ ...prop, key: propKey }}
                        fullPath={nestedPath}
                        value={getIn({ temp: value }, `temp.${propKey}`)}
                        setFieldValue={setFieldValue}
                        marketplace_id={marketplace_id}
                        language_tag={language_tag}
                        amazonError={amazonErrors}
                        onAmazonErrorClear={onAmazonErrorClear}
                    />
                );
            })}
        </div>
    );
}