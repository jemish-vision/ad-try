
// ==================== FIELD FILTER CONFIGURATION ====================
class FieldFilterConfig {
    constructor() {
        // Define which fields to keep for specific objects
        this.filterRules = {
            'purchasable_offer': {
                keep: ['currency', 'our_price', 'maximum_retail_price'],
                skip: [
                    'map_price',
                    'automated_pricing_merchandising_rule_plan',
                    'minimum_seller_allowed_price',
                    'maximum_seller_allowed_price',
                    'discounted_price',
                    'start_at',
                    'end_at',
                    'audience',
                    'quantity_discount_plan',
                    'variable_weight_based_price',
                    'marketplace_id' // Also skip marketplace_id as it's not in keep list
                ]
            },
            'fulfillment_availability': {
                keep: ['fulfillment_channel_code', 'quantity'],
                skip: [
                    'lead_time_to_ship_max_days',
                    'restock_date',
                    'is_inventory_available'
                ]
            }
        };
    }

    shouldKeepField(parentKey, childKey) {
        const rule = this.filterRules[parentKey];
        if (!rule) return true; // No filter rule, keep all fields
        return rule.keep.includes(childKey);
    }

    hasFilterRule(key) {
        return this.filterRules.hasOwnProperty(key);
    }

    getKeepFields(key) {
        return this.filterRules[key]?.keep || [];
    }
};

export class ConditionRegistry {
    constructor() {
        this.conditions = new Map();
        this.conditionCounter = 0;
    }
    register(condition) {
        const conditionKey = this.generateConditionKey(condition);
        if (!this.conditions.has(conditionKey)) {
            const conditionId = `COND_${++this.conditionCounter}`;
            this.conditions.set(conditionKey, {
                id: conditionId,
                condition,
                key: conditionKey
            });
        }
        return this.conditions.get(conditionKey).id;
    }
    generateConditionKey(condition) {
        return JSON.stringify(this.normalizeCondition(condition));
    }
    normalizeCondition(condition) {
        if (!condition) return null;
        const normalized = {};
        Object.keys(condition).sort().forEach(key => {
            const value = condition[key];
            if (Array.isArray(value)) {
                normalized[key] = value.map(v => this.normalizeCondition(v));
            } else if (typeof value === 'object' && value !== null) {
                normalized[key] = this.normalizeCondition(value);
            } else {
                normalized[key] = value;
            }
        });
        return normalized;
    }
    getAll() {
        const registry = {};
        this.conditions.forEach(({ id, condition }) => {
            registry[id] = condition;
        });
        return registry;
    }
}

