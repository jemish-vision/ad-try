# AI Agent Implementation Checklist (`R-AdvertiseIQ`)

Read this file before implementing any feature, page, route, modal, action, or API integration in the frontend codebase.

> **Scope rule:** Check each item below before starting implementation. If a check applies to the task, follow it; otherwise, leave it.

---

## Things to Check Before Implementing Any Task

### 1. Multi-Language Support
- Support all existing project languages configured in `src/i18n.js` (`en`, `de`, `fr`, `es`, `it`, `pt`, `ja`, `zh`, `hi` — `nsSeparator: false`, `keySeparator: false`).
- Wrap all user-facing copy, labels, tooltips, and messages using `useTranslation()` (`t(...)`) / `i18next`.
- Add matching translation keys to every locale file under `src/locales/`:
  `en.json`, `de.json`, `fr.json`, `es.json`, `it.json`, `pt.json`, `ja.json`, `zh.json`, `hi.json`.

### 2. Guided Tour (Tour Guide)
The **Guided Tour** is the step-by-step walkthrough opened from the "?" button in the page header. Keep it up to date whenever you add or change a page, feature, workflow, or user-facing setting.
- **Tour config:** each page has a tour under `src/tour/config/` (e.g. `aiCreditsTour.js`) that exports `{ id, title, steps }` and calls `tourRegistry.register(...)`. Add steps to the page's existing tour; for a new page, create a new `<page>Tour.js` and import it in `src/tour/config/index.js`.
- **Route → tour:** the "?" button only appears on routes listed in `routeToTourMap` in `src/helper/filter/Filter.js`. Map every new page route to its tour `id`.
- **Steps:** `{ target: "#element-id", icon: <@phosphor-icons/react icon>, title, content, blockTargetInteraction: true }`. Use `requireClick: true` instead when the user must click the target (e.g. a tab) to reveal the next step. Order the steps in the page's visual flow.
- **Targets:** give every targeted element a stable `id`. If you rename or remove an `id`, update the steps that point to it. Steps whose target isn't on the page are skipped automatically, so put essential steps on elements that are always rendered.
- **Translations:** step `title` and `content` are translated with `t()` when shown, so add every new step `title`/`content` string as a key in all 9 locale files (see section 1).

### 3. Audit Logs
- Ensure all relevant state-changing operations (create, update, delete, permission/setting/rule/bid/budget changes) maintain audit logs.
- When adding or wiring actions to backend endpoints, check `Node-AdvertiseIQ/api-server/constants/auditRouteEvents.js`, `Node-AdvertiseIQ/api-server/middleware/auditRequest.js`, and `Node-AdvertiseIQ/api-server/helpers/auditHelper.js`, and verify display/filtering in `src/layout/views/Audit Log/AuditLog.js` if new event types or targets are introduced.

### 4. Mock Data
- Provide mock/demo data for development, demo mode, and automated tests for new views, charts, tables, and API workflows.
- Verify behavior in Demo Mode (`isMockTestingUser` on backend endpoints) and respect `src/components/DemoModeSubmitGuard.js` (write/submit actions stay blocked in Demo Mode; only explicitly safe UI/filter controls may use `data-demo-allow`).
- Add unit tests (`*.test.js`) with mocked API responses covering new UI states and interactions.

### 5. RBAC (Role-Based Access Control)
- Implement and verify role-based access permissions across UI visibility, routing, actions, and paired API endpoints:
  - Frontend constants & checks: `SYSTEM_PAGES` / `PAGE_ACTIONS` in `src/common/constants/permissions.js`, `PermissionCheck(page, type)` in `src/helper/permission/PermissionCheck.js`, route definitions in `src/router/routes.js`, and sidebar navigation in `src/layout/component/sidebar/Sidebar.js`.
  - Backend enforcement (for paired API routes): `SYSTEM_PAGES` in `Node-AdvertiseIQ/api-server/constants/permissions.js` and `validateRoutePermission(...)` in `Node-AdvertiseIQ/api-server/middleware/routePermission.js` (backed by `roleBasedPermission.model.js`, `profileBasedPermission.model.js`, `packages.model.js`).
- **Required Database Changes (Must Report at Task End):**
  - If any RBAC database updates are needed (e.g., inserting a new page entry, updating `roleBasedPermission`, `profileBasedPermission`, `packages`, or Super Admin/plan/role permissions), **explicitly tell the user at the end of the task the exact RBAC database changes and manual/script steps to perform.**
