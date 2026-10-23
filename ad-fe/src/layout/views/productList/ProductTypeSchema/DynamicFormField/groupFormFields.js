// helpers to evaluate showWhen / requireWhen conditions
import { getIn } from "formik"; // if not already imported in this file

// Resolve path like "fulfillment_availability[].fulfillment_channel_code"
// returns an array of matched values (handles arrays and plain fields)
function resolvePathValues(values, path) {
    if (!path) return [];
    // split by dot, handle parts with []
    const parts = path.split('.');
    let current = [values];

    for (const p of parts) {
        const isArrayPattern = p.endsWith('[]');
        const key = isArrayPattern ? p.slice(0, -2) : p;

        const next = [];
        for (const ctx of current) {
            const val = ctx && typeof ctx === 'object' ? ctx[key] : undefined;
            if (val === undefined || val === null) continue;

            if (Array.isArray(val)) {
                if (isArrayPattern) {
                    // push each item as next contexts
                    for (const item of val) next.push(item);
                } else {
                    // if not array pattern but val is array, push whole array
                    next.push(val);
                }
            } else {
                next.push(val);
            }
        }
        current = next;
    }

    // flatten and return primitive values (if leaf is object, return that object)
    return current.flat();
}

// Evaluate a simple condition { path, equals, ... }
function matchSimpleCondition(values, condition) {
    if (!condition || !condition.path) return false;
    const path = condition.path;
    const targetValues = resolvePathValues(values, path)?.filter(v => v); // array
    const cmp = condition.equals ?? condition.in ?? condition.notEquals;

    // Currently support equals and notEquals and in (array) checks
    if (condition.equals !== undefined) {
        // any matched value equals
        return targetValues.some(v => String(v) === String(condition.equals));
    }
    if (condition.notEquals !== undefined) {
        return targetValues.some(v => String(v) !== String(condition.notEquals));
    }
    if (condition.in !== undefined && Array.isArray(condition.in)) {
        return targetValues.some(v => condition.in.includes(v));
    }

    // fallback: check truthiness of any matched value
    return targetValues.some(v => Boolean(v));
}

// Recursively evaluate nested condition objects (operator: and/or)
function evaluateConditionObject(values, condObj) {
    if (!condObj) return false;
    const op = (condObj.operator || 'and').toLowerCase();
    const conditions = condObj?.conditions || [condObj];

    if (op === 'and') {
        return conditions.every(c => {
            if (c.operator && c.conditions) return evaluateConditionObject(values, c);
            return matchSimpleCondition(values, c);
        });
    } else if (op === 'or') {
        return conditions.some(c => {
            if (c.operator && c.conditions) return evaluateConditionObject(values, c);
            return matchSimpleCondition(values, c);
        });
    }
    // default
    return false;
}

// Top-level: showWhen may be an array of condition objects or a single object.
// If showWhen missing -> visible by default (true).
export function isFieldVisible(field, values) {
    if (!field) return true;
    const showWhen = field.showWhen;

    if (!showWhen) return true;

    // showWhen can be an array of condition objects (as in your example).
    if (Array.isArray(showWhen)) {
        // if any of the condition blocks evaluate to true, show the field
        return showWhen.some(sw => evaluateConditionObject(values, sw));
    } else {
        return evaluateConditionObject(values, showWhen);
    }
}