// ==================== CONDITION EVALUATOR ====================
export class ConditionEvaluator {
    constructor(schema, allOfConditions, conditionRegistry, selectedKeys = []) {
        this.schema = schema;
        this.properties = schema.properties || {};
        this.allOfConditions = allOfConditions || [];
        this.defs = schema.$defs || {};
        this.conditionRegistry = conditionRegistry;
        this.dependencyGraph = new Map();
        this.selectedKeys = new Set(selectedKeys || []);
        this.processedPaths = new Set();
    }
    evaluateAllConditions(selectedKeys) {
        // Clear the path tracking set before a new evaluation run
        this.processedPaths.clear();

        const results = [];
        const processedTopLevel = new Set(); // Track top-level conditions processed
        const process = (cond, index, depth = 0, path = "") => {
            const key = JSON.stringify(cond);
            if (processedTopLevel.has(key)) return; // Prevent re-processing identical top-level conditions
            processedTopLevel.add(key);

            // Check if the condition itself is a nested if/then/else chain (like the example)
            if (cond.if && cond.then) {
                // If it's an if/then/else chain, process it recursively with safety checks
                const nestedResults = this.evaluateNestedIfThenElse(cond, selectedKeys, index, depth, path);
                results.push(...nestedResults);
            } else {
                // Otherwise, process it as a single condition (existing logic for allOf, anyOf, simple if-then)
                // Pass depth and path to evaluateCondition if it handles sub-conditions recursively
                const evaluated = this.evaluateCondition(cond, selectedKeys, index, depth, path);
                if (evaluated) {
                    results.push(evaluated);
                    // Only process subConditions if they exist and are distinct objects
                    if (evaluated.subConditions) {
                        evaluated.subConditions.forEach((sub, i) => {
                            // Use the raw condition if available, otherwise use the evaluated object itself
                            const subRaw = sub.rawCondition || sub;
                            // Increment depth and update path for sub-conditions
                            process(subRaw, `${index}.sub_${i}`, depth + 1, `${path}.sub_${i}`);
                        });
                    }
                }
            }
        };

        // Start processing with an initial path
        this.allOfConditions.forEach((cond, i) => process(cond, i.toString(), 0, `root_${i}`));
        return results;
    }
    static DEFAULT_MAX_DEPTH = 20;
    evaluateNestedIfThenElse(conditionBlock, selectedKeys, parentIndex, depth = 0, path = "") {
        // Safety check: Prevent excessive recursion
        if (depth > ConditionEvaluator.DEFAULT_MAX_DEPTH) {
            return [];
        }

        const results = [];
        let currentCondition = conditionBlock;
        let currentDepth = depth;
        let currentPath = path;

        // Loop through the chain of if/then/else
        while (currentCondition && currentCondition.if && currentCondition.then) {
            // Create a unique identifier for the current condition block to prevent re-processing in this path
            const conditionId = this.getConditionIdentifier(currentCondition);
            const pathKey = `${currentPath}-${conditionId}`;

            // If this specific condition block at this path has already been processed, stop to avoid loops
            if (this.processedPaths.has(pathKey)) {
                break; // Exit the loop to prevent infinite recursion
            }

            // Mark this path as processed
            this.processedPaths.add(pathKey);

            // Evaluate the current if/then pair
            const evaluated = this.evaluateCondition(currentCondition, selectedKeys, `${parentIndex}.nested_${currentDepth}`, currentDepth + 1, pathKey);
            if (evaluated) {
                results.push(evaluated);
            }

            // Move to the next condition in the 'else' part and increment depth/path
            currentCondition = currentCondition.else;
            currentDepth++;
            currentPath = `${pathKey}.else`;
        }
        return results;
    }
    getConditionIdentifier(condition) {
        const ifPartStr = JSON.stringify(condition?.if || {});
        let hash = 0;
        for (let i = 0; i < ifPartStr.length; i++) {
            const char = ifPartStr.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0; // Convert to 32bit integer
        }
        return hash.toString(36); // Convert integer to a short string
    }

    evaluateCondition(condition, selectedKeys, index, depth = 0, path = "") {
        // Safety check: Prevent excessive recursion
        if (depth > ConditionEvaluator.DEFAULT_MAX_DEPTH) {
            return null;
        }

        if (!condition) return null;

        // Use the path passed in to track where we are
        const currentPath = path;

        // Handle allOf, anyOf as before
        if (condition.allOf && !condition.if) {
            const subConditions = condition.allOf
                .map((c, i) => this.evaluateCondition(c, selectedKeys, `${index}.allOf_${i}`, depth + 1, `${currentPath}.allOf_${i}`))
                .filter(Boolean);
            if (!subConditions.length) return null;
            return {
                type: 'allOf',
                index,
                subConditions
            };
        }

        if (condition.anyOf && !condition.if) {
            const subConditions = condition.anyOf
                .map((c, i) => this.evaluateCondition(c, selectedKeys, `${index}.anyOf_${i}`, depth + 1, `${currentPath}.anyOf_${i}`))
                .filter(Boolean);
            if (!subConditions.length) return null;
            return {
                type: 'anyOf',
                index,
                subConditions
            };
        }

        // Handle if/then (and nested else chains)
        if (condition.if && condition.then) {
            const ifPart = this.parseIfCondition(condition.if);
            const thenPart = this.parseThenCondition(condition.then);

            // Process the 'else' part recursively if it exists and contains nested conditions
            let elseSubConditions = [];
            if (condition.else) {
                // Use the new helper to process the 'else' chain safely
                // Pass the current path + ".else" to maintain the full traversal path
                elseSubConditions = this.evaluateNestedIfThenElse(condition.else, selectedKeys, `${index}.else`, depth + 1, `${currentPath}.else`);
            }

            if (!ifPart || !thenPart) return null;

            const showWhenCondition = this.buildShowWhen(ifPart);
            const conditionId = showWhenCondition ? this.conditionRegistry.register(showWhenCondition) : null;

            const result = {
                type: 'if-then',
                index,
                conditionId,
                if: ifPart,
                then: thenPart,
                showWhenCondition,
                rawCondition: condition,
                // Add the results from the nested 'else' chain
                elseSubConditions: elseSubConditions
            };

            this.buildDependencyGraph(result);
            return result;
        }

        return null;
    }

    parseIfCondition(ifCond) {
        const result = {
            type: null,
            operator: null,
            conditions: [],
            fields: [],
            paths: [],
            values: {},
            negated: false
        };
        if (ifCond.not) {
            const nested = this.parseIfCondition(ifCond.not);
            if (!nested) return null;
            // Invert everything
            return {
                ...nested,
                negated: true,
            };
        }
        if (ifCond.anyOf) {
            return {
                type: 'anyOf',
                operator: 'or',
                conditions: ifCond.anyOf.map(c => this.parseIfCondition(c)).filter(Boolean)
            };
        }
        if (ifCond.allOf) {
            return {
                type: 'allOf',
                operator: 'and',
                conditions: ifCond.allOf.map(c => this.parseIfCondition(c)).filter(Boolean)
            };
        }
        if (ifCond.required && ifCond.required.length > 0) {
            result.fields = [...ifCond.required];
            result.type = 'exists';
        }
        if (ifCond.properties) {
            for (const [key, prop] of Object.entries(ifCond.properties)) {
                if (!result.fields.includes(key)) {
                    result.fields.push(key);
                }
                if (prop.contains) {
                    const extracted = this.extractFromContains(prop.contains, key);
                    result.paths.push(...extracted.paths);
                    Object.assign(result.values, extracted.values);
                    result.type = 'equals';
                } else if (prop.items?.required) {
                    result.paths.push(`${key}[]`);
                    result.type = 'exists';
                } else if (prop.items?.properties?.value?.enum) {
                    const p = `${key}[].value`;
                    result.paths.push(p);
                    result.values[p] = prop.items.properties.value.enum;
                    result.type = 'equals';
                }
            }
        }
        return (result.fields.length || result.paths.length || result.conditions.length) ? result : null;
    }
    extractFromContains(contains, parentKey, depth = 0) {
        const result = { paths: [], values: {} };
        if (depth > 10) return result;
        if (!contains?.properties) return result;
        const required = contains.required || [];
        for (const reqKey of required) {
            const prop = contains.properties[reqKey];
            if (!prop) continue;
            const currentPath = parentKey ? `${parentKey}[].${reqKey}` : reqKey;
            if (prop.enum) {
                result.paths.push(currentPath);
                result.values[currentPath] = prop.enum;
                continue;
            }
            if (prop.properties?.value?.enum) {
                const path = `${currentPath}.value`;
                result.paths.push(path);
                result.values[path] = prop.properties.value.enum;
                continue;
            }
            if (prop.contains) {
                const nested = this.extractFromContains(prop.contains, currentPath, depth + 1);
                result.paths.push(...nested.paths);
                Object.assign(result.values, nested.values);
            }
        }
        return result;
    }
    parseThenCondition(thenCond) {
        const result = {
            required: [],
            nestedRequired: {},
            properties: {}
        };
        if (thenCond.required) {
            result.required = [...thenCond.required];
        }
        if (thenCond.properties) {
            for (const [key, prop] of Object.entries(thenCond.properties)) {
                result.properties[key] = this.extractPropertyRequirements(prop, key);
            }
        }
        return result;
    }
    extractPropertyRequirements(prop, parentKey, depth = 0) {
        if (depth > 10) return {};
        const result = {
            required: [],
            optional: [],
            nested: {},
            pathMap: new Map()
        };
        const trackPath = (key, path) => {
            result.pathMap.set(key, path);
        };
        if (prop.items?.required) {
            result.required = [...prop.items.required];
            prop.items.required.forEach(k => trackPath(k, `${parentKey}[].${k}`));
        }
        if (prop.items?.not?.required) {
            result.optional = [...prop.items.not.required];
            prop.items.not.required.forEach(k => trackPath(k, `${parentKey}[].${k}`));
        }
        if (prop.items?.properties) {
            for (const [nestedKey, nestedProp] of Object.entries(prop.items.properties)) {
                const nestedPath = `${parentKey}[].${nestedKey}`;
                trackPath(nestedKey, nestedPath);
                if (nestedProp.type === 'object' || nestedProp.properties) {
                    const nested = this.extractPropertyRequirements(nestedProp, nestedPath, depth + 1);
                    result.nested[nestedKey] = nested;
                    // Merge pathMap
                    nested.pathMap?.forEach((p, k) => trackPath(k, p));
                }
                if (nestedProp.required) {
                    if (!result.nested[nestedKey]) result.nested[nestedKey] = { required: [], optional: [], nested: {}, pathMap: new Map() };
                    result.nested[nestedKey].required.push(...nestedProp.required);
                }
                if (nestedProp.not?.required) {
                    if (!result.nested[nestedKey]) result.nested[nestedKey] = { required: [], optional: [], nested: {}, pathMap: new Map() };
                    result.nested[nestedKey].optional.push(...nestedProp.not.required);
                }
            }
        }
        return result;
    }
    buildDependencyGraph(evaluatedCondition) {
        if (!evaluatedCondition.if || !evaluatedCondition.then) return;
        const triggerFields = this.extractTriggerFields(evaluatedCondition.if);
        const dependentFields = this.extractDependentFields(evaluatedCondition.then);
        triggerFields.forEach(trigger => {
            if (!this.dependencyGraph.has(trigger)) {
                this.dependencyGraph.set(trigger, new Set());
            }
            dependentFields.forEach(dep => this.dependencyGraph.get(trigger).add(dep));
        });
    }
    extractTriggerFields(ifPart) {
        const fields = new Set();
        const add = p => {
            // for example "battery[].cell_composition[].value" → "battery"
            const root = p.split(/[.\[]/)[0];
            if (root) fields.add(root);
        };
        if (ifPart.fields) ifPart.fields.forEach(add);
        if (ifPart.paths) ifPart.paths.forEach(add);
        if (ifPart.conditions) ifPart.conditions.forEach(c => this.extractTriggerFields(c).forEach(f => fields.add(f)));
        return Array.from(fields);
    }
    extractDependentFields(thenPart) {
        const fields = new Set();
        if (thenPart.required) {
            thenPart.required.forEach(f => fields.add(f));
        }
        if (thenPart.properties) {
            Object.keys(thenPart.properties).forEach(k => fields.add(k));
        }
        return Array.from(fields);
    }
    buildShowWhen(ifPart) {
        if (!ifPart) return null;
        // Build the positive version first
        const buildPositive = (part) => {
            if (part.type === 'anyOf' || part.type === 'allOf') {
                const conds = part.conditions.map(buildPositive).filter(Boolean);
                return conds.length
                    ? { operator: part.operator === 'or' ? 'or' : 'and', conditions: conds }
                    : null;
            }
            if (part.paths?.length) {
                const path = part.paths[0];
                const values = part.values[path];
                if (!values?.length) return null;
                return values.length === 1
                    ? { path, equals: values[0] }
                    : { operator: 'or', conditions: values.map(v => ({ path, equals: v })) };
            }
            if (part.fields?.length) {
                return { path: part.fields[0], exists: true };
            }
            return null;
        };
        const positive = buildPositive(ifPart);
        if (!positive) return null;
        // Apply negation ONLY if `ifPart.negated === true`
        return ifPart.negated ? this.invertShowWhen(positive) : positive;
    }
    invertShowWhen(cond) {
        if (!cond) return null;
        if (cond.equals !== undefined) return { path: cond.path, notEquals: cond.equals };
        if (cond.notEquals !== undefined) return { path: cond.path, equals: cond.notEquals };
        if (cond.exists) return { path: cond.path, missing: true };
        if (cond.missing) return { path: cond.path, exists: true };
        if (cond.operator) {
            const op = cond.operator === 'and' ? 'or' : 'and';
            return { operator: op, conditions: cond.conditions.map(c => this.invertShowWhen(c)).filter(Boolean) };
        }
        return null;
    }
    getDependencyGraph() {
        const graph = {};
        this.dependencyGraph.forEach((deps, trigger) => {
            graph[trigger] = Array.from(deps);
        });
        return graph;
    }
};

export class FlattenedFieldBuilder {
    constructor(schema, evaluatedConditions, conditionRegistry, selectedKeys) {
        this.schema = schema;
        this.properties = schema.properties || {};
        this.evaluatedConditions = evaluatedConditions || [];
        this.conditionRegistry = conditionRegistry;
        this.selectedKeys = new Set(selectedKeys || []);
        this.allFields = [];
        this.processedKeys = new Set();
        this.topLevelRequired = new Set(schema.required || []);
        this.topLevelRequired.add('purchasable_offer');
        this.topLevelRequired.add('fulfillment_availability');
        // Initialize field filter
        this.fieldFilter = new FieldFilterConfig();
        // Calculate resolved keys once in the constructor
        this.resolvedKeys = new Set(this.resolveAllDependencies(Array.from(this.selectedKeys)));
        // Build the condition map based on resolved keys
        this.conditionMap = this.buildConditionMap();
    }

    resolveAllDependencies(selectedKeys) {
        const allKeys = new Set(selectedKeys);
        const queue = [...selectedKeys];
        const processed = new Set();

        while (queue.length > 0) {
            const currentKey = queue.shift();
            if (processed.has(currentKey)) {
                continue;
            }
            processed.add(currentKey);

            this.evaluatedConditions.forEach(condition => {
                if (condition.type === 'if-then' && condition.if && condition.then) {
                    const triggers = this.extractTriggerFields(condition.if);
                    if (triggers.includes(currentKey)) {
                        const dependents = this.extractDependentFields(condition.then);
                        dependents.forEach(dep => {
                            if (!allKeys.has(dep)) {
                                allKeys.add(dep);
                                queue.push(dep);
                            }
                        });
                    }
                } else if (condition.type === 'allOf' || condition.type === 'anyOf') {
                    condition.subConditions?.forEach(sub => {
                        if (sub.type === 'if-then' && sub.if && sub.then) {
                            const triggers = this.extractTriggerFields(sub.if);
                            if (triggers.includes(currentKey)) {
                                const dependents = this.extractDependentFields(sub.then);
                                dependents.forEach(dep => {
                                    if (!allKeys.has(dep)) {
                                        allKeys.add(dep);
                                        queue.push(dep);
                                    }
                                });
                            }
                        }
                    });
                }
            });
        }
        return Array.from(allKeys);
    }

    buildConditionMap() {
        const map = new Map();
        const process = (cond) => {
            if (cond.type !== 'if-then') {
                if (cond.subConditions) cond.subConditions.forEach(process);
                return;
            }
            const triggers = this.extractTriggerFields(cond.if);
            const dependents = this.extractDependentFields(cond.then);
            const keep = triggers.some(t => this.resolvedKeys.has(t));
            if (keep) {
                dependents.forEach(dep => {
                    if (!map.has(dep)) map.set(dep, []);
                    map.get(dep).push(cond);
                });
            }
            if (cond.elseSubConditions) {
                cond.elseSubConditions.forEach(process);
            }
            if (cond.subConditions) cond.subConditions.forEach(process);
        };
        this.evaluatedConditions.forEach(process);
        return map;
    }

    extractTriggerFields(ifPart) {
        const fields = new Set();
        if (ifPart.fields) {
            ifPart.fields.forEach(f => fields.add(f));
        }
        if (ifPart.paths) {
            ifPart.paths.forEach(p => {
                const root = p.split('[].')[0];
                fields.add(root);
            });
        }
        if (ifPart.conditions) {
            ifPart.conditions.forEach(c => {
                this.extractTriggerFields(c).forEach(f => fields.add(f));
            });
        }
        return Array.from(fields);
    }

    extractDependentFields(thenPart) {
        const fields = new Set();
        if (thenPart.required) {
            thenPart.required.forEach(f => fields.add(f));
        }
        if (thenPart.properties) {
            Object.keys(thenPart.properties).forEach(k => fields.add(k));
        }
        return Array.from(fields);
    }

    buildAllFields(selectedKeys) {
        // Use the already calculated resolved keys
        const allResolvedKeys = this.resolvedKeys; // Use the instance variable
        const allFieldKeys = new Set(allResolvedKeys);
        const fields = [];
        allFieldKeys.forEach(key => {
            if (!this.processedKeys.has(key)) {
                const field = this.buildField(key);
                if (field) {
                    fields.push(field);
                    this.processedKeys.add(key);
                }
            }
        });
        return fields;
    }
    buildField(key) {
        const propertySchema = this.properties[key];
        if (!propertySchema) return null;

        const isTopLevelRequired = this.topLevelRequired.has(key);

        const field = {
            key,
            label: propertySchema.title || this.formatLabel(key),
            type: propertySchema.type,
            required: isTopLevelRequired
        };

        if (propertySchema.description) {
            field.description = propertySchema.description;
        }

        switch (propertySchema.type) {
            case 'array':
                Object.assign(field, this.buildArrayField(key, propertySchema, isTopLevelRequired));
                break;
            case 'boolean':
                Object.assign(field, this.buildBooleanField(propertySchema));
                break;
            case 'string':
                Object.assign(field, this.buildStringField(propertySchema));
                break;
            case 'number':
            case 'integer':
                Object.assign(field, this.buildNumberField(propertySchema));
                break;
        }

        if (!isTopLevelRequired) {
            const conditionData = this.buildFieldConditions(key);
            Object.assign(field, conditionData);
        }

        const dependentFieldKeys = this.findDependentFieldKeys(key);
        if (dependentFieldKeys.length > 0) {
            field.dependentFields = dependentFieldKeys;
        }

        return field;
    }

    buildArrayField(key, schema, isTopLevelRequired = false) {
        const field = {
            key,
            label: schema.title || this.formatLabel(key),
            type: 'array',
            description: schema.description,
            minItems: schema.minItems,
            maxItems: schema.maxItems,
            minUniqueItems: schema.minUniqueItems,
            maxUniqueItems: schema.maxUniqueItems,
            renderAsSingle: schema.maxUniqueItems === 1
        };

        if (schema.items) {
            field.items = this.buildArrayItems(schema.items, key, isTopLevelRequired);
        }

        if (!isTopLevelRequired) {
            const conditionData = this.buildFieldConditions(key);
            Object.assign(field, conditionData);
        }

        const dependentFieldKeys = this.findDependentFieldKeys(key);
        if (dependentFieldKeys.length > 0) {
            field.dependentFields = dependentFieldKeys;
        }

        return field;
    }

    buildArrayItems(itemsSchema, parentKey, isParentTopLevelRequired = false) {
        if (!itemsSchema?.properties) return [];
        const items = [];
        const required = itemsSchema.required || [];

        // Check if this parent key has a filter rule
        const hasFilter = this.fieldFilter.hasFilterRule(parentKey);

        for (const [childKey, childProp] of Object.entries(itemsSchema.properties)) {
            // FILTER LOGIC: Skip fields not in the keep list
            if (hasFilter && !this.fieldFilter.shouldKeepField(parentKey, childKey)) {
                continue; // Skip this field entirely
            }

            const isItemRequired = required.includes(childKey);
            const finalIsRequired = isItemRequired || isParentTopLevelRequired;

            const item = {
                childKey,
                label: childProp.title || this.formatLabel(childKey),
                placeholder: childProp?.examples?.[0],
                description: childProp.description || this.formatLabel(childKey),
                required: finalIsRequired
            };

            if (childProp.type) {
                item.type = childProp.type;
            }

            item.semanticType = this.determineSemanticType(childProp, childKey);

            // Handle enum values
            if (childProp.anyOf) {
                for (const option of childProp.anyOf) {
                    if (option.enum) {
                        item.enum = option.enum;
                        item.enumNames = option.enumNames || option.enum;
                        item.options = option.enum.map((val, idx) => ({
                            value: val,
                            label: option.enumNames?.[idx] || String(val)
                        }));
                        break;
                    }
                }
            } else if (childProp.enum) {
                item.type = 'select';
                item.enum = childProp.enum;
                item.enumNames = childProp.enumNames || childProp.enum;
                item.options = childProp.enum.map((val, idx) => ({
                    value: val,
                    label: childProp.enumNames?.[idx] || String(val)
                }));
            }

            if (childProp.type === 'array') {
                item.type = 'array';
                item.items = this.buildArrayItems(childProp.items, `${parentKey}.${childKey}`, finalIsRequired);
                item.minItems = childProp.minItems;
                item.maxItems = childProp.maxItems;
                item.renderAsSingle = childProp.maxUniqueItems === 1;
                if (!isParentTopLevelRequired && !isItemRequired) {
                    const nestedConditions = this.buildNestedArrayConditions(parentKey, childKey);
                    if (nestedConditions.showWhen?.length) item.showWhen = nestedConditions.showWhen;
                    if (nestedConditions.requireWhen?.length) item.requireWhen = nestedConditions.requireWhen;
                }
            }

            if (childProp.type === 'object' && childProp.properties) {
                item.properties = this.buildNestedObjectProperties(childProp, `${parentKey}.${childKey}`, finalIsRequired);
            }

            this.addConstraints(item, childProp);
            items.push(item);
        }
        return items;
    }

    determineSemanticType(schemaDef, key) {
        if (schemaDef.format === 'date' || schemaDef.format === 'date-time') {
            return 'date';
        }
        if (Array.isArray(schemaDef.oneOf)) {
            for (const option of schemaDef.oneOf) {
                if (option.format === 'date' || option.format === 'date-time') {
                    return 'date';
                }
            }
        }
        if (schemaDef.format === 'uri') {
            return 'image';
        }
        if (Array.isArray(schemaDef.oneOf)) {
            for (const option of schemaDef.oneOf) {
                if (option.format === 'uri') {
                    return 'image';
                }
            }
        }
        return schemaDef.type;
    }

    buildNestedArrayConditions(parentKey, childKey) {
        const result = { showWhen: [], requireWhen: [] };
        this.evaluatedConditions.forEach(cond => {
            if (cond.type !== 'if-then') return;
            const thenProp = cond.then?.properties?.[parentKey];
            if (!thenProp) return;
            const requiredInItems = thenProp.items?.required || [];
            const requiredDirect = thenProp.required || [];

            if (!requiredInItems.includes(childKey) && !requiredDirect.includes(childKey)) return;

            const built = cond.showWhenCondition;
            if (!built) return;
            const withId = this.addConditionId(built, cond.conditionId);
            result.showWhen.push(withId);
            result.requireWhen.push(withId);
        });
        return result;

    }

    buildNestedObjectProperties(objectSchema, path, isParentTopLevelRequired = false) {
        const properties = [];
        const required = objectSchema.required || [];

        for (const [key, prop] of Object.entries(objectSchema.properties || {})) {
            const isNestedRequired = required.includes(key);
            const finalIsRequired = isNestedRequired || isParentTopLevelRequired;

            const property = {
                key,
                label: prop.title || this.formatLabel(key),
                type: prop.type,
                placeholder: prop?.examples?.[0],
                description: prop.description || this.formatLabel(key),
                required: finalIsRequired
            };

            property.semanticType = this.determineSemanticType(prop, key);

            if (prop.anyOf) {
                for (const option of prop.anyOf) {
                    if (option.enum) {
                        property.enum = option.enum;
                        property.enumNames = option.enumNames || option.enum;
                        property.options = option.enum.map((val, idx) => ({
                            value: val,
                            label: option.enumNames?.[idx] || String(val)
                        }));
                        break;
                    }
                }
            } else if (prop.enum) {
                property.type = 'select';
                property.enum = prop.enum;
                property.enumNames = prop.enumNames || prop.enum;
                property.options = prop.enum.map((val, idx) => ({
                    value: val,
                    label: prop.enumNames?.[idx] || String(val)
                }));
            }

            if (prop.type === 'object' && prop.properties) {
                property.properties = this.buildNestedObjectProperties(prop, `${path}.${key}`, finalIsRequired);
            }

            this.addConstraints(property, prop);
            properties.push(property);
        }
        return properties;
    }

    buildFieldConditions(key) {
        const result = {};
        const conditions = this.conditionMap.get(key) || [];
        if (!conditions.length) return result;

        const showWhen = [];
        const requireWhen = [];

        const isPathSelected = (cond) => {
            const visit = (c) => {
                if (c.path) {
                    const root = c.path.split(/[.\[]/)[0];
                    return this.resolvedKeys.has(root);
                }
                if (c.conditions) {
                    return c.conditions.some(visit);
                }
                return true;
            };
            return visit(cond);
        };

        conditions.forEach(cond => {
            const built = cond.showWhenCondition;
            if (!built) return;

            if (!isPathSelected(built)) return;

            const withId = this.addConditionId(built, cond.conditionId);
            showWhen.push(withId);
            requireWhen.push(withId);
        });

        if (showWhen.length) result.showWhen = showWhen;
        if (requireWhen.length) result.requireWhen = requireWhen;
        return result;
    }

    findDependentFieldKeys(key) {
        const dependentKeys = new Set();
        this.evaluatedConditions.forEach(condition => {
            if (condition.type === 'if-then' && condition.if && condition.then) {
                const triggers = this.extractTriggerFields(condition.if);
                if (triggers.includes(key)) {
                    const dependents = this.extractDependentFields(condition.then);
                    dependents.forEach(depKey => {
                        if (depKey !== key) {
                            dependentKeys.add(depKey);
                        }
                    });
                }
            }
        });
        return Array.from(dependentKeys);
    }

    addConditionId(condition, conditionId) {
        if (!condition) return null;
        const copy = JSON.parse(JSON.stringify(condition));
        const attach = c => ({ ...c, conditionId });

        if (copy.operator && copy.conditions) {
            copy.conditionId = conditionId;
            copy.conditions = copy.conditions.map(attach);
        } else {
            return attach(copy);
        }
        return copy;
    }

    buildBooleanField(schema) {
        return {
            type: 'boolean',
            enum: [true, false],
            enumNames: schema.enumNames || ['Yes', 'No'],
            options: [
                { value: true, label: schema.enumNames?.[0] || 'Yes' },
                { value: false, label: schema.enumNames?.[1] || 'No' }
            ]
        };
    }

    buildStringField(schema) {
        const field = { inputType: 'text' };
        field.semanticType = this.determineSemanticType(schema, 'topLevelString');

        if (schema.anyOf) {
            for (const option of schema.anyOf) {
                if (option.enum) {
                    field.type = 'select';
                    field.enum = option.enum;
                    field.enumNames = option.enumNames || option.enum;
                    field.options = option.enum.map((val, idx) => ({
                        value: val,
                        label: option.enumNames?.[idx] || String(val)
                    }));
                    break;
                }
            }
        } else if (schema.enum) {
            field.type = 'select';
            field.enum = schema.enum;
            field.enumNames = schema.enumNames || schema.enum;
            field.options = schema.enum.map((val, idx) => ({
                value: val,
                label: schema.enumNames?.[idx] || String(val)
            }));
        }

        this.addConstraints(field, schema);
        return field;
    }

    buildNumberField(schema) {
        const field = { inputType: 'number' };
        this.addConstraints(field, schema);
        return field;
    }

    addConstraints(field, schema) {
        if (schema.minLength !== undefined) field.minLength = schema.minLength;
        if (schema.maxLength !== undefined) field.maxLength = schema.maxLength;
        if (schema.minimum !== undefined) field.min = schema.minimum;
        if (schema.maximum !== undefined) field.max = schema.maximum;
        if (schema.pattern) field.pattern = schema.pattern;
    }

    formatLabel(key) {
        return key
            .split('_')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

// Helper function to ensure enum integrity
export function ensureEnumIntegrity(fields) {
    const validateField = (field) => {
        // For array fields with nested enums
        if (field.type === 'array' && field.items) {
            field.items = field.items.map(item => {
                if (item.properties) {
                    item.properties = item.properties.map(prop => validateField(prop));
                }
                return item;
            });
        }

        // Verify enum options exist
        if (field.enum && field.options) {
            // Verify that all enum values have corresponding options
            const enumSet = new Set(field.enum);
            const optionValues = new Set(field.options.map(opt => opt.value));

            // If there's a mismatch, regenerate options
            if (enumSet.size !== optionValues.size ||
                ![...enumSet].every(v => optionValues.has(v))) {
                field.options = field.enum.map((val, idx) => ({
                    value: val,
                    label: field.enumNames?.[idx] || String(val)
                }));
            }
        }

        return field;
    };

    return fields.map(field => validateField(field));
};
